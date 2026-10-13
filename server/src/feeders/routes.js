// Read-only API over what the poller records (see ../poller.js and
// schema.sql). Shaped like the frontend's FEEDER_SNAPSHOT so the app can
// swap between live data and the snapshot without caring which it has.

import express from "express";
import { pool } from "../db.js";
import { DDL as LOCATION_DDL } from "./locate.js";

export const feederRouter = express.Router();

const STALE_AFTER_MIN = 5;   // older than this and the app labels the data "Delayed"
const SEEN_WITHIN_H = 24;    // feeders the provider stopped reporting drop out after this

// Hours into the feed's own day at a poll. The provider's "hours on today"
// doesn't reset at midnight WAT (observed: about 08:00 WAT), so the
// denominator for availability is measured from the data: the longest uptime
// any feeder reports at that poll — a feeder that's been on all day — capped
// at 24 h. Falls back to hours since midnight WAT if nothing is on.
const HOURS_INTO_DAY = `LEAST(24, GREATEST(0.1, COALESCE(
  (SELECT max(r.uptime_h) FROM feeder_reading r WHERE r.polled_at = p.polled_at),
  EXTRACT(EPOCH FROM (p.polled_at AT TIME ZONE 'Africa/Lagos')::time) / 3600)))`;

// The feed spells Kaduna's DisCo "KAEDC"; the app (and NERC) use "KAEDCO".
const toAppDisco = (code) => (code === "KAEDC" ? "KAEDCO" : code);

feederRouter.get("/api/feeders/summary", async (_req, res, next) => {
  try {
    const { rows: [poll] } = await pool.query(`
      SELECT p.polled_at,
             EXTRACT(EPOCH FROM (now() - p.polled_at)) / 60 AS age_min,
             ${HOURS_INTO_DAY} AS hours_elapsed
      FROM feeder_poll_run p WHERE p.ok ORDER BY p.polled_at DESC LIMIT 1`);
    if (!poll) return res.status(503).json({ available: false, reason: "The poller has not recorded any data yet." });

    // Current state per DisCo: status from each feeder's last known state,
    // readings (MW, uptime) from the latest poll. Feeders with no reading in
    // that poll were fully dead (the poller skips all-zero rows) — they count
    // as offline with 0 MW, which is what they are.
    const { rows: discos } = await pool.query(`
      SELECT f.disco_code,
             count(*)::int                                                        AS feeders,
             count(*) FILTER (WHERE f.last_status = 1)::int                       AS online,
             count(*) FILTER (WHERE f.last_voltage_status = 1 AND f.last_status = 0)::int AS shedding,
             round(coalesce(sum(r.power_mw) FILTER (WHERE r.status = 1 AND r.quality_flags = 0), 0)::numeric, 1)::float AS live_mw,
             round(avg(coalesce(r.uptime_h, 0))::numeric, 1)::float               AS avg_uptime_h,
             count(*) FILTER (WHERE f.category IN ('Dedicated', 'Industrial'))::int AS dedicated,
             count(*) FILTER (WHERE f.category IN ('Dedicated', 'Industrial') AND f.last_status = 1)::int AS dedicated_online
      FROM feeder f
      LEFT JOIN feeder_reading r ON r.feeder_id = f.feeder_id AND r.polled_at = $1
      WHERE f.last_seen_at > now() - make_interval(hours => $2)
      GROUP BY f.disco_code`, [poll.polled_at, SEEN_WITHIN_H]);

    // Hour-by-hour share of feeders online over the last 24h, from the
    // rollups — this only fills in as history accumulates.
    const { rows: trend } = await pool.query(`
      SELECT f.disco_code, h.hour,
             round(100.0 * sum(h.online_samples) / nullif(sum(h.samples), 0))::int AS online_pct
      FROM feeder_hourly h JOIN feeder f USING (feeder_id)
      WHERE h.hour > now() - interval '24 hours'
      GROUP BY f.disco_code, h.hour ORDER BY h.hour`);

    const { rows: [health] } = await pool.query(`
      SELECT count(*) FILTER (WHERE ok)::int AS ok_polls, count(*) FILTER (WHERE NOT ok)::int AS failed_polls
      FROM feeder_poll_run WHERE polled_at > now() - interval '1 hour'`);
    const { rows: [since] } = await pool.query(`SELECT min(polled_at) AS recording_since FROM feeder_poll_run WHERE ok`);

    const out = {};
    for (const d of discos) {
      out[toAppDisco(d.disco_code)] = {
        feeders: d.feeders, online: d.online, shedding: d.shedding, liveMw: d.live_mw,
        avgUptimeH: d.avg_uptime_h, dedicated: d.dedicated, dedicatedOnline: d.dedicated_online, trend: [],
      };
    }
    for (const t of trend) out[toAppDisco(t.disco_code)]?.trend.push({ hour: t.hour, onlinePct: t.online_pct });

    res.json({
      available: true,
      capturedAt: poll.polled_at,
      ageMinutes: Math.round(Number(poll.age_min) * 10) / 10,
      stale: Number(poll.age_min) > STALE_AFTER_MIN,
      hoursElapsed: Math.max(0.1, Math.round(Number(poll.hours_elapsed) * 10) / 10),
      dayStartedAt: new Date(new Date(poll.polled_at).getTime() - Number(poll.hours_elapsed) * 3600_000).toISOString(),
      source: "Feeder-compliance API · live via the Onction poller",
      recordingSince: since.recording_since,
      poller: { okPollsLastHour: health.ok_polls, failedPollsLastHour: health.failed_polls },
      discos: out,
    });
  } catch (e) {
    // No poller tables yet (fresh database, poller never started).
    if (e.code === "42P01") return res.status(503).json({ available: false, reason: "Feeder tables not created yet — start the poller." });
    next(e);
  }
});

// ── Individual feeders ────────────────────────────────────────────────────
// Every feeder the provider reported in the last day, with what's measured
// (status, live MW, hours on today), what the poller has accumulated (peak
// recorded load, share of polls online), and where it is — at its station,
// with how that position was found (see locate.js). No feed field gives a
// rated capacity, so "peak" is the highest clean reading recorded, and says
// since when.
const latestPoll = () => pool.query(`
  SELECT p.polled_at,
         EXTRACT(EPOCH FROM (now() - p.polled_at)) / 60 AS age_min,
         ${HOURS_INTO_DAY} AS hours_elapsed
  FROM feeder_poll_run p WHERE p.ok ORDER BY p.polled_at DESC LIMIT 1`).then(r => r.rows[0]);

const feederRow = (f, hoursElapsed) => {
  const uptime = f.uptime_h ?? 0;
  return {
    id: f.feeder_id, name: f.name, disco: toAppDisco(f.disco_code), discoName: f.disco, state: f.state, station: f.station,
    kv: String(f.voltage_class || "").startsWith("33") ? 33 : 11, category: f.category,
    status: f.last_status === 1 ? "on" : f.last_voltage_status === 1 ? "shedding" : "off",
    liveMw: f.last_status === 1 && f.quality_flags === 0 && f.power_mw != null ? Math.round(f.power_mw * 100) / 100 : f.last_status === 1 ? null : 0,
    flagged: (f.quality_flags || 0) !== 0,
    uptimeH: Math.round(uptime * 10) / 10,
    availabilityTodayPct: Math.min(100, Math.round((100 * uptime) / Math.max(0.1, hoursElapsed))),
    onlinePct24h: f.samples_24h ? Math.round((100 * f.online_24h) / f.samples_24h) : null,
    recordedHours24h: f.hours_24h || 0,
    peakMw: f.peak_mw != null ? Math.round(f.peak_mw * 100) / 100 : null,
    recordingSince: f.first_seen_at,
    position: f.loc_method && f.loc_method !== "none"
      ? { lat: f.lat, lng: f.lon, method: f.loc_method, precision: f.loc_precision, matchedName: f.matched_name, address: f.loc_address }
      : null,
    positionPending: !f.loc_method,
  };
};

const FEEDER_SELECT = `
  SELECT f.feeder_id, f.name, f.disco_code, f.disco, f.state, f.station, f.voltage_class, f.category,
         f.last_status, f.last_voltage_status, f.first_seen_at,
         r.power_mw, r.quality_flags, COALESCE(r.uptime_h, d.uptime_h) AS uptime_h,
         h.peak_mw, h.online_24h, h.samples_24h, h.hours_24h,
         l.lat, l.lon, l.method AS loc_method, l.precision AS loc_precision, l.matched_name, l.address AS loc_address
  FROM feeder f
  LEFT JOIN feeder_reading r ON r.feeder_id = f.feeder_id AND r.polled_at = $1
  LEFT JOIN feeder_daily d ON d.feeder_id = f.feeder_id AND d.day = ($1::timestamptz AT TIME ZONE 'Africa/Lagos')::date
  LEFT JOIN (
    SELECT feeder_id, max(mw_max) AS peak_mw,
           (sum(online_samples) FILTER (WHERE hour > now() - interval '24 hours'))::int AS online_24h,
           (sum(samples)        FILTER (WHERE hour > now() - interval '24 hours'))::int AS samples_24h,
           (count(*)            FILTER (WHERE hour > now() - interval '24 hours'))::int AS hours_24h
    FROM feeder_hourly GROUP BY feeder_id
  ) h ON h.feeder_id = f.feeder_id
  LEFT JOIN feeder_station_location l ON l.station = f.station AND l.state = f.state`;

feederRouter.get("/api/feeders", async (_req, res, next) => {
  try {
    const poll = await latestPoll();
    if (!poll) return res.status(503).json({ available: false, reason: "The poller has not recorded any data yet." });
    await pool.query(LOCATION_DDL);
    const { rows } = await pool.query(`${FEEDER_SELECT}
      WHERE f.last_seen_at > now() - make_interval(hours => $2) ORDER BY f.disco_code, f.name`, [poll.polled_at, SEEN_WITHIN_H]);
    const hours = Number(poll.hours_elapsed);
    const feeders = rows.map(f => feederRow(f, hours));
    res.json({
      available: true, capturedAt: poll.polled_at, stale: Number(poll.age_min) > STALE_AFTER_MIN,
      hoursElapsed: Math.max(0.1, Math.round(hours * 10) / 10),
      dayStartedAt: new Date(new Date(poll.polled_at).getTime() - hours * 3600_000).toISOString(),
      located: feeders.filter(f => f.position).length, pending: feeders.filter(f => f.positionPending).length,
      feeders,
    });
  } catch (e) {
    if (e.code === "42P01") return res.status(503).json({ available: false, reason: "Feeder tables not created yet — start the poller." });
    next(e);
  }
});

// One feeder: the list row plus its last 48 h hour by hour and recent on/off changes.
feederRouter.get("/api/feeders/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Feeder id must be a number" });
    const poll = await latestPoll();
    if (!poll) return res.status(503).json({ available: false, reason: "The poller has not recorded any data yet." });
    await pool.query(LOCATION_DDL);
    const { rows: [f] } = await pool.query(`${FEEDER_SELECT} WHERE f.feeder_id = $2`, [poll.polled_at, id]);
    if (!f) return res.status(404).json({ error: `No feeder ${id}` });
    const { rows: hourly } = await pool.query(`
      SELECT hour, round(100.0 * online_samples / nullif(samples, 0))::int AS online_pct,
             round((mw_sum / nullif(mw_samples, 0))::numeric, 2)::float AS avg_mw, mw_max
      FROM feeder_hourly WHERE feeder_id = $1 AND hour > now() - interval '48 hours' ORDER BY hour`, [id]);
    const { rows: events } = await pool.query(`
      SELECT at, status, voltage_status, prev_status FROM feeder_status_event
      WHERE feeder_id = $1 AND prev_status IS NOT NULL ORDER BY at DESC LIMIT 20`, [id]);
    res.json({ ...feederRow(f, Number(poll.hours_elapsed)), capturedAt: poll.polled_at,
      hoursElapsed: Math.max(0.1, Math.round(Number(poll.hours_elapsed) * 10) / 10),
      hourly: hourly.map(h => ({ hour: h.hour, onlinePct: h.online_pct, avgMw: h.avg_mw, maxMw: h.mw_max })),
      events: events.map(e => ({ at: e.at, status: e.status === 1 ? "on" : e.voltage_status === 1 ? "shedding" : "off" })) });
  } catch (e) {
    if (e.code === "42P01") return res.status(503).json({ available: false, reason: "Feeder tables not created yet — start the poller." });
    next(e);
  }
});

// Read-only API over what the poller records (see ../poller.js and
// schema.sql). Shaped like the frontend's FEEDER_SNAPSHOT so the app can
// swap between live data and the snapshot without caring which it has.

import express from "express";
import { pool } from "../db.js";

export const feederRouter = express.Router();

const STALE_AFTER_MIN = 5;   // older than this and the app labels the data "Delayed"
const SEEN_WITHIN_H = 24;    // feeders the provider stopped reporting drop out after this

// The feed spells Kaduna's DisCo "KAEDC"; the app (and NERC) use "KAEDCO".
const toAppDisco = (code) => (code === "KAEDC" ? "KAEDCO" : code);

feederRouter.get("/api/feeders/summary", async (_req, res, next) => {
  try {
    const { rows: [poll] } = await pool.query(`
      SELECT polled_at,
             EXTRACT(EPOCH FROM (now() - polled_at)) / 60 AS age_min,
             EXTRACT(EPOCH FROM (polled_at AT TIME ZONE 'Africa/Lagos')::time) / 3600 AS hours_elapsed
      FROM feeder_poll_run WHERE ok ORDER BY polled_at DESC LIMIT 1`);
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

// Feeder poller — fetches the live feeder-compliance API once a minute and
// records it (see feeders/schema.sql for what's kept and for how long).
// Runs as its own container (`poller` in docker-compose.yml), from the same
// image as the API.
//
// The API key stays server-side: it's read from FEEDER_API_KEY and never
// logged (errors print the URL without its query string).

import fs from "node:fs/promises";
import { pool } from "./db.js";

const API_URL  = process.env.FEEDER_API_URL || "https://feedercomplianceprodapi.azurewebsites.net/api/v1/Energy/feeder-online-data";
const API_KEY  = process.env.FEEDER_API_KEY;
const INTERVAL_MS        = Number(process.env.FEEDER_POLL_INTERVAL_S || 60) * 1000;
const TIMEOUT_MS         = 45_000;
const RAW_RETENTION_DAYS = Number(process.env.FEEDER_RAW_RETENTION_DAYS || 14);
const POLL_LOG_RETENTION_DAYS = 90;
const STALE_WARN_POLLS   = 5; // consecutive polls with no changed reading before warning

// Data-quality bitmask stored on every reading.
export const QUALITY = {
  NEGATIVE_POWER:      1,  // usually a CT wired backwards
  VOLTAGE_OUT_OF_BAND: 2,  // any phase outside 80–115% of nominal
  IMPLAUSIBLE_CURRENT: 4,
  IMPLAUSIBLE_MW:      8,
  ONLINE_NO_VOLTAGE:   16, // status says on, voltage says off
  PHASE_IMBALANCE:     32, // >30% spread between phase currents
};

function nominalKv(voltageClass) {
  return String(voltageClass).startsWith("33") ? 33 : 11;
}

export function qualityFlags(r) {
  if (r.status !== 1) return 0; // offline readings are all zeros — nothing to judge
  const kv = nominalKv(r.voltageClass);
  const V = [r.voltage1, r.voltage2, r.voltage3];
  const I = [r.current1, r.current2, r.current3];
  let f = 0;
  if (r.power < 0) f |= QUALITY.NEGATIVE_POWER;
  if (V.some(v => v < 0.8 * kv || v > 1.15 * kv)) f |= QUALITY.VOLTAGE_OUT_OF_BAND;
  if (Math.max(...I) > (kv === 11 ? 1000 : 800)) f |= QUALITY.IMPLAUSIBLE_CURRENT;
  if (r.power > (kv === 11 ? 15 : 40)) f |= QUALITY.IMPLAUSIBLE_MW;
  if (r.voltageStatus !== 1) f |= QUALITY.ONLINE_NO_VOLTAGE;
  const maxI = Math.max(...I), minI = Math.min(...I);
  if (maxI > 20 && (maxI - minI) / maxI > 0.3) f |= QUALITY.PHASE_IMBALANCE;
  return f;
}

// Fields that should always come back numeric; anything else is coerced to null.
const NUMERIC = ["status", "voltageStatus", "power", "voltage1", "voltage2", "voltage3",
  "current1", "current2", "current3", "actualEnergyConsumption", "upTimeHours", "instantDAR"];

function clean(r) {
  const out = { ...r };
  for (const k of NUMERIC) out[k] = Number.isFinite(r[k]) ? r[k] : null;
  for (const k of ["alternateFeederName", "motherFeederName", "motherStationName"]) {
    if (out[k] === "N/A" || out[k] === "") out[k] = null;
  }
  out.qualityFlags = qualityFlags(out);
  return out;
}

async function fetchFeeders() {
  const url = `${API_URL}?apiKey=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${API_URL}`);
    err.httpStatus = res.status;
    throw err;
  }
  const body = await res.json();
  if (!body?.status || !Array.isArray(body.data)) {
    const err = new Error(`Unexpected response shape: ${String(body?.message).slice(0, 200)}`);
    err.httpStatus = res.status;
    throw err;
  }
  return { rows: body.data.filter(r => Number.isInteger(r.feederId)).map(clean), httpStatus: res.status };
}

// All writes for one poll, in one transaction. The payload goes in as a
// single jsonb parameter and is unpacked by jsonb_to_recordset, so a poll is
// a handful of statements no matter how many feeders there are.
const RECORDSET = `jsonb_to_recordset($1::jsonb) AS s(
  "feederId" int, "deviceId" int, "deviceUID" text, name text, disco text, "discoCode" text, state text,
  "voltageClass" text, station text, "feederCategory" text, "alternateFeederName" text,
  "motherFeederName" text, "motherStationName" text, contractor text, "dataPartnerId" int,
  status int, "voltageStatus" int, power float8, voltage1 float8, voltage2 float8, voltage3 float8,
  current1 float8, current2 float8, current3 float8, "actualEnergyConsumption" float8,
  "upTimeHours" float8, "instantDAR" float8, "qualityFlags" int)`;

async function record(rows, polledAt) {
  const payload = JSON.stringify(rows);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 0. Snapshot each feeder's last known state before step 1 overwrites it.
    await client.query(`
      CREATE TEMP TABLE prev_state ON COMMIT DROP AS
      SELECT feeder_id, last_status, last_voltage_status FROM feeder`);

    // 1. Feeder metadata + last known state.
    await client.query(`
      INSERT INTO feeder (feeder_id, device_id, device_uid, name, disco_code, disco, state, station,
                          voltage_class, category, mother_feeder, mother_station, alternate_feeder,
                          contractor, data_partner_id, last_status, last_voltage_status, first_seen_at, last_seen_at)
      SELECT s."feederId", s."deviceId", s."deviceUID", s.name, s."discoCode", s.disco, s.state, s.station,
             s."voltageClass", s."feederCategory", s."motherFeederName", s."motherStationName", s."alternateFeederName",
             s.contractor, s."dataPartnerId", s.status, s."voltageStatus", $2, $2
      FROM ${RECORDSET}
      ON CONFLICT (feeder_id) DO UPDATE SET
        device_id = EXCLUDED.device_id, device_uid = EXCLUDED.device_uid, name = EXCLUDED.name,
        disco_code = EXCLUDED.disco_code, disco = EXCLUDED.disco, state = EXCLUDED.state,
        station = EXCLUDED.station, voltage_class = EXCLUDED.voltage_class, category = EXCLUDED.category,
        mother_feeder = EXCLUDED.mother_feeder, mother_station = EXCLUDED.mother_station,
        alternate_feeder = EXCLUDED.alternate_feeder, contractor = EXCLUDED.contractor,
        data_partner_id = EXCLUDED.data_partner_id,
        last_status = COALESCE(EXCLUDED.last_status, feeder.last_status),
        last_voltage_status = COALESCE(EXCLUDED.last_voltage_status, feeder.last_voltage_status),
        last_seen_at = EXCLUDED.last_seen_at`, [payload, polledAt]);

    // 2. Status transitions, compared against the state snapshotted in
    //    step 0 (the feeder rows have just been overwritten, and must exist
    //    first for the foreign key). First sightings are recorded too
    //    (prev_* NULL) so every feeder's history has a known starting state.
    const { rowCount: statusChanges } = await client.query(`
      INSERT INTO feeder_status_event (feeder_id, at, status, voltage_status, prev_status, prev_voltage_status)
      SELECT s."feederId", $2, s.status, s."voltageStatus", f.last_status, f.last_voltage_status
      FROM ${RECORDSET}
      LEFT JOIN prev_state f ON f.feeder_id = s."feederId"
      WHERE s.status IS NOT NULL AND s."voltageStatus" IS NOT NULL
        AND (f.feeder_id IS NULL OR f.last_status IS DISTINCT FROM s.status
             OR f.last_voltage_status IS DISTINCT FROM s."voltageStatus")
      ON CONFLICT DO NOTHING`, [payload, polledAt]);

    // 3. Raw readings — skipping fully dead all-zero feeders.
    await client.query(`
      INSERT INTO feeder_reading (polled_at, feeder_id, status, voltage_status, power_mw, v1, v2, v3, i1, i2, i3,
                                  energy_counter, uptime_h, dar_pct, quality_flags)
      SELECT $2, s."feederId", s.status, s."voltageStatus", s.power, s.voltage1, s.voltage2, s.voltage3,
             s.current1, s.current2, s.current3, s."actualEnergyConsumption", s."upTimeHours", s."instantDAR",
             s."qualityFlags"
      FROM ${RECORDSET}
      WHERE s.status IS NOT NULL AND s."voltageStatus" IS NOT NULL
        AND (s.status = 1 OR s."voltageStatus" = 1 OR COALESCE(s.power, 0) <> 0 OR COALESCE(s."upTimeHours", 0) > 0)
      ON CONFLICT DO NOTHING`, [payload, polledAt]);

    // 4. Hourly rollup, accumulated one sample at a time.
    await client.query(`
      INSERT INTO feeder_hourly (feeder_id, hour, samples, online_samples, voltage_samples, shed_samples,
                                 flagged_samples, mw_sum, mw_samples, mw_max, energy_first, energy_last)
      SELECT s."feederId", date_trunc('hour', $2::timestamptz), 1,
             (s.status = 1)::int, (s."voltageStatus" = 1)::int, (s."voltageStatus" = 1 AND s.status = 0)::int,
             (s."qualityFlags" <> 0)::int,
             CASE WHEN s.status = 1 AND s."qualityFlags" = 0 THEN COALESCE(s.power, 0) ELSE 0 END,
             (s.status = 1 AND s."qualityFlags" = 0)::int,
             CASE WHEN s.status = 1 AND s."qualityFlags" = 0 THEN s.power END,
             NULLIF(s."actualEnergyConsumption", 0), NULLIF(s."actualEnergyConsumption", 0)
      FROM ${RECORDSET}
      WHERE s.status IS NOT NULL AND s."voltageStatus" IS NOT NULL
      ON CONFLICT (feeder_id, hour) DO UPDATE SET
        samples         = feeder_hourly.samples + 1,
        online_samples  = feeder_hourly.online_samples + EXCLUDED.online_samples,
        voltage_samples = feeder_hourly.voltage_samples + EXCLUDED.voltage_samples,
        shed_samples    = feeder_hourly.shed_samples + EXCLUDED.shed_samples,
        flagged_samples = feeder_hourly.flagged_samples + EXCLUDED.flagged_samples,
        mw_sum          = feeder_hourly.mw_sum + EXCLUDED.mw_sum,
        mw_samples      = feeder_hourly.mw_samples + EXCLUDED.mw_samples,
        mw_max          = GREATEST(feeder_hourly.mw_max, EXCLUDED.mw_max),
        energy_first    = COALESCE(feeder_hourly.energy_first, EXCLUDED.energy_first),
        energy_last     = COALESCE(EXCLUDED.energy_last, feeder_hourly.energy_last)`, [payload, polledAt]);

    // 5. Provider's daily uptime — latest value wins (it only grows through
    //    the day, and overwriting avoids carrying yesterday's total into
    //    today if the provider's midnight reset lags our clock).
    await client.query(`
      INSERT INTO feeder_daily (feeder_id, day, uptime_h, dar_pct, updated_at)
      SELECT s."feederId", ($2::timestamptz AT TIME ZONE 'Africa/Lagos')::date, s."upTimeHours", s."instantDAR", $2
      FROM ${RECORDSET}
      ON CONFLICT (feeder_id, day) DO UPDATE SET
        uptime_h = EXCLUDED.uptime_h, dar_pct = EXCLUDED.dar_pct, updated_at = EXCLUDED.updated_at`, [payload, polledAt]);

    await client.query("COMMIT");
    return { statusChanges };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── Loop ───────────────────────────────────────────────────────────────────
let previous = new Map();   // feederId -> reading signature, to detect frozen provider data
let stalePolls = 0;
let lastPruneHour = -1;

const signature = (r) => [r.status, r.voltageStatus, r.power, r.current1, r.voltage1, r.actualEnergyConsumption].join("|");

async function logRun(run) {
  await pool.query(
    `INSERT INTO feeder_poll_run (polled_at, ok, http_status, duration_ms, feeder_count, online_count, changed_count, status_changes, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [run.polledAt, run.ok, run.httpStatus ?? null, run.durationMs, run.feederCount ?? null,
     run.onlineCount ?? null, run.changedCount ?? null, run.statusChanges ?? null, run.error ?? null]
  ).catch(e => console.error("could not log poll run:", e.message));
}

async function prune() {
  const hour = new Date().getUTCHours();
  if (hour === lastPruneHour) return;
  lastPruneHour = hour;
  const { rowCount } = await pool.query(
    "DELETE FROM feeder_reading WHERE polled_at < now() - make_interval(days => $1)", [RAW_RETENTION_DAYS]);
  await pool.query("DELETE FROM feeder_poll_run WHERE polled_at < now() - make_interval(days => $1)", [POLL_LOG_RETENTION_DAYS]);
  if (rowCount) console.log(`pruned ${rowCount} raw readings older than ${RAW_RETENTION_DAYS} days`);
}

async function pollOnce() {
  const polledAt = new Date();
  const t0 = Date.now();
  try {
    // One quick retry for network-level failures (DNS, reset, timeout) —
    // not for answers the provider actually gave, like a rejected key.
    const { rows, httpStatus } = await fetchFeeders().catch(async (e) => {
      if (e.httpStatus || stopping) throw e;
      console.warn(`${polledAt.toISOString()} retrying after: ${e.message}`);
      await new Promise(r => setTimeout(r, 10_000));
      return fetchFeeders();
    });
    const changedCount = rows.filter(r => previous.get(r.feederId) !== signature(r)).length;
    previous = new Map(rows.map(r => [r.feederId, signature(r)]));
    const { statusChanges } = await record(rows, polledAt);
    const onlineCount = rows.filter(r => r.status === 1).length;
    const durationMs = Date.now() - t0;
    await logRun({ polledAt, ok: true, httpStatus, durationMs, feederCount: rows.length, onlineCount, changedCount, statusChanges });

    stalePolls = changedCount === 0 ? stalePolls + 1 : 0;
    if (stalePolls === STALE_WARN_POLLS) console.warn(`WARNING: no feeder reading has changed in ${STALE_WARN_POLLS} polls — provider data may be frozen`);
    console.log(`${polledAt.toISOString()} ok  feeders=${rows.length} online=${onlineCount} changed=${changedCount} status_changes=${statusChanges} ${durationMs}ms`);
    await prune();
  } catch (e) {
    const durationMs = Date.now() - t0;
    console.error(`${polledAt.toISOString()} ERR ${e.message}`);
    await logRun({ polledAt, ok: false, httpStatus: e.httpStatus, durationMs, error: e.message.slice(0, 500) });
  }
}

let timer = null;
let stopping = false;

function scheduleNext() {
  if (stopping) return;
  // Align to the interval grid (e.g. the top of each minute) so samples land
  // at consistent times and a slow poll doesn't make the schedule drift.
  const wait = INTERVAL_MS - (Date.now() % INTERVAL_MS);
  timer = setTimeout(async () => { await pollOnce(); scheduleNext(); }, wait);
}

async function main() {
  if (!API_KEY) {
    // Idle instead of exiting so `restart: unless-stopped` doesn't crash-loop
    // on a server whose .env hasn't been given the key yet.
    console.error("FEEDER_API_KEY is not set — the poller is idle. Add it to .env and restart the poller container.");
    setInterval(() => console.error("FEEDER_API_KEY is still not set — poller idle."), 3600_000);
    return;
  }
  const schema = await fs.readFile(new URL("./feeders/schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log(`feeder poller started — every ${INTERVAL_MS / 1000}s, raw readings kept ${RAW_RETENTION_DAYS} days`);
  await pollOnce();
  scheduleNext();
}

async function shutdown(signal) {
  stopping = true;
  clearTimeout(timer);
  console.log(`${signal} received — stopping poller`);
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

main().catch(e => { console.error("poller failed to start:", e); process.exit(1); });

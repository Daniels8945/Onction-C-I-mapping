-- Live feeder history, recorded by the poller (src/poller.js) from the
-- feeder-compliance API. That API only ever returns "right now", so every
-- reliability number (hours of supply, outages, load-shedding, Band A
-- compliance) has to come from what we record here.
--
-- Applied by the poller on every start (idempotent), not via
-- server/init/ — that directory only runs on a brand-new database volume.

-- One row per feeder: descriptive fields (upserted each poll) plus the last
-- known state, which is what status changes are detected against.
CREATE TABLE IF NOT EXISTS feeder (
  feeder_id           integer PRIMARY KEY,
  device_id           integer,
  device_uid          text,
  name                text NOT NULL,
  disco_code          text,
  disco               text,
  state               text,
  station             text,
  voltage_class       text,             -- "11Kv Feeder" | "33Kv Feeder"
  category            text,             -- Commercial | Dedicated | Industrial | Alternate | Rural | Unassigned
  mother_feeder       text,             -- upstream 33kV feeder, when the provider knows it
  mother_station      text,
  alternate_feeder    text,
  contractor          text,
  data_partner_id     integer,
  last_status         smallint,
  last_voltage_status smallint,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feeder_disco_idx   ON feeder (disco_code);
CREATE INDEX IF NOT EXISTS feeder_station_idx ON feeder (station);

-- Every poll attempt, successful or not — the poller's own health record.
CREATE TABLE IF NOT EXISTS feeder_poll_run (
  id             bigserial PRIMARY KEY,
  polled_at      timestamptz NOT NULL DEFAULT now(),
  ok             boolean NOT NULL,
  http_status    integer,
  duration_ms    integer,
  feeder_count   integer,
  online_count   integer,
  changed_count  integer,               -- readings that differ from the previous poll; 0 means the provider's data may be frozen
  status_changes integer,
  error          text
);
CREATE INDEX IF NOT EXISTS feeder_poll_run_at_idx ON feeder_poll_run (polled_at);

-- Every on/off (and voltage present/absent) transition. Small, kept
-- forever: this is the exact outage history.
CREATE TABLE IF NOT EXISTS feeder_status_event (
  feeder_id            integer NOT NULL REFERENCES feeder (feeder_id),
  at                   timestamptz NOT NULL,
  status               smallint NOT NULL,
  voltage_status       smallint NOT NULL,
  prev_status          smallint,         -- NULL on the first sighting of a feeder
  prev_voltage_status  smallint,
  PRIMARY KEY (feeder_id, at)
);
CREATE INDEX IF NOT EXISTS feeder_status_event_at_idx ON feeder_status_event (at);

-- Raw 1-minute readings. Kept RAW_RETENTION_DAYS (default 14) — the hourly
-- and daily tables below keep the long-term picture. All-zero rows from
-- feeders that are fully dead are skipped; their state is already captured
-- by feeder_status_event and the rollups.
CREATE TABLE IF NOT EXISTS feeder_reading (
  polled_at       timestamptz NOT NULL,
  feeder_id       integer NOT NULL,
  status          smallint NOT NULL,
  voltage_status  smallint NOT NULL,
  power_mw        real,
  v1 real, v2 real, v3 real,             -- kV
  i1 real, i2 real, i3 real,             -- A
  energy_counter  double precision,      -- cumulative meter register (unit unconfirmed, looks like Wh)
  uptime_h        real,                  -- provider's hours online so far today (resets at midnight WAT)
  dar_pct         real,                  -- provider's instantDAR = uptime_h / 24 * 100
  quality_flags   smallint NOT NULL DEFAULT 0,  -- bitmask, see QUALITY in poller.js
  PRIMARY KEY (feeder_id, polled_at)
);
CREATE INDEX IF NOT EXISTS feeder_reading_at_idx ON feeder_reading (polled_at);

-- Per-feeder per-hour rollup, kept forever. Stored as sample counts (not
-- minutes) so a missed poll doesn't skew the percentages.
CREATE TABLE IF NOT EXISTS feeder_hourly (
  feeder_id        integer NOT NULL,
  hour             timestamptz NOT NULL,
  samples          integer NOT NULL,
  online_samples   integer NOT NULL,     -- status = 1
  voltage_samples  integer NOT NULL,     -- voltage present
  shed_samples     integer NOT NULL,     -- voltage present but feeder off: supply was there, the feeder was switched out
  flagged_samples  integer NOT NULL,     -- readings with any quality flag
  mw_sum           double precision NOT NULL,  -- over clean online samples only
  mw_samples       integer NOT NULL,
  mw_max           real,
  energy_first     double precision,
  energy_last      double precision,
  PRIMARY KEY (feeder_id, hour)
);
CREATE INDEX IF NOT EXISTS feeder_hourly_hour_idx ON feeder_hourly (hour);

-- The provider's own end-of-day uptime per feeder (its counter resets at
-- midnight WAT, so the last value seen on a date is that day's total).
-- A cross-check for the uptime we derive from our own samples.
CREATE TABLE IF NOT EXISTS feeder_daily (
  feeder_id    integer NOT NULL,
  day          date NOT NULL,            -- Africa/Lagos calendar date
  uptime_h     real,
  dar_pct      real,
  updated_at   timestamptz NOT NULL,
  PRIMARY KEY (feeder_id, day)
);

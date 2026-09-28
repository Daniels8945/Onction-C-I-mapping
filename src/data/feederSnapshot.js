// Per-DisCo supply snapshot from the live feeder-compliance API, as recorded
// by the poller (server/src/poller.js) — one real poll, frozen here so the
// app still has real figures when the live feed (/api/feeders/summary) is
// unavailable — see features/feeders/useFeederLive.js, which falls back to
// it and labels it as a snapshot.
//
// Field meanings are inferred (the provider publishes no docs): power in MW,
// uptime = hours online so far today (resets at midnight WAT).

export const FEEDER_SNAPSHOT = {
  capturedAt: "2026-09-28T17:49+01:00",
  hoursElapsed: 17.8, // hours since midnight WAT at capture — the denominator for "availability today"
  source: "Feeder-compliance API · 991 metered 11/33 kV feeders",
  // Keyed by the app's DisCo ids (DISCOS[].id) — the feed spells Kaduna "KAEDC".
  discos: {
    AEDC:   { feeders: 221, online: 98,  shedding: 16, liveMw: 114.2, avgUptimeH: 7.9,  dedicated: 63, dedicatedOnline: 29 },
    EKEDC:  { feeders: 177, online: 117, shedding: 20, liveMw: 207.6, avgUptimeH: 11.9, dedicated: 52, dedicatedOnline: 34 },
    IKEDC:  { feeders: 149, online: 67,  shedding: 22, liveMw: 188.9, avgUptimeH: 9.3,  dedicated: 24, dedicatedOnline: 6 },
    IBEDC:  { feeders: 86,  online: 31,  shedding: 12, liveMw: 70.1,  avgUptimeH: 7.1,  dedicated: 25, dedicatedOnline: 8 },
    EEDC:   { feeders: 71,  online: 40,  shedding: 10, liveMw: 92.1,  avgUptimeH: 9.8,  dedicated: 20, dedicatedOnline: 8 },
    KAEDCO: { feeders: 61,  online: 4,   shedding: 1,  liveMw: 21.6,  avgUptimeH: 1.4,  dedicated: 11, dedicatedOnline: 0 },
    KEDCO:  { feeders: 54,  online: 9,   shedding: 2,  liveMw: 24.8,  avgUptimeH: 2.1,  dedicated: 9,  dedicatedOnline: 0 },
    JEDC:   { feeders: 53,  online: 19,  shedding: 1,  liveMw: 49.2,  avgUptimeH: 4.9,  dedicated: 11, dedicatedOnline: 2 },
    PHEDC:  { feeders: 52,  online: 6,   shedding: 1,  liveMw: 8.4,   avgUptimeH: 2.3,  dedicated: 6,  dedicatedOnline: 0 },
    BEDC:   { feeders: 49,  online: 14,  shedding: 2,  liveMw: 23.8,  avgUptimeH: 5.3,  dedicated: 16, dedicatedOnline: 7 },
    YEDC:   { feeders: 18,  online: 4,   shedding: 0,  liveMw: 3.5,   avgUptimeH: 4.2,  dedicated: 5,  dedicatedOnline: 1 },
  },
};

import { useState, useEffect } from "react";
import { gridApi } from "@/lib/gridApi";
import { FEEDER_SNAPSHOT } from "@/data/feederSnapshot";

// Live DisCo feeder data from /api/feeders/summary (recorded by the poller),
// refreshed every minute. Falls back to the frozen FEEDER_SNAPSHOT when the
// API has nothing — e.g. a server where the poller isn't running yet — so
// the app always has figures, and `mode` says which kind they are:
//   live      recorded within the last few minutes
//   delayed   the poller has fallen behind (data older than 5 min)
//   snapshot  the frozen reading — the live feed is unavailable
const REFRESH_MS = 60_000;

export default function useFeederLive() {
  const [state, setState] = useState({ mode: "snapshot", data: FEEDER_SNAPSHOT, reason: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await gridApi.feederSummary();
        if (cancelled) return;
        if (d.available && Object.keys(d.discos).length) setState({ mode: d.stale ? "delayed" : "live", data: d, reason: null });
        else setState({ mode: "snapshot", data: FEEDER_SNAPSHOT, reason: d.reason || "No live data yet" });
      } catch (err) {
        // 503 lands here too (the API returns { available: false } with it).
        if (!cancelled) setState(s => (s.mode === "snapshot" ? { ...s, reason: err.message } : { ...s, mode: "delayed", reason: err.message }));
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return state;
}

export function feederTotals(data) {
  const all = Object.values(data.discos);
  const sum = (k) => all.reduce((a, d) => a + (d[k] || 0), 0);
  return { feeders: sum("feeders"), online: sum("online"), shedding: sum("shedding"), liveMw: Math.round(sum("liveMw")) };
}

// "17:49" style WAT time, or date + time if it isn't today.
export function formatWat(iso) {
  const d = new Date(iso);
  const opts = { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false };
  const sameDay = d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" }) === new Date().toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" });
  return sameDay ? `${d.toLocaleTimeString("en-NG", opts)} WAT` : `${d.toLocaleString("en-NG", { ...opts, day: "numeric", month: "short" })} WAT`;
}

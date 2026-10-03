import { useState, useEffect } from "react";
import { gridApi } from "@/lib/gridApi";

// Debounced place / address / establishment search through the server
// (/api/geocode/search — Google Places when configured, else OpenStreetMap;
// keys, rate limits and caching live there). Results come back uniform:
// { name, address, state, lga, lat, lng, confidence, confidence_reason,
//   precision: "site" | "address" | "area" | "feature", source }.
//
// Results always belong to the CURRENT query: they're cleared the moment the
// query changes, and a response for an older query is dropped. (Showing the
// previous query's results while the next one loads let Enter pick a place
// the user had already typed past.)
export default function usePlaceSearch(query, enabled, { minLength = 3, delay = 350 } = {}) {
  const [state, setState] = useState({ query: "", results: [], status: "idle", stateHint: null, errors: [] });

  useEffect(() => {
    const q = String(query || "").trim();
    if (!enabled || q.length < minLength) { setState({ query: q, results: [], status: "idle", stateHint: null, errors: [] }); return; }
    setState({ query: q, results: [], status: "loading", stateHint: null, errors: [] });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const d = await gridApi.geocodeSearch(q, { signal: controller.signal });
        setState({ query: q, results: d.results, status: "done", stateHint: d.state_hint, errors: d.errors || [] });
      } catch (err) {
        if (err.name !== "AbortError") setState({ query: q, results: [], status: "error", stateHint: null, errors: [err.message] });
      }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, enabled, minLength, delay]);

  // Belt and braces: never hand back results for a different query.
  const current = String(query || "").trim();
  return state.query === current ? state : { ...state, results: [], status: enabled && current.length >= minLength ? "loading" : "idle" };
}

// "Ikeja, Lagos" style subtitle for a result.
export const placeSubtitle = (r) =>
  [r.address && r.address !== r.name ? r.address.replace(new RegExp(`,?\\s*${r.state}$`), "") : null, r.lga, r.state].filter(Boolean).join(" · ");

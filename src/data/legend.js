// ─────────────────────────────────────────────────────────────────────────────
//  TCN Loop Map — shared legend constants
//  Single source of truth for every color/shape used on the transmission-line-
//  status layer, the substation status rings, and the generation-station icons.
//  Both useNigeriaMap.js (the actual map paint) and MapLegend.jsx (the visual
//  key) import from here so the two can never drift apart. Values are sampled
//  directly off TCN's own "Five Existing and One Ongoing Transmission Line
//  Loops" map legend, not approximated.
// ─────────────────────────────────────────────────────────────────────────────

export const TX_LINE_STATUS = [
  { key: "proposed", label: "Proposed 330kV Transmission Lines", color: "#ef4444" },
  { key: "ongoing",  label: "On-going 330kV Transmission Lines", color: "#6b7280" },
  { key: "existing", label: "Existing 330kV Transmission Lines", color: "#0ea5e9" },
];

export const SUBSTATION_STATUS = [
  { key: "proposed",     label: "Proposed 330/132kV Bulk S/S",         outer: "#ef4444", inner: "#eab308" },
  { key: "ongoing",      label: "On-going 330/132kV Bulk S/S",         outer: "#a78bfa", inner: "#22c55e" },
  { key: "ongoing-nipp", label: "On-going 330/132kV Bulk S/S by NIPP", outer: "#22d3ee", inner: "#22c55e" },
  { key: "existing",     label: "Existing 330/132kV Bulk S/S",         outer: "#1d4ed8", inner: "#eab308" },
];

export const GENCO_ICONS = [
  { key: "gc-solar-proposed",   label: "Proposed 132kV Solar PV Power Station",  shape: "pentagon", color: "#facc15" },
  { key: "gc-hydro-ongoing",    label: "On-going/Committed Hydro Power Station", shape: "triangle",  color: "#ec4899" },
  { key: "gc-hydro-existing",   label: "Existing Hydro Power Station",           shape: "triangle",  color: "#3b82f6" },
  { key: "gc-thermal-existing", label: "Existing Thermal Power Station",         shape: "square",    color: "#1d4ed8" },
  { key: "gc-thermal-nipp",     label: "Existing NIPP Thermal Power Station",    shape: "square",    color: "#22d3ee" },
  { key: "gc-thermal-ipp",      label: "IPP Thermal Power Station",              shape: "square",    color: "#ef4444" },
];

// Builds a MapLibre ["match", ["get","status"], ...] color expression from one
// of the lists above, so the paint definition and the legend read off the
// exact same rows instead of the color being retyped by hand in two places.
export function statusColorExpr(list, colorKey = "color", fallbackKey = "existing") {
  const fallback = list.find(x => x.key === fallbackKey)?.[colorKey];
  const expr = ["match", ["get", "status"]];
  list.forEach(x => { if (x.key !== fallbackKey) expr.push(x.key, x[colorKey]); });
  expr.push(fallback);
  return expr;
}

// How current the routing model's data is. Everything the grid API computes
// (supply points, routes, losses, GenCo ranking) is calculated on request,
// but from a fixed dataset — server/init/01-onction-grid.sql — not from live
// grid readings. Update these when that file's data changes.
export const NETWORK_DATA_AS_OF = "2026-09-28"; // substations and lines (last edit to the seed file)
export const DEAL_DATA_AS_OF = "2026-08-20";    // GenCo tariffs and commitments (the source analysis)

const fmt = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const MODEL_DATA_NOTE =
  `Calculated now from Onction's network model, not from live grid readings. ` +
  `Network data last updated ${fmt(NETWORK_DATA_AS_OF)}; GenCo tariffs and commitments as of ${fmt(DEAL_DATA_AS_OF)}.`;

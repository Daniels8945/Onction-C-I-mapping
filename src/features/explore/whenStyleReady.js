// Run a map-drawing function as soon as the map's STYLE can take new
// sources/layers — not when every tile has loaded.
//
// The route-line bug: draw code used to bail out when map.isStyleLoaded()
// was false, which in MapLibre also happens whenever tiles are still
// loading (e.g. mid fly-to). Nothing retried once the layers already
// existed, so a route picked while the map was moving drew nothing until
// something else (like swapping the ends) called draw again.
//
// Only the latest pending call per `key` runs, so a stale draw can never
// overwrite a newer one.
const pending = new WeakMap(); // map -> Map(key -> fn)

const styleAccepting = (map) => !!map.style && map.style._loaded !== false && (() => {
  try { map.getStyle(); return true; } catch { return false; }
})();

export function whenStyleReady(map, key, fn) {
  if (!map) return;
  let byKey = pending.get(map);
  if (!byKey) { byKey = new Map(); pending.set(map, byKey); }
  byKey.delete(key);
  if (styleAccepting(map)) {
    try { fn(); return; } catch (e) {
      if (!/style is not done loading/i.test(e.message)) throw e;
    }
  }
  byKey.set(key, fn);
  const flush = () => {
    const queued = pending.get(map);
    if (!queued?.size) return;
    if (!styleAccepting(map)) { map.once("styledata", flush); return; }
    const fns = [...queued.values()];
    queued.clear();
    fns.forEach(f => f());
  };
  map.once("styledata", flush);
  map.once("idle", flush);
}

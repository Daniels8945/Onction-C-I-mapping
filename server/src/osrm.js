// Real road distance + road-following geometry for the LAST MILE only
// (injection substation -> final destination) via a self-hosted OSRM instance.
// Trunk hops stay on grid_edge corridor data — actual transmission lines don't
// follow roads, so OSRM has no business touching that part of the route.
const OSRM_URL = process.env.OSRM_URL || "http://localhost:5001";

// Returns null on any failure (OSRM down, point off the road network, etc.)
// so callers can fall back to the straight-line haversine estimate.
export async function roadRoute(from, to) {
  try {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    const route = data.routes[0];
    return { distanceKm: route.distance / 1000, geometry: route.geometry.coordinates };
  } catch {
    return null;
  }
}

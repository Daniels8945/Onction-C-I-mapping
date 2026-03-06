// ─────────────────────────────────────────────────────────────
//  Spatial Analysis Utilities  (Turf.js wrappers)
//  All pure functions — no side-effects, no DOM access.
// ─────────────────────────────────────────────────────────────
import * as turf from "@turf/turf";
import { GENCOS, DISCOS } from "../data";

/**
 * Draw a circular buffer around a point and count features inside.
 * @param {[number,number]} lngLat  — [longitude, latitude]
 * @param {number}          radiusKm
 * @returns {{ buffered, gencoCount, discoCount, totalCapacity, gencoNames }}
 */
export function computeBuffer(lngLat, radiusKm = 100) {
  const pt       = turf.point(lngLat);
  const buffered = turf.buffer(pt, radiusKm, { units: "kilometers" });

  const gencoFC = turf.featureCollection(GENCOS.map(g => turf.point([g.lng, g.lat], g)));
  const discoFC = turf.featureCollection(DISCOS.map(d => turf.point([d.lng, d.lat], d)));

  const insideGencos = turf.pointsWithinPolygon(gencoFC, buffered);
  const insideDISCOs = turf.pointsWithinPolygon(discoFC, buffered);

  const totalCapacity = insideGencos.features
    .reduce((sum, f) => sum + Number(f.properties.capacity), 0);

  const gencoNames = insideGencos.features
    .map(f => `${f.properties.name} (${f.properties.capacity} MW)`);

  return {
    buffered,
    gencoCount:    insideGencos.features.length,
    discoCount:    insideDISCOs.features.length,
    totalCapacity,
    gencoNames,
  };
}

/**
 * Measure the straight-line distance and bearing between two coordinates.
 * @param {[number,number]} from — [lng, lat]
 * @param {[number,number]} to   — [lng, lat]
 * @returns {{ distanceKm, bearing }}
 */
export function measureDistance(from, to) {
  const p1 = turf.point(from);
  const p2 = turf.point(to);
  return {
    distanceKm: turf.distance(p1, p2, { units: "kilometers" }),
    bearing:    turf.bearing(p1, p2),
  };
}

/**
 * Find the nearest GenCo to a given point.
 * @param {[number,number]} lngLat — [longitude, latitude]
 * @returns {{ name, type, capacity, fuel, owner, distanceKm, coordinates }}
 */
export function findNearestGenco(lngLat) {
  const from    = turf.point(lngLat);
  const gencoFC = turf.featureCollection(GENCOS.map(g => turf.point([g.lng, g.lat], g)));
  const nearest = turf.nearestPoint(from, gencoFC);
  const distKm  = turf.distance(from, nearest, { units: "kilometers" });

  return {
    ...nearest.properties,
    distanceKm:  distKm,
    coordinates: nearest.geometry.coordinates,
  };
}

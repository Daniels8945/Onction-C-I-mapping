import * as turf from "@turf/turf";
import { GENCOS, DISCOS } from "../data";

export function computeBuffer(lngLat, radiusKm = 100) {
  const pt       = turf.point(lngLat);
  const buffered = turf.buffer(pt, radiusKm, { units: "kilometers" });
  const gencoFC  = turf.featureCollection(GENCOS.map(g => turf.point([g.lng, g.lat], g)));
  const discoFC  = turf.featureCollection(DISCOS.map(d => turf.point([d.lng, d.lat], d)));
  const inGencos = turf.pointsWithinPolygon(gencoFC, buffered);
  const inDiscos = turf.pointsWithinPolygon(discoFC, buffered);
  const totalCapacity = inGencos.features.reduce((s, f) => s + Number(f.properties.capacity), 0);
  const gencoNames    = inGencos.features.map(f => `${f.properties.name} (${f.properties.capacity} MW)`);
  return { buffered, gencoCount: inGencos.features.length, discoCount: inDiscos.features.length, totalCapacity, gencoNames };
}

export function measureDistance(from, to) {
  const p1 = turf.point(from), p2 = turf.point(to);
  return { distanceKm: turf.distance(p1, p2, { units: "kilometers" }), bearing: turf.bearing(p1, p2) };
}

export function findNearestGenco(lngLat) {
  const from    = turf.point(lngLat);
  const gencoFC = turf.featureCollection(GENCOS.map(g => turf.point([g.lng, g.lat], g)));
  const nearest = turf.nearestPoint(from, gencoFC);
  return { ...nearest.properties, distanceKm: turf.distance(from, nearest, { units: "kilometers" }), coordinates: nearest.geometry.coordinates };
}

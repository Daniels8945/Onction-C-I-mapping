import * as THREE from "three";
import maplibregl from "maplibre-gl";
import { loadModels, meshParts, Instanced } from "@/features/connect/connect3d";

// Grid Route in 3D: a MapLibre custom layer drawing, with three.js and the
// same Blender models as the Connect view, the modelled grid path of a
// route — substation yards at its nodes, miniature 330 kV towers and
// conductors along its corridors, and energy pulses flowing A → B.
//
// The towers are illustrative: the network data holds each corridor as a
// straight span between two substations, not tower positions. They're placed
// ON that modelled path (never moved off it to look better), at a spacing
// chosen for the screen, not the real ~400 m span:
//   • density adapts to zoom, route length and screen size — spacing is set
//     in screen pixels, so a 400 km route at country zoom gets a handful of
//     representative towers and the same route close up gets more;
//   • spacing snaps to powers of two of the real span, so zooming in only
//     ADDS towers between the ones already there (no sliding or reshuffle),
//     with hysteresis so small zoom changes don't flip density back and forth;
//   • far out (below DETAIL_ZOOM) towers become simple markers;
//   • only towers in (or just outside) the view are built, capped.
// The first/last miles are not lines in the data, so they get no towers.

const SPAN_M = 400;            // a real 330 kV span: the finest spacing ever used
const MAX_TOWERS = 160;
const MIN_GAP_PX = 64;         // closest two detailed towers may appear on screen
const MIN_GAP_SIMPLE_PX = 34;  // …and two simple markers
const DETAIL_ZOOM = 6.5;       // detailed models at or above this zoom (±0.15 hysteresis)
const PULSES = 18;
const WIRE = 0x0ea5e9;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function createRoute3D(map) {
  const layerId = "route-3d";
  const state = { data: null, enabled: false, models: null, view: { towers: true, substations: true, flow: true } };
  let three = null, origin = null;
  let built = { zoom: null, k: null, detailed: null, bounds: null };
  let phase = 0, lastFrame = null, pending = null;

  const toLocal = (lng, lat) => {
    const m = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
    const s = origin.meterInMercatorCoordinateUnits();
    return new THREE.Vector3((m.x - origin.x) / s, (m.y - origin.y) / s, 0);
  };
  const metresPerPx = () => 1 / (512 * 2 ** map.getZoom() * origin.meterInMercatorCoordinateUnits());
  const sizePx = (base) => base * Math.min(1.8, Math.max(0.6, 1.12 ** (map.getZoom() - 10)));

  // The route's grid path as segments in local metres, with the distance
  // along the path where each starts (so tower spots are stable).
  function pathSegments() {
    const nodes = state.data.nodes;
    const segs = [];
    let along = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const A = toLocal(a.lng, a.lat), B = toLocal(b.lng, b.lat);
      const len = A.distanceTo(B);
      if (len < 1) continue;
      segs.push({ a, b, A, B, len, start: along, dir: B.clone().sub(A).divideScalar(len) });
      along += len;
    }
    return { segs, total: along };
  }

  // Spacing level k: towers every SPAN_M·2^k metres along the path. The
  // smallest k that keeps towers MIN_GAP apart on screen, kept as it is
  // while it's still within tolerance (no flicker on small zooms).
  function spacingLevel(minGapPx) {
    const want = Math.log2(Math.max(1, (minGapPx * metresPerPx()) / SPAN_M));
    const prev = built.k;
    if (prev != null && want <= prev + 0.15 && want > prev - 0.85) return prev;
    return Math.max(0, Math.ceil(want));
  }

  function towerSites(detailed, subClearM) {
    const { segs, total } = pathSegments();
    const b = map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.15, padLat = (b.getNorth() - b.getSouth()) * 0.15;
    const inView = (lng, lat) => lng > b.getWest() - padLng && lng < b.getEast() + padLng && lat > b.getSouth() - padLat && lat < b.getNorth() + padLat;
    let k = spacingLevel(detailed ? MIN_GAP_PX : MIN_GAP_SIMPLE_PX);
    for (let attempt = 0; attempt < 8; attempt++, k++) {
      const step = SPAN_M * 2 ** k;
      const sites = [];
      // Spots at (j + ½)·step along the whole path, so they never sit on a
      // substation and a finer level contains every spot of a coarser one.
      for (let d = step / 2; d < total; d += step) {
        const seg = segs.find(s => d >= s.start && d < s.start + s.len);
        if (!seg) continue;
        const t = (d - seg.start) / seg.len;
        const p = seg.A.clone().addScaledVector(seg.dir, d - seg.start);
        if (p.distanceTo(seg.A) < subClearM || p.distanceTo(seg.B) < subClearM) continue;
        const lng = seg.a.lng + (seg.b.lng - seg.a.lng) * t, lat = seg.a.lat + (seg.b.lat - seg.a.lat) * t;
        if (!inView(lng, lat)) continue;
        sites.push({ p, rot: Math.atan2(seg.dir.x, -seg.dir.y), seg, lng, lat });
      }
      if (sites.length <= MAX_TOWERS) { built.k = k; return sites; }
    }
    return [];
  }

  function buildStatic() {
    const { scene, models } = three;
    three.towers = new Instanced(meshParts(models.tower), MAX_TOWERS);
    // Far-out stand-in: a slim pylon marker, one draw call for all of them.
    three.markers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshLambertMaterial({ color: WIRE }), MAX_TOWERS);
    three.markers.count = 0; three.markers.frustumCulled = false;
    three.wires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.9 }));
    three.wires.frustumCulled = false;
    three.subs = new THREE.Group();
    three.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), PULSES);
    three.pulses.frustumCulled = false;
    scene.add(three.towers.group, three.markers, three.wires, three.subs, three.pulses);
  }

  function buildSubs() {
    three.subs.clear();
    for (const n of state.data.nodes) {
      const holder = new THREE.Group();
      const yard = three.models.substation.clone();
      yard.rotation.x = Math.PI / 2;
      holder.add(yard);
      holder.position.copy(toLocal(n.lng, n.lat));
      holder.userData.node = n.name;
      three.subs.add(holder);
    }
  }

  function rebuild() {
    if (!three || !state.data || !origin) return;
    const v = state.view;
    const z = map.getZoom();
    const detailed = built.detailed == null ? z >= DETAIL_ZOOM : built.detailed ? z >= DETAIL_ZOOM - 0.15 : z >= DETAIL_ZOOM + 0.15;
    if (detailed !== built.detailed) built.k = null; // different gap rule
    built.detailed = detailed;
    const mpp = metresPerPx();
    const towerM = sizePx(40) * mpp, subM = sizePx(46) * mpp, markerM = sizePx(16) * mpp;

    const sites = v.towers ? towerSites(detailed, subM * 0.7) : [];
    const toM = (s, size) => new THREE.Matrix4().compose(s.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.rot), new THREE.Vector3(size, size, size));
    three.towers.set(detailed ? sites.map(s => ({ ...s, info: null })) : [], (s) => toM(s, towerM));
    const tmp = new THREE.Matrix4();
    const markerSites = detailed ? [] : sites;
    markerSites.forEach((s, i) => three.markers.setMatrixAt(i, tmp.copy(toM(s, markerM))));
    three.markers.count = markerSites.length;
    three.markers.instanceMatrix.needsUpdate = true;

    // Conductors between neighbouring towers on the same corridor.
    const pos = [];
    if (detailed) {
      const arms = [[0.36, 0.76], [-0.36, 0.76], [0.30, 0.90], [-0.30, 0.90], [0, 1.08]];
      for (let i = 0; i < sites.length - 1; i++) {
        const s0 = sites[i], s1 = sites[i + 1];
        if (s0.seg !== s1.seg || s0.p.distanceTo(s1.p) > SPAN_M * 2 ** built.k * 1.01) continue; // a gap clipped by the view
        for (const [ax, az] of arms) {
          const off = (s) => new THREE.Vector3(Math.cos(s.rot) * ax * towerM, Math.sin(s.rot) * ax * towerM, (az - 0.055) * towerM).add(s.p);
          const p0 = off(s0), p1 = off(s1);
          pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
      }
    }
    three.wires.geometry.dispose();
    three.wires.geometry = new THREE.BufferGeometry();
    three.wires.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));

    three.subs.visible = v.substations;
    for (const h of three.subs.children) h.scale.setScalar(subM * 0.9);

    // Energy flow: pulses along the grid path, A → B, at conductor height.
    const { segs } = pathSegments();
    three.curve = null;
    if (segs.length) {
      const h = (detailed ? towerM * 0.9 : markerM * 0.6);
      const path = new THREE.CurvePath();
      segs.forEach(s => path.add(new THREE.LineCurve3(s.A.clone().setZ(h), s.B.clone().setZ(h))));
      three.curve = path;
      three.pulseR = Math.max(towerM * 0.06, mpp * 2.2);
    }
    three.pulses.visible = !!three.curve && v.flow;
    three.sites = sites;
    three.counts = { towers: detailed ? sites.length : 0, markers: markerSites.length, wires: pos.length / 6, spacingM: built.k != null ? SPAN_M * 2 ** built.k : null };
    built.zoom = z;
    built.bounds = map.getBounds().toArray().flat().map(x => x.toFixed(4)).join(",");
  }

  const layer = {
    id: layerId, type: "custom", renderingMode: "3d",
    onAdd(m, gl) {
      const renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-0.6, 0.4, 1);
      scene.add(sun);
      three = { renderer, scene, camera: new THREE.Camera(), models: state.models };
      buildStatic();
      buildSubs();
      rebuild();
    },
    render(gl, args) {
      if (!three || !origin || !state.data) return;
      const mapMatrix = args?.defaultProjectionData?.mainMatrix || args;
      const s = origin.meterInMercatorCoordinateUnits();
      const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0).scale(new THREE.Vector3(s, s, s));
      three.camera.projectionMatrix = new THREE.Matrix4().fromArray(mapMatrix).multiply(local);
      if (built.zoom == null || Math.abs(map.getZoom() - built.zoom) > 0.04) rebuild();
      if (three.curve && three.pulses.visible) {
        const now = performance.now();
        if (!reducedMotion() && lastFrame != null) phase = (phase + (now - lastFrame) / 6000) % 1;
        lastFrame = now;
        const tmp = new THREE.Matrix4();
        for (let i = 0; i < PULSES; i++) {
          const t = (phase + i / PULSES) % 1;
          tmp.compose(three.curve.getPointAt(t), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(three.pulseR));
          three.pulses.setMatrixAt(i, tmp);
        }
        three.pulses.instanceMatrix.needsUpdate = true;
      }
      three.renderer.resetState();
      three.renderer.render(three.scene, three.camera);
      if (three.curve && three.pulses.visible && !reducedMotion() && !document.hidden && !pending) {
        pending = setTimeout(() => { pending = null; map.triggerRepaint(); }, 33);
      }
    },
    onRemove() {
      three?.renderer.dispose();
      three = null; built = { zoom: null, k: null, detailed: null, bounds: null };
    },
  };

  // Panning and resizing change which towers are in view; zoom is handled
  // in render(). Same-view events (e.g. a resize back) don't rebuild.
  const onMoveEnd = () => {
    if (!three) return;
    const key = map.getBounds().toArray().flat().map(x => x.toFixed(4)).join(",");
    if (key !== built.bounds) { rebuild(); map.triggerRepaint(); }
  };

  function addLayer() {
    if (!state.enabled || !state.models || !state.data || map.getLayer(layerId)) return;
    map.addLayer(layer);
  }

  map.on("moveend", onMoveEnd);
  map.on("resize", onMoveEnd);

  return {
    // { nodes: [{ name, lng, lat }] } — the route's grid path, in order.
    setData(data) {
      state.data = data && data.nodes.length >= 2 ? data : null;
      if (!state.data) { if (map.getLayer(layerId)) map.removeLayer(layerId); return; }
      const lngs = state.data.nodes.map(n => n.lng), lats = state.data.nodes.map(n => n.lat);
      origin = maplibregl.MercatorCoordinate.fromLngLat([(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2], 0);
      built.k = null;
      if (three) { buildSubs(); rebuild(); map.triggerRepaint(); } else addLayer();
    },
    setView(v) {
      state.view = { ...state.view, ...v };
      if (three) { rebuild(); map.triggerRepaint(); }
    },
    async setEnabled(on) {
      state.enabled = on;
      if (!on) { if (map.getLayer(layerId)) map.removeLayer(layerId); return; }
      state.models = await loadModels();
      if (state.enabled) addLayer();
    },
    restore() { addLayer(); },
    destroy() {
      map.off("moveend", onMoveEnd); map.off("resize", onMoveEnd);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      clearTimeout(pending);
      state.data = null;
    },
    debug() {
      if (!three) return { active: false, enabled: state.enabled };
      return {
        active: true, layers: (map.style?._order || []).filter(id => id === layerId).length,
        sceneObjects: three.scene.children.length, substations: three.subs.children.length, substationsVisible: three.subs.visible,
        detailed: built.detailed, towers: three.towers.meshes[0]?.count || 0, markers: three.markers.count, wires: three.counts?.wires ?? 0,
        spacingM: three.counts?.spacingM ?? null, pulses: three.pulses.visible,
        // Where the drawn towers are: on screen (spacing) and on the map (on the path).
        towerScreen: (three.sites || []).map(t => ({ lng: t.lng, lat: t.lat, seg: `${t.seg.a.name}|${t.seg.b.name}`, ...map.project([t.lng, t.lat]) })),
      };
    },
  };
}

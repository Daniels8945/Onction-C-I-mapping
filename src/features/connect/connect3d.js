import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import maplibregl from "maplibre-gl";

// The Connect view's miniature 3D layer — a MapLibre custom layer drawing,
// with three.js, the infrastructure the assessment found around one customer:
//   • a substation yard on every candidate substation (the data's own points)
//   • 330/132 kV lattice towers + conductors along the nearby corridors
//   • the customer's works at the customer point
//   • a raised, glowing "potential connection" arc from the chosen substation
//     to the customer, with energy pulses flowing toward the customer.
// Models come from blender/build_models.py (public/models/*.glb, normalised
// units) and are sized in screen pixels — a miniature, not to scale — so they
// read at any zoom. Lazy-loaded: none of this (three.js included) is fetched
// until 3D is switched on.
//
// Coordinates: one origin per customer; everything is placed in local metres
// (x east, y south — Mercator's direction — z up) and the origin/scale is
// folded into the projection matrix in float64, so nothing jitters at high
// zoom. Tower positions along a corridor are illustrative (the dataset holds
// corridors as straight spans between substations, not tower locations).

const MODEL_BASE = `${import.meta.env.BASE_URL}models/`;
const STATUS_WIRE = { existing: 0x0ea5e9, ongoing: 0x9ca3af, proposed: 0xef4444 };
const ARC = 0xf5a623;
const MAX_TOWERS = 260;
const REAL_SPAN_M = 400;          // a typical 330 kV span — the closest towers ever get
const PULSES = 14;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let modelsPromise = null;
function loadModels() {
  if (!modelsPromise) {
    const loader = new GLTFLoader();
    const load = (f) => loader.loadAsync(MODEL_BASE + f).then(g => {
      g.scene.traverse(o => {
        if (o.isMesh) { o.material.side = THREE.DoubleSide; }
      });
      return g.scene;
    });
    modelsPromise = Promise.all([load("tower_330kv.glb"), load("substation.glb"), load("customer_site.glb")])
      .then(([tower, substation, customer]) => ({ tower, substation, customer }))
      .catch(e => { modelsPromise = null; throw e; });
  }
  return modelsPromise;
}

// Sub-meshes of a model with their transforms baked relative to the model
// root (Y-up glTF → our Z-up), for building InstancedMeshes.
function meshParts(root) {
  const up = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: up.clone().multiply(o.matrixWorld) }); });
  return parts;
}

const ghosts = new Map();
function ghostMaterial(m, opacity) {
  const key = `${m.uuid}:${opacity}`;
  if (!ghosts.has(key)) {
    const g = m.clone();
    g.transparent = true; g.opacity = opacity; g.depthWrite = false;
    ghosts.set(key, g);
  }
  return ghosts.get(key);
}

// Instanced copies of a model: one InstancedMesh per sub-mesh.
class Instanced {
  constructor(parts, capacity, { opacity = 1 } = {}) {
    this.parts = parts;
    this.group = new THREE.Group();
    this.meshes = parts.map(p => {
      const m = new THREE.InstancedMesh(p.geometry, opacity < 1 ? ghostMaterial(p.material, opacity) : p.material, capacity);
      m.count = 0; m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    this.info = [];
  }
  set(items, toMatrix) {
    const tmp = new THREE.Matrix4();
    this.info = items.map(i => i.info);
    this.meshes.forEach((m, k) => {
      const n = Math.min(items.length, m.instanceMatrix.count);
      for (let i = 0; i < n; i++) m.setMatrixAt(i, tmp.multiplyMatrices(toMatrix(items[i]), this.parts[k].matrix));
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }
}

export function createConnect3D(map, { onHover, onClick } = {}) {
  const state = { data: null, selected: null, focusLine: null, enabled: false, models: null, error: null, view: null };
  // Presentation filters (see useConnect's VIEW_DEFAULTS): which categories,
  // which individual substations, "only this connection". They decide what
  // is drawn from state.data — never what state.data holds.
  const view = () => state.view || { kv330: true, kv132: true, substations: true, customer: true, connection: true, flow: true, flowPaused: false, focus: false, hidden: [] };
  const lineKv = (l) => (l.voltage_kv >= 330 ? 330 : 132);
  const attached = (l) => l.from_node === state.selected || l.to_node === state.selected;
  const lineShown = (l) => { const v = view(); return (lineKv(l) === 330 ? v.kv330 : v.kv132) && (!(v.focus && state.selected) || attached(l)); };
  const subShown = (c) => { const v = view(); return v.substations && !v.hidden.includes(c.name) && (!(v.focus && state.selected) || c.name === state.selected); };
  let phase = 0, lastFrame = null;   // energy-flow animation clock (pausable)
  const layerId = "connect-3d";
  let three = null;   // { renderer, scene, camera, ...objects } once the layer is added
  let origin = null;  // MercatorCoordinate of the customer
  let built = { zoom: null, key: null };
  let raf = null, lastHoverKey = null, pending = null;

  // ── geometry helpers ────────────────────────────────────────────────
  const toLocal = (lng, lat) => {
    const m = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
    const s = origin.meterInMercatorCoordinateUnits();
    return new THREE.Vector3((m.x - origin.x) / s, (m.y - origin.y) / s, 0);
  };
  // Metres per screen pixel at the customer, for the current zoom.
  const metresPerPx = () => 1 / (512 * 2 ** map.getZoom() * origin.meterInMercatorCoordinateUnits());
  // Miniature size: grows gently with zoom so close-ups feel physical.
  const sizePx = (base) => base * Math.min(1.8, Math.max(0.6, 1.12 ** (map.getZoom() - 10)));

  // ── scene building ──────────────────────────────────────────────────
  function buildStatic() {
    const { scene, models } = three;
    const towerParts = meshParts(models.tower);
    three.towers = new Instanced(towerParts, MAX_TOWERS);
    three.towersGhost = new Instanced(towerParts, MAX_TOWERS, { opacity: 0.35 });
    scene.add(three.towers.group, three.towersGhost.group);
    three.wires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    three.wires.frustumCulled = false;
    scene.add(three.wires);
    three.subs = new THREE.Group();
    three.customer = models.customer.clone();
    three.customer.rotation.x = Math.PI / 2;
    three.customerHolder = new THREE.Group();
    three.customerHolder.add(three.customer);
    three.customerHolder.userData.hit = { kind: "customer" };
    scene.add(three.subs, three.customerHolder);
    // Highlight ring under the chosen substation.
    three.ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.7, 64), new THREE.MeshBasicMaterial({ color: ARC, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    scene.add(three.ring);
    // Potential-connection arc + pulses.
    three.arc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ARC, transparent: true, opacity: 0.85 }));
    three.arcGlow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ARC, transparent: true, opacity: 0.18, depthWrite: false }));
    three.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), PULSES);
    three.pulses.frustumCulled = false;
    scene.add(three.arc, three.arcGlow, three.pulses);
  }

  // Which corridor points to put towers on: inside the radius and the view
  // (padded), spaced so towers never overlap on screen, capped.
  function towerSites(towerM) {
    const d = state.data;
    const radiusM = (d.radiusKm || 50) * 1000 * 1.1;
    const b = map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.15, padLat = (b.getNorth() - b.getSouth()) * 0.15;
    const inView = (lng, lat) => lng > b.getWest() - padLng && lng < b.getEast() + padLng && lat > b.getSouth() - padLat && lat < b.getNorth() + padLat;
    let spacing = Math.max(REAL_SPAN_M, towerM * 1.9);
    for (let attempt = 0; attempt < 6; attempt++) {
      const sites = [];
      for (const line of d.lines.filter(lineShown)) {
        const [a, c] = line.coordinates;
        const A = toLocal(a[0], a[1]), C = toLocal(c[0], c[1]);
        const len = A.distanceTo(C);
        if (len < 1) continue;
        const dir = C.clone().sub(A).divideScalar(len);
        const rot = Math.atan2(dir.x, -dir.y);
        const n = Math.floor(len / spacing);
        for (let i = 0; i <= n; i++) {
          const p = A.clone().addScaledVector(dir, Math.min(len, i * spacing + (len - n * spacing) / 2));
          if (p.length() > radiusM) continue;
          const lng = a[0] + (c[0] - a[0]) * (A.distanceTo(p) / len), lat = a[1] + (c[1] - a[1]) * (A.distanceTo(p) / len);
          if (!inView(lng, lat)) continue;
          sites.push({ p, rot, line });
        }
      }
      if (sites.length <= MAX_TOWERS) return sites;
      spacing *= Math.sqrt(sites.length / MAX_TOWERS) * 1.05;
    }
    return [];
  }

  // One yard per candidate substation: the chosen one larger, the others
  // receding; unbuilt (ongoing / proposed) ones as ghosts. Rebuilt only when
  // the data or the selection changes — zooming just rescales.
  function buildSubs() {
    if (!three || !state.data || !origin) return;
    three.subs.clear();
    for (const c of state.data.candidates.filter(subShown)) {
      const sel = c.name === state.selected;
      const holder = new THREE.Group();
      const yard = three.models.substation.clone();
      yard.rotation.x = Math.PI / 2;
      if (c.status !== "existing" || (state.selected && !sel)) {
        const op = c.status !== "existing" ? 0.4 : 0.7;
        yard.traverse(o => { if (o.isMesh) o.material = ghostMaterial(o.material, op); });
      }
      holder.add(yard);
      holder.position.copy(toLocal(c.lon, c.lat));
      holder.userData.hit = { kind: "substation", candidate: c };
      holder.userData.rel = sel ? 1.25 : c.supply_point ? 0.9 : 0.75;
      three.subs.add(holder);
    }
  }

  function rebuild() {
    if (!three || !state.data || !origin) return;
    const d = state.data;
    const mpp = metresPerPx();
    const towerM = sizePx(40) * mpp;
    const subM = sizePx(46) * mpp;
    const custM = sizePx(40) * mpp;

    // Towers + conductors.
    const sites = towerSites(towerM);
    const solid = sites.filter(s => s.line.status !== "proposed"), ghost = sites.filter(s => s.line.status === "proposed");
    const toM = (s) => new THREE.Matrix4().compose(s.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.rot), new THREE.Vector3(towerM, towerM, towerM));
    three.towers.set(solid.map(s => ({ ...s, info: { kind: "line", line: s.line } })), toM);
    three.towersGhost.set(ghost.map(s => ({ ...s, info: { kind: "line", line: s.line } })), toM);
    const pos = [], col = [];
    const byLine = new Map();
    sites.forEach(s => { if (!byLine.has(s.line)) byLine.set(s.line, []); byLine.get(s.line).push(s); });
    const arms = [[0.36, 0.76], [-0.36, 0.76], [0.30, 0.90], [-0.30, 0.90], [0, 1.08]];
    for (const [line, list] of byLine) {
      const c = new THREE.Color(STATUS_WIRE[line.status] ?? 0x94a3b8);
      for (let i = 0; i < list.length - 1; i++) {
        const s0 = list[i], s1 = list[i + 1];
        if (s0.p.distanceTo(s1.p) > towerM * 12 + REAL_SPAN_M * 3) continue; // a gap (clipped by the view) — don't bridge it
        for (const [ax, az] of arms) {
          const off = (s) => new THREE.Vector3(Math.cos(s.rot) * ax * towerM, Math.sin(s.rot) * ax * towerM, (az - 0.055) * towerM).add(s.p);
          const p0 = off(s0), p1 = off(s1);
          pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
    three.wires.geometry.dispose();
    three.wires.geometry = new THREE.BufferGeometry();
    three.wires.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    three.wires.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));

    // Substations: sized for this zoom (built in buildSubs).
    for (const holder of three.subs.children) {
      const c = holder.userData.hit.candidate;
      holder.scale.setScalar(subM * holder.userData.rel);
      if (c.name === state.selected) {
        three.ring.position.copy(holder.position).setZ(subM * 0.01);
        three.ring.scale.setScalar(subM * holder.userData.rel);
      }
    }
    three.ring.visible = !!state.selected && three.subs.children.some(h => h.userData.hit.candidate.name === state.selected);

    // Customer.
    three.customerHolder.position.set(0, 0, 0);
    three.customerHolder.scale.setScalar(custM);
    three.customerHolder.visible = view().customer;

    // Arc: selected substation → customer.
    const cand = d.candidates.find(c => c.name === state.selected);
    three.arc.visible = three.arcGlow.visible = !!cand && view().connection;
    three.pulses.visible = three.arc.visible && view().flow;
    three.counts = { kv330: sites.filter(x => lineKv(x.line) === 330).length, kv132: sites.filter(x => lineKv(x.line) === 132).length, wires: pos.length / 6 };
    if (cand) {
      const A = toLocal(cand.lon, cand.lat), B = new THREE.Vector3(0, 0, custM * 0.25);
      A.z = subM * 0.35;
      const len = A.distanceTo(B);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      mid.z += Math.min(len * 0.22, towerM * 3.2) + towerM * 0.6;
      three.curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      const r = Math.max(towerM * 0.035, mpp * 1.6);
      three.arc.geometry.dispose(); three.arcGlow.geometry.dispose();
      three.arc.geometry = new THREE.TubeGeometry(three.curve, 96, r, 6, false);
      three.arcGlow.geometry = new THREE.TubeGeometry(three.curve, 96, r * 3.2, 8, false);
      three.pulseR = r * 2.4;
    }
    built.zoom = map.getZoom();
  }

  // ── render loop ─────────────────────────────────────────────────────
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
      three = { renderer, scene, camera: new THREE.Camera(), models: state.models, raycaster: new THREE.Raycaster() };
      buildStatic();
      buildSubs();
      rebuild();
    },
    render(gl, args) {
      if (!three || !origin || !state.data) return;
      const mapMatrix = args?.defaultProjectionData?.mainMatrix || args;  // v5 / v4 signature
      const s = origin.meterInMercatorCoordinateUnits();
      const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0).scale(new THREE.Vector3(s, s, s));
      three.camera.projectionMatrix = new THREE.Matrix4().fromArray(mapMatrix).multiply(local);
      three.camera.projectionMatrixInverse.copy(three.camera.projectionMatrix).invert();
      if (built.zoom == null || Math.abs(map.getZoom() - built.zoom) > 0.04) rebuild();
      if (three.curve && three.pulses.visible) {
        const now = performance.now();
        if (!view().flowPaused && !reducedMotion() && lastFrame != null) phase = (phase + (now - lastFrame) / 2600) % 1;
        lastFrame = now;
        const t0 = phase;
        const tmp = new THREE.Matrix4();
        for (let i = 0; i < PULSES; i++) {
          const t = (t0 + i / PULSES) % 1;
          const fade = Math.sin(Math.PI * t);
          tmp.compose(three.curve.getPointAt(t), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(three.pulseR * (0.55 + 0.45 * fade)));
          three.pulses.setMatrixAt(i, tmp);
        }
        three.pulses.instanceMatrix.needsUpdate = true;
      }
      three.renderer.resetState();
      three.renderer.render(three.scene, three.camera);
      // Pulses animate at ~30 fps — enough to read as flow, half the cost of
      // redrawing the whole map every frame.
      if (three.curve && three.pulses.visible && !view().flowPaused && !reducedMotion() && !document.hidden && !pending) {
        pending = setTimeout(() => { pending = null; map.triggerRepaint(); }, 33);
      }
    },
    onRemove() {
      three?.renderer.dispose();
      three = null; built = { zoom: null, key: null };
    },
  };

  // ── picking ─────────────────────────────────────────────────────────
  function pick(point) {
    if (!three || !state.enabled) return null;
    const canvas = map.getCanvas();
    const x = (point.x / canvas.clientWidth) * 2 - 1, y = 1 - (point.y / canvas.clientHeight) * 2;
    const inv = three.camera.projectionMatrixInverse;
    const near = new THREE.Vector3(x, y, -1).applyMatrix4(inv), far = new THREE.Vector3(x, y, 1).applyMatrix4(inv);
    three.raycaster.ray.set(near, far.sub(near).normalize());
    const targets = [three.customerHolder, three.subs, three.towers.group, three.towersGhost.group];
    const hits = three.raycaster.intersectObjects(targets, true);
    // three.js raycasts invisible objects too — a hidden layer must not be hoverable.
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    for (const h of hits) {
      if (!shown(h.object)) continue;
      if (h.object.isInstancedMesh && h.instanceId != null) {
        const set = three.towers.meshes.includes(h.object) ? three.towers : three.towersGhost.meshes.includes(h.object) ? three.towersGhost : null;
        if (set) return set.info[h.instanceId];
      }
      let o = h.object;
      while (o && !o.userData.hit) o = o.parent;
      if (o) return o.userData.hit;
    }
    return null;
  }
  const hitKey = (h) => h ? `${h.kind}:${h.candidate?.name || (h.line ? `${h.line.from_node}|${h.line.to_node}` : "")}` : null;

  const onMove = (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const h = pick(e.point);
      const key = hitKey(h);
      map.getCanvas().style.cursor = h ? "pointer" : "";
      if (key !== lastHoverKey || h) onHover?.(h, e.point);
      lastHoverKey = key;
    });
  };
  const onLeave = () => { lastHoverKey = null; onHover?.(null); };
  const onMapClick = (e) => { const h = pick(e.point); if (h) onClick?.(h, e); };
  const onMoveEnd = () => { if (three) { rebuild(); map.triggerRepaint(); } };

  function addLayer() {
    if (!state.enabled || !state.models || !state.data || map.getLayer(layerId)) return;
    map.addLayer(layer);
  }

  return {
    // Data from the assessment: { customer:{lng,lat}, candidates, lines, radiusKm }.
    setData(data) {
      state.data = data;
      origin = data ? maplibregl.MercatorCoordinate.fromLngLat([data.customer.lng, data.customer.lat], 0) : null;
      if (three) { buildSubs(); rebuild(); map.triggerRepaint(); }
      else addLayer();
    },
    // Presentation only: re-filter what's drawn. No reload, no new layer.
    setView(v) {
      const prev = state.view;
      state.view = v;
      if (!v.flowPaused) lastFrame = null;  // resume without a jump
      if (!three) return;
      const subsChanged = !prev || prev.substations !== v.substations || prev.focus !== v.focus || prev.hidden.join("|") !== v.hidden.join("|");
      if (subsChanged) buildSubs();
      rebuild(); map.triggerRepaint();
    },
    resetFlow() { phase = 0; lastFrame = null; map.triggerRepaint(); },
    setSelected(name) {
      state.selected = name;
      if (three) { buildSubs(); rebuild(); map.triggerRepaint(); }
    },
    async setEnabled(on) {
      state.enabled = on;
      if (!on) { if (map.getLayer(layerId)) map.removeLayer(layerId); onHover?.(null); return; }
      state.models = await loadModels();
      if (state.enabled) addLayer();
    },
    // After a style swap (theme change) the custom layer is gone — re-add.
    restore() { addLayer(); },
    pick,
    bind() {
      map.on("mousemove", onMove); map.on("mouseout", onLeave); map.on("click", onMapClick); map.on("moveend", onMoveEnd);
    },
    destroy() {
      map.off("mousemove", onMove); map.off("mouseout", onLeave); map.off("click", onMapClick); map.off("moveend", onMoveEnd);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(pending);
    },
    // For browser tests: what the 3D layer is drawing right now.
    debug() {
      if (!three) return { active: false, enabled: state.enabled };
      return {
        active: true, enabled: state.enabled, layers: (map.style?._order || []).filter(id => id === layerId).length,
        towers: three.towers.meshes[0]?.count || 0, ghostTowers: three.towersGhost.meshes[0]?.count || 0,
        towers330: three.counts?.kv330 ?? 0, towers132: three.counts?.kv132 ?? 0, wires: three.counts?.wires ?? 0,
        sceneObjects: three.scene.children.length,
        substations: three.subs.children.length, customer: three.customerHolder.visible, arc: three.arc.visible,
        pulses: three.pulses.visible, phase,
        selected: state.selected,
        // Screen positions of what's drawn, to check alignment with the data.
        substationScreen: three.subs.children.map(h => ({ name: h.userData.hit.candidate.name, px: map.project([h.userData.hit.candidate.lon, h.userData.hit.candidate.lat]) })),
      };
    },
  };
}

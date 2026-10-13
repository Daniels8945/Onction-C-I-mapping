import { test, expect } from "@playwright/test";
import { openApp, haversineKm } from "./helpers.js";

// Grid Route in 3D: towers sit on the modelled path, their density adapts to
// zoom without reshuffling, the scene is rebuilt (never duplicated) when the
// route or viewport changes, and it's removed when the route closes.

const dbg = (page) => page.evaluate(() => window.__route3d?.debug());
const settle = async (page) => {
  await page.waitForFunction(() => !window.__gisMap.isMoving());
  await page.evaluate(() => new Promise(r => { window.__gisMap.triggerRepaint(); requestAnimationFrame(() => requestAnimationFrame(r)); }));
};
async function openRoute(page, query, label) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByRole("dialog").locator("input").first().fill(query);
  await page.getByRole("dialog").getByText(label).click();
  await page.waitForFunction(() => window.__route3d?.debug().active, null, { timeout: 30_000 });
  await settle(page);
}
const view = (page, center, zoom, pitch = 0) => page.evaluate(([c, z, p]) => window.__gisMap.jumpTo({ center: c, zoom: z, pitch: p }), [center, zoom, pitch]).then(() => settle(page));

// Distance (km) from a point to the straight segment a–b, in a local flat frame.
function offPathKm(p, a, b) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180), ky = 110.57;
  const px = p.lng * kx, py = p.lat * ky, ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky;
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  await openApp(page, { threeD: true, errors });
});
test.afterEach(() => expect(errors).toEqual([]));

test("towers sit on the modelled path; a long route gets a handful at country zoom", async ({ page, request }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  const subs = await (await request.get(`${process.env.E2E_API_URL || "http://127.0.0.1:4001"}/api/substations`)).json();
  const at = (n) => { const s = subs.find(x => x.name === n); return { lng: s.lon, lat: s.lat }; };
  await view(page, [5.0, 6.5], 6.6);
  const d = await dbg(page);
  expect(d.layers).toBe(1);
  expect(d.substations).toBe(3);                                  // Benin, Ikeja West, Alausa
  expect(d.detailed).toBe(true);
  expect(d.towers).toBeGreaterThan(1);
  expect(d.towers).toBeLessThanOrEqual(12);                       // representative, not hundreds
  for (const t of d.towerScreen) {
    const [a, b] = t.seg.split("|");
    expect(offPathKm(t, at(a), at(b))).toBeLessThan(0.05);        // on the corridor, not beside it
  }
});

test("zooming in adds towers between the existing ones; zooming out removes them; no flicker on small zooms", async ({ page }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  const c = [4.6, 6.45];
  const counts = {}, spacing = {};
  for (const z of [6.6, 7.6, 8.6, 9.6]) {
    await view(page, c, z);
    const d = await dbg(page);
    counts[z] = d.towers; spacing[z] = d.spacingM;
    // On screen (flat view) neighbouring towers keep a readable gap.
    const pts = d.towerScreen.filter(t => t.x > 0 && t.y > 0 && t.x < 1440 && t.y < 900);
    for (let i = 1; i < pts.length; i++) if (pts[i].seg === pts[i - 1].seg) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeGreaterThan(50);
  }
  // Spacing never grows as you zoom in, and shrinks at least 4× over 3 levels.
  expect(spacing[7.6]).toBeLessThanOrEqual(spacing[6.6]);
  expect(spacing[8.6]).toBeLessThanOrEqual(spacing[7.6]);
  expect(spacing[9.6]).toBeLessThanOrEqual(spacing[8.6]);
  expect(spacing[9.6]).toBeLessThanOrEqual(spacing[6.6] / 4);
  // Finer levels contain every coarser spot: the zoom-8.6 towers are all still there at 9.6.
  await view(page, c, 8.6);
  const coarse = (await dbg(page)).towerScreen.map(t => [t.lng.toFixed(5), t.lat.toFixed(5)].join());
  await view(page, c, 9.6);
  const fine = new Set((await dbg(page)).towerScreen.map(t => [t.lng.toFixed(5), t.lat.toFixed(5)].join()));
  await view(page, c, 8.6);
  const inViewCoarse = (await dbg(page)).towerScreen.filter(t => t.x > 500 && t.x < 940 && t.y > 300 && t.y < 600).map(t => [t.lng.toFixed(5), t.lat.toFixed(5)].join());
  for (const k of inViewCoarse) expect(fine.has(k)).toBe(true);
  expect(coarse.length).toBeGreaterThan(0);
  // A small zoom change keeps the same density.
  await view(page, c, 8.65); const s1 = (await dbg(page)).spacingM;
  await view(page, c, 8.55); const s2 = (await dbg(page)).spacingM;
  await view(page, c, 8.62); const s3 = (await dbg(page)).spacingM;
  expect(new Set([s1, s2, s3]).size).toBe(1);
});

test("far out: simple markers instead of models", async ({ page }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  await view(page, [5.0, 6.8], 5.5);
  const d = await dbg(page);
  expect(d.detailed).toBe(false);
  expect(d.towers).toBe(0);
  expect(d.markers).toBeGreaterThan(0);
  expect(d.wires).toBe(0);
  await view(page, [5.0, 6.8], 7.5);
  expect((await dbg(page)).detailed).toBe(true);
});

test("layer toggles change the drawing only; the route's numbers stay", async ({ page }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  const card = page.getByTestId("route-card");
  const numbers = await card.getByTestId("route-loss-note").textContent();
  await page.getByTestId("route3d-towers").click();
  await page.getByTestId("route3d-substations").click();
  await page.getByTestId("route3d-flow").click();
  await settle(page);
  let d = await dbg(page);
  expect([d.towers, d.markers, d.substationsVisible, d.pulses]).toEqual([0, 0, false, false]);
  expect(await card.getByTestId("route-loss-note").textContent()).toBe(numbers);
  for (const k of ["towers", "substations", "flow"]) await page.getByTestId(`route3d-${k}`).click();
  await settle(page);
  d = await dbg(page);
  expect(d.towers + d.markers).toBeGreaterThan(0);
  expect(d.substationsVisible && d.pulses).toBe(true);
  await page.getByTestId("route3d-all-off").click();
  await settle(page);
  d = await dbg(page);
  expect([d.towers, d.markers, d.substationsVisible, d.pulses]).toEqual([0, 0, false, false]);
  await page.getByTestId("route3d-all-on").click();
  await settle(page);
  d = await dbg(page);
  expect(d.towers + d.markers).toBeGreaterThan(0);
  expect(d.substationsVisible && d.pulses).toBe(true);
});

test("changing the route rebuilds in place; resizing doesn't duplicate; closing removes it and flattens", async ({ page }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  const first = await dbg(page);
  await page.getByTestId("join-from").locator("select").selectOption("Geregu");   // a different grid path
  await page.waitForFunction(() => window.__route3d.debug().substations === 5, null, { timeout: 20_000 });
  const second = await dbg(page);
  expect(second.layers).toBe(1);
  expect(second.sceneObjects).toBe(first.sceneObjects);
  for (const size of [{ width: 900, height: 700 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await settle(page);
    const d = await dbg(page);
    expect([d.layers, d.sceneObjects]).toEqual([1, first.sceneObjects]);
  }
  await page.getByRole("button", { name: "Close route" }).click();
  await page.waitForFunction(() => !window.__gisMap.getLayer("route-3d") && window.__gisMap.getPitch() < 1, null, { timeout: 10_000 });
});

test("3D off flattens and removes the layer; the route stays", async ({ page }) => {
  await openRoute(page, "Geregu Power PLC to IKEDC", "Geregu Power PLC → IKEDC");
  await page.getByTestId("route3d-toggle").click();
  await page.waitForFunction(() => !window.__gisMap.getLayer("route-3d") && window.__gisMap.getPitch() < 1, null, { timeout: 10_000 });
  await expect(page.getByTestId("route-loss-note")).toBeVisible();
  await page.getByTestId("route3d-toggle").click();
  await page.waitForFunction(() => window.__gisMap.getLayer("route-3d"), null, { timeout: 10_000 });
});

test("models fail to download: the route still works and the card says 3D couldn't load", async ({ page }) => {
  await page.route("**/models/*.glb", r => r.abort());
  await page.reload();
  await page.waitForFunction(() => window.__gisMap?.loaded());
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByRole("dialog").locator("input").first().fill("Geregu Power PLC to IKEDC");
  await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
  const card = page.getByTestId("route-card");
  await expect(card).toContainText("The 3D view couldn't load", { timeout: 20_000 });
  await expect(card.getByTestId("route-loss-note")).toBeVisible();
  errors.length = 0; // the failed downloads are expected here
});

test("phone: route 3D stays usable in portrait", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openApp(page, { threeD: true });
  await page.keyboard.press("Control+K");
  await page.getByRole("dialog").locator("input").first().fill("Geregu Power PLC to IKEDC");
  await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
  await page.waitForFunction(() => window.__route3d?.debug().active, null, { timeout: 30_000 });
  await settle(page);
  const d = await dbg(page);
  expect(d.layers).toBe(1);
  expect(d.towers + d.markers).toBeLessThanOrEqual(30);
  await ctx.close();
});

test("short route: a few towers, readable gaps, nothing piled up", async ({ page }) => {
  await openRoute(page, "Shongai Tech to Promasidor", "Shongai Tech → Promasidor");
  await page.evaluate(() => window.__gisMap.jumpTo({ pitch: 0 }));
  await settle(page);
  const d = await dbg(page);
  expect(d.layers).toBe(1);
  expect(d.substations).toBeGreaterThanOrEqual(2);
  expect(d.towers + d.markers).toBeGreaterThan(0);
  expect(d.towers + d.markers).toBeLessThanOrEqual(40);
  const pts = d.towerScreen;
  for (let i = 1; i < pts.length; i++) if (pts[i].seg === pts[i - 1].seg) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeGreaterThan(30);
});

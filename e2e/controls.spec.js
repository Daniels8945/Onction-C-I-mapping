import { test, expect } from "@playwright/test";
import { openApp, search, choose } from "./helpers.js";

// The Connect view's layer / animation controls, inside the real workflow.
// Throughout: controls change what's DRAWN (2D layer visibility/filters, 3D
// objects) — never the assessment, the card's figures, the map's data
// sources or the camera; and they never duplicate or rebuild the 3D layer.

const d3 = (page) => page.evaluate(() => { const d = window.__connect3d.debug(); delete d.substationScreen; return d; });
const vis = (page, id) => page.evaluate((i) => window.__gisMap.getLayoutProperty(i, "visibility") ?? "visible", id);
const camera = (page) => page.evaluate(() => { const m = window.__gisMap, c = m.getCenter(); return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), pitch: m.getPitch() }; });
// The analysis as the app holds it: the card's figures + the map's sources.
const analysis = (page) => page.evaluate(() => ({
  card: [...document.querySelectorAll("[data-testid=candidate]")].map(b => b.textContent).join("|"),
  summary: document.querySelector("[data-testid=radius-summary], [data-testid=radius-empty]")?.textContent,
  indication: document.querySelector("[data-testid=indication]")?.textContent,
  lines: window.__gisMap.getSource("connect-lines-src")._data.features.length,
  cands: window.__gisMap.getSource("connect-cands-src")._data.features.length,
}));
// What's on screen once it has settled: a filter change re-lays-out the
// layer in MapLibre's worker, so the screen catches up a few frames later.
// Query until two reads 200 ms apart agree.
const rendered = (page, layer) => page.evaluate(async (l) => {
  const m = window.__gisMap, read = () => JSON.stringify(m.queryRenderedFeatures({ layers: [l] }).map(f => f.properties));
  let prev = null;
  for (let i = 0; i < 20; i++) {
    m.triggerRepaint();
    await new Promise(r => setTimeout(r, 200));
    const cur = read();
    if (cur === prev) return JSON.parse(cur);
    prev = cur;
  }
  return JSON.parse(prev);
}, layer);

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  await openApp(page, { threeD: true, errors });
  await search(page, "6.75, 3.38");
  await choose(page, "6.75000, 3.38000");
  await page.waitForFunction(() => window.__connect3d?.debug().active && !window.__gisMap.isMoving() && window.__gisMap.getPitch() > 40, null, { timeout: 30_000 });
  await page.waitForTimeout(800);
});
test.afterEach(() => { expect(errors, errors.join("\n")).toEqual([]); });

test("330 kV off → only 330 kV disappears; back on → it returns; data and camera untouched", async ({ page }) => {
  const before = await d3(page), data = await analysis(page), cam = await camera(page);
  expect(before.towers330).toBeGreaterThan(0);
  expect(before.towers132).toBeGreaterThan(0);

  await page.getByTestId("layer-kv330").click();
  await expect(page.getByTestId("layer-kv330")).toHaveAttribute("aria-pressed", "false");
  let d = await d3(page);
  expect(d.towers330).toBe(0);
  expect(d.towers132).toBe(before.towers132);
  for (const f of await rendered(page, "connect-lines")) expect(f.kv).toBe(132);

  await page.getByTestId("layer-kv330").click();
  d = await d3(page);
  expect(d.towers330).toBe(before.towers330);
  expect(d.sceneObjects).toBe(before.sceneObjects);
  expect(d.layers).toBe(1);
  expect((await rendered(page, "connect-lines")).some(f => f.kv === 330)).toBe(true);
  expect(await analysis(page)).toEqual(data);
  expect(await camera(page)).toEqual(cam);
});

test("categories one by one: 132 kV, substations, connection, energy flow", async ({ page }) => {
  const data = await analysis(page), cam = await camera(page);
  await page.getByTestId("layer-kv132").click();
  expect((await d3(page)).towers132).toBe(0);

  await page.getByTestId("layer-substations").click();
  expect((await d3(page)).substations).toBe(0);
  expect(await vis(page, "connect-cands")).toBe("none");
  await expect(page.getByTestId("candidate").first()).toBeVisible();     // still listed: hidden ≠ removed

  await page.getByTestId("layer-connection").click();
  let d = await d3(page);
  expect(d.arc).toBe(false);
  expect(d.pulses).toBe(false);                                           // no orphan pulses without their line
  expect(await vis(page, "connect-line")).toBe("none");
  expect(await vis(page, "connect-line-label")).toBe("none");
  await expect(page.getByTestId("hidden-layer-note")).toContainText("The connection and substations are hidden");
  await expect(page.getByTestId("connection-summary")).toBeVisible();     // figures still there

  await page.getByTestId("layer-connection").click();
  await page.getByTestId("layer-flow").click();
  d = await d3(page);
  expect(d.arc).toBe(true);
  expect(d.pulses).toBe(false);
  expect(await page.evaluate(() => window.__gisMap.getPaintProperty("connect-line", "line-dasharray"))).toEqual([2, 1.2]);
  await expect(page.getByTestId("flow-pause")).toBeDisabled();
  expect(await analysis(page)).toEqual(data);
  expect(await camera(page)).toEqual(cam);
});

test("All off hides every Connect layer but not the map; All on restores; Reset returns to defaults", async ({ page }) => {
  const start = await d3(page), data = await analysis(page);
  await page.getByTestId("layers-all-off").click();
  const d = await d3(page);
  expect([d.towers, d.ghostTowers, d.substations, d.wires]).toEqual([0, 0, 0, 0]);
  expect([d.customer, d.arc, d.pulses]).toEqual([false, false, false]);
  for (const id of ["connect-cands", "connect-cand-labels", "connect-line", "connect-line-label", "connect-radius", "connect-radius-label"]) expect(await vis(page, id)).toBe("none");
  expect(await rendered(page, "connect-lines")).toEqual([]);
  await expect(page.locator(".customer-pin")).toBeHidden();
  // The basemap (geography) is untouched and still renders.
  const base = await page.evaluate(() => ({ loaded: window.__gisMap.loaded(), layers: window.__gisMap.getStyle().layers.filter(l => !l.id.startsWith("connect-")).length }));
  expect(base.loaded).toBe(true);
  expect(base.layers).toBeGreaterThan(20);
  for (const b of await page.locator("[data-testid^=layer-]:not([data-testid=layer-focus])").all()) await expect(b).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("layers-all-on").click();
  const back = await d3(page);
  expect([back.towers, back.substations, back.customer, back.arc, back.pulses, back.sceneObjects, back.layers])
    .toEqual([start.towers, start.substations, true, true, true, start.sceneObjects, 1]);
  await expect(page.locator(".customer-pin")).toBeVisible();

  await page.getByTestId("layer-kv330").click();
  await page.getByTestId("layer-labels").click();
  await page.getByTestId("layer-focus").click();
  await page.getByTestId("layers-reset").click();
  for (const b of await page.locator("[data-testid^=layer-]:not([data-testid=layer-focus])").all()) await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("layer-focus")).toHaveAttribute("aria-pressed", "false");
  expect((await d3(page)).towers).toBe(start.towers);
  expect(await analysis(page)).toEqual(data);
});

test("selecting while hidden: category stays off (and the card says so); one-by-one hides are revealed by choosing", async ({ page }) => {
  const n = (await d3(page)).substations;
  await page.getByTestId("layer-substations").click();
  const second = page.getByTestId("candidate").nth(1);
  const name = (await second.locator("span.truncate").first().textContent()).trim();
  await second.click();
  await expect(page.getByTestId("connection-summary")).toContainText(name);
  expect((await d3(page)).selected).toBe(name);
  expect((await d3(page)).substations).toBe(0);
  await expect(page.getByTestId("hidden-layer-note")).toContainText("Substations are hidden");
  await page.getByTestId("hidden-layer-note").getByRole("button", { name: "Show" }).click();
  expect((await d3(page)).substations).toBe(n);

  // Hide one substation individually.
  const third = page.getByTestId("candidate").nth(2);
  const thirdName = (await third.locator("span.truncate").first().textContent()).trim();
  await page.getByTestId("candidate-visibility").nth(2).click();
  expect((await d3(page)).substations).toBe(n - 1);
  expect((await rendered(page, "connect-cands")).some(f => f.name === thirdName)).toBe(false);
  await expect(page.getByTestId("show-hidden")).toContainText("1 substation hidden");
  // The selected one can't be hidden.
  await expect(page.getByTestId("candidate-visibility").nth(1)).toBeDisabled();
  // Choosing the hidden one shows it again.
  await third.click();
  expect((await d3(page)).substations).toBe(n);
  await expect(page.getByTestId("show-hidden")).toHaveCount(0);
});

test("only this connection, and clearing the selection", async ({ page }) => {
  const n = (await d3(page)).substations;
  await page.getByTestId("layer-focus").click();
  const d = await d3(page);
  expect(d.substations).toBe(1);
  const cands = await rendered(page, "connect-cands");
  expect(cands.map(c => c.name)).toEqual([d.selected]);
  for (const l of await rendered(page, "connect-lines")) expect(l.attached).toBe(true);

  await page.getByTestId("clear-selection").click();
  const c = await d3(page);
  expect(c.selected).toBe(null);
  expect(c.arc).toBe(false);
  expect(c.substations).toBe(n);                          // focus needs a selection — never a blank map
  await expect(page.getByTestId("connection-summary")).toHaveCount(0);
  await expect(page.getByTestId("indication")).toBeVisible(); // the assessment stays
  await expect(page.getByTestId("layer-focus")).toBeDisabled();
});

test("energy flow: pause freezes it, resume continues, restart goes back to the start", async ({ page }) => {
  const phase = async () => (await d3(page)).phase;
  await page.getByTestId("flow-pause").click();
  const p0 = await phase(); const dash0 = await page.evaluate(() => window.__gisMap.getPaintProperty("connect-line", "line-dasharray"));
  await page.waitForTimeout(700);
  expect(await phase()).toBe(p0);
  expect(await page.evaluate(() => window.__gisMap.getPaintProperty("connect-line", "line-dasharray"))).toEqual(dash0);
  expect((await d3(page)).pulses).toBe(true);              // paused, still shown

  await page.getByTestId("flow-pause").click();           // resume
  await page.waitForTimeout(700);
  const p1 = await phase();
  expect(p1).not.toBe(p0);
  expect(Math.abs(p1 - p0) % 1).toBeLessThan(0.6);       // continued, didn't jump

  await page.getByTestId("flow-pause").click();
  await page.getByTestId("flow-reset").click();
  expect(await phase()).toBe(0);
});

test("changing customer keeps the controls and doesn't duplicate the scene", async ({ page }) => {
  const objs = (await d3(page)).sceneObjects;
  await page.getByTestId("layer-kv330").click();
  await page.getByTestId("candidate-visibility").nth(2).click();
  await search(page, "Nestle Agbara");
  await choose(page, "Nestle Nigeria PLC Agbara");
  await page.waitForFunction(() => !window.__gisMap.isMoving() && window.__connect3d.debug().selected, null, { timeout: 20_000 });
  await page.waitForTimeout(800);
  const d = await d3(page);
  await expect(page.getByTestId("layer-kv330")).toHaveAttribute("aria-pressed", "false");
  expect(d.towers330).toBe(0);
  expect(d.towers132).toBeGreaterThan(0);
  await expect(page.getByTestId("show-hidden")).toHaveCount(0);  // one-by-one hides were for the last customer
  expect(d.substations).toBe(await page.getByTestId("candidate").count());
  expect(d.layers).toBe(1);
  expect(d.sceneObjects).toBe(objs);
  expect(await page.evaluate(() => document.querySelectorAll(".customer-pin").length)).toBe(1);
});

test("refresh keeps the layer choices, consistently", async ({ page }) => {
  await page.getByTestId("layer-kv132").click();
  await page.getByTestId("layer-flow").click();
  await page.reload();
  await page.waitForFunction(() => window.__gisMap?.loaded(), null, { timeout: 45_000 });
  await search(page, "6.75, 3.38");
  await choose(page, "6.75000, 3.38000");
  await page.waitForFunction(() => window.__connect3d?.debug().active && !window.__gisMap.isMoving(), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await expect(page.getByTestId("layer-kv132")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("layer-flow")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("layer-kv330")).toHaveAttribute("aria-pressed", "true");
  const d = await d3(page);
  expect(d.towers132).toBe(0);
  expect(d.towers330).toBeGreaterThan(0);
  expect(d.pulses).toBe(false);
  for (const f of await rendered(page, "connect-lines")) expect(f.kv).toBe(330);
});

test("rapid toggling ends in a state that matches the buttons, with no duplicates", async ({ page }) => {
  const start = await d3(page);
  const b = page.getByTestId("layer-kv330");
  for (let i = 0; i < 15; i++) await b.click({ delay: 0 });          // odd → off
  for (let i = 0; i < 10; i++) await page.getByTestId(i % 2 ? "layers-all-on" : "layers-all-off").click({ force: true });
  // last click was All on
  await page.getByTestId("layer-substations").click();
  await page.getByTestId("layer-substations").click();
  await page.getByTestId("layer-customer").click();
  await page.waitForTimeout(400);
  const d = await d3(page);
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("layer-customer")).toHaveAttribute("aria-pressed", "false");
  expect(d.towers).toBe(start.towers);
  expect(d.substations).toBe(start.substations);
  expect(d.customer).toBe(false);
  await expect(page.locator(".customer-pin")).toBeHidden();
  expect(d.layers).toBe(1);
  expect(d.sceneObjects).toBe(start.sceneObjects);
});

test("in 2D too: categories filter the flat map", async ({ page }) => {
  await page.getByTestId("toggle-3d").click();
  await page.waitForFunction(() => !window.__gisMap.getLayer("connect-3d") && !window.__gisMap.isMoving());
  await page.getByTestId("layer-kv132").click();
  for (const f of await rendered(page, "connect-lines")) expect(f.kv).toBe(330);
  await page.getByTestId("layers-all-off").click();
  expect(await rendered(page, "connect-cands")).toEqual([]);
  expect(await vis(page, "connect-line")).toBe("none");
  await page.getByTestId("layers-all-on").click();
  expect((await rendered(page, "connect-cands")).length).toBeGreaterThan(0);
});

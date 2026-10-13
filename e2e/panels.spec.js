import { test, expect } from "@playwright/test";
import { openApp, search, choose, searchBox } from "./helpers.js";

// Movable map panels (legend, map layers, customer search) and the sidebar's
// All on / All off / Reset view. A panel moves only by its grip; moving it
// never pans the map, toggles a layer or selects anything, and it can't be
// lost off-screen.

const camera = (page) => page.evaluate(() => { const m = window.__gisMap, c = m.getCenter(); return { lng: c.lng, lat: c.lat, zoom: m.getZoom() }; });
const box = (loc) => loc.boundingBox();
const mapArea = (page) => page.evaluate(() => {
  const r = window.__gisMap.getContainer().closest(".flex-1.relative.flex.flex-col").getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});

async function drag(page, grip, dx, dy) {
  const g = await box(grip);
  const x = g.x + g.width / 2, y = g.y + g.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const inside = (b, a) => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1;

test("legend: drag by its grip moves it without panning the map; stays on-screen; put back", async ({ page }) => {
  const errors = [];
  await openApp(page, { errors });
  const legend = page.getByTestId("map-legend");
  const grip = page.getByTestId("grip-legend");
  const cam = await camera(page);
  const before = await box(legend);

  await drag(page, grip, -500, 120);
  const after = await box(legend);
  expect(Math.abs(after.x - (before.x - 500))).toBeLessThan(3);
  expect(Math.abs(after.y - (before.y + 120))).toBeLessThan(3);
  expect(await camera(page)).toEqual(cam);                       // the map didn't pan

  await drag(page, grip, -3000, 3000);                             // far past the corner
  expect(inside(await box(legend), await mapArea(page))).toBe(true);

  // The header still collapses and expands on a plain click.
  await legend.getByRole("button", { name: /TCN Loop Map Legend/ }).click();
  await expect(legend.getByRole("button", { name: /TCN Loop Map Legend/ })).toHaveAttribute("aria-expanded", "false");
  await legend.getByRole("button", { name: /TCN Loop Map Legend/ }).click();

  // Kept for the session, then put back.
  const moved = await box(legend);
  await page.reload();
  await page.waitForFunction(() => window.__gisMap?.loaded());
  const reloaded = await box(page.getByTestId("map-legend"));
  expect(Math.abs(reloaded.x - moved.x)).toBeLessThan(3);
  await page.getByRole("button", { name: "Put Legend back" }).click();
  const home = await box(page.getByTestId("map-legend"));
  expect(Math.abs(home.x - before.x)).toBeLessThan(3);
  expect(Math.abs(home.y - before.y)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("legend: arrow keys on the grip move it too", async ({ page }) => {
  await openApp(page);
  const legend = page.getByTestId("map-legend");
  const before = await box(legend);
  await page.getByTestId("grip-legend").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  const after = await box(legend);
  expect(Math.round(before.x - after.x)).toBe(16);
  expect(Math.round(after.y - before.y)).toBe(16);
});

test("customer search: moves by its grip; typing and choosing a result still work", async ({ page }) => {
  const errors = [];
  await openApp(page, { errors });
  const panel = page.getByTestId("customer-search");
  const before = await box(panel);
  // Clicking into the input doesn't move it.
  await searchBox(page).click();
  expect(await box(panel)).toEqual(before);
  await page.keyboard.press("Escape");

  await drag(page, page.getByTestId("grip-customer-search"), 300, 200);
  const after = await box(panel);
  expect(Math.abs(after.x - (before.x + 300))).toBeLessThan(3);
  expect(Math.abs(after.y - (before.y + 200))).toBeLessThan(3);

  await search(page, "6.75, 3.38");
  await choose(page, "6.75000, 3.38000");
  expect(await box(panel)).toEqual(after);                       // still where it was put
  expect(errors).toEqual([]);
});

test("map layers panel: moves independently; dragging never toggles a layer", async ({ page }) => {
  await openApp(page);
  await search(page, "6.75, 3.38");
  await choose(page, "6.75000, 3.38000");
  const layers = page.getByTestId("view-controls");
  await expect(layers).toBeVisible();
  const legendBefore = await box(page.getByTestId("map-legend"));
  const pressed = () => layers.locator("[data-testid^=layer-]").evaluateAll(bs => bs.map(b => b.getAttribute("aria-pressed")));
  const states = await pressed();
  const before = await box(layers);

  await drag(page, page.getByTestId("grip-map-layers"), -200, -300);
  const after = await box(layers);
  expect(after.x).not.toBe(before.x);
  expect(await pressed()).toEqual(states);                       // nothing toggled
  expect(await box(page.getByTestId("map-legend"))).toEqual(legendBefore); // legend didn't move
  expect(inside(after, await mapArea(page))).toBe(true);
});

test("phone: panels drag by touch and stay on-screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openApp(page);
  const legend = page.getByTestId("map-legend");
  await expect(legend.getByRole("button", { name: /TCN Loop Map Legend/ })).toHaveAttribute("aria-expanded", "false"); // starts collapsed
  const grip = page.getByTestId("grip-legend");
  const g = await box(grip);
  const cam = await camera(page);
  // A touch drag on the grip (pointer events, as a finger sends them).
  await grip.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, clientX: g.x + 5, clientY: g.y + 5, isPrimary: true });
  await page.evaluate(([x, y]) => {
    for (let i = 1; i <= 5; i++) window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: x - i * 30, clientY: y + i * 40 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" }));
  }, [g.x + 5, g.y + 5]);
  const after = await box(legend);
  expect(after.y).toBeGreaterThan(g.y + 100);
  expect(inside(after, await mapArea(page))).toBe(true);
  expect(await camera(page)).toEqual(cam);
  // Rotating to landscape keeps it inside the map.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  expect(inside(await box(legend), await mapArea(page))).toBe(true);
  await ctx.close();
});

test("sidebar: All on, All off and Reset view change visibility only", async ({ page }) => {
  await openApp(page);
  const visible = (id) => page.evaluate((i) => window.__gisMap.getLayoutProperty(i, "visibility") ?? "visible", id);
  const sources = () => page.evaluate(() => ["grid-sub-src", "grid-genco-src"].map(s => window.__gisMap.getSource(s)?._data?.features?.length ?? null));
  const data = await sources();

  await page.getByTestId("sidebar-all-on").click();
  for (const id of ["grid-sub-ring-outer-existing", "grid-edge-existing", "discos-circle", "ci-circle"]) expect(await visible(id)).toBe("visible");
  await page.getByTestId("sidebar-all-off").click();
  for (const id of ["grid-sub-ring-outer-existing", "grid-edge-existing", "discos-circle", "ci-circle", "gencos-marker"]) expect(await visible(id)).toBe("none");
  expect(await sources()).toEqual(data);                          // the data is still there

  await page.evaluate(() => window.__gisMap.jumpTo({ center: [3.4, 6.5], zoom: 10 }));
  await page.getByTestId("sidebar-reset").click();
  expect(await visible("ci-circle")).toBe("visible");             // defaults back on
  expect(await visible("grid-sub-ring-outer-existing")).toBe("none"); // defaults off
  await page.waitForFunction(() => !window.__gisMap.isMoving());
  const c = await camera(page);
  expect(Math.round(c.zoom)).toBe(6);
});

test("phone: customer search — tapping and typing don't move it; choosing works, portrait and landscape", async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await openApp(page);
    const panel = page.getByTestId("customer-search");
    const before = await box(panel);
    await searchBox(page).tap();
    await search(page, "6.75, 3.38");
    const now = await box(panel);                                  // the results list grows it; it doesn't move
    expect([now.x, now.y]).toEqual([before.x, before.y]);
    await page.locator("#customer-results [role=option]").filter({ hasText: "6.75000, 3.38000" }).first().tap();
    await expect(page.getByTestId("connect-card")).toBeVisible();
    await ctx.close();
  }
});

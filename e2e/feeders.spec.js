import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.js";

// The feeder browser: every metered feeder from the live feed (recorded by
// the poller), its stats, and its position at its station. Needs the poller
// running with FEEDER_API_KEY set.

const API = process.env.E2E_API_URL || "http://127.0.0.1:4001";
const settle = (page) => page.waitForFunction(() => !window.__gisMap.isMoving(), null, { timeout: 15_000 });

test.describe("API", () => {
  test("every feeder's figures are within their bounds", async ({ request }) => {
    const d = await (await request.get(`${API}/api/feeders`)).json();
    expect(d.available).toBe(true);
    expect(d.feeders.length).toBeGreaterThan(900);
    expect(d.hoursElapsed).toBeGreaterThan(0);
    expect(d.hoursElapsed).toBeLessThanOrEqual(24);
    for (const f of d.feeders) {
      expect(["on", "off", "shedding"]).toContain(f.status);
      expect(f.availabilityTodayPct).toBeGreaterThanOrEqual(0);
      expect(f.availabilityTodayPct).toBeLessThanOrEqual(100);
      // Hours on can't exceed hours into the feed's day (the denominator).
      expect(f.uptimeH).toBeLessThanOrEqual(d.hoursElapsed + 0.1);
      if (f.status !== "on") expect(f.liveMw).toBe(0);
      if (f.peakMw != null && f.liveMw != null && f.status === "on" && !f.flagged) expect(f.peakMw).toBeGreaterThanOrEqual(f.liveMw - 0.01);
    }
  });

  test("placed feeders sit in their own state", async ({ request }) => {
    const d = await (await request.get(`${API}/api/feeders`)).json();
    const placed = d.feeders.filter(f => f.position);
    expect(placed.length).toBeGreaterThan(0);
    const norm = (s) => String(s).toLowerCase().replace(/ state$/, "").replace("federal capital territory", "abuja").replace("fct", "abuja").replace("port harcourt", "rivers").replace(/^eko$/, "lagos");
    // One per station is enough.
    const seen = new Set();
    for (const f of placed) {
      const k = `${f.station}|${f.state}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const at = await (await request.get(`${API}/api/locate?lat=${f.position.lat}&lng=${f.position.lng}`)).json();
      expect(norm(at.state), `${f.station} (${f.state})`).toBe(norm(f.state));
      expect(["network", "google"]).toContain(f.position.method);
    }
  });

  test("one feeder: detail matches the list row and has history", async ({ request }) => {
    const d = await (await request.get(`${API}/api/feeders`)).json();
    const f = d.feeders.find(x => x.status === "on" && x.position);
    const one = await (await request.get(`${API}/api/feeders/${f.id}`)).json();
    expect(one.name).toBe(f.name);
    expect(Array.isArray(one.hourly)).toBe(true);
    expect(one.hourly.length).toBeGreaterThan(0);
    expect((await request.get(`${API}/api/feeders/999999999`)).status()).toBe(404);
    expect((await request.get(`${API}/api/feeders/abc`)).status()).toBe(400);
  });
});

test.describe("browser", () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    await openApp(page, { errors });
    await page.getByTestId("feeders-kpi").click();
    await expect(page.getByTestId("feeder-list").locator("li").first()).toBeVisible({ timeout: 20_000 });
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test("list: search and filters narrow it; every row matches", async ({ page }) => {
    const card = page.getByTestId("feeder-card");
    const total = Number((await card.getByTestId("feeder-count").textContent()).match(/\d+/)[0]);
    expect(total).toBeGreaterThan(900);
    await card.getByLabel("1. DisCo").selectOption("EKEDC");
    await card.getByLabel("Status").selectOption("on");
    const n = Number((await card.getByTestId("feeder-count").textContent()).match(/\d+/)[0]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(total);
    const d = await (await page.request.get(`${API}/api/feeders`)).json();
    expect(n).toBe(d.feeders.filter(f => f.disco === "EKEDC" && f.status === "on").length);
    await card.getByLabel("Search feeders").fill("zzzz-no-such-feeder");
    await expect(card.getByTestId("feeder-count")).toHaveText("0 feeders");
  });

  test("pick a feeder: stats match the API, the map flies there in 3D, column height is its load", async ({ page }) => {
    const d = await (await page.request.get(`${API}/api/feeders`)).json();
    const f = d.feeders.filter(x => x.status === "on" && x.position && !x.flagged && x.liveMw > 0.5)[0];
    const card = page.getByTestId("feeder-card");
    await card.getByLabel("Search feeders").fill(f.name);
    await card.getByTestId("feeder-list").locator("li button").filter({ hasText: f.name }).first().click();
    const detail = card.getByTestId("feeder-detail");
    await expect(detail.getByTestId("feeder-name")).toHaveText(f.name);
    await expect(detail.getByTestId("feeder-status")).toContainText("On");
    await expect(detail.getByTestId("feeder-availability")).toContainText(`${f.availabilityTodayPct}`);
    await expect(detail.getByTestId("feeder-position")).toBeVisible();
    await settle(page);
    const map = await page.evaluate(() => ({
      pitch: window.__gisMap.getPitch(), zoom: window.__gisMap.getZoom(),
      col: window.__gisMap.getSource("feeders-sel-src")._data.features.find(x => x.properties.kind === "column"),
      pts: window.__gisMap.getSource("feeders-src")._data.features.length,
    }));
    expect(map.pitch).toBeGreaterThan(30);
    expect(map.zoom).toBeGreaterThanOrEqual(12.9);
    expect(map.col.properties.height).toBeCloseTo(Math.max(60, f.liveMw * 100), 0);
    expect(map.pts).toBe(d.feeders.filter(x => x.position).length);
    // Back to the list, then close: everything is cleared and the map flattens.
    await detail.getByRole("button", { name: "All feeders" }).click();
    await expect(card.getByTestId("feeder-list")).toBeVisible();
    await card.getByRole("button", { name: "Close feeders" }).click();
    await page.waitForFunction(() => window.__gisMap.getSource("feeders-src")._data.features.length === 0 && window.__gisMap.getPitch() < 1, null, { timeout: 10_000 });
  });

  test("new user: DisCo → station → feeder dropdowns pick a feeder and show it on the map", async ({ page }) => {
    const d = await (await page.request.get(`${API}/api/feeders`)).json();
    const f = d.feeders.find(x => x.disco === "IKEDC" && x.position);
    const card = page.getByTestId("feeder-card");
    const picker = card.getByTestId("feeder-picker");
    await picker.getByLabel("1. DisCo").selectOption("IKEDC");
    // Stations offered are only IKEDC's.
    const stationOpts = await picker.getByLabel("2. Station").locator("option").allTextContents();
    const ikedcStations = new Set(d.feeders.filter(x => x.disco === "IKEDC").map(x => `${x.station}|${x.state}`));
    expect(stationOpts.length - 1).toBe(ikedcStations.size);
    await picker.getByLabel("2. Station").selectOption(`${f.station}|${f.state}`);
    // Feeders offered are only that station's.
    const feederOpts = (await picker.getByLabel("3. Feeder").locator("option").allTextContents()).slice(1);
    expect(feederOpts.length).toBe(d.feeders.filter(x => x.station === f.station && x.state === f.state).length);
    await picker.getByLabel("3. Feeder").selectOption(String(f.id));
    await expect(card.getByTestId("feeder-detail").getByTestId("feeder-name")).toHaveText(f.name);
    await settle(page);
    const col = await page.evaluate(() => window.__gisMap.getSource("feeders-sel-src")._data.features.find(x => x.properties.kind === "column"));
    expect(col).toBeTruthy();
    // The dropdowns stay on the chosen feeder, so a neighbour is one step away.
    await expect(picker.getByLabel("3. Feeder")).toHaveValue(String(f.id));
  });

  test("picking from the list moves the dropdowns to that feeder", async ({ page }) => {
    const card = page.getByTestId("feeder-card");
    const first = card.getByTestId("feeder-list").locator("li button").first();
    const name = (await first.locator("span.font-semibold").textContent()).trim();
    await first.click();
    const picker = card.getByTestId("feeder-picker");
    const chosen = await picker.getByLabel("3. Feeder").evaluate(s => s.options[s.selectedIndex].textContent);
    expect(chosen.startsWith(name)).toBe(true);
    await expect(picker.getByLabel("1. DisCo")).toHaveValue(/.+/);
    await expect(picker.getByLabel("2. Station")).toHaveValue(/.+\|.+/);
  });

  test("clicking a feeder on the map selects it", async ({ page }) => {
    const d = await (await page.request.get(`${API}/api/feeders`)).json();
    const f = d.feeders.find(x => x.position);
    await page.evaluate(([lng, lat]) => window.__gisMap.jumpTo({ center: [lng, lat], zoom: 15, pitch: 0 }), [f.position.lng, f.position.lat]);
    await settle(page);
    await page.waitForTimeout(500);
    const xy = await page.evaluate(() => {
      const m = window.__gisMap, feats = m.queryRenderedFeatures({ layers: ["feeders-pts"] });
      const r = m.getCanvas().getBoundingClientRect(), c = m.project(feats[0].geometry.coordinates);
      return { x: r.left + c.x, y: r.top + c.y, id: feats[0].properties.id };
    });
    await page.mouse.click(xy.x, xy.y);
    const name = d.feeders.find(x => x.id === xy.id).name;
    await expect(page.getByTestId("feeder-detail").getByTestId("feeder-name")).toHaveText(name);
  });
});

test("feed unavailable: the card says so and shows no figures", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/feeders", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ available: false, reason: "The poller has not recorded any data yet." }) }));
  await page.getByTestId("feeders-kpi").click();
  await expect(page.getByTestId("feeder-card")).toContainText("Feeder list unavailable", { timeout: 15_000 });
  await expect(page.getByTestId("feeder-list")).toHaveCount(0);
});

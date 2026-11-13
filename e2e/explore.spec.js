import { test, expect } from "@playwright/test";
import { openApp, haversineKm } from "./helpers";

// Explore: Site Scan and Grid Route. First the arithmetic the API returns
// (distances add up, loss follows the loss model), then what the cards say
// about it. Uses the two cases from the Oct 2026 audit: a site at Adavi,
// Kogi, and Geregu Power PLC → IKEDC (Alausa, Lagos).

const API = process.env.E2E_API_URL || "http://127.0.0.1:4001";
const ADAVI = { lat: 7.6572, lng: 6.4174 };
const GEREGU_PLANT = { lat: 7.4706, lng: 6.6595 };   // src/data GENCOS "Geregu Power PLC"
const IKEDC = { lat: 6.60, lng: 3.35 };               // src/data DISCOS IKEDC

// Every route invariant that holds whatever the network data says.
function checkRoute(r) {
  const hopKm = r.hops.reduce((a, h) => a + h.km, 0);
  expect(r.hop_count).toBe(r.hops.length);
  for (let i = 1; i < r.hops.length; i++) expect(r.hops[i].from_node).toBe(r.hops[i - 1].to_node);
  if (r.hops.length) {
    expect(r.hops[0].from_node).toBe(r.source_node);
    expect(r.hops.at(-1).to_node).toBe(r.injection_node);
  }
  expect(Math.abs(r.routed_km - hopKm)).toBeLessThanOrEqual(0.06);                     // routed_km is hop sum, 1 dp
  expect(Math.abs(r.first_mile_km + r.routed_km + r.last_mile_km - r.total_km)).toBeLessThanOrEqual(0.1);
  const m = r.loss_model;
  expect(Math.abs(m.fixed_pct + (hopKm / 100) * m.per_100km_pct - r.loss_pct)).toBeLessThanOrEqual(0.005);
}

test.describe("route arithmetic (API)", () => {
  test("Adavi: every GenCo route adds up and losses follow the loss model", async ({ request }) => {
    const res = await request.get(`${API}/api/best-source?lat=${ADAVI.lat}&lng=${ADAVI.lng}`);
    expect(res.ok()).toBeTruthy();
    const { results } = await res.json();
    const gencos = await (await request.get(`${API}/api/gencos`)).json();
    expect(results.length).toBe(gencos.length);   // every GenCo is checked
    for (const r of results) checkRoute(r);
    // One supply point serves the site, so every route shares its last mile.
    expect(new Set(results.map(r => r.injection_node)).size).toBe(1);
    expect(new Set(results.map(r => r.last_mile_km)).size).toBe(1);
    // Without a road route, the last mile is the straight line to that point.
    const sub = (await (await request.get(`${API}/api/substations`)).json()).find(s => s.name === results[0].injection_node);
    if (!results[0].last_mile_geometry) {
      expect(Math.abs(haversineKm(ADAVI, { lat: sub.lat, lng: sub.lon }) - results[0].last_mile_km)).toBeLessThanOrEqual(0.06);
    }
  });

  test("point to point: Geregu Power PLC → IKEDC adds up", async ({ request }) => {
    const res = await request.get(`${API}/api/route?fromLat=${GEREGU_PLANT.lat}&fromLng=${GEREGU_PLANT.lng}&lat=${IKEDC.lat}&lng=${IKEDC.lng}`);
    expect(res.ok()).toBeTruthy();
    checkRoute(await res.json());
  });

  test("loss models scale only the per-km rate", async ({ request }) => {
    const models = await (await request.get(`${API}/api/loss-models`)).json();
    for (const m of models) {
      const r = await (await request.get(`${API}/api/route?genco=NDPHC%20Geregu&lat=${IKEDC.lat}&lng=${IKEDC.lng}&lossModel=${m.code}`)).json();
      checkRoute(r);
      expect(r.loss_model.code).toBe(m.code);
    }
  });
});

test.describe("what the cards say", () => {
  const openPalette = async (page) => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const input = page.getByRole("dialog").getByRole("combobox").or(page.getByRole("dialog").locator("input")).first();
    await expect(input).toBeVisible();
    return input;
  };

  test("route card: model badge, honest straight-line comparison, loss explained", async ({ page, request }) => {
    const errors = [];
    await openApp(page, { errors });
    const input = await openPalette(page);
    await input.fill("Geregu Power PLC to IKEDC");
    await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
    const card = page.getByTestId("route-card");
    await expect(card.getByTestId("route-loss-note")).toBeVisible();

    const r = await (await request.get(`${API}/api/route?fromLat=${GEREGU_PLANT.lat}&fromLng=${GEREGU_PLANT.lng}&lat=${IKEDC.lat}&lng=${IKEDC.lng}`)).json();
    const straight = haversineKm(GEREGU_PLANT, IKEDC);

    // Routing results are a model of fixed data, never "Live" (only metered
    // feeder data can be live).
    const routeSection = card.locator("section").filter({ hasText: "Grid route" });
    await expect(routeSection.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(routeSection.getByText("Model", { exact: true })).toBeVisible();

    // Ratio is of the full route, and the straight-line miles are called out.
    const s = card.getByTestId("route-straight");
    await expect(s).toContainText(`${(r.total_km / straight).toFixed(2)}× that`);
    await expect(s).toContainText("first/last mile to the nearest supply point, which is not an existing line");

    // Loss breakdown matches the API's loss model.
    const m = r.loss_model;
    await expect(card.getByTestId("route-loss-note")).toContainText(
      `${m.fixed_pct}% transformation + ${m.per_100km_pct}% per 100 km × ${r.routed_km} km of grid line = ${r.loss_pct}%`);
    await expect(card).toContainText(r.first_mile_geometry ? "by road" : "straight line");
    expect(errors).toEqual([]);
  });

  test("scan card beside a station that isn't a supply point says so", async ({ page }) => {
    const errors = [];
    await openApp(page, { errors });
    const input = await openPalette(page);
    await input.fill("Ajaokuta Steel");
    await page.getByRole("dialog").getByText("Ajaokuta Steel Co. Ltd (ASCON)").first().click();
    const card = page.getByTestId("scan-card");
    await expect(card).toContainText("doesn't list it as a supply point", { timeout: 30_000 });
    for (const title of ["Grid connection", "Best grid sources"]) {
      const sec = card.locator("section").filter({ hasText: title }).first();
      await expect(sec.getByText("Live", { exact: true })).toHaveCount(0);
      await expect(sec.getByText("Model", { exact: true })).toBeVisible();
    }
    await expect(card).toContainText("this is a comparison, not a price");
    expect(errors).toEqual([]);
  });
});

// Task 1.5: the site's supply substation is picked automatically, and the
// user can choose another (chips, the map, or the route's pickers).
test.describe("choosing the supply substation", () => {
  const openPalette = async (page) => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const input = page.getByRole("dialog").locator("input").first();
    await expect(input).toBeVisible();
    return input;
  };
  const scanAscon = async (page) => {
    const input = await openPalette(page);
    await input.fill("Ajaokuta Steel");
    await page.getByRole("dialog").getByText("Ajaokuta Steel Co. Ltd (ASCON)").first().click();
    const card = page.getByTestId("scan-card");
    await expect(card.getByTestId("supply-choices")).toBeVisible({ timeout: 30_000 });
    return card;
  };

  test("scan: auto pick, choose an unconfirmed substation, then go back", async ({ page }) => {
    const errors = [];
    await openApp(page, { errors });
    const card = await scanAscon(page);
    const supply = card.getByTestId("scan-supply");
    await expect(supply).toContainText("Benin");
    await expect(card).toContainText("Picked automatically");
    const before = await card.locator("ol li").first().textContent();

    await card.getByTestId("supply-choices").getByRole("button", { name: /^Ajaokuta/ }).click();
    await expect(supply).toContainText("Ajaokuta");
    await expect(card).toContainText("Your choice of substation");
    await expect(card).toContainText("isn't confirmed as a supply point");
    await expect(card.locator("ol li").first()).not.toHaveText(before);   // the ranking was recomputed

    await card.getByRole("button", { name: "Back to the nearest listed supply point" }).click();
    await expect(supply).toContainText("Benin");
    await expect(card).toContainText("Picked automatically");
    expect(errors).toEqual([]);
  });

  test("scan: clicking an alternative substation on the map picks it", async ({ page }) => {
    await openApp(page);
    const card = await scanAscon(page);
    await page.waitForFunction(() => !window.__gisMap.isMoving() && window.__gisMap.getSource("scan-pts-src"));
    // Zoom in on Lokoja so no other marker (the GenCos near Ajaokuta) sits on top of it.
    await page.evaluate(() => {
      const f = window.__gisMap.querySourceFeatures("scan-pts-src").find(x => x.properties.name === "Lokoja");
      window.__gisMap.jumpTo({ center: f.geometry.coordinates, zoom: 10 });
    });
    await page.waitForFunction(() => !window.__gisMap.isMoving());
    await page.waitForTimeout(600);
    const xy = await page.evaluate(() => {
      const f = window.__gisMap.querySourceFeatures("scan-pts-src").find(x => x.properties.name === "Lokoja");
      const p = window.__gisMap.project(f.geometry.coordinates);
      const r = window.__gisMap.getCanvas().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.click(xy.x, xy.y);
    await expect(card.getByTestId("scan-supply")).toContainText("Lokoja");
  });

  test("route: start a plant at its own substation", async ({ page, request }) => {
    const errors = [];
    await openApp(page, { errors });
    const input = await openPalette(page);
    await input.fill("Geregu Power PLC to IKEDC");
    await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
    const card = page.getByTestId("route-card");
    const pickA = card.getByTestId("join-from").locator("select");
    await expect(pickA).toBeVisible();
    await pickA.selectOption("Geregu");
    const r = await (await request.get(`${API}/api/route?fromLat=${GEREGU_PLANT.lat}&fromLng=${GEREGU_PLANT.lng}&fromNode=Geregu&lat=${IKEDC.lat}&lng=${IKEDC.lng}`)).json();
    checkRoute(r);
    await expect(card.getByTestId("route-loss-note")).toContainText(`= ${r.loss_pct}%`);
    await expect(card.getByTestId("join-from")).toContainText("isn't confirmed as a supply point");
    await pickA.selectOption("");
    await expect(card.getByTestId("join-from")).not.toContainText("isn't confirmed");
    expect(errors).toEqual([]);
  });

  test("API: a substation off the built grid can't be chosen", async ({ request }) => {
    const res = await request.get(`${API}/api/route?fromLat=${ADAVI.lat}&fromLng=${ADAVI.lng}&fromNode=Obajana&lat=${IKEDC.lat}&lng=${IKEDC.lng}`);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("isn't a built substation on the grid");
  });
});

// Task 1.8: pick a substation, see the customers nearest to it.
test.describe("customers near a substation", () => {
  test("Ota 132kV lists its nearby customers; tapping one scans it connected there", async ({ page }) => {
    const errors = [];
    await openApp(page, { errors });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByRole("dialog").locator("input").first().fill("Ota 132kV");
    await page.getByRole("dialog").getByText("132 kV · existing").first().click();
    const card = page.getByTestId("substation-card");
    await expect(card).toContainText("Ota 132kV");
    await expect(card).toContainText("Listed supply point");
    const list = card.getByTestId("substation-customers");
    await expect(list).toContainText("GeePee");
    // Distances are sorted, nearest first.
    const kms = (await list.locator("li").allTextContents()).map(t => Number(t.match(/([\d.]+) km/)[1]));
    expect([...kms].sort((a, b) => a - b)).toEqual(kms);
    // Drawn on the map.
    expect(await page.evaluate(() => window.__gisMap.getSource("subfocus-src") != null)).toBe(true);

    await list.getByRole("button", { name: /GeePee/ }).click();
    const scan = page.getByTestId("scan-card");
    await expect(scan.getByTestId("scan-supply")).toContainText("Ota 132kV", { timeout: 30_000 });
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a substation that isn't a supply point says so", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByRole("dialog").locator("input").first().fill("Ajaokuta");
    await page.getByRole("dialog").getByText("330 kV · existing").first().click();
    const card = page.getByTestId("substation-card");
    await expect(card).toContainText("Not confirmed as a supply point");
    await expect(card).toContainText("On the built grid");
    await expect(card.getByTestId("substation-customers").locator("li").first()).toBeVisible();
  });
});

// Site Scan and Find a customer pick the same supply point for the same
// site (same in-state rule), and the scan explains when the rule applies.
test("scan and connect agree on the supply point; the in-state choice is explained", async ({ page, request }) => {
  for (const [lat, lng] of [[6.75, 3.38], [6.505, 3.08], [7.6572, 6.4174], [9.0, 7.4]]) {
    const c = await (await request.get(`${API}/api/connect?lat=${lat}&lng=${lng}`)).json();
    const s = await (await request.get(`${API}/api/best-source?lat=${lat}&lng=${lng}&preferState=1`)).json();
    const rec = c.candidates.find(x => x.recommended);
    expect(s.dest_join.node).toBe(rec.name);
    expect(Math.abs(s.results[0].last_mile_km - rec.distance_km)).toBeLessThanOrEqual(0.1);
  }
  await openApp(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByRole("dialog").locator("input").first().fill("6.75, 3.38");
  await page.getByRole("dialog").getByText(/6\.75.*3\.38/).first().click();
  // Expected answer from the data (it moves when substation positions are corrected).
  const s = await (await request.get(`${API}/api/best-source?lat=6.75&lng=3.38&preferState=1`)).json();
  const card = page.getByTestId("scan-card");
  await expect(card.getByTestId("scan-supply")).toContainText(s.dest_join.node, { timeout: 30_000 });
  const nearer = s.dest_join.snap?.nearest_overall;
  expect(nearer, "this site sits near a state boundary, so the in-state rule should apply").toBeTruthy();
  await expect(card).toContainText(`${nearer.node} in ${nearer.state} is slightly nearer`);
});

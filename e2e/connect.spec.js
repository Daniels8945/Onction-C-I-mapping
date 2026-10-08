import { test, expect } from "@playwright/test";

// The customer-connection journey in a real browser against the real API
// (Google Places + OpenStreetMap search, the grid dataset): search → confirm
// → nearby infrastructure → potential connection → indication, in 2D and 3D,
// plus the edge cases. Search results come from live providers, so
// assertions are about shape and place (state, LGA, distance), not exact
// listings.

import { KNOWN_NOISE, haversineKm, openApp, searchBox, search, choose, customerCoords, mapCenterNear } from "./helpers.js";

let errors;
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, errors.join("\n")).toEqual([]); });

test.describe("search", () => {
  test("known business → located, assessed, connection drawn on the first pick", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "Nestle Agbara");
    await choose(page, "Nestle Nigeria PLC Agbara");
    const card = page.getByTestId("connect-card");
    await expect(card).toContainText("Ogun");
    const cust = await customerCoords(page);
    expect(cust.lat).toBeGreaterThan(6.45); expect(cust.lat).toBeLessThan(6.56);
    expect(cust.lng).toBeGreaterThan(3.02); expect(cust.lng).toBeLessThan(3.16);
    // No second interaction needed: the suggested supply point is selected and drawn.
    await expect(page.getByTestId("connection-summary")).toBeVisible();
    await expect(page.getByTestId("indication")).toBeVisible();
    await mapCenterNear(page, cust);
    // The drawn line joins exactly the chosen substation and the customer,
    // and the card's distance is the straight-line distance between them.
    const line = await page.evaluate(() => window.__gisMap.getSource("connect-line-src")._data.features.find(f => f.properties.kind === "straight"));
    const [sub, end] = line.geometry.coordinates;
    expect(end[0]).toBeCloseTo(cust.lng, 4); expect(end[1]).toBeCloseTo(cust.lat, 4);
    const shown = Number((await page.getByTestId("connection-summary").textContent()).match(/([\d.]+) km/)[1]);
    expect(Math.abs(haversineKm(cust, { lat: sub[1], lng: sub[0] }) - shown)).toBeLessThan(0.15);
  });

  test("ambiguous name → several sites in different states, previewed on the map, user picks", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "Dangote");
    const places = page.locator("#customer-results [role=option]").filter({ has: page.locator("span.rounded-full") });
    expect(await places.count()).toBeGreaterThanOrEqual(4);
    const subs = await places.allTextContents();
    const states = new Set(subs.map(s => s.match(/(Lagos|Ogun|Kogi|Kano|Edo|Rivers|FCT|Jigawa|Kaduna|Benue|Gombe|Abuja)/)?.[1]).filter(Boolean));
    expect(states.size).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("search-dot")).toHaveCount(await places.count());
    // Arrow keys move the highlighted preview dot.
    await searchBox(page).press("ArrowDown");
    await expect(page.locator(".search-dot--active")).toHaveCount(1);
    const second = (await places.nth(1).locator("p").first().textContent()).replace(/^\d+/, "").trim();
    await places.nth(1).click();
    await expect(page.getByLabel("Customer name")).toHaveValue(second);
    await expect(page.getByTestId("search-dot")).toHaveCount(0); // previews gone once chosen
  });

  test("misspelling → still finds the business", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "Dangote cemnt");
    await expect(page.locator("#customer-results")).toContainText(/Dangote Cement/i);
  });

  test("informal description → matching places in that state", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "cement factory in Ogun");
    const places = page.locator("#customer-results [role=option]").filter({ has: page.locator("span.rounded-full") });
    expect(await places.count()).toBeGreaterThanOrEqual(3);
    for (const t of await places.allTextContents()) expect(t).toContain("Ogun");
    await expect(page.locator("#customer-results")).toContainText(/check it's your customer/);
  });

  test("incomplete address → the area to start from, and the user is asked to confirm the site", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "Ikeja Industrial Area");
    await expect(page.locator("#customer-results")).toContainText("wasn't found as a site");
    await choose(page, "Ikeja");
    await expect(page.getByTestId("confirm-location")).toBeVisible();
    await expect(page.getByTestId("next-step")).toContainText(/centre of an area/);
    await page.getByRole("button", { name: "Yes, this is the site" }).click();
    await expect(page.getByTestId("confirm-location")).toHaveCount(0);
  });

  test("no result → guidance, and dropping a pin still runs the assessment", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "qwxzv blorp");
    await expect(page.getByTestId("search-no-match")).toContainText("Nothing found");
    await choose(page, "Drop a pin on the map");
    await page.evaluate(() => window.__gisMap.jumpTo({ center: [3.35, 6.6], zoom: 11 }));
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.getByTestId("connect-card")).toContainText("Placed by you");
    await expect(page.getByTestId("connection-summary")).toBeVisible();
  });

  test("coordinates: valid → exact point; outside Nigeria → nothing found", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "51.5, -0.12");
    await expect(page.getByTestId("search-no-match")).toBeVisible();
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    expect(await customerCoords(page)).toEqual({ lat: 6.75, lng: 3.38 });
  });
});

test.describe("infrastructure", () => {
  test("state context: in-state supply point preferred; off → nearest overall (cross-state)", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    const card = page.getByTestId("connect-card");
    await expect(card).toContainText("In Ogun");
    await expect(page.getByTestId("candidate").filter({ hasText: "Suggested" })).toContainText("Ota 132kV");
    await page.getByLabel(/Prefer infrastructure in/).uncheck();
    await expect(page.getByTestId("candidate").filter({ hasText: "Suggested" })).toContainText("Odogunyan", { timeout: 20_000 });
    await expect(page.getByTestId("candidate").filter({ hasText: "Suggested" })).toContainText("Lagos");
  });

  test("nearby lines: cross-state relationships shown; click → real metadata", async ({ page, request }) => {
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await expect(page.getByTestId("nearby-line").first()).toBeVisible();
    await expect(page.getByTestId("nearby-line").filter({ hasText: "Cross-state" }).first()).toBeVisible();
    const api = await (await request.get("http://127.0.0.1:4001/api/connect?lat=6.75&lng=3.38")).json();
    const first = api.nearby_lines[0];
    await page.getByTestId("nearby-line").first().click();
    const detail = page.getByTestId("line-detail");
    await expect(detail).toContainText(`${first.from_node} – ${first.to_node}`);
    await expect(detail).toContainText(`${first.line_km} km`);
    await expect(detail).toContainText(`~${first.distance_km} km`);
    await expect(detail).toContainText("(inferred)");
  });

  test("remote site → apparent gap explained; expand radius; wider region", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "Kirikasamma");
    await choose(page, "Kiri");
    await page.getByTestId("radius-25").click();
    const empty = page.getByTestId("radius-empty");
    await expect(empty).toContainText("within 25 km");
    await expect(empty).toContainText("apparent infrastructure gap");
    await expect(page.getByTestId("candidate").filter({ hasText: "Beyond 25 km" }).first()).toBeVisible();
    await empty.getByRole("button", { name: /Expand to 50 km/ }).click();
    await expect(page.getByTestId("radius-empty")).toContainText("within 50 km");
    await page.waitForFunction(() => !window.__gisMap.isMoving());
    const z0 = await page.evaluate(() => window.__gisMap.getZoom());
    await Promise.all([page.waitForResponse(/api\/connect\?.*radiusKm=200/), page.getByTestId("radius-200").click()]);
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !window.__gisMap.isMoving());
    expect(await page.evaluate(() => window.__gisMap.getZoom())).toBeLessThan(z0);
    await expect(page.getByTestId("indication")).toContainText(/gap|extension/i);
  });

  test("multiple options: choosing another substation redraws the connection", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    const other = page.getByTestId("candidate").filter({ hasNotText: "Suggested" }).first();
    const name = (await other.locator("span.truncate").first().textContent()).trim();
    await other.click();
    await expect(page.getByTestId("connection-summary")).toContainText(name);
    await expect(page.getByTestId("indication").locator("..")).toContainText(`you're viewing ${name}`);
  });
});

test.describe("3D", () => {
  test("models load, align with the data, hover + click work, arc follows the selection", async ({ page }) => {
    const failed = [];
    page.on("requestfailed", r => { if (/models\//.test(r.url())) failed.push(r.url()); });
    await openApp(page, { threeD: true, errors });
    await search(page, "Nestle Agbara");
    await choose(page, "Nestle Nigeria PLC Agbara");
    await page.waitForFunction(() => window.__connect3d?.debug().active, null, { timeout: 30_000 });
    await page.waitForFunction(() => !window.__gisMap.isMoving() && window.__gisMap.getPitch() > 40, null, { timeout: 15_000 });
    expect(failed).toEqual([]);
    const d = await page.evaluate(() => window.__connect3d.debug());
    expect(d.towers + d.ghostTowers).toBeGreaterThan(0);
    expect(d.substations).toBe(await page.getByTestId("candidate").count());
    expect(d.arc).toBe(true);
    // Alignment: the rendered yard is hit exactly at its substation's coordinates.
    const sel = d.substationScreen.find(s => s.name === d.selected);
    const hit = await page.evaluate((p) => window.__connect3d.pick(p), sel.px);
    expect(hit?.kind).toBe("substation");
    expect(hit.candidate.name).toBe(d.selected);
    // Hover → tooltip names it.
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.mouse.move(box.x + sel.px.x - 40, box.y + sel.px.y + 40);
    await page.mouse.move(box.x + sel.px.x, box.y + sel.px.y - 2, { steps: 5 });
    await expect(page.getByTestId("connect-tooltip")).toContainText(d.selected);
    await expect(page.getByTestId("connect-tooltip")).toContainText("Transmission substation");
    // Click another yard → it becomes the evaluated connection. Pull back
    // so the neighbouring substations are in view first.
    await page.mouse.move(5, 5);
    await page.evaluate(() => { const m = window.__gisMap; m.jumpTo({ zoom: 10.6, center: m.getCenter() }); });
    await page.waitForTimeout(1500);
    const other = await page.evaluate(() => {
      const dd = window.__connect3d.debug(), c = window.__gisMap.getCanvas();
      return dd.substationScreen.find(s => s.name !== dd.selected && s.px.x > 420 && s.px.x < c.clientWidth - 260 && s.px.y > 80 && s.px.y < c.clientHeight - 40
        && window.__connect3d.pick(s.px)?.candidate?.name === s.name);
    });
    expect(other, "a second substation in view").toBeTruthy();
    await page.mouse.click(box.x + other.px.x, box.y + other.px.y);
    await expect(page.getByTestId("connection-summary")).toContainText(other.name);
    expect((await page.evaluate(() => window.__connect3d.debug())).selected).toBe(other.name);
  });

  test("a tower hit reports its transmission line", async ({ page }) => {
    await openApp(page, { threeD: true, errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await page.waitForFunction(() => window.__connect3d?.debug().active && !window.__gisMap.isMoving(), null, { timeout: 30_000 });
    // Scan the canvas for a tower and check what it says it is.
    const found = await page.evaluate(() => {
      const c = window.__gisMap.getCanvas();
      for (let y = 60; y < c.clientHeight; y += 6) for (let x = 420; x < c.clientWidth - 260; x += 6) {
        const h = window.__connect3d.pick({ x, y });
        if (h?.kind === "line") return { line: h.line };
      }
      return null;
    });
    expect(found).not.toBeNull();
    expect(found.line.from_node).toBeTruthy();
    expect(found.line.voltage_kv).toBeGreaterThan(0);
  });

  test("3D off → layer removed and the map flattens; theme switch keeps 3D", async ({ page }) => {
    await openApp(page, { threeD: true, errors });
    await search(page, "Nestle Agbara");
    await choose(page, "Nestle Nigeria PLC Agbara");
    await page.waitForFunction(() => window.__connect3d?.debug().active, null, { timeout: 30_000 });
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.waitForFunction(() => !!window.__gisMap.getLayer("connect-3d"), null, { timeout: 20_000 });
    await page.getByTestId("toggle-3d").click();
    await page.waitForFunction(() => !window.__gisMap.getLayer("connect-3d"));
    await page.waitForFunction(() => !window.__gisMap.isMoving() && window.__gisMap.getPitch() < 1, null, { timeout: 15_000 });
    await expect(page.getByTestId("connection-summary")).toBeVisible(); // 2D still shows everything
  });

  test("phones start in 2D", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?e2e");
    await page.evaluate(() => localStorage.removeItem("gis:connect-3d"));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await page.waitForFunction(() => window.__gisMap?.loaded(), null, { timeout: 45_000 });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await expect(page.getByTestId("connection-summary")).toBeAttached();
    await expect(page.getByTestId("toggle-3d")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => !!window.__gisMap.getLayer("connect-3d"))).toBe(false);
  });
});

test.describe("connection & resilience", () => {
  test("customer → infrastructure → route, and flipping origin/destination", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await page.getByRole("button", { name: "Route power here" }).click();
    const route = page.getByTestId("route-card");
    await expect(route).toBeVisible();
    await expect(page.getByLabel("To place")).toHaveValue(/6\.75|Customer|6\.750/);
    await page.getByLabel("From place").fill("Ikeja West");
    await page.getByRole("option").filter({ hasText: "Ikeja West" }).first().click();
    await page.getByRole("button", { name: "Swap From and To" }).click();
    await expect(page.getByLabel("From place")).toHaveValue(/6\.75|Customer|6\.750/);
    await expect(page.getByLabel("To place")).toHaveValue(/Ikeja West/);
  });

  test("reload starts clean", async ({ page }) => {
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await page.reload();
    await page.waitForFunction(() => window.__gisMap?.loaded(), null, { timeout: 45_000 });
    await expect(page.getByTestId("connect-card")).toHaveCount(0);
  });

  test("slow API → loading state, then the result", async ({ page }) => {
    await page.route("**/api/connect?*", async (route) => { await new Promise(r => setTimeout(r, 2500)); await route.continue(); });
    await openApp(page, { errors });
    await search(page, "6.75, 3.38");
    await choose(page, "6.75000, 3.38000");
    await expect(page.getByTestId("next-step")).toContainText("Finding infrastructure");
    await expect(page.getByTestId("connection-summary")).toBeVisible({ timeout: 20_000 });
  });

  test("API errors are explained, not silent", async ({ page }) => {
    await page.route("**/api/connect?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) }));
    await page.route("**/api/geocode/search?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Search backend down" }) }));
    errors = null; // the 500s above log console errors on purpose
    await openApp(page);
    await searchBox(page).fill("Nestle Agbara");
    await expect(page.locator("#customer-results")).toContainText("Search unavailable: Search backend down");
    // With search down, a dropped pin still gets to the assessment — which fails, visibly.
    await choose(page, "Drop a pin on the map");
    await page.evaluate(() => window.__gisMap.jumpTo({ center: [3.35, 6.6], zoom: 11 }));
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.getByTestId("connect-card")).toContainText("Internal server error");
    await expect(page.getByTestId("next-step")).toContainText("Couldn't reach the grid API");
    errors = [];
  });
});

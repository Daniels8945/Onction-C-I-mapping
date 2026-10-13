import { test, expect } from "@playwright/test";
import { openApp, search, choose, customerCoords, haversineKm } from "./helpers.js";

// The whole job, start to finish, as a C&I analyst would do it: find a
// customer, check their grid connection and sources, route power, look at it
// in 3D, adjust the view, change things, start again — on desktop, then on a
// phone. Each step checks the numbers, not just that something appeared.

const API = process.env.E2E_API_URL || "http://127.0.0.1:4001";
const settle = (page) => page.waitForFunction(() => !window.__gisMap.isMoving());
const palette = async (page, text) => {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByRole("dialog").locator("input").first().fill(text);
};

test("customer → connection → sources → route → 3D → controls → start again", async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = [];
  await openApp(page, { threeD: true, errors });

  // 1–2. The map is up and drawing the network data.
  expect(await page.evaluate(() => window.__gisMap.getStyle().layers.length)).toBeGreaterThan(20);

  // 3–5. Find a customer; coordinates and state are shown.
  await search(page, "Nestle Agbara");
  await choose(page, "Nestle Nigeria PLC Agbara");
  const connect = page.getByTestId("connect-card");
  await expect(connect).toContainText("Ogun");
  const cust = await customerCoords(page);
  await expect(page.getByTestId("connection-summary")).toBeVisible();
  const connectKm = Number((await page.getByTestId("connection-summary").textContent()).match(/([\d.]+) km/)[1]);
  const connectSub = (await page.getByTestId("connection-summary").textContent()).trim();

  // 6–7. Site Scan for the same customer: the same point, and when both pick
  // the same supply point, the same straight-line distance.
  await connect.getByRole("button", { name: "GenCo sources" }).click();
  const scan = page.getByTestId("scan-card");
  const supply = scan.getByTestId("scan-supply");
  await expect(supply).toBeVisible({ timeout: 30_000 });
  const scanText = await supply.textContent();
  const scanNode = scanText.split("·")[0].trim();
  const scanKm = Number(scanText.match(/([\d.]+) km/)[1]);
  if (connectSub.includes(scanNode) && /straight/.test(scanText)) expect(Math.abs(scanKm - connectKm)).toBeLessThanOrEqual(0.1);
  const best = await (await request.get(`${API}/api/best-source?lat=${cust.lat}&lng=${cust.lng}`)).json();
  expect(best.dest_join.node).toBe(scanNode);

  // 8. Ranking: availability first, then delivered cost — as the card says.
  const ORDER = ["Available", "Earmarked", "Committed", "Over-committed", "No data"];
  const labels = await scan.locator("ol li").evaluateAll(lis => lis.map(li => li.querySelector("span.rounded-full")?.textContent));
  const ranks = labels.map(l => ORDER.indexOf(l));
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

  // 9–10. Route between two places; the numbers add up.
  await scan.getByRole("button", { name: "Close scan" }).click();
  await palette(page, "Geregu Power PLC to IKEDC");
  await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
  const route = page.getByTestId("route-card");
  await expect(route.getByTestId("route-loss-note")).toBeVisible({ timeout: 30_000 });
  const r = await (await request.get(`${API}/api/route?fromLat=7.4706&fromLng=6.6595&lat=6.6&lng=3.35`)).json();
  expect(Math.abs(r.first_mile_km + r.routed_km + r.last_mile_km - r.total_km)).toBeLessThanOrEqual(0.1);
  expect(r.hop_count).toBe(r.hops.length);
  await expect(route).toContainText(`${Math.round(r.total_km)}`);
  await expect(route).toContainText(`${r.loss_pct}`);

  // 11–13. 3D: on, and tower density follows zoom.
  await page.waitForFunction(() => window.__route3d?.debug().active, null, { timeout: 30_000 });
  await page.evaluate(() => window.__gisMap.jumpTo({ center: [4.6, 6.45], zoom: 6.6, pitch: 0 })); await settle(page);
  await page.waitForTimeout(300);
  const far = (await page.evaluate(() => window.__route3d.debug())).spacingM;
  await page.evaluate(() => window.__gisMap.jumpTo({ zoom: 9.6 })); await settle(page);
  await page.waitForTimeout(300);
  const near = (await page.evaluate(() => window.__route3d.debug())).spacingM;
  expect(near).toBeLessThan(far);

  // 14. Layers: all off and back, without touching the route.
  const note = await route.getByTestId("route-loss-note").textContent();
  await page.getByTestId("sidebar-all-off").click();
  await page.getByTestId("sidebar-all-on").click();
  expect(await route.getByTestId("route-loss-note").textContent()).toBe(note);

  // 15. Move the legend out of the way; the map doesn't pan.
  const cam = await page.evaluate(() => window.__gisMap.getCenter().toArray());
  const g = await page.getByTestId("grip-legend").boundingBox();
  await page.mouse.move(g.x + 5, g.y + 5); await page.mouse.down();
  await page.mouse.move(g.x - 200, g.y + 80, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__gisMap.getCenter().toArray())).toEqual(cam);

  // 16. Change the route: start at the plant's own substation.
  await route.getByTestId("join-from").locator("select").selectOption("Geregu");
  await page.waitForFunction(() => window.__route3d.debug().substations === 5, null, { timeout: 20_000 });

  // 17. Clear and start again: closing removes the route and its 3D.
  await route.getByRole("button", { name: "Close route" }).click();
  await page.waitForFunction(() => !window.__gisMap.getLayer("route-3d"));
  await palette(page, "Ota 132kV");
  await page.getByRole("dialog").getByText("132 kV · existing").first().click();
  await expect(page.getByTestId("substation-card")).toContainText("GeePee");

  // 19. Phone-sized window: the open card and map still fit.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const card = await page.getByTestId("substation-card").boundingBox();
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

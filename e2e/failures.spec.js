import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.js";

// When data is missing or a request fails, the cards say so plainly and
// never show a number in its place.

const palette = async (page, text) => {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.getByRole("dialog").locator("input").first().fill(text);
};
const scanAscon = async (page) => {
  await palette(page, "Ajaokuta Steel");
  await page.getByRole("dialog").getByText("Ajaokuta Steel Co. Ltd (ASCON)").first().click();
  return page.getByTestId("scan-card");
};

test("grid sources fail: scan says so, shows no ranking, cost or distance", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/best-source**", r => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal error" }) }));
  const card = await scanAscon(page);
  await expect(card).toContainText("Couldn't get grid sources: Internal error", { timeout: 20_000 });
  await expect(card).toContainText("No ranking");
  await expect(card).not.toContainText("₦");
  await expect(card.getByTestId("scan-supply")).toHaveCount(0);
  // The rest of the scan still works.
  await expect(card).toContainText("Solar resource");
});

test("API unreachable: the route card explains instead of showing numbers", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/route?**", r => r.abort("connectionrefused"));
  await palette(page, "Geregu Power PLC to IKEDC");
  await page.getByRole("dialog").getByText("Geregu Power PLC → IKEDC").click();
  const card = page.getByTestId("route-card");
  await expect(card).toContainText("Grid API:", { timeout: 20_000 });
  await expect(card.getByTestId("route-loss-note")).toHaveCount(0);
  await expect(card).not.toContainText("km of grid line");
});

test("location lookup fails: the DisCo section says why it's empty", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/geocode/reverse**", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Geocoder unavailable" }) }));
  const card = await scanAscon(page);
  await expect(card).toContainText("Needs the location lookup", { timeout: 20_000 });
  await expect(card).not.toContainText("feeders on");
});

test("no live feeder data: DisCo supply is marked as a dated snapshot, not live", async ({ page }) => {
  // Blocked from the first request, as on a server with no poller.
  await page.route("**/api/feeders/summary", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ available: false, reason: "poller idle" }) }));
  await openApp(page);
  const card = await scanAscon(page);
  const supply = card.locator("section").filter({ hasText: "DisCo supply today" });
  await expect(supply.getByText("Snapshot", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(supply.getByText("Live", { exact: true })).toHaveCount(0);
});

test("a GenCo with no tariff: no delivered cost is invented", async ({ page }) => {
  await openApp(page);
  // The real response, with the top source's tariff removed (as for MEPP).
  await page.route("**/api/best-source**", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.results = body.results.map(r => r.genco === "Tetracore (Atakobo)" ? { ...r, tariff_ngn_kwh: null } : r);
    await route.fulfill({ response: res, json: body });
  });
  const card = await scanAscon(page);
  const rows = card.locator("ol li");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const tetra = rows.filter({ hasText: "Tetracore" });
  await expect(tetra).toHaveCount(1);
  await expect(tetra).not.toContainText("₦");                       // no price made up
  await expect(rows.filter({ hasText: "NDPHC Geregu" })).toContainText("₦"); // others keep theirs
});

test("explanations: every analytical section can say how it was worked out", async ({ page }) => {
  await openApp(page);
  const card = await scanAscon(page);
  await expect(card.getByTestId("scan-supply")).toBeVisible({ timeout: 30_000 });
  const how = card.getByTestId("how-it-works");
  expect(await how.count()).toBeGreaterThanOrEqual(4);              // grid connection, sources, demand, solar (+ DisCo)
  await how.first().locator("summary").click();
  await expect(how.first()).toContainText("What it can't tell you");
  await expect(how.first()).toContainText("What to do next");
});

import { expect } from "@playwright/test";

// Shared by the e2e specs: app start-up, the customer search, and map checks.

export const KNOWN_NOISE = [
  /api\/feeders\/summary/,            // no FEEDER_API_KEY locally — the app falls back to its snapshot
  /Failed to load resource: the server responded with a status of 503/,
  /could not be loaded\. Please make sure you have added the image/, // basemap sprite
  /GL Driver Message/, /GPU stall/,
];

export function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function openApp(page, { threeD = false, errors } = {}) {
  // Each test starts from the default view; a reload within the test keeps
  // whatever the test changed (sessionStorage survives reloads in a tab).
  await page.addInitScript((on) => {
    try {
      if (!sessionStorage.getItem("e2e-init")) { localStorage.removeItem("gis:connect-view"); localStorage.setItem("gis:connect-3d", on ? "1" : "0"); sessionStorage.setItem("e2e-init", "1"); }
    } catch {}
  }, threeD);
  page.on("pageerror", (e) => errors?.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !KNOWN_NOISE.some(r => r.test(m.text()))) errors?.push(`console: ${m.text()}`); });
  await page.goto("/?e2e");
  await page.waitForFunction(() => window.__gisMap?.loaded(), null, { timeout: 45_000 });
}

export const searchBox = (page) => page.getByRole("combobox", { name: "Find a customer" });

export async function search(page, text) {
  await searchBox(page).fill(text);
  // Wait until the server results for THIS query are in (spinner gone).
  await expect(page.locator("#customer-results")).toBeVisible();
  await expect(page.locator("[data-testid=customer-search] .animate-spin")).toHaveCount(0, { timeout: 30_000 });
}

export async function choose(page, text) {
  await page.locator("#customer-results [role=option]").filter({ hasText: text }).first().click();
  await expect(page.getByTestId("connect-card")).toBeVisible();
}

export async function customerCoords(page) {
  const t = await page.getByTestId("customer-coords").textContent();
  const [lat, lng] = t.split(",").map(Number);
  return { lat, lng };
}

// The map has settled on the customer.
export async function mapCenterNear(page, pt, km) {
  await page.waitForFunction(() => !window.__gisMap.isMoving(), null, { timeout: 15_000 });
  const c = await page.evaluate(() => window.__gisMap.getCenter());
  const b = await page.evaluate(() => window.__gisMap.getBounds().toArray());
  expect(pt.lng).toBeGreaterThan(b[0][0]); expect(pt.lng).toBeLessThan(b[1][0]);
  expect(pt.lat).toBeGreaterThan(b[0][1]); expect(pt.lat).toBeLessThan(b[1][1]);
  if (km) expect(haversineKm({ lat: c.lat, lng: c.lng }, pt)).toBeLessThan(km);
}


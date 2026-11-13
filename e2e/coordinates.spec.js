import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { openApp, haversineKm } from "./helpers.js";

// Substations whose positions have been checked against Google satellite
// imagery (fixtures/verified-substations.json). Every part of the app that
// places them — the API, the map layer, Site Scan's distances, feeders
// placed at them — must use the verified point.

const API = process.env.E2E_API_URL || "http://127.0.0.1:4001";
const VERIFIED = JSON.parse(readFileSync(new URL("./fixtures/verified-substations.json", import.meta.url)));
const TOLERANCE_KM = 0.015; // 15 m: coordinates stored to 6 dp, nothing else should move them

test.describe("verified substation coordinates", () => {
  test("the API serves the verified positions", async ({ request }) => {
    const subs = await (await request.get(`${API}/api/substations`)).json();
    for (const v of VERIFIED) {
      const s = subs.find(x => x.name === v.name);
      expect(s, v.name).toBeTruthy();
      expect(haversineKm({ lat: s.lat, lng: s.lon }, v), v.name).toBeLessThan(TOLERANCE_KM);
    }
  });

  test("feeders placed at these substations sit on the verified point", async ({ request }) => {
    const res = await request.get(`${API}/api/feeders`);
    test.skip(!res.ok(), "feeder feed unavailable");
    const { feeders } = await res.json();
    for (const v of VERIFIED) {
      for (const f of feeders.filter(f => f.position?.method === "network" && f.position.matchedName === v.name)) {
        expect(haversineKm({ lat: f.position.lat, lng: f.position.lng }, v), `${f.name} @ ${v.name}`).toBeLessThan(TOLERANCE_KM);
      }
    }
  });

  test("the map draws them at the verified point", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("sidebar-all-on").click();
    await page.waitForFunction(() => window.__gisMap.getSource("grid-sub-src")?._data?.features?.length > 0, null, { timeout: 20_000 });
    for (const v of VERIFIED) {
      const at = await page.evaluate((n) => window.__gisMap.getSource("grid-sub-src")._data.features.find(f => f.properties.name === n)?.geometry.coordinates, v.name);
      expect(at, v.name).toBeTruthy();
      expect(haversineKm({ lat: at[1], lng: at[0] }, v), v.name).toBeLessThan(TOLERANCE_KM);
    }
  });

  test("Site Scan measures distances from the verified point", async ({ request }) => {
    // A point ~400 m from each verified substation: choosing that substation,
    // the last mile must be the straight line to the verified point.
    // Only built, grid-connected substations can be chosen as a supply point.
    const built = new Set((await (await request.get(`${API}/api/substations`)).json()).filter(s => s.status === "existing").map(s => s.name));
    for (const v of VERIFIED.filter(v => built.has(v.name))) {
      const p = { lat: v.lat + 0.003, lng: v.lng + 0.002 };
      const r = await (await request.get(`${API}/api/best-source?lat=${p.lat}&lng=${p.lng}&toNode=${encodeURIComponent(v.name)}`)).json();
      const last = r.results[0];
      if (!last.last_mile_geometry) expect(Math.abs(last.last_mile_km - haversineKm(p, v))).toBeLessThanOrEqual(0.06);
    }
  });
});

// No duplicate data: one row per physical feeder station, and stations
// matched to a substation keep no copy of its coordinates (they read the
// substation's, so a correction there moves them too).
test.describe("no duplicate station data", () => {
  const sql = (q) => execSync(`docker exec mapping-db psql -U mapping -d mapping_grid -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

  test("one row per station name and state", () => {
    expect(sql("SELECT count(*) FROM (SELECT name_key, state FROM feeder_station GROUP BY 1, 2 HAVING count(*) > 1) d")).toBe("0");
    expect(sql("SELECT to_regclass('feeder_station_location') IS NULL")).toBe("t"); // the old per-spelling table is gone
  });

  test("every spelling the feed uses points at exactly one station", () => {
    expect(sql("SELECT count(*) FROM (SELECT DISTINCT station, state FROM feeder) f LEFT JOIN feeder_station_alias a USING (station, state) WHERE a.station_id IS NULL")).toBe("0");
  });

  test("network-matched stations store no coordinates of their own", () => {
    expect(sql("SELECT count(*) FROM feeder_station WHERE method = 'network' AND (lat IS NOT NULL OR lon IS NOT NULL)")).toBe("0");
    expect(sql("SELECT count(*) FROM feeder_station s LEFT JOIN substation sub ON sub.name = s.matched_name WHERE s.method = 'network' AND sub.name IS NULL")).toBe("0");
  });
});

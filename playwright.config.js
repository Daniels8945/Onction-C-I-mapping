import { defineConfig } from "@playwright/test";

// Browser tests for the real app. Needs the API running (docker compose up
// -d — it serves 127.0.0.1:4001) with GOOGLE_MAPS_API_KEY set; the Vite dev
// server is started here and pointed at that API.
//   npx playwright test
const PORT = 5199;
const API = process.env.E2E_API_URL || "http://127.0.0.1:4001";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,               // Nominatim's 1 req/s limit is shared by every test
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    env: { VITE_API_URL: API },
  },
});

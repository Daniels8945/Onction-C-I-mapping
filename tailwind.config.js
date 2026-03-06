// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // ── Custom colour tokens ───────────────────────────────
      colors: {
        // Backgrounds
        surface:  "#080b0f",   // deepest bg
        panel:    "#0d1117",   // sidebar, topbar
        elevated: "#111820",   // cards, inputs
        // Borders
        rim:      "#1c2535",   // default border
        rim2:     "#243040",   // stronger border
        // Accent
        accent:   "#f5a623",   // primary amber
        // Semantic
        "green-gis": "#00e5a0",
        danger:      "#e05252",
        violet:      "#7c6af8",
        // Text
        light:    "#d8dde8",   // primary text
        slate:    "#8090a8",   // muted text
      },
      // ── Custom fonts ───────────────────────────────────────
      fontFamily: {
        mono:    ["JetBrains Mono", "monospace"],
        display: ["Syne", "sans-serif"],
      },
      // ── Keyframes ──────────────────────────────────────────
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        spin: "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};

// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
// Tailwind (including Preflight reset) loads first
import "./index.css";
// MapLibre CSS loads second so its canvas/popup rules override Preflight
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

# Nigeria GIS Platform

Interactive infrastructure mapping platform built with **React + MapLibre GL JS + Turf.js + Tailwind CSS**.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Project Structure

```
nigeria-gis/
├── src/
│   ├── data/
│   │   └── index.js          ← All GIS data (DISCOs, GenCos, transmission, C&I)
│   ├── utils/
│   │   └── analysis.js       ← Turf.js spatial functions (buffer, measure, nearest)
│   ├── hooks/
│   │   └── useNigeriaMap.js  ← All MapLibre map logic in one custom hook
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Toggle.jsx        ← On/off toggle switch
│   │   │   ├── ToolButton.jsx    ← Toolbar action button
│   │   │   ├── LayerRow.jsx      ← Layer toggle row
│   │   │   └── SectionTitle.jsx  ← Sidebar section header
│   │   ├── Topbar.jsx        ← Top navigation bar
│   │   ├── Sidebar.jsx       ← Left panel (layers, finder, info, analysis)
│   │   ├── MapView.jsx       ← Map container + loading overlay
│   │   ├── LocationFinder.jsx← Coordinate input + Nominatim address search
│   │   ├── InfoCard.jsx      ← Selected feature info panel
│   │   ├── AnalysisBox.jsx   ← Turf.js results display
│   │   └── StatusBar.jsx     ← Bottom status bar
│   ├── App.jsx               ← Root component — wires hook to components
│   ├── main.jsx              ← React entry point
│   └── index.css             ← Tailwind + MapLibre overrides
├── tailwind.config.js        ← Custom colour tokens
├── vite.config.js
└── package.json
```

---

## Adding Your Own Data

### Add a new facility layer
1. Add your data array to `src/data/index.js`
2. Add a `_addMyLayer(map)` function in `useNigeriaMap.js`
3. Call it inside `map.on('load', ...)` 
4. Add it to `LAYER_GROUPS` in the hook
5. Add a `<LayerRow>` in `Sidebar.jsx`

### Add a custom Turf analysis
1. Write a pure function in `src/utils/analysis.js`
2. Import and call it in `useNigeriaMap.js`
3. Add a button in `Topbar.jsx`

---

## Custom Colours (Tailwind)

| Token        | Value     | Usage                     |
|-------------|-----------|---------------------------|
| `surface`   | `#080b0f` | Deepest background        |
| `panel`     | `#0d1117` | Topbar, sidebar           |
| `elevated`  | `#111820` | Cards, inputs             |
| `rim`       | `#1c2535` | Default border            |
| `rim2`      | `#243040` | Strong border             |
| `accent`    | `#f5a623` | Primary amber             |
| `green-gis` | `#00e5a0` | GenCos, success states    |
| `danger`    | `#e05252` | Transmission lines, errors|
| `violet`    | `#7c6af8` | C&I customers             |
| `light`     | `#d8dde8` | Primary text              |
| `slate`     | `#8090a8` | Muted text / labels       |

---

## Tech Stack

- **React 18** — UI framework
- **MapLibre GL JS v4** — WebGL vector map rendering (open source, no API key)
- **Turf.js v6** — Client-side GIS analysis (buffer, distance, nearest point)
- **Tailwind CSS v3** — Utility-first styling
- **Vite** — Build tooling
- **Nominatim** — Free OpenStreetMap geocoding (address search)

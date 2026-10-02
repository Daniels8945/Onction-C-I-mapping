# Boundary data

- `ng-states.geojson` — Nigeria's 36 states + FCT (ADM1)
- `ng-lgas.geojson` — the 774 Local Government Areas (ADM2)

Source: geoBoundaries gbOpen NGA ADM1/ADM2 (simplified), originally from
GRID3 — https://www.geoboundaries.org — licensed CC BY 4.0. Coordinates
rounded to 4 decimal places (~11 m); "Abuja Federal Capital Territory"
renamed "FCT". Used server-side by `src/geo/admin.js` to tell which state /
LGA a customer or substation is in.

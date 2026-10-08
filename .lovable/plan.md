# Smart Early-Warning System (El Niño-aware) + Fluid Layer Switching

Goal: turn the map from a static display into a live warning system — automatic alerts for El Niño-driven floods, heavy rain and drought (Kenya first, then the region), plus smooth, stable layer switching.

## 1. Live alerts engine (in the app)
- New warnings module that evaluates live data every 10 minutes: Open-Meteo rainfall (past 72h + 7-day forecast), GDACS/USGS threats already in the map, and the current ENSO (El Niño) state from NOAA's public ONI index.
- Rules produce graded alerts: **Advisory / Watch / Warning / Emergency**, per location, e.g.
  - Heavy rain: 24h > 50 mm Watch, > 100 mm Warning; 72h > 150 mm Emergency.
  - Flood risk: high 72h rain on saturated ground (from past 3-day totals) in flood-prone basins (Tana, Nyando, Lake Victoria, Juba-Shabelle, etc.).
  - El Niño boost: when ONI ≥ +0.5, thresholds for East Africa short-rains (Oct–Dec) are lowered one level and an "El Niño active" banner shows.
- Each alert carries source, issued time, valid-until, confidence, and "why" text — no unexplained numbers.

## 2. Alert UI
- **Alert banner** at the top (only when Warning or higher is active), color-coded, dismissible, with count.
- **Alerts panel** inside the existing right-side area (as a tab in the Weather card, keeping the rule "no card under the weather card"): sorted list, filter by country/severity, click to fly to location.
- **Map markers** for alerts: pulsing rings sized by severity, reusing the existing pulse style.
- Optional browser notification + sound for new Warning/Emergency (user opt-in toggle).
- "Last updated X min ago" + live/stale indicator so the UI never looks frozen.

## 3. Fluid, stable layer switching
- Keep each weather layer loaded once and toggle visibility instead of removing/re-adding it (current code removes and rebuilds layers each switch — the source of flicker and failures).
- Fade-in/out opacity transitions (~300 ms), disable buttons while a layer loads with a small spinner, debounce rapid clicks, and keep threat markers always on top.
- Recover automatically if a layer fails (retry once, then show a small notice instead of breaking the map).

## 4. Official data (KMD / NOAA) — prepared, not live yet
Per your notes, KMD has no open API; access is by data-sharing agreement. I will add a ready-to-use connector slot for KMD and NOAA Climate Data (token-based), switched off until credentials exist. Alerts work now from public sources and will automatically weigh KMD station data higher once connected.

## Technical details
- `src/lib/warnings/` — `rules.ts` (thresholds, ENSO adjustment), `enso.ts` (ONI fetch from NOAA CPC text file, cached 24h), `engine.ts` (combines rainfall + threats → alerts).
- `src/hooks/useEarlyWarnings.ts` — polling, dedupe by location+type, new-alert detection.
- Components: `AlertBanner.tsx`, `AlertsTab` inside `WeatherCard.tsx`, alert marker layer via MapLibre GeoJSON circle layers.
- `useWeatherLayers.ts`: persistent layer registry, `setLayoutProperty('visibility')` + paint opacity transitions, load-state per layer, click debounce.
- Backend ingestion of KMD/NOAA (`services/api` handler + `NOAA_CDO_TOKEN`, `KMD_API_*` secrets) stubbed and disabled.
- Unchanged blockers: the Mostar API host and paused cloud backend still limit DB-sourced threats; alerts in this plan work without them.

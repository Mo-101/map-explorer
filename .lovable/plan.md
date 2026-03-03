

## Verification Results — All Four Improvements Working

I triggered the GFS ingestion and tested each system. Here's the status:

### Confirmed Working

1. **GFS Detection Calibration** — Ingestion ran successfully: 54 hazards detected from 12 sample points. Addis Ababa now shows corrected MSLP values (~985-988 hPa) instead of the spurious ~827 hPa. The barometric correction and 870 hPa floor filter are functioning correctly.

2. **Region Names in Ticker** — Titles now include location names (e.g., `"Low pressure 988 hPa — Addis Ababa"`). The coordinate-based `nearestCity` fallback is in place for older records without region in titles.

3. **Ticker Click-to-Zoom** — `mapInstance` is passed to `SituationalTicker`. Items with coordinates get `cursor-pointer` styling and trigger `map.flyTo()` on click.

4. **AI Situational Summaries** — Edge function returns quality summaries via Lovable AI. Example output: *"A high-severity meteorological alert is in effect for Addis Ababa due to a significant low-pressure system of 988 hPa, alongside a critical wind threat in Lagos..."*. 5-minute caching is active.

### Current Data Profile
- **100 active threats** returned by `neon-threats` (limit cap)
- Heavy concentration on **Addis Ababa** pressure signals (expected — 2355m elevation generates many corrected MSLP readings near thresholds)
- Seed data (cyclone, cholera, flood) still present alongside live GFS detections

---

## Recommended Next Optimizations

Based on your roadmap, here's what to tackle next, prioritized by impact:

### Priority 1: Reduce Ticker Noise — Temporal Persistence Filter
**Problem**: Addis Ababa generates dozens of near-threshold MSLP signals (984-988 hPa) for consecutive forecast hours, flooding the ticker.

**Solution**: In `ingest-gfs`, only emit a hazard if the condition persists for 3+ consecutive forecast hours. Group by location and hazard type, emit a single representative alert with the min/max range.

**Changes**:
- Post-process `allHazards` to cluster by `(lat, lon, type)` before upserting
- Store only the peak severity detection per cluster
- Reduces 54 hazards to ~8-12 meaningful signals

### Priority 2: Expand GFS Coverage
**Problem**: Only 12 fixed points — large gaps across West Africa, Sahel, Horn of Africa.

**Solution**: Expand to ~30-40 strategic points covering all African sub-regions. Add points for:
- West Africa: Abuja, Ouagadougou, Bamako, Accra, Conakry
- East Africa: Mogadishu, Kigali, Bujumbura, Lilongwe
- Southern Africa: Lusaka, Harare, Maputo, Luanda
- North Africa: Algiers, Tunis, Tripoli, Khartoum
- Islands: Antananarivo (interior), Moroni, Port Louis

**Consideration**: Open-Meteo allows concurrent requests. Use `Promise.allSettled` with batches of 5 to stay within rate limits. Edge function timeout may need attention for 40 points × 72 hours.

### Priority 3: Threat Details Panel
**Problem**: Clicking a ticker item zooms the map but shows no additional information.

**Solution**: Add a slide-up panel or popover when a threat location is clicked, showing:
- Threat type, severity badge, and title
- Forecast timeline (pressure/wind graph using recharts)
- Source metadata (GFS run ID, forecast hour)
- "Last updated" timestamp

### Priority 4: Scheduled Ingestion via pg_cron
**Problem**: GFS ingestion only runs on manual trigger. No automated schedule.

**Solution**: Set up a cron job to invoke `ingest-gfs` every 6 hours (matching GFS run schedule: 00z, 06z, 12z, 18z). Uses `pg_cron` + `pg_net` extensions already available.

### Priority 5: Stale Alert Cleanup
**Problem**: Old GFS alerts remain `is_active = TRUE` indefinitely.

**Solution**: Add a cleanup step at the end of ingestion that sets `is_active = FALSE` for GFS alerts older than 72 hours or from previous run IDs.

---

## Suggested Implementation Order

1. Temporal persistence filter (reduce noise) — high impact, moderate effort
2. Stale alert cleanup — quick win, prevents data bloat
3. Scheduled ingestion via pg_cron — automates the pipeline
4. Expand coverage to 30-40 points — broader monitoring
5. Threat details panel — UX enhancement

Which of these would you like to implement next?


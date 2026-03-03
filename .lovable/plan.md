

## Plan: Four Improvements to Hazard Monitoring System

### Task 1: GFS Detection Calibration

**Root cause**: Open-Meteo returns `surface_pressure` (station-level), not sea-level pressure. At high-elevation points like Nairobi (1661m), station pressure is naturally ~827 hPa — physically correct but incorrectly triggering MSLP thresholds.

**Changes to `supabase/functions/ingest-gfs/index.ts`**:

1. Add `elevation` field to each sample point:
   ```
   { lat: -1.3, lon: 36.8, name: "Nairobi", elevation: 1661 },
   { lat: 9.0, lon: 38.7, name: "Addis Ababa", elevation: 2355 },
   { lat: -26.2, lon: 28.0, name: "Johannesburg", elevation: 1753 },
   // etc. — sea-level cities get elevation: 0 or ~10
   ```

2. Add barometric correction function:
   ```typescript
   function stationToMSLP(stationHpa: number, elevationM: number, tempC = 15): number {
     return stationHpa * Math.pow(1 + 0.0065 * elevationM / (tempC + 0.0065 * elevationM + 273.15), 5.257);
   }
   ```

3. Apply correction at line ~285 where `pressure` is read, and add a hard floor filter of 870 hPa post-correction.

4. Also pass the location `name` into `detectHazards` to include it in titles (feeds into Task 2).

---

### Task 2: Fix Region Names in Ticker

**Two-part fix**:

**A) Backend** — Update `detectHazards` in `ingest-gfs/index.ts` to accept a `locationName` parameter. Append it to hazard titles:
- `"Deep low pressure 970 hPa"` → `"Deep low pressure 970 hPa — Nairobi"`
- Same for wind and rain titles.

**B) Frontend fallback** — In `SituationalTicker.tsx`, add a coordinate-based nearest-city lookup for threats that lack a region in their title. Static array of ~15 African cities with lat/lng used as fallback when title splitting yields nothing.

Update `buildTickerItems` region extraction: try title split first, then fall back to coordinate lookup using threat's `center_lat`/`center_lng`.

---

### Task 3: Ticker Click-to-Zoom

**Changes**:

1. **`TickerItem` interface** — Add optional `lat`/`lng` fields.

2. **`buildTickerItems`** — Attach representative coordinates to REGION, PRESSURE, and WIND items (use first matching threat's coords). OVERVIEW items get no coords.

3. **`SituationalTicker` component** — Accept `mapInstance` prop (MapTiler SDK `Map`). On click of items with coords, call `mapInstance.flyTo({ center: [lng, lat], zoom: 6, duration: 1500 })`. Style clickable items with `cursor-pointer hover:bg-white/5`.

4. **`Index.tsx`** — Pass `mapInstance` to `<SituationalTicker mapInstance={mapInstance} />`.

---

### Task 4: AI Situational Summaries

**New edge function**: `supabase/functions/ai-situational-summary/index.ts`

- Accepts threat data array via POST
- Uses Lovable AI Gateway (`google/gemini-3-flash-preview`) with `LOVABLE_API_KEY`
- System prompt: meteorological analyst for African disaster monitoring, 2-3 sentence summary
- Non-streaming (invoke pattern)
- Returns `{ summary: string }`
- Handles 429/402 errors gracefully

**Config**: Add `[functions.ai-situational-summary]` with `verify_jwt = false` to `config.toml`.

**Frontend integration in `SituationalTicker.tsx`**:
- After fetching threats, call `ai-situational-summary` edge function
- Cache result for 5 minutes (simple timestamp check)
- Prepend as first ticker item: `{ module: 'AI BRIEF', text: summary, severity: 'info' }`
- Fallback silently to no AI item if call fails

---

### Execution Order

1. GFS calibration + region names in titles (both in `ingest-gfs`)
2. Region fallback in ticker frontend
3. Click-to-zoom (ticker + Index)
4. AI summary edge function + ticker integration
5. Deploy all edge functions and re-trigger ingestion


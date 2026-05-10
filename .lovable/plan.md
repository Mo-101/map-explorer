
# The Phantom — Whisper Engine

GraphCast-powered weather intelligence as a sovereign microservice with its own isolated Neo4j subgraph. No coupling to the hazard/POE graph. Coverage: Africa regional grid at GraphCast's native 0.25° resolution. Schema defined from first principles for `mo-weather-stormscribe-003`.

---

## 1. Coverage grid

- Bounding box: lat `-40° → +40°`, lon `-20° → +55°` (Africa + immediate maritime margins)
- Resolution: `0.25°` (GraphCast native)
- Node count: ~321 × 301 ≈ **96,000 `:WeatherLocation` nodes** (one-time seed)
- Each grid point carries a deterministic ID: `g_{lat_idx}_{lon_idx}` so MERGE is idempotent

## 2. Neo4j subgraph schema (Whisper Graph)

Fully isolated namespace. No shared labels with the hazard graph.

### Node labels

```text
(:WeatherLocation { id, lat, lon, lat_idx, lon_idx, h3_r5 })
(:ForecastCycle   { id, base_time, model_version, ingested_at, status })
(:ForecastNode    { id, cycle_id, location_id, lead_hours, valid_time,
                    t2m, u10, v10, msl, tp, tcwv,
                    z500, t850, q700,
                    wind_speed_10m, precip_rate,
                    flood_risk, storm_risk, heat_risk })
(:Variable        { name, unit, level })   // dictionary node, optional
(:Anomaly         { id, kind, severity, threshold, triggered_at })
```

### Relationships

```text
(:WeatherLocation)-[:HAS_FORECAST]->(:ForecastNode)
(:ForecastCycle)-[:PRODUCED]->(:ForecastNode)
(:ForecastNode)-[:NEXT]->(:ForecastNode)        // per-location time chain
(:ForecastNode)-[:TRIGGERED]->(:Anomaly)
(:Anomaly)-[:AT]->(:WeatherLocation)
```

### Indexes (covers all three query patterns)

```cypher
CREATE CONSTRAINT loc_id   IF NOT EXISTS FOR (l:WeatherLocation) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT cyc_id   IF NOT EXISTS FOR (c:ForecastCycle)   REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT fn_id    IF NOT EXISTS FOR (f:ForecastNode)    REQUIRE f.id IS UNIQUE;

CREATE POINT INDEX loc_point   IF NOT EXISTS FOR (l:WeatherLocation) ON (l.point);
CREATE INDEX fn_valid_time     IF NOT EXISTS FOR (f:ForecastNode) ON (f.valid_time);
CREATE INDEX fn_lead           IF NOT EXISTS FOR (f:ForecastNode) ON (f.lead_hours);
CREATE INDEX fn_flood_risk     IF NOT EXISTS FOR (f:ForecastNode) ON (f.flood_risk);
CREATE INDEX fn_precip_rate    IF NOT EXISTS FOR (f:ForecastNode) ON (f.precip_rate);
CREATE INDEX fn_msl            IF NOT EXISTS FOR (f:ForecastNode) ON (f.msl);
```

### APOC reflex triggers (anomaly scans)

- On `ForecastNode` create → if `msl < 1000 hPa`, `precip_rate > 25 mm/h`, or `wind_speed_10m > 25 m/s` → MERGE `:Anomaly` and link.

## 3. Microservice — `mostar-graphcast-engine`

```text
mostar-graphcast-engine/
├── Dockerfile                  # python:3.10 + JAX CPU (swap to CUDA later)
├── requirements.txt            # jax, haiku, xarray, redis, neo4j, cfgrib
├── engine/
│   ├── worker.py               # Redis BLPOP loop
│   ├── inference.py            # GraphCast model load + autoregressive rollout
│   ├── data_adapter.py         # GFS GRIB → xarray with year/day progress features
│   ├── grid.py                 # Africa bbox slicing, lat_idx/lon_idx mapping
│   ├── persist.py              # xarray → Cypher MERGE batched UNWIND writer
│   └── reflex.py               # post-write anomaly verification
├── seed/
│   └── seed_locations.py       # one-shot: MERGE 96k :WeatherLocation nodes
└── config.py                   # NEO4J_URI, REDIS_URL, MODEL_PATH, BBOX
```

### Queue payload contract

```json
{ "cycle_id": "gc_2026051000",
  "base_time": "2026-05-10T00:00:00Z",
  "source": "gfs",
  "lead_hours": [6, 12, 24, 48, 72, 120, 168, 240] }
```

### Persistence pattern (batched UNWIND, idempotent)

```cypher
UNWIND $rows AS r
MATCH  (l:WeatherLocation { id: r.location_id })
MERGE  (c:ForecastCycle   { id: r.cycle_id })
  ON CREATE SET c.base_time = datetime(r.base_time), c.model_version = r.model_version
MERGE  (f:ForecastNode    { id: r.fn_id })
  ON CREATE SET f += r.props
MERGE  (l)-[:HAS_FORECAST]->(f)
MERGE  (c)-[:PRODUCED]->(f);
```

`NEXT` chain stitched in a second pass per location, ordered by `lead_hours`.

## 4. Bridge to the existing app

- `supabase/functions/whisper-query/` — thin Deno proxy that forwards Cypher reads to the Whisper Graph (read-only) so the React app can query forecasts without exposing Neo4j creds.
- `src/services/whisperService.ts` — typed client matching the three query patterns (point lookup, rollout, anomaly scan).
- No UI changes in this plan — schema + service first.

## 5. Build order

1. Seed script + schema migration (constraints, indexes, 96k `:WeatherLocation` MERGE)
2. `data_adapter.py` — GFS → xarray with derived features (most fragile, do early)
3. `inference.py` — GraphCast rollout on a fixture
4. `persist.py` — batched UNWIND + NEXT chain
5. `reflex.py` + APOC triggers — anomalies
6. `worker.py` — Redis consumer wiring
7. Dockerfile + deploy target
8. `whisper-query` edge function + `whisperService.ts`

## 6. Secrets needed before step 1

- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (Whisper Graph instance)
- `REDIS_URL`
- `GRAPHCAST_MODEL_PATH` (or bucket URL for `params/` and `stats/`)
- GFS source already covered by existing `ingest-gfs`

## 7. Open decisions for after approval

- Deployment target (Cloud Run CPU vs GCP VM with GPU) — affects Dockerfile base image
- Cycle cadence (6h matches GFS; do we persist all 40 lead steps or only the 8 listed above?)
- Retention policy (drop `ForecastNode`s older than N cycles to keep graph lean)


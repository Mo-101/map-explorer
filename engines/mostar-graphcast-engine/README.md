# mostar-graphcast-engine — Whisper Engine

GraphCast inference worker that writes the **Whisper subgraph** into the
shared Grid Neo4j instance (same `bolt://` connection as Grid Core and the
Phantom subgraph). Logical isolation is via the `W_` label prefix.

## Subgraph contract

```
Grid Neo4j instance
│
├── Grid Core               (:GridTag) (:MoScriptRevision) (:UsageTrace)
│                           (:Agent) (:SovereignCoreLedger)
│                           (:ViolationFlag)   ← SHARED
│
├── Phantom subgraph        (:POE_*)
│
└── Whisper subgraph        (:W_Location) (:W_ForecastCycle) (:W_ForecastNode)
                            raises (:ViolationFlag) with source='whisper'
```

Every `:W_ForecastCycle` is anchored to `:SovereignCoreLedger { id: 'core' }`
via `[:ANCHORED_TO]` on write, mirroring GridTag registration.

## Files

| Path | Purpose |
|------|---------|
| `engine.py` | GraphCast model load + autoregressive rollout |
| `adapter.py` | GFS GRIB → xarray + time progress features |
| `bridge.py` | xarray → :W_ForecastNode + cycle anchoring + NEXT chain |
| `reflex.py` | Fallback anomaly scan → shared :ViolationFlag |
| `worker.py` | Redis queue consumer (`whisper:jobs`) |
| `grid.py` | Africa 0.25° grid indexing + region tagging |
| `seed_locations.py` | One-shot: schema + ~96k :W_Location + APOC trigger |
| `schema/whisper_schema.cypher` | Constraints + indexes |
| `schema/apoc_trigger.cypher` | stormscribe reflex trigger |
| `schema/seed_locations.cypher` | MERGE template (run by seed script) |

## Coverage

Full Africa 0.25° grid: lat `[-40, 40]`, lon `[-20, 55]` → **~96,000 `:W_Location` nodes**, seeded once.

## Environment

```
NEO4J_URI=bolt://localhost:7687   # same instance as Grid + Phantom
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
NEO4J_DATABASE=neo4j
REDIS_URL=redis://localhost:6379
WHISPER_QUEUE=whisper:jobs
GRAPHCAST_MODEL_PATH=/models/graphcast/params
GRAPHCAST_STATS_PATH=/models/graphcast/stats
```

## First-time setup

```bash
pip install -r requirements.txt
python seed_locations.py     # schema + 96k locations + APOC trigger
python worker.py             # consumer
```

## Job payload

```json
{ "cycle_id":   "gc_2026051000",
  "base_time":  "2026-05-10T00:00:00Z",
  "source":     "gfs",
  "lead_hours": [6, 12, 24, 48, 72, 120, 168, 240],
  "grib_paths": ["/data/gfs.t00z.pgrb2.0p25.f000",
                 "/data/gfs.t00z.pgrb2.0p25.f006"] }
```

Push with `LPUSH whisper:jobs '<json>'`.

## Consumer side — mo-weather-stormscribe-003

The agent polls shared `:ViolationFlag` nodes filtered by `source = 'whisper'`:

```cypher
MATCH (v:ViolationFlag { source: 'whisper', status: 'open' })-[:AT]->(l:W_Location)
WHERE v.severity > 0.5
RETURN v, l
ORDER BY v.severity DESC
```

…then calls `trigger_moscript_ritual('ms-flood-omen-002' | 'ms-weather-watch-001', v.id)`.

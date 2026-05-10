# mostar-graphcast-engine — The Phantom (Whisper Engine)

Sovereign GraphCast inference microservice that persists forecasts into an
isolated Neo4j subgraph ("Whisper Graph") for the Mo Weather intelligence
layer. Coverage: Africa regional grid at GraphCast's native 0.25° resolution.

This service runs **outside** the Lovable Vite/React project. Lovable cannot
execute Python or JAX. Treat this directory as deployable source code: build
the Docker image, push it to your runtime of choice (Cloud Run, GCE VM with
GPU, or on-prem worker), and point it at Redis + Neo4j.

## Architecture

```
   GFS GRIB ──► data_adapter ──► xarray ──► inference (GraphCast)
                                              │
                                              ▼
                                          persist ──► Neo4j (Whisper Graph)
                                              │
                                              ▼
                                           reflex ──► :Anomaly nodes
```

The worker consumes job payloads from a Redis list (`whisper:jobs`) emitted by
the existing Supabase `ingest-gfs` pipeline (or any other scheduler).

## Layout

| Path | Purpose |
|------|---------|
| `engine/worker.py` | Redis BLPOP loop, dispatches jobs |
| `engine/data_adapter.py` | GFS GRIB → xarray with derived features (year_progress sin/cos, etc.) |
| `engine/inference.py` | GraphCast model load + autoregressive rollout |
| `engine/grid.py` | Africa bbox slicing, deterministic location IDs |
| `engine/persist.py` | Batched UNWIND writer + per-location NEXT chain |
| `engine/reflex.py` | Post-write anomaly verification (defence-in-depth vs APOC trigger) |
| `seed/seed_locations.py` | One-shot: schema + 96k `:WeatherLocation` nodes + APOC trigger |
| `config.py` | Env-driven config |
| `Dockerfile` | python:3.10 + JAX CPU (swap to CUDA for GPU runtimes) |

## Whisper Graph schema (isolated subgraph)

Labels: `:WeatherLocation`, `:ForecastCycle`, `:ForecastNode`, `:Anomaly`,
`:Variable`. No shared labels with the hazard graph.

See `seed/seed_locations.py` for the authoritative schema (constraints,
indexes, APOC trigger).

## Environment

```
NEO4J_URI=bolt://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
REDIS_URL=redis://...
GRAPHCAST_MODEL_PATH=/models/graphcast/params
GRAPHCAST_STATS_PATH=/models/graphcast/stats
BBOX_LAT_MIN=-40
BBOX_LAT_MAX=40
BBOX_LON_MIN=-20
BBOX_LON_MAX=55
GRID_RES=0.25
```

## First-time setup

```bash
pip install -r requirements.txt
python -m seed.seed_locations         # creates schema + 96k locations
python -m engine.worker               # starts the consumer
```

## Job payload contract

```json
{
  "cycle_id": "gc_2026051000",
  "base_time": "2026-05-10T00:00:00Z",
  "source": "gfs",
  "lead_hours": [6, 12, 24, 48, 72, 120, 168, 240]
}
```

Push to Redis: `LPUSH whisper:jobs '<json>'`.

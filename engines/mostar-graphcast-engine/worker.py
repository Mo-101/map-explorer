"""Redis-driven worker entrypoint."""
from __future__ import annotations
import json
import logging
import signal
import sys
import time

import redis

from config import REDIS_URL, JOB_QUEUE, GRAPHCAST_MODEL_PATH, GRAPHCAST_STATS_PATH
from engine import GraphCastRunner, RolloutSpec
from adapter import load_gfs_state, normalize
from bridge import write_forecast
from reflex import scan_cycle

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("whisper.worker")

_running = True


def _stop(_sig, _frame):
    global _running
    log.info("Shutdown signal received")
    _running = False


def handle_job(runner: GraphCastRunner, payload: dict) -> None:
    cycle_id   = payload["cycle_id"]
    base_time  = payload["base_time"]
    lead_hours = payload.get("lead_hours", [6, 12, 24, 48, 72, 120, 168, 240])
    grib_paths = payload.get("grib_paths", [])
    source     = payload.get("source", "gfs")

    log.info("Job %s | base=%s | leads=%s", cycle_id, base_time, lead_hours)
    t0 = time.time()

    state = load_gfs_state(grib_paths)
    state = normalize(state, GRAPHCAST_STATS_PATH)
    forecast = runner.rollout(state, RolloutSpec(cycle_id, base_time, lead_hours))

    write_forecast(forecast, cycle_id, base_time, lead_hours, source=source)
    scan_cycle(cycle_id)  # reflex pass; APOC trigger already covers live writes

    log.info("Job %s done in %.1fs", cycle_id, time.time() - t0)


def main() -> int:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    r = redis.from_url(REDIS_URL, decode_responses=True)
    runner = GraphCastRunner(GRAPHCAST_MODEL_PATH, GRAPHCAST_STATS_PATH)

    log.info("Whisper worker listening on %s", JOB_QUEUE)
    while _running:
        item = r.blpop(JOB_QUEUE, timeout=5)
        if not item:
            continue
        _, raw = item
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            log.exception("Bad job payload: %s", raw)
            continue
        try:
            handle_job(runner, payload)
        except Exception:
            log.exception("Job failed; payload=%s", payload)

    return 0


if __name__ == "__main__":
    sys.exit(main())

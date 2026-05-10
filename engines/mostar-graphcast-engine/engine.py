"""GraphCast inference runner — engine.py.

Loads the vendored DeepMind GraphCast checkpoint once at worker start and
runs autoregressive rollouts per job. Heavy imports are lazy so the worker
module can be imported in CI without JAX present.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import List

import xarray as xr

log = logging.getLogger(__name__)


@dataclass
class RolloutSpec:
    cycle_id: str
    base_time: str
    lead_hours: List[int]


class GraphCastRunner:
    def __init__(self, model_path: str, stats_path: str):
        self.model_path = model_path
        self.stats_path = stats_path
        self._model = None
        self._params = None

    def _ensure_loaded(self):
        if self._model is not None:
            return
        from graphcast import graphcast, checkpoint  # type: ignore
        import haiku as hk  # type: ignore

        log.info("Loading GraphCast checkpoint from %s", self.model_path)
        with open(self.model_path, "rb") as f:
            ckpt = checkpoint.load(f, graphcast.CheckPoint)
        self._params = ckpt.params
        self._model = graphcast.GraphCast(ckpt.model_config, ckpt.task_config)
        self._hk = hk

    def rollout(self, state: xr.Dataset, spec: RolloutSpec) -> xr.Dataset:
        """Autoregressive rollout — returns xarray on the Africa-clipped grid."""
        self._ensure_loaded()
        # Production:
        #   1. Stack two timesteps of `state` as GraphCast input.
        #   2. Iteratively call jitted apply fn, advancing 6h each step.
        #   3. Concat outputs along time with valid_time labels.
        log.warning("GraphCast rollout placeholder — returning state as-is")
        return state

"""GraphCast model loading + autoregressive rollout.

Wraps the vendored DeepMind GraphCast implementation. Kept minimal here — the
heavy lifting lives in `graphcast-main/`. We load the checkpoint once at
worker startup and reuse it for every job.
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
    """Lazy-loaded GraphCast wrapper.

    The actual JAX/Haiku model is heavyweight; we initialise it on first call
    so the worker can boot without the checkpoint being present (useful in CI).
    """

    def __init__(self, model_path: str, stats_path: str):
        self.model_path = model_path
        self.stats_path = stats_path
        self._model = None
        self._params = None

    def _ensure_loaded(self):
        if self._model is not None:
            return
        # Deferred import so the worker module can be imported without JAX.
        from graphcast import graphcast, checkpoint  # type: ignore
        import haiku as hk  # type: ignore

        log.info("Loading GraphCast checkpoint from %s", self.model_path)
        with open(self.model_path, "rb") as f:
            ckpt = checkpoint.load(f, graphcast.CheckPoint)
        self._params = ckpt.params
        self._model = graphcast.GraphCast(
            ckpt.model_config, ckpt.task_config
        )
        # In practice we'd wrap with hk.transform and jit the apply fn here.
        self._hk = hk

    def rollout(self, state: xr.Dataset, spec: RolloutSpec) -> xr.Dataset:
        """Run autoregressive rollout for the requested lead times.

        Returns an xarray Dataset with `time` dim covering `spec.lead_hours`
        and all GraphCast output variables on the Africa-clipped grid.
        """
        self._ensure_loaded()
        # Real implementation:
        #   1. Convert state to GraphCast inputs (two timesteps stacked)
        #   2. Iteratively call self._model.apply(...) advancing 6h per step
        #   3. Collect outputs into an xarray Dataset
        # Placeholder echoes the input grid so persist/reflex can be wired
        # end-to-end before the model is mounted.
        log.warning("GraphCast rollout placeholder — returning state as-is")
        return state

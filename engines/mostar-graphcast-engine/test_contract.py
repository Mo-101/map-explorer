"""Contract tests.

Runs without JAX or xarray installed: the state objects are light stubs shaped
like an xarray Dataset. The cross-check against the real vendored TaskConfig
activates automatically when ``graphcast`` is importable, so the pinned literal
cannot drift away from the checkpoint unnoticed.

    python -m unittest discover -s engines/mostar-graphcast-engine -p "test_*.py"
"""
from __future__ import annotations

import unittest

from contract import (
    GRID_LAT_POINTS,
    GRID_LON_POINTS,
    MOSTAR_GRAPHCAST_OPERATIONAL_V1 as CONTRACT,
    ContractViolation,
    GraphCastContract,
    ViolationCode,
    from_task_config,
    resolve_contract,
    validate_state,
)


class _Coord:
    def __init__(self, values):
        self.values = values


class _State:
    """Minimal xarray-Dataset-shaped stub."""

    def __init__(self, dims, coords, data_vars):
        self.dims = dims
        self.coords = {k: _Coord(v) for k, v in coords.items()}
        self.data_vars = {k: object() for k in data_vars}


def _grid(n_lat=GRID_LAT_POINTS, n_lon=GRID_LON_POINTS):
    lat = [-90 + 0.25 * i for i in range(n_lat)]
    lon = [0 + 0.25 * i for i in range(n_lon)]
    return lat, lon


def _valid_state(**overrides):
    lat, lon = overrides.pop("grid", _grid())
    coords = {
        "lat": lat,
        "lon": lon,
        "level": list(CONTRACT.pressure_levels_hpa),
        "time": [-6, 0],
    }
    coords.update(overrides.pop("coords", {}))
    data_vars = overrides.pop("data_vars", list(CONTRACT.required_variables))
    return _State(dims={"lat", "lon", "level", "time"}, coords=coords, data_vars=data_vars)


class TestPinnedContract(unittest.TestCase):
    def test_operational_uses_thirteen_weatherbench_levels(self):
        self.assertEqual(
            CONTRACT.pressure_levels_hpa,
            (50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 850, 925, 1000),
        )
        self.assertEqual(len(CONTRACT.pressure_levels_hpa), 13)

    def test_precipitation_is_not_an_input(self):
        # The whole reason GraphCast_operational is viable from a GFS analysis.
        self.assertNotIn("total_precipitation_6hr", CONTRACT.required_variables)

    def test_wind_is_required_as_vector_components(self):
        # Scalar speed cannot be decomposed back into u/v.
        self.assertIn("10m_u_component_of_wind", CONTRACT.surface_variables)
        self.assertIn("10m_v_component_of_wind", CONTRACT.surface_variables)

    def test_two_input_timesteps(self):
        self.assertEqual(CONTRACT.history_hours, (-6, 0))
        self.assertEqual(CONTRACT.n_input_timesteps, 2)

    def test_solar_forcing_and_statics_present(self):
        self.assertIn("toa_incident_solar_radiation", CONTRACT.forcing_variables)
        self.assertIn("geopotential_at_surface", CONTRACT.static_variables)
        self.assertIn("land_sea_mask", CONTRACT.static_variables)


class TestValidator(unittest.TestCase):
    def test_accepts_a_conforming_state(self):
        validate_state(_valid_state(), CONTRACT)

    def test_rejects_cfgrib_dimension_names(self):
        state = _State(
            dims={"latitude", "longitude", "level", "time"},
            coords={"latitude": [], "longitude": []},
            data_vars=CONTRACT.required_variables,
        )
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(state, CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.INVALID_DIM_NAME)

    def test_rejects_africa_clipped_input(self):
        # The exact failure clip_to_africa() would produce.
        lat = [-40 + 0.25 * i for i in range(321)]
        lon = [-20 + 0.25 * i for i in range(301)]
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(grid=(lat, lon)), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.INVALID_GRID)

    def test_rejects_descending_latitude(self):
        lat, lon = _grid()
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(grid=(list(reversed(lat)), lon)), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.LATITUDE_ORDER_MISMATCH)

    def test_rejects_missing_variable(self):
        vars_ = [v for v in CONTRACT.required_variables if v != "specific_humidity"]
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(data_vars=vars_), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.MISSING_INPUT_VARIABLE)

    def test_rejects_missing_pressure_level(self):
        levels = [x for x in CONTRACT.pressure_levels_hpa if x != 50]
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(coords={"level": levels}), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.MISSING_PRESSURE_LEVEL)

    def test_rejects_extra_pressure_levels(self):
        # Feeding the 37-level set to a 13-level checkpoint.
        levels = sorted(set(CONTRACT.pressure_levels_hpa) | {1, 2, 3, 5, 7, 10})
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(coords={"level": levels}), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.UNEXPECTED_PRESSURE_LEVEL)

    def test_rejects_wrong_timestep_count(self):
        with self.assertRaises(ContractViolation) as ctx:
            validate_state(_valid_state(coords={"time": [0]}), CONTRACT)
        self.assertEqual(ctx.exception.code, ViolationCode.INVALID_TIME_SPACING)


class TestDriftDetection(unittest.TestCase):
    class _FakeTaskConfig:
        def __init__(self, levels, inputs, duration="12h"):
            self.pressure_levels = levels
            self.input_variables = inputs
            self.input_duration = duration

    def test_thirty_seven_level_checkpoint_is_rejected(self):
        era5_37 = (1, 2, 3, 5, 7, 10, 20, 30, 50, 70, 100, 125, 150, 175, 200, 225,
                   250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 775, 800,
                   825, 850, 875, 900, 925, 950, 975, 1000)
        cfg = self._FakeTaskConfig(era5_37, CONTRACT.required_variables)
        with self.assertRaises(ContractViolation) as ctx:
            resolve_contract(cfg)
        self.assertEqual(ctx.exception.code, ViolationCode.CONTRACT_DRIFT)

    def test_matching_checkpoint_resolves(self):
        cfg = self._FakeTaskConfig(
            CONTRACT.pressure_levels_hpa, CONTRACT.required_variables
        )
        resolved = resolve_contract(cfg)
        self.assertEqual(resolved.pressure_levels_hpa, CONTRACT.pressure_levels_hpa)

    def test_no_task_config_returns_pinned(self):
        self.assertIs(resolve_contract(None), CONTRACT)


class TestAgainstVendoredCheckpoint(unittest.TestCase):
    """Activates only where the vendored graphcast package imports."""

    def setUp(self):
        try:
            from graphcast import graphcast as gc  # type: ignore
        except Exception as exc:
            self.skipTest(f"graphcast not importable ({type(exc).__name__})")
        self.gc = gc

    def test_pinned_matches_task_13_precip_out(self):
        derived = from_task_config(self.gc.TASK_13_PRECIP_OUT)
        self.assertEqual(derived.pressure_levels_hpa, CONTRACT.pressure_levels_hpa)
        self.assertEqual(set(derived.required_variables), set(CONTRACT.required_variables))
        self.assertEqual(derived.history_hours, CONTRACT.history_hours)

    def test_resolve_accepts_the_real_task_config(self):
        resolve_contract(self.gc.TASK_13_PRECIP_OUT)


if __name__ == "__main__":
    unittest.main()

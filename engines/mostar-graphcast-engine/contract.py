"""Frozen GraphCast input contract — the single source of truth for ingestion.

The contract is *derived* from the checkpoint's own ``TaskConfig`` wherever the
vendored ``graphcast`` package can be imported, and falls back to a pinned
literal otherwise. When both are available they are cross-checked and any
disagreement is a hard failure.

That derivation is the whole point of this module. The previous hand-written
contract in ``adapter.py`` carried a docstring claiming 37 pressure levels while
its own ``PRESSURE_LEVELS`` list held 13 — the sort of drift that silently
builds an ingestion pipeline around the wrong model.

Target model
------------
``GraphCast_operational`` (0.25 deg, 13 pressure levels), which upstream
documents as "can be initialized from HRES data (does not require precipitation
inputs)". That corresponds to ``graphcast.graphcast.TASK_13_PRECIP_OUT``.

The absence of precipitation from the *inputs* is what makes this checkpoint
viable for GFS initialisation at all: a GFS analysis has no clean 6-hour
accumulated precipitation field at t=0, so the 37-level ``TASK`` (which requires
``total_precipitation_6hr`` as an input) could not be initialised from it
without fabricating that field.

Initialising this checkpoint from GFS rather than HRES remains an engineering
adaptation, not a configuration upstream guarantees. Forecasts produced this way
must be scored against reference data before being treated as operational.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

# --- Grid geometry -------------------------------------------------------
# GraphCast is a *global* model on a global mesh. Regional clipping is a
# post-inference operation on the output; clipping the input state produces
# invalid results regardless of how correct the fields themselves are.
GRID_RESOLUTION_DEG = 0.25
GRID_LAT_POINTS = 721          # -90..90 inclusive at 0.25 deg
GRID_LON_POINTS = 1440         # 0..359.75 at 0.25 deg

# Dimension names are not negotiable: graphcast.py transposes on ("lat", "lon")
# and reads sample_inputs.lat / sample_inputs.lon directly. "latitude" and
# "longitude" — the names cfgrib emits for GFS — will not work.
LAT_DIM = "lat"
LON_DIM = "lon"

TIME_STEP_HOURS = 6


class ViolationCode:
    """Stable, machine-readable validation failure codes."""

    MISSING_INPUT_VARIABLE = "MISSING_INPUT_VARIABLE"
    MISSING_PRESSURE_LEVEL = "MISSING_PRESSURE_LEVEL"
    UNEXPECTED_PRESSURE_LEVEL = "UNEXPECTED_PRESSURE_LEVEL"
    INVALID_GRID = "INVALID_GRID"
    INVALID_DIM_NAME = "INVALID_DIM_NAME"
    INVALID_TIME_SPACING = "INVALID_TIME_SPACING"
    LONGITUDE_ORDER_MISMATCH = "LONGITUDE_ORDER_MISMATCH"
    LATITUDE_ORDER_MISMATCH = "LATITUDE_ORDER_MISMATCH"
    NONFINITE_INPUT = "NONFINITE_INPUT"
    UNIT_MISMATCH = "UNIT_MISMATCH"
    CONTRACT_DRIFT = "CONTRACT_DRIFT"


class ContractViolation(Exception):
    """Raised when a state fails the contract. Never recoverable in-place.

    A forecast is never published after one of these. Degrading to NaN and
    running inference anyway produces a plausible-looking field with no
    physical meaning, which is worse than no forecast at all.
    """

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True)
class GraphCastContract:
    name: str
    resolution_deg: float
    pressure_levels_hpa: tuple[int, ...]
    history_hours: tuple[int, ...]
    surface_variables: tuple[str, ...]
    atmospheric_variables: tuple[str, ...]
    forcing_variables: tuple[str, ...]
    static_variables: tuple[str, ...]

    @property
    def required_variables(self) -> tuple[str, ...]:
        return (
            self.surface_variables
            + self.atmospheric_variables
            + self.forcing_variables
            + self.static_variables
        )

    @property
    def n_input_timesteps(self) -> int:
        return len(self.history_hours)


# --- Pinned literal ------------------------------------------------------
# Mirrors graphcast.graphcast.TASK_13_PRECIP_OUT. Kept so ingestion tooling can
# be developed and tested without JAX installed; cross-checked against the real
# TaskConfig whenever the package is importable.
MOSTAR_GRAPHCAST_OPERATIONAL_V1 = GraphCastContract(
    name="MOSTAR_GRAPHCAST_OPERATIONAL_V1",
    resolution_deg=GRID_RESOLUTION_DEG,
    # graphcast.PRESSURE_LEVELS_WEATHERBENCH_13
    pressure_levels_hpa=(50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 850, 925, 1000),
    # input_duration="12h" at 6-hourly resolution => two states, t-6h and t.
    history_hours=(-6, 0),
    # TARGET_SURFACE_NO_PRECIP_VARS — note the absence of total_precipitation_6hr.
    surface_variables=(
        "2m_temperature",
        "mean_sea_level_pressure",
        "10m_v_component_of_wind",
        "10m_u_component_of_wind",
    ),
    # TARGET_ATMOSPHERIC_VARS, each required at every pressure level above.
    atmospheric_variables=(
        "temperature",
        "geopotential",
        "u_component_of_wind",
        "v_component_of_wind",
        "vertical_velocity",
        "specific_humidity",
    ),
    # toa_incident_solar_radiation is NOT a GFS field: it must be computed with
    # graphcast.solar_radiation for both input and target lead times.
    forcing_variables=(
        "toa_incident_solar_radiation",
        "year_progress_sin",
        "year_progress_cos",
        "day_progress_sin",
        "day_progress_cos",
    ),
    # Static fields do not come from a GFS cycle; they are supplied once from
    # the ERA5/HRES static dataset and carried alongside every state.
    static_variables=(
        "geopotential_at_surface",
        "land_sea_mask",
    ),
)


def from_task_config(task_config: Any, name: str = "derived") -> GraphCastContract:
    """Build a contract from a checkpoint's TaskConfig.

    Classification of the flat ``input_variables`` tuple uses the vendored
    graphcast constants when importable so the split cannot drift either.
    """
    try:
        from graphcast import graphcast as gc  # type: ignore

        atmospheric = set(gc.ALL_ATMOSPHERIC_VARS)
        forcing = set(gc.FORCING_VARS)
        static = set(gc.STATIC_VARS)
    except Exception:
        atmospheric = set(MOSTAR_GRAPHCAST_OPERATIONAL_V1.atmospheric_variables)
        forcing = set(MOSTAR_GRAPHCAST_OPERATIONAL_V1.forcing_variables)
        static = set(MOSTAR_GRAPHCAST_OPERATIONAL_V1.static_variables)

    inputs = tuple(task_config.input_variables)
    return GraphCastContract(
        name=name,
        resolution_deg=GRID_RESOLUTION_DEG,
        pressure_levels_hpa=tuple(int(x) for x in task_config.pressure_levels),
        history_hours=_history_from_duration(str(task_config.input_duration)),
        surface_variables=tuple(
            v for v in inputs if v not in atmospheric and v not in forcing and v not in static
        ),
        atmospheric_variables=tuple(v for v in inputs if v in atmospheric),
        forcing_variables=tuple(v for v in inputs if v in forcing),
        static_variables=tuple(v for v in inputs if v in static),
    )


def _history_from_duration(duration: str) -> tuple[int, ...]:
    """"12h" at 6-hourly steps -> (-6, 0)."""
    text = duration.strip().lower()
    if not text.endswith("h"):
        raise ContractViolation(
            ViolationCode.INVALID_TIME_SPACING,
            f"unsupported input_duration {duration!r}; expected hours",
        )
    total = int(text[:-1])
    steps = total // TIME_STEP_HOURS
    # A 12h duration spans two 6-hourly states: t-6h and t.
    return tuple(-TIME_STEP_HOURS * i for i in range(steps - 1, -1, -1))


def resolve_contract(task_config: Any | None = None) -> GraphCastContract:
    """Return the contract to ingest against, cross-checking when possible.

    Pass the loaded checkpoint's ``task_config`` in production. Any divergence
    from the pinned literal raises rather than silently preferring one.
    """
    pinned = MOSTAR_GRAPHCAST_OPERATIONAL_V1
    if task_config is None:
        return pinned

    derived = from_task_config(task_config, name=pinned.name)
    for field_name in ("pressure_levels_hpa", "history_hours"):
        want = getattr(pinned, field_name)
        got = getattr(derived, field_name)
        if tuple(want) != tuple(got):
            raise ContractViolation(
                ViolationCode.CONTRACT_DRIFT,
                f"{field_name}: checkpoint has {got}, pinned contract has {want}",
            )
    if set(derived.required_variables) != set(pinned.required_variables):
        missing = set(derived.required_variables) - set(pinned.required_variables)
        extra = set(pinned.required_variables) - set(derived.required_variables)
        raise ContractViolation(
            ViolationCode.CONTRACT_DRIFT,
            f"variable set differs; checkpoint-only={sorted(missing)} pinned-only={sorted(extra)}",
        )
    return derived


def validate_state(dataset: Any, contract: GraphCastContract) -> None:
    """Fail closed on any deviation from ``contract``.

    Accepts anything xarray-shaped: ``.dims``, ``.coords``, ``.data_vars``.
    Raises ``ContractViolation`` on the first problem found.
    """
    dims = set(getattr(dataset, "dims", ()) or ())
    coords = getattr(dataset, "coords", {}) or {}
    data_vars = getattr(dataset, "data_vars", {}) or {}

    if LAT_DIM not in dims or LON_DIM not in dims:
        raise ContractViolation(
            ViolationCode.INVALID_DIM_NAME,
            f"expected dims {LAT_DIM!r}/{LON_DIM!r}, found {sorted(dims)}. "
            "cfgrib emits 'latitude'/'longitude' for GFS and must be renamed.",
        )

    lat = _values(coords.get(LAT_DIM))
    lon = _values(coords.get(LON_DIM))
    if lat is None or lon is None:
        raise ContractViolation(
            ViolationCode.INVALID_GRID, "lat/lon coordinate values are missing"
        )

    if len(lat) != GRID_LAT_POINTS or len(lon) != GRID_LON_POINTS:
        raise ContractViolation(
            ViolationCode.INVALID_GRID,
            f"expected global {GRID_LAT_POINTS}x{GRID_LON_POINTS} grid at "
            f"{contract.resolution_deg} deg, got {len(lat)}x{len(lon)}. "
            "GraphCast is global; do not clip the input state.",
        )

    if not _ascending(lat):
        raise ContractViolation(
            ViolationCode.LATITUDE_ORDER_MISMATCH,
            "latitude must ascend (-90 -> 90); GFS GRIB arrives descending",
        )
    if not _ascending(lon):
        raise ContractViolation(
            ViolationCode.LONGITUDE_ORDER_MISMATCH,
            "longitude must ascend over 0..360",
        )

    present = set(data_vars)
    for name in contract.required_variables:
        if name not in present:
            raise ContractViolation(
                ViolationCode.MISSING_INPUT_VARIABLE,
                f"{name!r} absent; contract requires {len(contract.required_variables)} variables",
            )

    if contract.atmospheric_variables:
        levels = _values(coords.get("level"))
        if levels is None:
            raise ContractViolation(
                ViolationCode.MISSING_PRESSURE_LEVEL,
                "no 'level' coordinate for atmospheric variables",
            )
        have = [int(x) for x in levels]
        want = list(contract.pressure_levels_hpa)
        missing = [x for x in want if x not in have]
        if missing:
            raise ContractViolation(
                ViolationCode.MISSING_PRESSURE_LEVEL,
                f"missing levels {missing} hPa (need all of {want})",
            )
        unexpected = [x for x in have if x not in want]
        if unexpected:
            raise ContractViolation(
                ViolationCode.UNEXPECTED_PRESSURE_LEVEL,
                f"levels {unexpected} hPa are not in the contract; "
                "subset to the checkpoint's levels before inference",
            )

    times = _values(coords.get("time"))
    if times is not None and len(times) != contract.n_input_timesteps:
        raise ContractViolation(
            ViolationCode.INVALID_TIME_SPACING,
            f"expected {contract.n_input_timesteps} input timesteps "
            f"{contract.history_hours}, got {len(times)}",
        )


def _values(coord: Any) -> Sequence[Any] | None:
    if coord is None:
        return None
    values = getattr(coord, "values", coord)
    try:
        return list(values)
    except TypeError:
        return None


def _ascending(values: Sequence[Any]) -> bool:
    return all(a <= b for a, b in zip(values, values[1:]))

"""GFS -> canonical state: identity, geometry, units.

Sits between the raw decoded GRIB and ``contract.validate_state``. Everything
here is deliberately explicit: no opportunistic ``.rename()`` buried in the
adapter, no matching on GRIB short name alone, no implicit unit coercion.

Three separate identities, because provenance should not be inferred from
filenames::

    gfs-20260916T06Z-analysis   raw artifact, one per acquired cycle
    gfs-20260916T12Z-analysis
              |
              +-- combined -->  gcinput-20260916T12Z-<contract_hash>
                                     |
                                     +-- inferred -->  gcop-20260916T12Z-<ckpt>

A forecast can then be traced back to exactly which analyses fed it, rather
than to a path that happens to contain a timestamp.

The history pair is ``analysis(t-6h) + analysis(t)``. It is NOT
``forecast(t | initialized t-6h) + analysis(t)``. Those are different
atmospheric states and the provenance records which was used.
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from typing import Any, Iterable, Sequence

from contract import (
    GRID_LAT_POINTS,
    GRID_LON_POINTS,
    GRID_RESOLUTION_DEG,
    LAT_DIM,
    LON_DIM,
    ContractViolation,
    GraphCastContract,
    ViolationCode,
)

# Standard gravity. The single constant relating GFS geopotential height to
# GraphCast geopotential; WMO/ISO value, not a tuned parameter.
G0 = 9.80665

# cfgrib's names for the GFS grid, which GraphCast does not accept.
# The vertical coordinate of the pressure stack, as cfgrib reports it.
ISOBARIC_LEVEL = "isobaricInhPa"

CFGRIB_LAT = "latitude"
CFGRIB_LON = "longitude"


class CanonicalError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class CanonicalCode:
    AMBIGUOUS_FIELD = "AMBIGUOUS_FIELD"
    FIELD_NOT_FOUND = "FIELD_NOT_FOUND"
    UNIT_MISMATCH = "UNIT_MISMATCH"
    STATIC_GRID_MISMATCH = "STATIC_GRID_MISMATCH"
    PROVENANCE_MISMATCH = "PROVENANCE_MISMATCH"


# --- Identity ------------------------------------------------------------

def raw_artifact_id(cycle_date: str, cycle_hour: int, kind: str = "analysis") -> str:
    return f"gfs-{cycle_date}T{cycle_hour:02d}Z-{kind}"


def canonical_state_id(cycle_date: str, cycle_hour: int, contract_hash: str) -> str:
    return f"gcinput-{cycle_date}T{cycle_hour:02d}Z-{contract_hash[:12]}"


def forecast_run_id(cycle_date: str, cycle_hour: int, checkpoint_hash: str) -> str:
    return f"gcop-{cycle_date}T{cycle_hour:02d}Z-{checkpoint_hash[:12]}"


@dataclass(frozen=True)
class StateProvenance:
    """What a canonical state was actually built from."""

    canonical_id: str
    contract_hash: str
    source_artifacts: list[str]
    history_offsets_hours: list[int]
    # "analysis" for every offset: the contract pairs two analyses. If this ever
    # reads "forecast" for a nonzero offset, the input state is not what the
    # checkpoint was specified against.
    source_kinds: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def assert_all_analyses(self) -> None:
        bad = [
            (off, kind)
            for off, kind in zip(self.history_offsets_hours, self.source_kinds)
            if kind != "analysis"
        ]
        if bad:
            raise CanonicalError(
                CanonicalCode.PROVENANCE_MISMATCH,
                f"history states must all be analyses, got {bad}. "
                "analysis(t-6h)+analysis(t) is not interchangeable with "
                "forecast(t|t-6h)+analysis(t).",
            )


# --- GRIB message identity ----------------------------------------------

@dataclass(frozen=True)
class GribMessage:
    """One decoded GRIB message, as cfgrib/eccodes reports it."""

    shortName: str
    typeOfLevel: str
    level: int
    units: str
    name: str = ""

    def key(self) -> tuple[str, str, int]:
        return (self.shortName, self.typeOfLevel, self.level)


def inventory(messages: Iterable[GribMessage]) -> list[dict[str, Any]]:
    """Machine-readable dump of a decoded cycle.

    Produced *before* any mapping is attempted, so the observed contents of the
    file are recorded independently of what we expected to find.
    """
    return [asdict(m) for m in messages]


@dataclass(frozen=True)
class FieldSelector:
    """Identifies a source field by more than its short name.

    GRIB short names repeat across vertical coordinates — ``t`` is temperature
    on isobaric levels and also at 2 m above ground — so matching on shortName
    alone is ambiguous by construction.
    """

    canonical: str
    shortName: str
    typeOfLevel: str
    expected_units: str
    level: int | None = None  # None => any isobaric level

    def matches(self, message: GribMessage) -> bool:
        if message.shortName != self.shortName:
            return False
        if message.typeOfLevel != self.typeOfLevel:
            return False
        if self.level is not None and message.level != self.level:
            return False
        return True


# Observed cfgrib short names for GFS. Still to be confirmed against a decoded
# cycle via resolve_mapping(); the point of the selector is that confirmation
# checks vertical coordinate and units too, not just the name.
ATMOSPHERIC_SELECTORS = (
    FieldSelector("geopotential", "gh", "isobaricInhPa", "gpm"),
    FieldSelector("temperature", "t", "isobaricInhPa", "K"),
    FieldSelector("specific_humidity", "q", "isobaricInhPa", "kg kg**-1"),
    FieldSelector("u_component_of_wind", "u", "isobaricInhPa", "m s**-1"),
    FieldSelector("v_component_of_wind", "v", "isobaricInhPa", "m s**-1"),
    FieldSelector("vertical_velocity", "w", "isobaricInhPa", "Pa s**-1"),
)

SURFACE_SELECTORS = (
    FieldSelector("2m_temperature", "t2m", "heightAboveGround", "K", level=2),
    FieldSelector("mean_sea_level_pressure", "prmsl", "meanSea", "Pa"),
    FieldSelector("10m_u_component_of_wind", "u10", "heightAboveGround", "m s**-1", level=10),
    FieldSelector("10m_v_component_of_wind", "v10", "heightAboveGround", "m s**-1", level=10),
)


def resolve_mapping(
    messages: Sequence[GribMessage],
    selectors: Sequence[FieldSelector],
    *,
    strict_units: bool = True,
    expected_levels: Sequence[int] | None = None,
) -> dict[str, list[GribMessage]]:
    """Bind canonical names to observed messages, failing on surprises.

    The hard rule: **one expected canonical field at one level must resolve to
    exactly one decoded GRIB message.** Zero is FIELD_NOT_FOUND, more than one
    is AMBIGUOUS_FIELD. There is never a "take the first" branch — duplicate
    messages at the same level mean two different encodings of what we are
    about to treat as one field, and picking arbitrarily hides that.

    Corrects nothing silently: a units mismatch raises so the mapping is fixed
    against the decoded file rather than the file being coerced to the mapping.
    """
    resolved: dict[str, list[GribMessage]] = {}
    for selector in selectors:
        found = [m for m in messages if selector.matches(m)]
        if not found:
            raise CanonicalError(
                CanonicalCode.FIELD_NOT_FOUND,
                f"no message for {selector.canonical} "
                f"(shortName={selector.shortName}, typeOfLevel={selector.typeOfLevel})",
            )
        if strict_units:
            wrong = [m for m in found if m.units != selector.expected_units]
            if wrong:
                raise CanonicalError(
                    CanonicalCode.UNIT_MISMATCH,
                    f"{selector.canonical}: expected units {selector.expected_units!r}, "
                    f"decoded {sorted({m.units for m in wrong})}",
                )

        # Exactly-one-per-level, whether the selector pins a level or spans the
        # isobaric stack.
        by_level: dict[int, list[GribMessage]] = {}
        for message in found:
            by_level.setdefault(message.level, []).append(message)
        duplicated = {lv: len(v) for lv, v in by_level.items() if len(v) > 1}
        if duplicated:
            raise CanonicalError(
                CanonicalCode.AMBIGUOUS_FIELD,
                f"{selector.canonical} resolved to multiple messages at level(s) "
                f"{sorted(duplicated)}: {duplicated}. Refusing to pick one — "
                "duplicate messages mean two encodings of the same field.",
            )

        # Only the isobaric stack spans the contract's pressure levels. A
        # surface selector also leaves `level` unpinned (prmsl sits on meanSea),
        # so keying off `level is None` alone would demand 13 pressure levels
        # from mean-sea-level pressure.
        spans_isobaric_stack = (
            selector.level is None and selector.typeOfLevel == ISOBARIC_LEVEL
        )
        if spans_isobaric_stack and expected_levels is not None:
            missing = [lv for lv in expected_levels if lv not in by_level]
            if missing:
                raise CanonicalError(
                    CanonicalCode.FIELD_NOT_FOUND,
                    f"{selector.canonical} missing at level(s) {missing} hPa",
                )
            extra = [lv for lv in by_level if lv not in expected_levels]
            if extra:
                raise CanonicalError(
                    CanonicalCode.AMBIGUOUS_FIELD,
                    f"{selector.canonical} present at unrequested level(s) {sorted(extra)} hPa",
                )

        resolved[selector.canonical] = found
    return resolved


# --- Units ---------------------------------------------------------------

def geopotential_height_to_geopotential(height_m: Any) -> Any:
    """gpm -> m^2 s^-2.

    GFS ships geopotential *height*; GraphCast's ``geopotential`` is the
    geopotential itself. Omitting this factor leaves the field numerically
    plausible and physically wrong by ~an order of magnitude.
    """
    return height_m * G0


def pascals_to_hectopascals(pressure_pa: Any) -> Any:
    """Pa -> hPa. GRIB pressure is Pa; the hazard thresholds are hPa."""
    return pressure_pa / 100.0


def assert_units(name: str, actual: str, expected: str) -> None:
    if actual != expected:
        raise CanonicalError(
            CanonicalCode.UNIT_MISMATCH,
            f"{name}: expected {expected!r}, got {actual!r}",
        )


# --- Geometry ------------------------------------------------------------

def canonicalize_coordinates(dataset: Any) -> Any:
    """Convert decoded GFS geometry into GraphCast geometry.

    Renames latitude/longitude to lat/lon, flips GFS's descending latitude to
    ascending, and checks the grid is global at 0.25 degrees. Deliberately the
    only place any of that happens.

    Requires a real xarray Dataset (``rename``/``sortby``/``sizes``); the pure
    checks are factored into :func:`check_grid` so they can be tested without
    xarray installed.
    """
    renames = {}
    if CFGRIB_LAT in getattr(dataset, "dims", ()):
        renames[CFGRIB_LAT] = LAT_DIM
    if CFGRIB_LON in getattr(dataset, "dims", ()):
        renames[CFGRIB_LON] = LON_DIM
    if renames:
        dataset = dataset.rename(renames)

    lat = list(dataset.coords[LAT_DIM].values)
    if len(lat) > 1 and lat[0] > lat[-1]:
        # GFS GRIB is stored north-to-south.
        dataset = dataset.sortby(LAT_DIM)

    lon = list(dataset.coords[LON_DIM].values)
    if any(v < 0 for v in lon):
        # Normalise -180..180 to 0..360, then re-sort.
        dataset = dataset.assign_coords({LON_DIM: [(v % 360.0) for v in lon]})
        dataset = dataset.sortby(LON_DIM)

    check_grid(
        list(dataset.coords[LAT_DIM].values),
        list(dataset.coords[LON_DIM].values),
    )
    return dataset


def check_grid(lat: Sequence[float], lon: Sequence[float]) -> None:
    """Geometry assertions, independent of xarray.

    A correctly *named* but reversed latitude axis is just as dangerous as a
    wrong grid, so orientation is checked, not only shape.
    """
    if len(lat) != GRID_LAT_POINTS or len(lon) != GRID_LON_POINTS:
        raise ContractViolation(
            ViolationCode.INVALID_GRID,
            f"expected global {GRID_LAT_POINTS}x{GRID_LON_POINTS} at "
            f"{GRID_RESOLUTION_DEG} deg, got {len(lat)}x{len(lon)}",
        )
    if lat[0] > lat[-1]:
        raise ContractViolation(
            ViolationCode.LATITUDE_ORDER_MISMATCH,
            "latitude descends; GraphCast requires -90 -> 90",
        )
    if lon[0] > lon[-1]:
        raise ContractViolation(
            ViolationCode.LONGITUDE_ORDER_MISMATCH,
            "longitude descends; GraphCast requires ascending 0..360",
        )
    if any(v < 0 for v in lon):
        raise ContractViolation(
            ViolationCode.LONGITUDE_ORDER_MISMATCH,
            "longitude contains negative values; normalise to 0..360",
        )


def validate_static_field(
    name: str,
    lat: Sequence[float],
    lon: Sequence[float],
    *,
    reference_lat: Sequence[float],
    reference_lon: Sequence[float],
) -> None:
    """Statics must sit on the same grid as the dynamic state.

    A correct-looking static field on a differently ordered grid silently
    mislabels every land point, so the coordinates are compared — not just the
    file hash, which says nothing about orientation.
    """
    if len(lat) != len(reference_lat) or len(lon) != len(reference_lon):
        raise CanonicalError(
            CanonicalCode.STATIC_GRID_MISMATCH,
            f"{name}: shape {len(lat)}x{len(lon)} != state "
            f"{len(reference_lat)}x{len(reference_lon)}",
        )
    if list(lat) != list(reference_lat):
        raise CanonicalError(
            CanonicalCode.STATIC_GRID_MISMATCH,
            f"{name}: latitude coordinates differ from the state grid "
            "(same shape, different orientation or offset)",
        )
    if list(lon) != list(reference_lon):
        raise CanonicalError(
            CanonicalCode.STATIC_GRID_MISMATCH,
            f"{name}: longitude coordinates differ from the state grid",
        )


def contract_hash(contract: GraphCastContract) -> str:
    payload = "|".join(
        [
            str(contract.resolution_deg),
            ",".join(str(x) for x in contract.pressure_levels_hpa),
            ",".join(str(x) for x in contract.history_hours),
            ",".join(sorted(contract.required_variables)),
        ]
    )
    return hashlib.sha256(payload.encode()).hexdigest()

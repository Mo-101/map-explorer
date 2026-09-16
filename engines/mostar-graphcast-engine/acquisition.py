"""Contract -> GfsAcquisitionManifest -> NOMADS request.

The chain is one-directional and starts at the checkpoint::

    checkpoint -> TaskConfig -> GraphCastContract -> GfsAcquisitionManifest -> NOMADS

Nothing here reads a hand-maintained variable list. If the checkpoint changes,
the request changes with it, which is the whole reason the manifest is generated
rather than written down.

Three variable classes, modelled explicitly because conflating them leads to
somebody trying to download an astronomical quantity from a weather service:

``DYNAMIC``
    Comes from the GFS cycle. Surface fields plus the upper-air stack.
``STATIC``
    Ships inside the checkpoint bundle. ``geopotential_at_surface`` and
    ``land_sea_mask`` appear in no GFS cycle at any level or forecast hour.
``COMPUTED``
    Derived locally. Time features are trigonometric;
    ``toa_incident_solar_radiation`` is astronomical and is produced by
    ``graphcast.solar_radiation`` for input *and* target lead times.

GRIB short names below follow NCEP's GFS 0.25 degree product. They are marked
unverified: ``verify_against_decoded`` exists to check them against a real
decoded cycle, and must be run before the mapping is trusted in production.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from contract import (
    GRID_RESOLUTION_DEG,
    LAT_DIM,
    LON_DIM,
    ContractViolation,
    GraphCastContract,
    ViolationCode,
)

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"

# GraphCast canonical name -> NCEP GRIB2 short name.
# UNVERIFIED against decoded output; see verify_against_decoded().
ATMOSPHERIC_TO_GRIB = {
    # NOTE: GFS distributes geopotential HEIGHT in metres. GraphCast wants
    # geopotential in m^2/s^2. The conversion (x g0) happens in the adapter,
    # never here -- this layer only names the source field.
    "geopotential": "HGT",
    "temperature": "TMP",
    "specific_humidity": "SPFH",
    "u_component_of_wind": "UGRD",
    "v_component_of_wind": "VGRD",
    "vertical_velocity": "VVEL",
}

# Surface fields carry their own level selector, so the mapping is a pair.
SURFACE_TO_GRIB = {
    "2m_temperature": ("TMP", "lev_2_m_above_ground"),
    "mean_sea_level_pressure": ("PRMSL", "lev_mean_sea_level"),
    "10m_u_component_of_wind": ("UGRD", "lev_10_m_above_ground"),
    "10m_v_component_of_wind": ("VGRD", "lev_10_m_above_ground"),
}

# Produced by graphcast.solar_radiation, not downloaded.
ASTRONOMICAL_FORCINGS = ("toa_incident_solar_radiation",)

GFS_CYCLE_HOURS = (0, 6, 12, 18)
# NCEP publishes a cycle progressively; the full 0.25 degree product lags the
# nominal cycle time. Conservative default, override once measured.
GFS_PUBLISH_LAG_HOURS = 5


class AcquisitionError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class AcquisitionCode:
    UNMAPPED_VARIABLE = "UNMAPPED_VARIABLE"
    UNAVAILABLE_CYCLE = "UNAVAILABLE_CYCLE"
    SHORTNAME_MISMATCH = "SHORTNAME_MISMATCH"
    UNVERIFIED_CHECKPOINT = "UNVERIFIED_CHECKPOINT"


# Development escape hatch. Production must never set this: with the checkpoint
# mount gone, resolve_contract(None) returns the pinned literal, and without
# this gate a request would still be generated from a contract nothing verified.
PINNED_CONTRACT_ENV = "MOSTAR_ALLOW_PINNED_CONTRACT"


def _unwrap(source: Any) -> tuple[GraphCastContract, bool]:
    """Accept a VerifiedCheckpoint or a bare contract; report which."""
    contract = getattr(source, "contract", None)
    if contract is not None:
        return contract, bool(getattr(source, "checkpoint_verified", False))
    return source, False


def _pinned_allowed(explicit: bool | None) -> bool:
    if explicit is not None:
        return explicit
    return os.environ.get(PINNED_CONTRACT_ENV) == "1"


@dataclass(frozen=True)
class GfsAcquisitionManifest:
    contract_id: str
    history_offsets_hours: list[int]
    pressure_levels_hpa: list[int]
    pressure_variables: list[str]
    surface_variables: list[str]
    computed_forcings: list[str]
    static_fields: list[str]
    grid: dict[str, Any]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True) + "\n"

    @property
    def field_count(self) -> int:
        """Distinct 2-D fields per timestep — the real download size driver."""
        return (
            len(self.pressure_variables) * len(self.pressure_levels_hpa)
            + len(self.surface_variables)
        )


def contract_id(contract: GraphCastContract) -> str:
    return (
        f"graphcast-operational-"
        f"{str(contract.resolution_deg).replace('.', 'p')}-"
        f"{len(contract.pressure_levels_hpa)}l-v1"
    )


def build_acquisition_manifest(
    source: Any, *, allow_pinned: bool | None = None
) -> GfsAcquisitionManifest:
    """Generate the acquisition manifest from a *verified* checkpoint.

    Pass the VerifiedCheckpoint returned by ``checkpoint.verify()``. Passing a
    bare contract is a development affordance and requires either
    ``allow_pinned=True`` or ``MOSTAR_ALLOW_PINNED_CONTRACT=1``.

    Fails closed on any contract variable with no known GFS source, rather than
    quietly omitting it and letting validate_state discover the hole later.
    """
    contract, verified = _unwrap(source)
    if not verified and not _pinned_allowed(allow_pinned):
        raise AcquisitionError(
            AcquisitionCode.UNVERIFIED_CHECKPOINT,
            "refusing to generate a NOMADS request from an unverified contract. "
            "Install the bundle and pass checkpoint.verify(...), or set "
            f"{PINNED_CONTRACT_ENV}=1 for development only.",
        )

    unmapped = [v for v in contract.atmospheric_variables if v not in ATMOSPHERIC_TO_GRIB]
    if unmapped:
        raise AcquisitionError(
            AcquisitionCode.UNMAPPED_VARIABLE,
            f"atmospheric variables with no GFS mapping: {unmapped}",
        )
    unmapped = [v for v in contract.surface_variables if v not in SURFACE_TO_GRIB]
    if unmapped:
        raise AcquisitionError(
            AcquisitionCode.UNMAPPED_VARIABLE,
            f"surface variables with no GFS mapping: {unmapped}",
        )

    return GfsAcquisitionManifest(
        contract_id=contract_id(contract),
        history_offsets_hours=list(contract.history_hours),
        pressure_levels_hpa=list(contract.pressure_levels_hpa),
        pressure_variables=list(contract.atmospheric_variables),
        surface_variables=list(contract.surface_variables),
        computed_forcings=list(contract.forcing_variables),
        static_fields=list(contract.static_variables),
        grid={
            "lat_name": LAT_DIM,
            "lon_name": LON_DIM,
            "global": True,
            "resolution_degrees": GRID_RESOLUTION_DEG,
        },
    )


@dataclass(frozen=True)
class GfsCycle:
    date: str   # YYYYMMDD
    hour: int   # 0/6/12/18

    @property
    def run_id_fragment(self) -> str:
        return f"{self.date}T{self.hour:02d}Z"

    @property
    def nomads_dir(self) -> str:
        return f"/gfs.{self.date}/{self.hour:02d}/atmos"


def latest_available_cycle(now: datetime | None = None) -> GfsCycle:
    """Most recent cycle expected to be fully published."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidate = now - timedelta(hours=GFS_PUBLISH_LAG_HOURS)
    hour = max(h for h in GFS_CYCLE_HOURS if h <= candidate.hour)
    return GfsCycle(date=candidate.strftime("%Y%m%d"), hour=hour)


def nomads_request(
    manifest: GfsAcquisitionManifest,
    cycle: GfsCycle,
    forecast_hour: int,
) -> dict[str, Any]:
    """Exact NOMADS filter parameters for one file.

    Requests only the contract's fields and levels. Downloading every GFS field
    and every level would be an order of magnitude more data for no benefit, and
    would then have to be subset back down before inference anyway.
    """
    params: dict[str, str] = {
        "file": f"gfs.t{cycle.hour:02d}z.pgrb2.0p25.f{forecast_hour:03d}",
        "dir": cycle.nomads_dir,
    }

    for name in manifest.pressure_variables:
        params[f"var_{ATMOSPHERIC_TO_GRIB[name]}"] = "on"
    for level in manifest.pressure_levels_hpa:
        params[f"lev_{level}_mb"] = "on"

    for name in manifest.surface_variables:
        short, level_key = SURFACE_TO_GRIB[name]
        params[f"var_{short}"] = "on"
        params[level_key] = "on"

    # Deliberately global: GraphCast runs on the global mesh and clipping the
    # input state invalidates inference. subregion is never set here.
    return {"url": NOMADS_FILTER_URL, "params": params}


def required_files(manifest: GfsAcquisitionManifest, cycle: GfsCycle) -> list[dict[str, Any]]:
    """One NOMADS request per input timestep.

    The contract's history offsets are relative to the cycle time. Offset 0 is
    the analysis (f000); -6 is taken from the *previous* cycle's analysis rather
    than this cycle's f-006, which does not exist.
    """
    out: list[dict[str, Any]] = []
    for offset in manifest.history_offsets_hours:
        if offset == 0:
            out.append(
                {"offset_hours": 0, "cycle": cycle, **nomads_request(manifest, cycle, 0)}
            )
            continue
        shifted = _shift_cycle(cycle, offset)
        out.append(
            {"offset_hours": offset, "cycle": shifted, **nomads_request(manifest, shifted, 0)}
        )
    return out


def _shift_cycle(cycle: GfsCycle, offset_hours: int) -> GfsCycle:
    base = datetime.strptime(cycle.date, "%Y%m%d").replace(
        hour=cycle.hour, tzinfo=timezone.utc
    )
    shifted = base + timedelta(hours=offset_hours)
    if shifted.hour not in GFS_CYCLE_HOURS:
        raise AcquisitionError(
            AcquisitionCode.UNAVAILABLE_CYCLE,
            f"offset {offset_hours}h from {cycle.run_id_fragment} lands on "
            f"{shifted.hour:02d}Z, which is not a GFS cycle hour",
        )
    return GfsCycle(date=shifted.strftime("%Y%m%d"), hour=shifted.hour)


def run_id(cycle: GfsCycle, model: str = "gcop") -> str:
    """Deterministic run identifier, e.g. gcop-gfs-20260916T12Z."""
    return f"{model}-gfs-{cycle.run_id_fragment}"


def verify_against_decoded(decoded_short_names: Iterable[str]) -> None:
    """Check the GRIB short-name mapping against a real decoded cycle.

    The mapping above is asserted from NCEP product documentation, not from
    observation. Run this against short names read out of an actual decoded
    file before trusting the mapping in production.
    """
    present = set(decoded_short_names)
    expected = set(ATMOSPHERIC_TO_GRIB.values()) | {s for s, _ in SURFACE_TO_GRIB.values()}
    missing = sorted(expected - present)
    if missing:
        raise AcquisitionError(
            AcquisitionCode.SHORTNAME_MISMATCH,
            f"short names absent from decoded cycle: {missing}. "
            "Correct the mapping against the decoded file, not the other way round.",
        )

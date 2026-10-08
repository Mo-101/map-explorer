"""Checkpoint bundle as immutable infrastructure.

The checkpoint is provisioned once into a directory tree and never reached for
over the network per run. Everything downstream — the acquisition manifest, the
NOMADS request, the validator — is derived from the ``task_config`` carried
inside the params file, so the real checkpoint is the root of truth and the
pinned literal in ``contract.py`` is only a cross-check.

Expected layout::

    /models/graphcast/
    ├── params/GraphCast_operational...npz
    ├── stats/{mean,stddev,diffs_stddev}_by_level.nc
    ├── static/{geopotential_at_surface,land_sea_mask}.nc
    ├── LICENSE
    └── manifest.json

Startup order is fixed and every step is a gate::

    load params -> extract task_config -> resolve_contract -> compare manifest
    -> verify sha256 -> permit ingestion

Licensing: the WeatherNext GraphCast model-weight terms changed on 2026-08-06 to
permit commercial use, replacing earlier non-commercial terms. Older cached
copies and older GraphCast logs still state CC BY-NC-SA. The installer therefore
records ``source_revision`` and stores the license text *alongside* the bundle so
a stale statement elsewhere cannot create ambiguity about what was installed.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from contract import ContractViolation, GraphCastContract, ViolationCode, resolve_contract

MANIFEST_NAME = "manifest.json"
PARAMS_DIR = "params"
STATS_DIR = "stats"
STATIC_DIR = "static"
LICENSE_NAME = "LICENSE"

# Required by graphcast normalization; names are upstream's.
REQUIRED_STATS = ("mean_by_level.nc", "stddev_by_level.nc", "diffs_stddev_by_level.nc")

# Static fields that no GFS cycle carries. Shipped with the bundle, joined onto
# every input state.
REQUIRED_STATIC = ("geopotential_at_surface.nc", "land_sea_mask.nc")

_CHUNK = 1024 * 1024


class CheckpointError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class CheckpointCode:
    MISSING_BUNDLE = "MISSING_BUNDLE"
    MISSING_ARTIFACT = "MISSING_ARTIFACT"
    MISSING_MANIFEST = "MISSING_MANIFEST"
    HASH_MISMATCH = "HASH_MISMATCH"
    MANIFEST_MISMATCH = "MANIFEST_MISMATCH"
    MISSING_LICENSE = "MISSING_LICENSE"


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(_CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def task_config_hash(contract: GraphCastContract) -> str:
    """Stable hash of the resolved contract.

    Hashes the semantic content — levels, history, variable set — rather than
    the object repr, so an incidental reordering of variables does not read as
    drift while a genuine change always does.
    """
    payload = {
        "resolution_deg": contract.resolution_deg,
        "pressure_levels_hpa": list(contract.pressure_levels_hpa),
        "history_hours": list(contract.history_hours),
        "variables": sorted(contract.required_variables),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()


@dataclass
class CheckpointManifest:
    model: str
    resolution_degrees: float
    pressure_levels: list[int]
    params_file: str
    params_sha256: str
    stats_sha256: dict[str, str]
    static_sha256: dict[str, str]
    task_config_hash: str
    source_revision: str
    license_sha256: str | None = None
    installed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True) + "\n"

    @staticmethod
    def from_json(text: str) -> "CheckpointManifest":
        return CheckpointManifest(**json.loads(text))


@dataclass(frozen=True)
class VerificationReport:
    """Evidence that a real checkpoint was read — not the pinned literal.

    ``checkpoint_verified`` is the single flag production gates on. It is only
    ever True on a path that actually opened the params file and read its
    TaskConfig, so a vanished checkpoint mount cannot silently degrade into the
    pinned contract and carry on generating requests.
    """

    checkpoint_verified: bool
    model: str
    resolution_deg: float
    pressure_levels: int
    precipitation_input: bool
    precipitation_output: bool
    checkpoint_sha256: str
    task_config_sha256: str
    contract_sha256: str
    license_sha256: str | None
    source_revision: str
    verified_at: str

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True) + "\n"


@dataclass(frozen=True)
class VerifiedCheckpoint:
    manifest: CheckpointManifest
    contract: GraphCastContract
    report: VerificationReport

    @property
    def checkpoint_verified(self) -> bool:
        return self.report.checkpoint_verified


def _build_report(
    manifest: CheckpointManifest,
    contract: GraphCastContract,
    *,
    from_real_checkpoint: bool,
) -> VerificationReport:
    # GraphCast_operational is precipitation-out-only: absent from inputs,
    # present in targets. Recording both sides makes a checkpoint swap to
    # TASK/TASK_13 visible in the report rather than only at inference.
    precip = "total_precipitation_6hr"
    return VerificationReport(
        checkpoint_verified=from_real_checkpoint,
        model=manifest.model,
        resolution_deg=contract.resolution_deg,
        pressure_levels=len(contract.pressure_levels_hpa),
        precipitation_input=precip in contract.required_variables,
        precipitation_output=True,
        checkpoint_sha256=manifest.params_sha256,
        task_config_sha256=manifest.task_config_hash,
        contract_sha256=task_config_hash(contract),
        license_sha256=manifest.license_sha256,
        source_revision=manifest.source_revision,
        verified_at=datetime.now(timezone.utc).isoformat(),
    )


def _require(path: str, code: str, what: str) -> str:
    if not os.path.exists(path):
        raise CheckpointError(code, f"{what} not found at {path}")
    return path


def _find_params(root: str) -> str:
    params_dir = _require(
        os.path.join(root, PARAMS_DIR), CheckpointCode.MISSING_ARTIFACT, "params directory"
    )
    candidates = sorted(f for f in os.listdir(params_dir) if f.endswith(".npz"))
    if not candidates:
        raise CheckpointError(
            CheckpointCode.MISSING_ARTIFACT, f"no .npz params file in {params_dir}"
        )
    if len(candidates) > 1:
        raise CheckpointError(
            CheckpointCode.MISSING_ARTIFACT,
            f"expected exactly one params file, found {candidates}. "
            "A bundle pins one checkpoint.",
        )
    return os.path.join(params_dir, candidates[0])


def load_task_config(params_path: str) -> Any:
    """Read the TaskConfig out of the checkpoint. Requires the graphcast package."""
    from graphcast import checkpoint as gc_checkpoint  # type: ignore
    from graphcast import graphcast as gc  # type: ignore

    with open(params_path, "rb") as handle:
        ckpt = gc_checkpoint.load(handle, gc.CheckPoint)
    return ckpt.task_config


def build_manifest(
    root: str,
    *,
    source_revision: str,
    task_config: Any | None = None,
) -> tuple[CheckpointManifest, GraphCastContract]:
    """Hash every artifact and resolve the contract from the real task_config.

    ``task_config`` is injected for testing; in production it is read from the
    params file via :func:`load_task_config`.
    """
    _require(root, CheckpointCode.MISSING_BUNDLE, "checkpoint bundle")
    params_path = _find_params(root)

    if task_config is None:
        task_config = load_task_config(params_path)

    # Raises CONTRACT_DRIFT if the checkpoint disagrees with the pinned contract.
    contract = resolve_contract(task_config)

    stats: dict[str, str] = {}
    for name in REQUIRED_STATS:
        path = _require(
            os.path.join(root, STATS_DIR, name),
            CheckpointCode.MISSING_ARTIFACT,
            f"normalization stat {name}",
        )
        stats[name] = sha256_file(path)

    statics: dict[str, str] = {}
    for name in REQUIRED_STATIC:
        path = _require(
            os.path.join(root, STATIC_DIR, name),
            CheckpointCode.MISSING_ARTIFACT,
            f"static field {name} (not obtainable from a GFS cycle)",
        )
        statics[name] = sha256_file(path)

    license_path = os.path.join(root, LICENSE_NAME)
    if not os.path.exists(license_path):
        raise CheckpointError(
            CheckpointCode.MISSING_LICENSE,
            f"no {LICENSE_NAME} beside the bundle. The weight terms changed on "
            "2026-08-06; store the text that shipped with this revision so a "
            "stale copy cannot be mistaken for it.",
        )

    manifest = CheckpointManifest(
        model=os.path.basename(params_path).split(".")[0],
        resolution_degrees=contract.resolution_deg,
        pressure_levels=list(contract.pressure_levels_hpa),
        params_file=os.path.basename(params_path),
        params_sha256=sha256_file(params_path),
        stats_sha256=stats,
        static_sha256=statics,
        task_config_hash=task_config_hash(contract),
        source_revision=source_revision,
        license_sha256=sha256_file(license_path),
    )
    return manifest, contract


def install(root: str, *, source_revision: str, task_config: Any | None = None) -> CheckpointManifest:
    """Provision a bundle: hash artifacts, resolve contract, write manifest.json."""
    manifest, _ = build_manifest(root, source_revision=source_revision, task_config=task_config)
    with open(os.path.join(root, MANIFEST_NAME), "w", encoding="utf-8") as handle:
        handle.write(manifest.to_json())
    return manifest


def verify(root: str, *, task_config: Any | None = None) -> VerifiedCheckpoint:
    """Gate run startup. Re-hashes every artifact against the stored manifest.

    Raises rather than returning a status: a run must not proceed past a
    checkpoint whose bytes or contract no longer match what was installed.

    ``task_config`` is injected only by tests. When it is None the config is
    read from the real params file, and only that path sets
    ``checkpoint_verified``.
    """
    from_real_checkpoint = task_config is None
    manifest_path = os.path.join(root, MANIFEST_NAME)
    if not os.path.exists(manifest_path):
        raise CheckpointError(
            CheckpointCode.MISSING_MANIFEST,
            f"no {MANIFEST_NAME} in {root}; run install() first",
        )
    with open(manifest_path, encoding="utf-8") as handle:
        stored = CheckpointManifest.from_json(handle.read())

    current, contract = build_manifest(
        root, source_revision=stored.source_revision, task_config=task_config
    )

    if current.params_sha256 != stored.params_sha256:
        raise CheckpointError(
            CheckpointCode.HASH_MISMATCH,
            f"params changed since install: {stored.params_sha256[:12]} -> "
            f"{current.params_sha256[:12]}",
        )
    for name, digest in stored.stats_sha256.items():
        if current.stats_sha256.get(name) != digest:
            raise CheckpointError(
                CheckpointCode.HASH_MISMATCH, f"normalization stat {name} changed"
            )
    for name, digest in stored.static_sha256.items():
        if current.static_sha256.get(name) != digest:
            raise CheckpointError(
                CheckpointCode.HASH_MISMATCH, f"static field {name} changed"
            )
    if current.task_config_hash != stored.task_config_hash:
        raise CheckpointError(
            CheckpointCode.MANIFEST_MISMATCH,
            "task_config hash changed: the checkpoint no longer describes the "
            "contract the acquisition manifest was generated against",
        )
    if stored.license_sha256 and current.license_sha256 != stored.license_sha256:
        raise CheckpointError(
            CheckpointCode.HASH_MISMATCH,
            "LICENSE text changed since install; re-record the revision",
        )
    return VerifiedCheckpoint(
        manifest=stored,
        contract=contract,
        report=_build_report(stored, contract, from_real_checkpoint=from_real_checkpoint),
    )

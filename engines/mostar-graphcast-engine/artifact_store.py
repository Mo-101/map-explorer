"""Opaque artifact storage.

Deliberately ignorant of what it stores. There is no ``put_zarr``, no
``put_netcdf``, no ``open_dataset`` — those are format concerns and belong in
CanonicalStateWriter / GraphCastForecastWriter / GribArchiveWriter. Keeping the
storage boundary format-blind is what lets the Zarr-versus-NetCDF decision be
made from measurements later without touching domain code.

``LocalArtifactStore`` exists now so Phase 2B has a working boundary before
cloud credentials enter the system. ``GcsArtifactStore`` implements the same
Protocol later; nothing above it changes.

Every write records a checksum. An artifact whose bytes cannot be re-verified
is not evidence, and the provenance chain this feeds is only as good as its
weakest link.
"""
from __future__ import annotations

import hashlib
import os
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol, runtime_checkable

_CHUNK = 1024 * 1024


class ArtifactError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class ArtifactCode:
    NOT_FOUND = "NOT_FOUND"
    CHECKSUM_MISMATCH = "CHECKSUM_MISMATCH"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    INVALID_KEY = "INVALID_KEY"


@dataclass(frozen=True)
class ArtifactMetadata:
    key: str
    size_bytes: int
    sha256: str
    stored_at: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ArtifactRef:
    """A stored artifact, addressable and verifiable."""

    key: str
    uri: str
    sha256: str
    size_bytes: int

    def to_dict(self) -> dict:
        return asdict(self)


@runtime_checkable
class ArtifactStore(Protocol):
    def put_file(self, key: str, path: Path) -> ArtifactRef: ...
    def get_file(self, key: str, destination: Path) -> ArtifactRef: ...
    def exists(self, key: str) -> bool: ...
    def stat(self, key: str) -> ArtifactMetadata: ...
    def checksum(self, key: str) -> str: ...


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(_CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def _validate_key(key: str) -> str:
    """Keys are POSIX-ish object paths, not filesystem paths.

    Rejects traversal outright: a key is a name in an object store, and
    ``..`` in one is either a bug or an attack.
    """
    if not key or key.startswith("/") or key.endswith("/"):
        raise ArtifactError(ArtifactCode.INVALID_KEY, f"malformed key {key!r}")
    parts = key.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise ArtifactError(ArtifactCode.INVALID_KEY, f"key {key!r} contains a traversal segment")
    return key


class LocalArtifactStore:
    """Filesystem-backed store. Same Protocol as the eventual GCS one."""

    def __init__(self, root: Path | str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / _validate_key(key)

    def put_file(self, key: str, path: Path, *, overwrite: bool = False) -> ArtifactRef:
        target = self._path(key)
        if target.exists() and not overwrite:
            raise ArtifactError(
                ArtifactCode.ALREADY_EXISTS,
                f"{key} already stored; raw artifacts are immutable",
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        # Write via a temporary name so a failed copy cannot leave a partial
        # artifact that later hashes as though it were complete.
        staging = target.with_suffix(target.suffix + ".partial")
        shutil.copyfile(path, staging)
        os.replace(staging, target)
        return ArtifactRef(
            key=key,
            uri=target.as_uri(),
            sha256=sha256_path(target),
            size_bytes=target.stat().st_size,
        )

    def get_file(self, key: str, destination: Path) -> ArtifactRef:
        source = self._path(key)
        if not source.exists():
            raise ArtifactError(ArtifactCode.NOT_FOUND, key)
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        return ArtifactRef(
            key=key,
            uri=source.as_uri(),
            sha256=sha256_path(destination),
            size_bytes=destination.stat().st_size,
        )

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def stat(self, key: str) -> ArtifactMetadata:
        path = self._path(key)
        if not path.exists():
            raise ArtifactError(ArtifactCode.NOT_FOUND, key)
        stat = path.stat()
        return ArtifactMetadata(
            key=key,
            size_bytes=stat.st_size,
            sha256=sha256_path(path),
            stored_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        )

    def checksum(self, key: str) -> str:
        path = self._path(key)
        if not path.exists():
            raise ArtifactError(ArtifactCode.NOT_FOUND, key)
        return sha256_path(path)

    def verify(self, key: str, expected_sha256: str) -> None:
        actual = self.checksum(key)
        if actual != expected_sha256:
            raise ArtifactError(
                ArtifactCode.CHECKSUM_MISMATCH,
                f"{key}: stored {actual[:12]}, expected {expected_sha256[:12]}",
            )


# --- Key layout ----------------------------------------------------------
# Mirrors the eventual bucket layout so keys do not change when the backing
# store does.

def raw_key(cycle_date: str, cycle_hour: int, forecast_hour: int) -> str:
    return (
        f"raw/gfs/{cycle_date[:4]}/{cycle_date[4:6]}/{cycle_date[6:8]}/"
        f"{cycle_hour:02d}/gfs.t{cycle_hour:02d}z.pgrb2.0p25.f{forecast_hour:03d}"
    )


def state_key(cycle_date: str, cycle_hour: int, contract_id: str, suffix: str) -> str:
    return (
        f"state/{contract_id}/{cycle_date[:4]}/{cycle_date[4:6]}/{cycle_date[6:8]}/"
        f"{cycle_hour:02d}/input.{suffix}"
    )


def inventory_key(cycle_date: str, cycle_hour: int) -> str:
    return f"contracts/observed/gfs-0p25-{cycle_date}T{cycle_hour:02d}Z.inventory.json"

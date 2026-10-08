"""Provenance from the HTTP request forward.

The chain has to be mechanically traversable, in this direction::

    public signal -> hazard event -> forecast product -> GraphCast run
      -> canonical initial state -> 06Z + 12Z analyses
      -> exact downloaded GRIB objects -> NCEP source

Which means the record cannot start at "we have a file". It starts at the
request: the URL and parameters actually sent, the status actually returned, the
bytes actually received and their hash. Anything reconstructed later from a
filename is a guess wearing the costume of evidence.

``analysis`` versus ``forecast`` is captured at acquisition rather than inferred
downstream, because by the time a state is assembled both look like a grid.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


class ProvenanceError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class ProvenanceCode:
    INCOMPLETE = "INCOMPLETE"
    BROKEN_CHAIN = "BROKEN_CHAIN"
    KIND_MISMATCH = "KIND_MISMATCH"


ANALYSIS = "analysis"
FORECAST = "forecast"


def classify_step(forecast_hour: int) -> str:
    """f000 is the analysis; every other step is a forecast.

    Recorded, never inferred later: an analysis and a 6-hour forecast valid at
    the same instant are different atmospheric states.
    """
    return ANALYSIS if forecast_hour == 0 else FORECAST


@dataclass(frozen=True)
class AcquisitionRecord:
    """Everything known at the moment bytes arrived."""

    artifact_id: str
    request_url: str
    request_params: dict[str, Any]
    response_status: int
    content_length: int
    sha256: str
    downloaded_at: str
    cycle_date: str
    cycle_hour: int
    forecast_hour: int
    kind: str                       # analysis | forecast
    etag: str | None = None
    last_modified: str | None = None
    storage_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, sort_keys=True) + "\n"

    def assert_consistent(self) -> None:
        expected = classify_step(self.forecast_hour)
        if self.kind != expected:
            raise ProvenanceError(
                ProvenanceCode.KIND_MISMATCH,
                f"{self.artifact_id}: f{self.forecast_hour:03d} is a {expected}, "
                f"recorded as {self.kind}",
            )
        if self.response_status != 200:
            raise ProvenanceError(
                ProvenanceCode.INCOMPLETE,
                f"{self.artifact_id}: HTTP {self.response_status}; a non-200 body is not evidence",
            )
        if not self.sha256 or self.content_length <= 0:
            raise ProvenanceError(
                ProvenanceCode.INCOMPLETE,
                f"{self.artifact_id}: missing checksum or empty body",
            )


def record_acquisition(
    *,
    artifact_id: str,
    url: str,
    params: dict[str, Any],
    status: int,
    body_sha256: str,
    content_length: int,
    cycle_date: str,
    cycle_hour: int,
    forecast_hour: int,
    etag: str | None = None,
    last_modified: str | None = None,
    storage_key: str | None = None,
) -> AcquisitionRecord:
    record = AcquisitionRecord(
        artifact_id=artifact_id,
        request_url=url,
        request_params=dict(params),
        response_status=status,
        content_length=content_length,
        sha256=body_sha256,
        downloaded_at=datetime.now(timezone.utc).isoformat(),
        cycle_date=cycle_date,
        cycle_hour=cycle_hour,
        forecast_hour=forecast_hour,
        kind=classify_step(forecast_hour),
        etag=etag,
        last_modified=last_modified,
        storage_key=storage_key,
    )
    record.assert_consistent()
    return record


@dataclass
class ForecastProvenance:
    """The traversable chain, assembled as each stage completes."""

    forecast_run_id: str
    canonical_state_id: str
    contract_hash: str
    checkpoint_sha256: str
    source_records: list[AcquisitionRecord] = field(default_factory=list)
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "forecast_run_id": self.forecast_run_id,
            "canonical_state_id": self.canonical_state_id,
            "contract_hash": self.contract_hash,
            "checkpoint_sha256": self.checkpoint_sha256,
            "generated_at": self.generated_at,
            "source_artifacts": [r.artifact_id for r in self.source_records],
            "source_kinds": [r.kind for r in self.source_records],
            "sources": [r.to_dict() for r in self.source_records],
        }

    def assert_complete(self, expected_inputs: int = 2) -> None:
        """Every link present, and every input state an analysis."""
        if not self.checkpoint_sha256:
            raise ProvenanceError(
                ProvenanceCode.BROKEN_CHAIN, "no checkpoint hash: forecast is unattributable"
            )
        if not self.contract_hash:
            raise ProvenanceError(ProvenanceCode.BROKEN_CHAIN, "no contract hash")
        if len(self.source_records) != expected_inputs:
            raise ProvenanceError(
                ProvenanceCode.BROKEN_CHAIN,
                f"expected {expected_inputs} source analyses, have {len(self.source_records)}",
            )
        for record in self.source_records:
            record.assert_consistent()
        forecasts = [r.artifact_id for r in self.source_records if r.kind != ANALYSIS]
        if forecasts:
            raise ProvenanceError(
                ProvenanceCode.KIND_MISMATCH,
                f"input state built from forecast artifacts {forecasts}; "
                "the contract specifies analysis(t-6h) + analysis(t)",
            )

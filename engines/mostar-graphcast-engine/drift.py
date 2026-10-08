"""Provisional contract vs checkpoint-derived contract — step 11.

Installing the real checkpoint is not the same as accepting it. Everything
built so far was generated from a contract transcribed by hand from the
vendored source. When the real weights arrive, the two must be compared and the
difference must be *empty*.

A non-empty diff is not a nuisance to patch around. It means the acquisition
manifest, the NOMADS requests, the validator and every test expectation were
built against a model that does not exist. That is a release-blocking
discovery, and the report is written out as an audit artifact so the decision
is recorded rather than made in a terminal and forgotten.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from contract import ContractViolation, GraphCastContract, ViolationCode, from_task_config


@dataclass(frozen=True)
class FieldDiff:
    field: str
    expected: Any
    checkpoint: Any

    @property
    def summary(self) -> str:
        return f"{self.field}: expected {self.expected!r}, checkpoint {self.checkpoint!r}"


@dataclass
class ContractDiffReport:
    provisional_name: str
    checkpoint_model: str
    differences: list[FieldDiff] = field(default_factory=list)
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @property
    def is_empty(self) -> bool:
        return not self.differences

    @property
    def release_blocking(self) -> bool:
        return bool(self.differences)

    def to_json(self) -> str:
        payload = asdict(self)
        payload["is_empty"] = self.is_empty
        payload["release_blocking"] = self.release_blocking
        return json.dumps(payload, indent=2, sort_keys=True, default=str) + "\n"

    def render(self) -> str:
        if self.is_empty:
            return (
                f"CONTRACT VERIFIED\n"
                f"  provisional: {self.provisional_name}\n"
                f"  checkpoint:  {self.checkpoint_model}\n"
                f"  no differences\n"
            )
        lines = [
            "CONTRACT_DRIFT",
            f"  provisional: {self.provisional_name}",
            f"  checkpoint:  {self.checkpoint_model}",
            "",
        ]
        for diff in self.differences:
            lines.append(f"  {diff.field}:")
            lines.append(f"    expected:   {diff.expected}")
            lines.append(f"    checkpoint: {diff.checkpoint}")
        lines.append("")
        lines.append("  RELEASE BLOCKED - the acquisition manifest was generated")
        lines.append("  against a model configuration that does not exist.")
        return "\n".join(lines) + "\n"


def _sorted_or_none(values: Any) -> Any:
    try:
        return sorted(values)
    except TypeError:
        return values


def diff_contracts(
    provisional: GraphCastContract, derived: GraphCastContract
) -> ContractDiffReport:
    """Compare the two contracts field by field."""
    report = ContractDiffReport(
        provisional_name=provisional.name, checkpoint_model=derived.name
    )

    if tuple(provisional.pressure_levels_hpa) != tuple(derived.pressure_levels_hpa):
        report.differences.append(
            FieldDiff(
                "pressure_levels",
                list(provisional.pressure_levels_hpa),
                list(derived.pressure_levels_hpa),
            )
        )
    if tuple(provisional.history_hours) != tuple(derived.history_hours):
        report.differences.append(
            FieldDiff("history_hours", list(provisional.history_hours), list(derived.history_hours))
        )
    if provisional.resolution_deg != derived.resolution_deg:
        report.differences.append(
            FieldDiff("resolution_deg", provisional.resolution_deg, derived.resolution_deg)
        )

    for name in ("surface_variables", "atmospheric_variables", "forcing_variables", "static_variables"):
        want = set(getattr(provisional, name))
        got = set(getattr(derived, name))
        if want != got:
            report.differences.append(
                FieldDiff(name, _sorted_or_none(want), _sorted_or_none(got))
            )

    want_all = set(provisional.required_variables)
    got_all = set(derived.required_variables)
    if want_all != got_all:
        report.differences.append(
            FieldDiff(
                "input_variables",
                {"only_in_provisional": sorted(want_all - got_all)},
                {"only_in_checkpoint": sorted(got_all - want_all)},
            )
        )

    return report


def activate(
    provisional: GraphCastContract,
    task_config: Any,
    *,
    audit_path: str | None = None,
) -> ContractDiffReport:
    """Phase 2A activation gate.

    Derives the contract from the real ``task_config``, diffs it against the
    provisional one, optionally writes the audit artifact, and raises unless the
    difference is empty.
    """
    derived = from_task_config(task_config, name="checkpoint-derived")
    report = diff_contracts(provisional, derived)

    if audit_path:
        with open(audit_path, "w", encoding="utf-8") as handle:
            handle.write(report.to_json())

    if report.release_blocking:
        raise ContractViolation(
            ViolationCode.CONTRACT_DRIFT,
            "checkpoint disagrees with the provisional contract:\n"
            + "\n".join(f"  {d.summary}" for d in report.differences),
        )
    return report

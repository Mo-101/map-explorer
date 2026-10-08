"""MODEL SIGNAL != PUBLIC WARNING.

Frozen deliberately early, while the forecast engine is still scaffolding and
there is nothing downstream to break. The moment a notification layer exists the
pressure to shorten this path becomes enormous, and the failure mode is not a
bad deployment - it is a false alarm sent to a Ministry of Health, or a real one
suppressed.

A model signal must clear every gate below, in order, before it is even
*eligible* to be sent. Eligibility is still not authorisation: the final gate is
a human governance decision this module can record but never make.

Upstream is explicit that these models are experimental and do not replace
official meteorological alerts or warnings. A MoStar hazard may therefore be
presented as a MoStar forecast signal; it may never be presented as an official
warning unless it originated from an authorised meteorological warning feed.

The practical lesson is already in this repository. 360 "extreme cyclone"
signals sat in production reading as real hazards over Nairobi, Addis Ababa,
Johannesburg, Kampala and Malawi. Every one was an artefact of comparing
surface pressure against sea-level thresholds. Had a notification layer existed,
it would have mailed five capitals about cyclones that were not happening.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Gate(str, Enum):
    """Ordered. Each one must pass before the next is considered."""

    PHYSICAL_VALIDATION = "physical_validation"
    MULTI_SOURCE_CORROBORATION = "multi_source_corroboration"
    HISTORICAL_CALIBRATION = "historical_calibration"
    HAZARD_CLASSIFICATION = "hazard_classification"
    PROVENANCE_COMPLETENESS = "provenance_completeness"
    CONFIDENCE_THRESHOLD = "confidence_threshold"
    GOVERNANCE_POLICY = "governance_policy"


GATE_ORDER: tuple[Gate, ...] = (
    Gate.PHYSICAL_VALIDATION,
    Gate.MULTI_SOURCE_CORROBORATION,
    Gate.HISTORICAL_CALIBRATION,
    Gate.HAZARD_CLASSIFICATION,
    Gate.PROVENANCE_COMPLETENESS,
    Gate.CONFIDENCE_THRESHOLD,
    Gate.GOVERNANCE_POLICY,
)


class SignalClass(str, Enum):
    """What a signal may be *called* in any surface that renders it."""

    MODEL_SIGNAL = "mostar_forecast_signal"
    OFFICIAL_WARNING = "official_warning"


class NotificationError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class NotificationCode:
    GATE_NOT_PASSED = "GATE_NOT_PASSED"
    GATE_OUT_OF_ORDER = "GATE_OUT_OF_ORDER"
    NOT_AUTHORISED = "NOT_AUTHORISED"
    MISATTRIBUTED_AUTHORITY = "MISATTRIBUTED_AUTHORITY"
    INCOMPLETE_PROVENANCE = "INCOMPLETE_PROVENANCE"


@dataclass
class GateResult:
    gate: Gate
    passed: bool
    detail: str = ""


@dataclass
class SignalEligibility:
    """Accumulated evidence that a signal may be sent. Never self-certifying."""

    signal_id: str
    results: list[GateResult] = field(default_factory=list)
    authorised_by: str | None = None
    source_feed: str | None = None

    def record(self, gate: Gate, passed: bool, detail: str = "") -> "SignalEligibility":
        expected = GATE_ORDER[len(self.results)] if len(self.results) < len(GATE_ORDER) else None
        if expected is None or gate is not expected:
            raise NotificationError(
                NotificationCode.GATE_OUT_OF_ORDER,
                f"expected {expected.value if expected else 'no further gates'}, got {gate.value}. "
                "Gates are ordered; corroboration before physical validation is not a shortcut.",
            )
        self.results.append(GateResult(gate=gate, passed=passed, detail=detail))
        return self

    @property
    def passed_gates(self) -> tuple[Gate, ...]:
        return tuple(r.gate for r in self.results if r.passed)

    @property
    def failed(self) -> tuple[GateResult, ...]:
        return tuple(r for r in self.results if not r.passed)

    @property
    def eligible(self) -> bool:
        """Every gate recorded and passed. Still not authorisation."""
        return len(self.results) == len(GATE_ORDER) and not self.failed

    def assert_eligible(self) -> None:
        if self.failed:
            first = self.failed[0]
            raise NotificationError(
                NotificationCode.GATE_NOT_PASSED,
                f"{self.signal_id}: {first.gate.value} did not pass ({first.detail})",
            )
        missing = GATE_ORDER[len(self.results):]
        if missing:
            raise NotificationError(
                NotificationCode.GATE_NOT_PASSED,
                f"{self.signal_id}: {len(missing)} gate(s) never evaluated, "
                f"first {missing[0].value}",
            )


def classify(source_feed: str | None) -> SignalClass:
    """A signal is an official warning only if it came from an authorised feed.

    Model output never becomes an official warning by being confident, recent,
    or corroborated. Provenance decides, not quality.
    """
    if source_feed and source_feed.startswith("authorised:"):
        return SignalClass.OFFICIAL_WARNING
    return SignalClass.MODEL_SIGNAL


def assert_not_misattributed(signal_class: SignalClass, rendered_label: str) -> None:
    """Refuse to present a model signal with the authority of a warning."""
    claims_authority = any(
        token in rendered_label.lower()
        for token in ("official", "warning", "alert issued", "met office", "advisory issued")
    )
    if signal_class is SignalClass.MODEL_SIGNAL and claims_authority:
        raise NotificationError(
            NotificationCode.MISATTRIBUTED_AUTHORITY,
            f"label {rendered_label!r} claims official authority for a model signal. "
            "MoStar forecast signals are not warnings and must not be labelled as such.",
        )


def authorise_notification(
    eligibility: SignalEligibility, *, approver: str | None
) -> SignalEligibility:
    """The final gate. Eligibility is necessary and never sufficient.

    A human or an explicit governance policy authorises; passing every automated
    gate only earns the right to be considered.
    """
    eligibility.assert_eligible()
    if not approver:
        raise NotificationError(
            NotificationCode.NOT_AUTHORISED,
            f"{eligibility.signal_id} is eligible but unauthorised. "
            "Eligibility is not authorisation; a governance decision is required.",
        )
    eligibility.authorised_by = approver
    return eligibility


def assert_provenance_complete(provenance: dict[str, Any] | None) -> None:
    """No notification without a full chain back to the source analyses."""
    required = ("canonical_id", "contract_hash", "source_artifacts", "source_kinds")
    if not provenance:
        raise NotificationError(
            NotificationCode.INCOMPLETE_PROVENANCE, "no provenance attached to signal"
        )
    missing = [k for k in required if not provenance.get(k)]
    if missing:
        raise NotificationError(
            NotificationCode.INCOMPLETE_PROVENANCE,
            f"provenance missing {missing}; a signal that cannot be traced to its "
            "source analyses is not eligible to notify anyone",
        )

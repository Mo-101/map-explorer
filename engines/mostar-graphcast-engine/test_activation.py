"""Activation gate, vocabulary separation and notification policy tests."""
from __future__ import annotations

import json
import os
import tempfile
import unittest

from contract import MOSTAR_GRAPHCAST_OPERATIONAL_V1 as CONTRACT
from contract import ContractViolation, GraphCastContract, ViolationCode
from drift import activate, diff_contracts
from notification_policy import (
    GATE_ORDER,
    Gate,
    NotificationCode,
    NotificationError,
    SignalClass,
    SignalEligibility,
    assert_not_misattributed,
    assert_provenance_complete,
    authorise_notification,
    classify,
)
from vocabularies import (
    DecodedGribVariable,
    GraphCastVariable,
    NomadsVariable,
    VocabularyCode,
    VocabularyError,
    assert_namespaces_disjoint,
    decoded_for,
    decoded_for_request,
    translate,
)


class _TaskConfig:
    def __init__(self, levels=None, inputs=None, duration="12h"):
        self.pressure_levels = levels or CONTRACT.pressure_levels_hpa
        self.input_variables = inputs or CONTRACT.required_variables
        self.input_duration = duration


ERA5_37 = (1, 2, 3, 5, 7, 10, 20, 30, 50, 70, 100, 125, 150, 175, 200, 225, 250,
           300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 775, 800, 825, 850,
           875, 900, 925, 950, 975, 1000)


class TestActivationGate(unittest.TestCase):
    def test_matching_checkpoint_produces_empty_diff(self):
        report = activate(CONTRACT, _TaskConfig())
        self.assertTrue(report.is_empty)
        self.assertFalse(report.release_blocking)
        self.assertIn("CONTRACT VERIFIED", report.render())

    def test_level_mismatch_blocks_release(self):
        with self.assertRaises(ContractViolation) as ctx:
            activate(CONTRACT, _TaskConfig(levels=ERA5_37))
        self.assertEqual(ctx.exception.code, ViolationCode.CONTRACT_DRIFT)

    def test_audit_artifact_is_written_even_when_blocking(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "activation.json")
            with self.assertRaises(ContractViolation):
                activate(CONTRACT, _TaskConfig(levels=ERA5_37), audit_path=path)
            # The decision must be recorded, not just raised into a terminal.
            self.assertTrue(os.path.exists(path))
            with open(path, encoding="utf-8") as fh:
                payload = json.load(fh)
            self.assertTrue(payload["release_blocking"])
            self.assertFalse(payload["is_empty"])
            fields = [d["field"] for d in payload["differences"]]
            self.assertIn("pressure_levels", fields)

    def test_audit_artifact_written_on_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "activation.json")
            activate(CONTRACT, _TaskConfig(), audit_path=path)
            with open(path, encoding="utf-8") as fh:
                payload = json.load(fh)
            self.assertTrue(payload["is_empty"])

    def test_precipitation_input_difference_is_caught(self):
        # TASK_13 (precip as input) instead of TASK_13_PRECIP_OUT.
        inputs = tuple(CONTRACT.required_variables) + ("total_precipitation_6hr",)
        with self.assertRaises(ContractViolation):
            activate(CONTRACT, _TaskConfig(inputs=inputs))

    def test_report_names_both_sides(self):
        derived = GraphCastContract(
            name="checkpoint-derived", resolution_deg=0.25,
            pressure_levels_hpa=ERA5_37, history_hours=CONTRACT.history_hours,
            surface_variables=CONTRACT.surface_variables,
            atmospheric_variables=CONTRACT.atmospheric_variables,
            forcing_variables=CONTRACT.forcing_variables,
            static_variables=CONTRACT.static_variables,
        )
        rendered = diff_contracts(CONTRACT, derived).render()
        self.assertIn("CONTRACT_DRIFT", rendered)
        self.assertIn("RELEASE BLOCKED", rendered)


class TestVocabularies(unittest.TestCase):
    def test_namespaces_are_disjoint(self):
        assert_namespaces_disjoint()

    def test_request_and_decoded_names_differ(self):
        # HGT is what you ask for; gh is what comes back.
        self.assertIn(NomadsVariable.HGT, NomadsVariable.ALL)
        self.assertIn(DecodedGribVariable.gh, DecodedGribVariable.ALL)
        self.assertNotEqual(NomadsVariable.HGT, DecodedGribVariable.gh)

    def test_one_request_name_yields_several_decoded_fields(self):
        # TMP returns both isobaric t and t2m.
        decoded = decoded_for_request(NomadsVariable.TMP)
        self.assertIn(DecodedGribVariable.t, decoded)
        self.assertIn(DecodedGribVariable.t2m, decoded)

    def test_geopotential_is_the_only_non_rename(self):
        gh = translate(DecodedGribVariable.gh)
        self.assertEqual(gh.graphcast, GraphCastVariable.geopotential)
        self.assertFalse(gh.is_pure_rename)
        self.assertEqual(gh.from_units, "gpm")
        self.assertEqual(gh.to_units, "m**2 s**-2")
        self.assertAlmostEqual(gh.transform(1000.0), 9806.65, places=2)

    def test_temperature_is_a_pure_rename(self):
        self.assertTrue(translate(DecodedGribVariable.t).is_pure_rename)

    def test_unknown_decoded_field_raises(self):
        with self.assertRaises(VocabularyError) as ctx:
            translate("mystery")
        self.assertEqual(ctx.exception.code, VocabularyCode.NO_TRANSLATION)

    def test_unknown_request_term_raises(self):
        with self.assertRaises(VocabularyError):
            decoded_for_request("NOTAVAR")

    def test_reverse_lookup(self):
        self.assertEqual(decoded_for(GraphCastVariable.geopotential), DecodedGribVariable.gh)


class TestNotificationPolicy(unittest.TestCase):
    def _all_gates(self, signal_id="sig-1"):
        eligibility = SignalEligibility(signal_id=signal_id)
        for gate in GATE_ORDER:
            eligibility.record(gate, True)
        return eligibility

    def test_full_pipeline_becomes_eligible(self):
        self.assertTrue(self._all_gates().eligible)

    def test_eligibility_is_not_authorisation(self):
        eligibility = self._all_gates()
        with self.assertRaises(NotificationError) as ctx:
            authorise_notification(eligibility, approver=None)
        self.assertEqual(ctx.exception.code, NotificationCode.NOT_AUTHORISED)

    def test_authorised_records_approver(self):
        result = authorise_notification(self._all_gates(), approver="duty-officer")
        self.assertEqual(result.authorised_by, "duty-officer")

    def test_skipping_gates_is_refused(self):
        eligibility = SignalEligibility(signal_id="sig-2")
        eligibility.record(Gate.PHYSICAL_VALIDATION, True)
        with self.assertRaises(NotificationError) as ctx:
            eligibility.record(Gate.CONFIDENCE_THRESHOLD, True)
        self.assertEqual(ctx.exception.code, NotificationCode.GATE_OUT_OF_ORDER)

    def test_partial_pipeline_is_not_eligible(self):
        eligibility = SignalEligibility(signal_id="sig-3")
        eligibility.record(Gate.PHYSICAL_VALIDATION, True)
        with self.assertRaises(NotificationError):
            eligibility.assert_eligible()

    def test_failed_gate_blocks(self):
        eligibility = SignalEligibility(signal_id="sig-4")
        eligibility.record(Gate.PHYSICAL_VALIDATION, False, "msl below 970 from terrain height")
        with self.assertRaises(NotificationError) as ctx:
            eligibility.assert_eligible()
        self.assertEqual(ctx.exception.code, NotificationCode.GATE_NOT_PASSED)

    def test_the_pressure_bug_would_have_been_stopped(self):
        """The 360 false extremes, replayed through the policy."""
        eligibility = SignalEligibility(signal_id="nairobi-cyclone")
        eligibility.record(
            Gate.PHYSICAL_VALIDATION, False,
            "831 hPa is surface pressure at 1795m, not a sea-level cyclone",
        )
        with self.assertRaises(NotificationError):
            eligibility.assert_eligible()

    def test_model_output_is_never_an_official_warning(self):
        self.assertIs(classify(None), SignalClass.MODEL_SIGNAL)
        self.assertIs(classify("graphcast"), SignalClass.MODEL_SIGNAL)
        self.assertIs(classify("authorised:kmd-feed"), SignalClass.OFFICIAL_WARNING)

    def test_model_signal_cannot_claim_official_authority(self):
        with self.assertRaises(NotificationError) as ctx:
            assert_not_misattributed(SignalClass.MODEL_SIGNAL, "Official Cyclone Warning")
        self.assertEqual(ctx.exception.code, NotificationCode.MISATTRIBUTED_AUTHORITY)

    def test_model_signal_label_is_allowed(self):
        assert_not_misattributed(SignalClass.MODEL_SIGNAL, "MoStar forecast signal - cyclone")

    def test_incomplete_provenance_blocks_notification(self):
        with self.assertRaises(NotificationError) as ctx:
            assert_provenance_complete({"canonical_id": "gcinput-x"})
        self.assertEqual(ctx.exception.code, NotificationCode.INCOMPLETE_PROVENANCE)

    def test_complete_provenance_passes(self):
        assert_provenance_complete({
            "canonical_id": "gcinput-20260916T12Z-abc",
            "contract_hash": "abc",
            "source_artifacts": ["gfs-20260916T06Z-analysis"],
            "source_kinds": ["analysis"],
        })


if __name__ == "__main__":
    unittest.main()

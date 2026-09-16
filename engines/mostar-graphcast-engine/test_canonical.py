"""Canonicalization, provenance, units and forcing-schedule tests.

No xarray, JAX or network required.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone

from acquisition import (
    AcquisitionCode,
    AcquisitionError,
    GfsCycle,
    build_acquisition_manifest,
    required_files,
)
from canonical import (
    ATMOSPHERIC_SELECTORS,
    G0,
    SURFACE_SELECTORS,
    CanonicalCode,
    CanonicalError,
    GribMessage,
    StateProvenance,
    canonical_state_id,
    check_grid,
    contract_hash,
    forecast_run_id,
    geopotential_height_to_geopotential,
    inventory,
    pascals_to_hectopascals,
    raw_artifact_id,
    resolve_mapping,
    validate_static_field,
)
from contract import MOSTAR_GRAPHCAST_OPERATIONAL_V1 as CONTRACT
from contract import (
    GRID_LAT_POINTS,
    GRID_LON_POINTS,
    ContractViolation,
    ViolationCode,
)
from forcings import (
    ForcingCode,
    ForcingError,
    assert_aligned,
    assert_covers_targets,
    build_schedule,
    time_features,
)


def _grid():
    lat = [-90 + 0.25 * i for i in range(GRID_LAT_POINTS)]
    lon = [0 + 0.25 * i for i in range(GRID_LON_POINTS)]
    return lat, lon


class TestVerificationGate(unittest.TestCase):
    """A vanished checkpoint mount must not silently produce requests."""

    def tearDown(self):
        os.environ.pop("MOSTAR_ALLOW_PINNED_CONTRACT", None)

    def test_bare_contract_is_refused_by_default(self):
        with self.assertRaises(AcquisitionError) as ctx:
            build_acquisition_manifest(CONTRACT)
        self.assertEqual(ctx.exception.code, AcquisitionCode.UNVERIFIED_CHECKPOINT)

    def test_env_var_permits_pinned_for_development(self):
        os.environ["MOSTAR_ALLOW_PINNED_CONTRACT"] = "1"
        manifest = build_acquisition_manifest(CONTRACT)
        self.assertEqual(manifest.field_count, 82)

    def test_explicit_allow_pinned(self):
        manifest = build_acquisition_manifest(CONTRACT, allow_pinned=True)
        self.assertEqual(len(manifest.pressure_levels_hpa), 13)

    def test_verified_checkpoint_needs_no_flag(self):
        class _Verified:
            contract = CONTRACT
            checkpoint_verified = True

        manifest = build_acquisition_manifest(_Verified())
        self.assertEqual(manifest.field_count, 82)

    def test_unverified_wrapper_still_refused(self):
        class _Unverified:
            contract = CONTRACT
            checkpoint_verified = False

        with self.assertRaises(AcquisitionError):
            build_acquisition_manifest(_Unverified())


class TestHistoryStateProvenance(unittest.TestCase):
    def test_history_state_uses_analysis_not_forecast(self):
        """The -6h state is the previous cycle's ANALYSIS, not this cycle's f006.

        12Z f000 could be paired with 06Z f006 and the shapes would match, but
        those are different atmospheric states: one is an analysis, the other a
        6-hour forecast. The contract is analysis(t-6h) + analysis(t).
        """
        manifest = build_acquisition_manifest(CONTRACT, allow_pinned=True)
        files = required_files(manifest, GfsCycle(date="20260916", hour=12))
        minus6 = next(f for f in files if f["offset_hours"] == -6)

        self.assertEqual(minus6["params"]["file"], "gfs.t06z.pgrb2.0p25.f000")
        # f000 is the analysis. Anything else would be a forecast state.
        self.assertTrue(minus6["params"]["file"].endswith("f000"))
        self.assertNotIn("f006", minus6["params"]["file"])

    def test_provenance_rejects_forecast_history(self):
        prov = StateProvenance(
            canonical_id="gcinput-20260916T12Z-abc",
            contract_hash="abc",
            source_artifacts=["gfs-20260916T06Z-forecast", "gfs-20260916T12Z-analysis"],
            history_offsets_hours=[-6, 0],
            source_kinds=["forecast", "analysis"],
        )
        with self.assertRaises(CanonicalError) as ctx:
            prov.assert_all_analyses()
        self.assertEqual(ctx.exception.code, CanonicalCode.PROVENANCE_MISMATCH)

    def test_provenance_accepts_analysis_pair(self):
        StateProvenance(
            canonical_id="gcinput-20260916T12Z-abc",
            contract_hash="abc",
            source_artifacts=["gfs-20260916T06Z-analysis", "gfs-20260916T12Z-analysis"],
            history_offsets_hours=[-6, 0],
            source_kinds=["analysis", "analysis"],
        ).assert_all_analyses()


class TestIdentities(unittest.TestCase):
    def test_three_distinct_identities(self):
        raw = raw_artifact_id("20260916", 12)
        state = canonical_state_id("20260916", 12, contract_hash(CONTRACT))
        run = forecast_run_id("20260916", 12, "deadbeefcafe1234")
        self.assertEqual(raw, "gfs-20260916T12Z-analysis")
        self.assertTrue(state.startswith("gcinput-20260916T12Z-"))
        self.assertTrue(run.startswith("gcop-20260916T12Z-"))
        self.assertEqual(len({raw, state, run}), 3)

    def test_state_id_changes_with_contract(self):
        from contract import GraphCastContract

        other = GraphCastContract(
            name="x", resolution_deg=0.25,
            pressure_levels_hpa=CONTRACT.pressure_levels_hpa[:-1],
            history_hours=CONTRACT.history_hours,
            surface_variables=CONTRACT.surface_variables,
            atmospheric_variables=CONTRACT.atmospheric_variables,
            forcing_variables=CONTRACT.forcing_variables,
            static_variables=CONTRACT.static_variables,
        )
        self.assertNotEqual(
            canonical_state_id("20260916", 12, contract_hash(CONTRACT)),
            canonical_state_id("20260916", 12, contract_hash(other)),
        )


class TestUnits(unittest.TestCase):
    def test_geopotential_height_conversion(self):
        # 5500 gpm at 500 hPa -> ~53936 m2/s2
        self.assertAlmostEqual(geopotential_height_to_geopotential(5500.0), 5500.0 * G0, places=6)
        self.assertAlmostEqual(G0, 9.80665, places=5)

    def test_conversion_is_not_identity(self):
        # The failure mode: forgetting g0 leaves a plausible-looking field.
        height = 5500.0
        self.assertNotAlmostEqual(geopotential_height_to_geopotential(height), height, places=0)

    def test_pressure_conversion(self):
        self.assertAlmostEqual(pascals_to_hectopascals(101325.0), 1013.25, places=6)


class TestGribMatching(unittest.TestCase):
    def _messages(self):
        msgs = []
        for level in CONTRACT.pressure_levels_hpa:
            msgs += [
                GribMessage("gh", "isobaricInhPa", level, "gpm"),
                GribMessage("t", "isobaricInhPa", level, "K"),
                GribMessage("q", "isobaricInhPa", level, "kg kg**-1"),
                GribMessage("u", "isobaricInhPa", level, "m s**-1"),
                GribMessage("v", "isobaricInhPa", level, "m s**-1"),
                GribMessage("w", "isobaricInhPa", level, "Pa s**-1"),
            ]
        msgs += [
            GribMessage("t2m", "heightAboveGround", 2, "K"),
            GribMessage("prmsl", "meanSea", 0, "Pa"),
            GribMessage("u10", "heightAboveGround", 10, "m s**-1"),
            GribMessage("v10", "heightAboveGround", 10, "m s**-1"),
        ]
        return msgs

    def test_inventory_is_machine_readable(self):
        rows = inventory(self._messages()[:2])
        self.assertEqual(rows[0]["shortName"], "gh")
        self.assertIn("typeOfLevel", rows[0])
        self.assertIn("units", rows[0])
        self.assertIn("level", rows[0])

    def test_resolves_all_contract_fields(self):
        resolved = resolve_mapping(
            self._messages(), ATMOSPHERIC_SELECTORS + SURFACE_SELECTORS
        )
        self.assertEqual(len(resolved["geopotential"]), 13)
        self.assertEqual(len(resolved["2m_temperature"]), 1)

    def test_shortname_alone_is_ambiguous(self):
        # 't' exists on isobaric levels; 't2m' is a different field at 2m.
        # Matching must discriminate on typeOfLevel.
        msgs = self._messages()
        isobaric_t = [m for m in msgs if m.shortName == "t"]
        surface_t = [m for m in msgs if m.shortName == "t2m"]
        self.assertEqual(len(isobaric_t), 13)
        self.assertEqual(len(surface_t), 1)
        self.assertNotEqual(isobaric_t[0].typeOfLevel, surface_t[0].typeOfLevel)

    def test_unit_mismatch_fails_closed(self):
        msgs = [m for m in self._messages() if m.shortName != "gh"]
        msgs += [
            GribMessage("gh", "isobaricInhPa", lv, "m")  # wrong units
            for lv in CONTRACT.pressure_levels_hpa
        ]
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(msgs, ATMOSPHERIC_SELECTORS)
        self.assertEqual(ctx.exception.code, CanonicalCode.UNIT_MISMATCH)

    def test_missing_field_fails_closed(self):
        msgs = [m for m in self._messages() if m.shortName != "w"]
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(msgs, ATMOSPHERIC_SELECTORS)
        self.assertEqual(ctx.exception.code, CanonicalCode.FIELD_NOT_FOUND)


class TestGridChecks(unittest.TestCase):
    def test_accepts_canonical_grid(self):
        lat, lon = _grid()
        check_grid(lat, lon)

    def test_rejects_descending_latitude(self):
        lat, lon = _grid()
        with self.assertRaises(ContractViolation) as ctx:
            check_grid(list(reversed(lat)), lon)
        self.assertEqual(ctx.exception.code, ViolationCode.LATITUDE_ORDER_MISMATCH)

    def test_rejects_negative_longitude(self):
        lat, _ = _grid()
        lon = [-180 + 0.25 * i for i in range(GRID_LON_POINTS)]
        with self.assertRaises(ContractViolation) as ctx:
            check_grid(lat, lon)
        self.assertEqual(ctx.exception.code, ViolationCode.LONGITUDE_ORDER_MISMATCH)

    def test_rejects_regional_grid(self):
        lat = [-40 + 0.25 * i for i in range(321)]
        lon = [0 + 0.25 * i for i in range(301)]
        with self.assertRaises(ContractViolation) as ctx:
            check_grid(lat, lon)
        self.assertEqual(ctx.exception.code, ViolationCode.INVALID_GRID)


class TestStaticFields(unittest.TestCase):
    def test_matching_grid_accepted(self):
        lat, lon = _grid()
        validate_static_field("land_sea_mask", lat, lon, reference_lat=lat, reference_lon=lon)

    def test_reversed_static_grid_rejected(self):
        """Same bytes, same shape, wrong orientation — every land point lies."""
        lat, lon = _grid()
        with self.assertRaises(CanonicalError) as ctx:
            validate_static_field(
                "land_sea_mask", list(reversed(lat)), lon,
                reference_lat=lat, reference_lon=lon,
            )
        self.assertEqual(ctx.exception.code, CanonicalCode.STATIC_GRID_MISMATCH)

    def test_shape_mismatch_rejected(self):
        lat, lon = _grid()
        with self.assertRaises(CanonicalError):
            validate_static_field(
                "geopotential_at_surface", lat[:-1], lon,
                reference_lat=lat, reference_lon=lon,
            )


class TestForcingSchedule(unittest.TestCase):
    def setUp(self):
        self.base = datetime(2026, 9, 16, 12, tzinfo=timezone.utc)

    def test_solar_forcing_covers_every_target_lead(self):
        schedule = build_schedule(self.base, CONTRACT.history_hours, horizon_hours=240)
        self.assertEqual(len(schedule.input_times), 2)
        self.assertEqual(len(schedule.target_times), 40)      # 240/6
        self.assertEqual(schedule.lead_hours[0], 6)
        self.assertEqual(schedule.lead_hours[-1], 240)
        assert_covers_targets(schedule, schedule.all_times)

    def test_input_only_forcings_are_refused(self):
        # The halfway implementation: forcings built for t-6h and t alone.
        schedule = build_schedule(self.base, CONTRACT.history_hours, horizon_hours=240)
        with self.assertRaises(ForcingError) as ctx:
            assert_covers_targets(schedule, schedule.input_times)
        self.assertEqual(ctx.exception.code, ForcingCode.MISSING_TARGET_TIME)

    def test_solar_forcing_timestamp_alignment(self):
        schedule = build_schedule(self.base, CONTRACT.history_hours, horizon_hours=48)
        assert_aligned(schedule)
        for t in schedule.all_times:
            self.assertEqual(t.minute, 0)
            self.assertEqual(t.hour % 6, 0)

    def test_misaligned_horizon_refused(self):
        with self.assertRaises(ForcingError) as ctx:
            build_schedule(self.base, CONTRACT.history_hours, horizon_hours=50)
        self.assertEqual(ctx.exception.code, ForcingCode.MISALIGNED_TIME)

    def test_input_times_are_history_offsets(self):
        schedule = build_schedule(self.base, CONTRACT.history_hours, horizon_hours=24)
        self.assertEqual(schedule.input_times[0], self.base - timedelta(hours=6))
        self.assertEqual(schedule.input_times[1], self.base)

    def test_time_features_are_bounded(self):
        for key, value in time_features(self.base).items():
            self.assertGreaterEqual(value, -1.0, key)
            self.assertLessEqual(value, 1.0, key)


if __name__ == "__main__":
    unittest.main()

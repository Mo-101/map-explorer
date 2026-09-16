"""Phase 2A tests: checkpoint bundle verification and acquisition manifest.

Runs with no JAX, no network and no real checkpoint — the bundle is faked on
disk with small files and the TaskConfig is injected.

    python -m unittest discover -s engines/mostar-graphcast-engine -p "test_*.py"
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone

from acquisition import (
    ASTRONOMICAL_FORCINGS,
    ATMOSPHERIC_TO_GRIB,
    AcquisitionCode,
    AcquisitionError,
    GfsCycle,
    build_acquisition_manifest,
    contract_id,
    latest_available_cycle,
    nomads_request,
    required_files,
    run_id,
    verify_against_decoded,
)
from checkpoint import (
    CheckpointCode,
    CheckpointError,
    REQUIRED_STATIC,
    REQUIRED_STATS,
    install,
    task_config_hash,
    verify,
)
from contract import MOSTAR_GRAPHCAST_OPERATIONAL_V1 as CONTRACT
from contract import ContractViolation, ViolationCode


class _TaskConfig:
    def __init__(self, levels=None, inputs=None, duration="12h"):
        self.pressure_levels = levels or CONTRACT.pressure_levels_hpa
        self.input_variables = inputs or CONTRACT.required_variables
        self.input_duration = duration


def _make_bundle(root: str, *, license_text: str = "CC BY 4.0\n") -> None:
    os.makedirs(os.path.join(root, "params"))
    os.makedirs(os.path.join(root, "stats"))
    os.makedirs(os.path.join(root, "static"))
    with open(os.path.join(root, "params", "GraphCast_operational.npz"), "wb") as fh:
        fh.write(b"fake-params")
    for name in REQUIRED_STATS:
        with open(os.path.join(root, "stats", name), "wb") as fh:
            fh.write(b"fake-" + name.encode())
    for name in REQUIRED_STATIC:
        with open(os.path.join(root, "static", name), "wb") as fh:
            fh.write(b"fake-" + name.encode())
    with open(os.path.join(root, "LICENSE"), "w", encoding="utf-8") as fh:
        fh.write(license_text)


class BundleTestCase(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="gcbundle-")
        _make_bundle(self.root)
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)


class TestCheckpointInstall(BundleTestCase):
    def test_install_writes_manifest_with_hashes(self):
        manifest = install(self.root, source_revision="abc123", task_config=_TaskConfig())
        self.assertEqual(len(manifest.params_sha256), 64)
        self.assertEqual(set(manifest.stats_sha256), set(REQUIRED_STATS))
        self.assertEqual(set(manifest.static_sha256), set(REQUIRED_STATIC))
        self.assertEqual(manifest.pressure_levels, list(CONTRACT.pressure_levels_hpa))
        self.assertTrue(os.path.exists(os.path.join(self.root, "manifest.json")))

    def test_license_is_recorded(self):
        # Weight terms changed 2026-08-06; the installed text must be pinned.
        manifest = install(self.root, source_revision="abc123", task_config=_TaskConfig())
        self.assertIsNotNone(manifest.license_sha256)

    def test_missing_license_is_refused(self):
        os.remove(os.path.join(self.root, "LICENSE"))
        with self.assertRaises(CheckpointError) as ctx:
            install(self.root, source_revision="abc", task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.MISSING_LICENSE)

    def test_missing_static_field_is_refused(self):
        os.remove(os.path.join(self.root, "static", "land_sea_mask.nc"))
        with self.assertRaises(CheckpointError) as ctx:
            install(self.root, source_revision="abc", task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.MISSING_ARTIFACT)

    def test_missing_normalization_stats_refused(self):
        os.remove(os.path.join(self.root, "stats", "diffs_stddev_by_level.nc"))
        with self.assertRaises(CheckpointError) as ctx:
            install(self.root, source_revision="abc", task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.MISSING_ARTIFACT)

    def test_ambiguous_params_refused(self):
        with open(os.path.join(self.root, "params", "Other.npz"), "wb") as fh:
            fh.write(b"second")
        with self.assertRaises(CheckpointError) as ctx:
            install(self.root, source_revision="abc", task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.MISSING_ARTIFACT)


class TestCheckpointVerify(BundleTestCase):
    def setUp(self):
        super().setUp()
        install(self.root, source_revision="abc123", task_config=_TaskConfig())

    def test_verify_passes_unchanged_bundle(self):
        manifest, contract = verify(self.root, task_config=_TaskConfig())
        self.assertEqual(contract.pressure_levels_hpa, CONTRACT.pressure_levels_hpa)
        self.assertEqual(manifest.source_revision, "abc123")

    def test_tampered_params_refused(self):
        with open(os.path.join(self.root, "params", "GraphCast_operational.npz"), "wb") as fh:
            fh.write(b"tampered")
        with self.assertRaises(CheckpointError) as ctx:
            verify(self.root, task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.HASH_MISMATCH)

    def test_swapped_stats_refused(self):
        with open(os.path.join(self.root, "stats", "mean_by_level.nc"), "wb") as fh:
            fh.write(b"different-stats")
        with self.assertRaises(CheckpointError) as ctx:
            verify(self.root, task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.HASH_MISMATCH)

    def test_altered_checkpoint_config_raises_contract_drift(self):
        # The Phase 2A acceptance test: a 37-level checkpoint must not be
        # silently ingested against.
        era5_37 = (1, 2, 3, 5, 7, 10, 20, 30, 50, 70, 100, 125, 150, 175, 200,
                   225, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750,
                   775, 800, 825, 850, 875, 900, 925, 950, 975, 1000)
        with self.assertRaises(ContractViolation) as ctx:
            verify(self.root, task_config=_TaskConfig(levels=era5_37))
        self.assertEqual(ctx.exception.code, ViolationCode.CONTRACT_DRIFT)

    def test_missing_manifest_refused(self):
        os.remove(os.path.join(self.root, "manifest.json"))
        with self.assertRaises(CheckpointError) as ctx:
            verify(self.root, task_config=_TaskConfig())
        self.assertEqual(ctx.exception.code, CheckpointCode.MISSING_MANIFEST)

    def test_task_config_hash_is_order_insensitive(self):
        shuffled = tuple(reversed(CONTRACT.required_variables))
        from contract import resolve_contract

        a = task_config_hash(resolve_contract(_TaskConfig()))
        b = task_config_hash(resolve_contract(_TaskConfig(inputs=shuffled)))
        self.assertEqual(a, b)


class TestAcquisitionManifest(unittest.TestCase):
    def setUp(self):
        self.manifest = build_acquisition_manifest(CONTRACT)

    def test_contract_id_records_levels(self):
        self.assertEqual(contract_id(CONTRACT), "graphcast-operational-0p25-13l-v1")

    def test_manifest_matches_contract(self):
        self.assertEqual(self.manifest.pressure_levels_hpa, list(CONTRACT.pressure_levels_hpa))
        self.assertEqual(self.manifest.history_offsets_hours, [-6, 0])
        self.assertEqual(len(self.manifest.pressure_variables), 6)
        self.assertEqual(len(self.manifest.surface_variables), 4)

    def test_field_count(self):
        # 6 upper-air x 13 levels + 4 surface = 82 fields per timestep.
        self.assertEqual(self.manifest.field_count, 82)

    def test_static_fields_are_not_downloaded(self):
        self.assertIn("land_sea_mask", self.manifest.static_fields)
        self.assertIn("geopotential_at_surface", self.manifest.static_fields)
        for name in self.manifest.static_fields:
            self.assertNotIn(name, self.manifest.pressure_variables)
            self.assertNotIn(name, self.manifest.surface_variables)

    def test_solar_forcing_is_computed_not_downloaded(self):
        for name in ASTRONOMICAL_FORCINGS:
            self.assertIn(name, self.manifest.computed_forcings)
            self.assertNotIn(name, self.manifest.surface_variables)

    def test_unmapped_variable_fails_closed(self):
        from contract import GraphCastContract

        bogus = GraphCastContract(
            name="x", resolution_deg=0.25,
            pressure_levels_hpa=CONTRACT.pressure_levels_hpa,
            history_hours=(-6, 0),
            surface_variables=CONTRACT.surface_variables,
            atmospheric_variables=CONTRACT.atmospheric_variables + ("ozone_mass_mixing_ratio",),
            forcing_variables=(), static_variables=(),
        )
        with self.assertRaises(AcquisitionError) as ctx:
            build_acquisition_manifest(bogus)
        self.assertEqual(ctx.exception.code, AcquisitionCode.UNMAPPED_VARIABLE)


class TestNomadsRequest(unittest.TestCase):
    def setUp(self):
        self.manifest = build_acquisition_manifest(CONTRACT)
        self.cycle = GfsCycle(date="20260916", hour=12)

    def test_request_selects_only_contract_levels(self):
        req = nomads_request(self.manifest, self.cycle, 0)
        levels = {k for k in req["params"] if k.startswith("lev_") and k.endswith("_mb")}
        self.assertEqual(len(levels), 13)
        self.assertIn("lev_50_mb", levels)
        self.assertNotIn("lev_1_mb", levels)   # 37-level set must not leak in
        self.assertNotIn("lev_975_mb", levels)

    def test_request_selects_mapped_short_names(self):
        req = nomads_request(self.manifest, self.cycle, 0)
        for short in ATMOSPHERIC_TO_GRIB.values():
            self.assertIn(f"var_{short}", req["params"])
        self.assertIn("var_PRMSL", req["params"])
        self.assertIn("lev_mean_sea_level", req["params"])

    def test_request_is_global(self):
        # Clipping the input state invalidates inference.
        req = nomads_request(self.manifest, self.cycle, 0)
        self.assertNotIn("subregion", req["params"])
        for key in ("leftlon", "rightlon", "toplat", "bottomlat"):
            self.assertNotIn(key, req["params"])

    def test_file_and_dir(self):
        req = nomads_request(self.manifest, self.cycle, 0)
        self.assertEqual(req["params"]["file"], "gfs.t12z.pgrb2.0p25.f000")
        self.assertEqual(req["params"]["dir"], "/gfs.20260916/12/atmos")

    def test_history_uses_previous_cycle_analysis(self):
        files = required_files(self.manifest, self.cycle)
        self.assertEqual(len(files), 2)
        minus6 = next(f for f in files if f["offset_hours"] == -6)
        # -6h from 12Z is the 06Z analysis, not this cycle's f-006.
        self.assertEqual(minus6["cycle"].hour, 6)
        self.assertEqual(minus6["params"]["file"], "gfs.t06z.pgrb2.0p25.f000")

    def test_history_crosses_day_boundary(self):
        files = required_files(self.manifest, GfsCycle(date="20260916", hour=0))
        minus6 = next(f for f in files if f["offset_hours"] == -6)
        self.assertEqual(minus6["cycle"].date, "20260915")
        self.assertEqual(minus6["cycle"].hour, 18)

    def test_run_id_is_deterministic(self):
        self.assertEqual(run_id(self.cycle), "gcop-gfs-20260916T12Z")

    def test_latest_cycle_respects_publish_lag(self):
        now = datetime(2026, 9, 16, 14, 0, tzinfo=timezone.utc)
        cycle = latest_available_cycle(now)
        # 14Z minus 5h lag = 09Z -> most recent published cycle is 06Z.
        self.assertEqual(cycle.hour, 6)
        self.assertEqual(cycle.date, "20260916")


class TestShortNameVerification(unittest.TestCase):
    def test_accepts_complete_decoded_set(self):
        decoded = set(ATMOSPHERIC_TO_GRIB.values()) | {"PRMSL", "TMP", "UGRD", "VGRD"}
        verify_against_decoded(decoded)

    def test_reports_missing_short_names(self):
        with self.assertRaises(AcquisitionError) as ctx:
            verify_against_decoded({"TMP", "UGRD"})
        self.assertEqual(ctx.exception.code, AcquisitionCode.SHORTNAME_MISMATCH)
        self.assertIn("HGT", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()

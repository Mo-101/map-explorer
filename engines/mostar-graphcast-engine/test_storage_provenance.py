"""ArtifactStore, exactly-one-match resolution, and acquisition provenance."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from artifact_store import (
    ArtifactCode,
    ArtifactError,
    ArtifactStore,
    LocalArtifactStore,
    inventory_key,
    raw_key,
    state_key,
)
from canonical import (
    ATMOSPHERIC_SELECTORS,
    SURFACE_SELECTORS,
    CanonicalCode,
    CanonicalError,
    GribMessage,
    resolve_mapping,
)
from contract import MOSTAR_GRAPHCAST_OPERATIONAL_V1 as CONTRACT
from provenance import (
    ANALYSIS,
    FORECAST,
    AcquisitionRecord,
    ForecastProvenance,
    ProvenanceCode,
    ProvenanceError,
    classify_step,
    record_acquisition,
)


class StoreTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = LocalArtifactStore(self.root / "store")
        self.sample = self.root / "sample.grib2"
        self.sample.write_bytes(b"GRIB" + b"\x00" * 512)


class TestArtifactStore(StoreTestCase):
    def test_satisfies_protocol(self):
        self.assertIsInstance(self.store, ArtifactStore)

    def test_store_is_format_blind(self):
        # No format-aware methods should exist on the storage boundary.
        for forbidden in ("put_zarr", "put_netcdf", "open_dataset", "to_xarray"):
            self.assertFalse(hasattr(self.store, forbidden), forbidden)

    def test_put_and_stat_roundtrip(self):
        ref = self.store.put_file("raw/a.grib2", self.sample)
        self.assertEqual(len(ref.sha256), 64)
        self.assertEqual(ref.size_bytes, self.sample.stat().st_size)
        self.assertEqual(self.store.stat("raw/a.grib2").sha256, ref.sha256)

    def test_get_file_roundtrip(self):
        ref = self.store.put_file("raw/a.grib2", self.sample)
        out = self.root / "out.grib2"
        got = self.store.get_file("raw/a.grib2", out)
        self.assertEqual(got.sha256, ref.sha256)
        self.assertEqual(out.read_bytes(), self.sample.read_bytes())

    def test_raw_artifacts_are_immutable(self):
        self.store.put_file("raw/a.grib2", self.sample)
        with self.assertRaises(ArtifactError) as ctx:
            self.store.put_file("raw/a.grib2", self.sample)
        self.assertEqual(ctx.exception.code, ArtifactCode.ALREADY_EXISTS)

    def test_missing_key_raises(self):
        with self.assertRaises(ArtifactError) as ctx:
            self.store.stat("raw/nope")
        self.assertEqual(ctx.exception.code, ArtifactCode.NOT_FOUND)

    def test_verify_detects_corruption(self):
        self.store.put_file("raw/a.grib2", self.sample)
        (self.store.root / "raw" / "a.grib2").write_bytes(b"corrupted")
        with self.assertRaises(ArtifactError) as ctx:
            self.store.verify("raw/a.grib2", self.store.stat("raw/a.grib2").sha256[::-1])
        self.assertEqual(ctx.exception.code, ArtifactCode.CHECKSUM_MISMATCH)

    def test_traversal_keys_refused(self):
        for bad in ("../escape", "raw/../../etc/passwd", "/absolute", "trailing/"):
            with self.assertRaises(ArtifactError, msg=bad) as ctx:
                self.store.put_file(bad, self.sample)
            self.assertEqual(ctx.exception.code, ArtifactCode.INVALID_KEY)

    def test_no_partial_artifact_left_behind(self):
        self.store.put_file("raw/a.grib2", self.sample)
        leftovers = list((self.store.root / "raw").glob("*.partial"))
        self.assertEqual(leftovers, [])

    def test_key_layout(self):
        self.assertEqual(
            raw_key("20260916", 12, 0),
            "raw/gfs/2026/09/16/12/gfs.t12z.pgrb2.0p25.f000",
        )
        self.assertTrue(state_key("20260916", 12, "gc-13l", "zarr").endswith("input.zarr"))
        self.assertEqual(
            inventory_key("20260916", 12),
            "contracts/observed/gfs-0p25-20260916T12Z.inventory.json",
        )


class TestExactlyOneMatch(unittest.TestCase):
    def _isobaric(self, short, units, levels=None):
        return [
            GribMessage(short, "isobaricInhPa", lv, units)
            for lv in (levels or CONTRACT.pressure_levels_hpa)
        ]

    def _full(self):
        msgs = []
        for short, units in (
            ("gh", "gpm"), ("t", "K"), ("q", "kg kg**-1"),
            ("u", "m s**-1"), ("v", "m s**-1"), ("w", "Pa s**-1"),
        ):
            msgs += self._isobaric(short, units)
        msgs += [
            GribMessage("t2m", "heightAboveGround", 2, "K"),
            GribMessage("prmsl", "meanSea", 0, "Pa"),
            GribMessage("u10", "heightAboveGround", 10, "m s**-1"),
            GribMessage("v10", "heightAboveGround", 10, "m s**-1"),
        ]
        return msgs

    def test_clean_cycle_resolves(self):
        resolved = resolve_mapping(
            self._full(),
            ATMOSPHERIC_SELECTORS + SURFACE_SELECTORS,
            expected_levels=CONTRACT.pressure_levels_hpa,
        )
        self.assertEqual(len(resolved["geopotential"]), 13)

    def test_duplicate_at_a_level_is_refused_not_deduplicated(self):
        """Never 'take first' — two messages mean two encodings."""
        msgs = self._full()
        msgs.append(GribMessage("gh", "isobaricInhPa", 500, "gpm"))
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(msgs, ATMOSPHERIC_SELECTORS)
        self.assertEqual(ctx.exception.code, CanonicalCode.AMBIGUOUS_FIELD)
        self.assertIn("500", ctx.exception.detail)

    def test_duplicate_surface_field_refused(self):
        msgs = self._full()
        msgs.append(GribMessage("prmsl", "meanSea", 0, "Pa"))
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(msgs, SURFACE_SELECTORS)
        self.assertEqual(ctx.exception.code, CanonicalCode.AMBIGUOUS_FIELD)

    def test_missing_level_reported(self):
        msgs = [m for m in self._full() if not (m.shortName == "t" and m.level == 850)]
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(
                msgs, ATMOSPHERIC_SELECTORS, expected_levels=CONTRACT.pressure_levels_hpa
            )
        self.assertEqual(ctx.exception.code, CanonicalCode.FIELD_NOT_FOUND)
        self.assertIn("850", ctx.exception.detail)

    def test_unrequested_level_reported(self):
        msgs = self._full() + [GribMessage("t", "isobaricInhPa", 975, "K")]
        with self.assertRaises(CanonicalError) as ctx:
            resolve_mapping(
                msgs, ATMOSPHERIC_SELECTORS, expected_levels=CONTRACT.pressure_levels_hpa
            )
        self.assertEqual(ctx.exception.code, CanonicalCode.AMBIGUOUS_FIELD)
        self.assertIn("975", ctx.exception.detail)


class TestAcquisitionProvenance(unittest.TestCase):
    def _record(self, forecast_hour=0, status=200, **kw):
        return record_acquisition(
            artifact_id=f"gfs-20260916T12Z-f{forecast_hour:03d}",
            url="https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl",
            params={"file": "gfs.t12z.pgrb2.0p25.f000"},
            status=status,
            body_sha256="a" * 64,
            content_length=1024,
            cycle_date="20260916",
            cycle_hour=12,
            forecast_hour=forecast_hour,
            **kw,
        )

    def test_analysis_classified_from_forecast_hour(self):
        self.assertEqual(classify_step(0), ANALYSIS)
        self.assertEqual(classify_step(6), FORECAST)

    def test_record_captures_request_and_response(self):
        rec = self._record(etag='"abc"', last_modified="Wed, 16 Sep 2026 12:00:00 GMT")
        self.assertEqual(rec.kind, ANALYSIS)
        self.assertEqual(rec.response_status, 200)
        self.assertEqual(rec.etag, '"abc"')
        self.assertIn("file", rec.request_params)
        self.assertTrue(rec.downloaded_at)

    def test_non_200_is_not_evidence(self):
        with self.assertRaises(ProvenanceError) as ctx:
            self._record(status=404)
        self.assertEqual(ctx.exception.code, ProvenanceCode.INCOMPLETE)

    def test_mislabelled_kind_refused(self):
        rec = AcquisitionRecord(
            artifact_id="x", request_url="u", request_params={}, response_status=200,
            content_length=10, sha256="b" * 64, downloaded_at="now",
            cycle_date="20260916", cycle_hour=12, forecast_hour=6, kind=ANALYSIS,
        )
        with self.assertRaises(ProvenanceError) as ctx:
            rec.assert_consistent()
        self.assertEqual(ctx.exception.code, ProvenanceCode.KIND_MISMATCH)

    def test_complete_chain_passes(self):
        chain = ForecastProvenance(
            forecast_run_id="gcop-20260916T12Z-abc",
            canonical_state_id="gcinput-20260916T12Z-def",
            contract_hash="def",
            checkpoint_sha256="c" * 64,
            source_records=[self._record(), self._record()],
        )
        chain.assert_complete()
        self.assertEqual(chain.to_dict()["source_kinds"], [ANALYSIS, ANALYSIS])

    def test_forecast_input_breaks_the_chain(self):
        chain = ForecastProvenance(
            forecast_run_id="r", canonical_state_id="s", contract_hash="h",
            checkpoint_sha256="c" * 64,
            source_records=[self._record(), self._record(forecast_hour=6)],
        )
        with self.assertRaises(ProvenanceError) as ctx:
            chain.assert_complete()
        self.assertEqual(ctx.exception.code, ProvenanceCode.KIND_MISMATCH)

    def test_unattributable_forecast_refused(self):
        chain = ForecastProvenance(
            forecast_run_id="r", canonical_state_id="s", contract_hash="h",
            checkpoint_sha256="", source_records=[self._record(), self._record()],
        )
        with self.assertRaises(ProvenanceError) as ctx:
            chain.assert_complete()
        self.assertEqual(ctx.exception.code, ProvenanceCode.BROKEN_CHAIN)

    def test_wrong_input_count_refused(self):
        chain = ForecastProvenance(
            forecast_run_id="r", canonical_state_id="s", contract_hash="h",
            checkpoint_sha256="c" * 64, source_records=[self._record()],
        )
        with self.assertRaises(ProvenanceError):
            chain.assert_complete()


if __name__ == "__main__":
    unittest.main()

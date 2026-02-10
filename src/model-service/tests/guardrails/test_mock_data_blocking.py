"""
Mock Data Blocking Abuse Tests
=============================

PURPOSE:
    Prove that System 1 cannot be tricked into using synthetic data in production phases.
    
TEST PHILOSOPHY:
    - Try every possible way to inject synthetic data
    - Verify forbidden phases reject it
    - Verify allowed phases can use it (for testing)
    
EXPECTED OUTCOME:
    All tests MUST fail for forbidden phases. If any test passes → System 1 is broken.
"""

import pytest
import sys
import os
import tempfile
from pathlib import Path

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'orchestrator'))

from moscripts_orchestrator import MoScriptsOrchestrator


class TestMockDataAbuse:
    """Adversarial tests to break synthetic data blocking."""
    
    def setup_method(self):
        """Setup for each test."""
        self.orchestrator = MoScriptsOrchestrator(strict_mode=True)
    
    def test_phase3_rejects_explicit_synthetic_flag(self):
        """
        ABUSE ATTEMPT: Pass explicit synthetic flag to Phase 3.
        
        WHY THIS SHOULD FAIL:
        Phase 3 (detection) cannot use synthetic data.
        Synthetic data would generate fake threats.
        
        This tests the most obvious abuse: "I'll just mark this as synthetic".
        """
        # Try to run Phase 3 with explicit synthetic flag
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase3a_detect', {
                'FeatureCube': '/tmp/features.zarr'
            }, metadata={'synthetic': True})
        
        # Verify it failed for synthetic data reason
        assert 'synthetic' in str(exc.value).lower()
        assert 'forbidden' in str(exc.value).lower()
    
    def test_phase3_rejects_synthetic_in_filename(self):
        """
        ABUSE ATTEMPT: Hide synthetic flag in filename.
        
        WHY THIS SHOULD FAIL:
        System 1 should detect synthetic data even if not explicitly flagged.
        Filenames containing "synthetic" or "mock" should be blocked.
        
        This tests the "I'll hide it in the filename" abuse.
        """
        # Create fake synthetic file
        with tempfile.NamedTemporaryFile(suffix='_synthetic_features.zarr', delete=False) as f:
            synthetic_file = Path(f.name)
        
        try:
            # Try to run Phase 3 with synthetic-named file
            with pytest.raises(Exception) as exc:
                self.orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': str(synthetic_file)
                })
            
            # Should fail due to synthetic detection in filename
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
            
        finally:
            synthetic_file.unlink(missing_ok=True)
    
    def test_phase3_rejects_mock_in_filename(self):
        """
        ABUSE ATTEMPT: Use "mock" in filename instead of "synthetic".
        
        WHY THIS SHOULD FAIL:
        System 1 should detect any mock/synthetic indicators.
        Cannot bypass by using different terminology.
        
        This tests the "I'll use 'mock' instead" abuse.
        """
        # Create fake mock file
        with tempfile.NamedTemporaryFile(suffix='_mock_features.zarr', delete=False) as f:
            mock_file = Path(f.name)
        
        try:
            # Try to run Phase 3 with mock-named file
            with pytest.raises(Exception) as exc:
                self.orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': str(mock_file)
                })
            
            # Should fail due to mock detection in filename
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
            
        finally:
            mock_file.unlink(missing_ok=True)
    
    def test_phase4_rejects_synthetic_detected_tracks(self):
        """
        ABUSE ATTEMPT: Pass synthetic detected tracks to validation.
        
        WHY THIS SHOULD FAIL:
        Phase 4 (validation) cannot use synthetic detected tracks.
        Would corrupt validation metrics.
        
        This tests the "I'll validate against fake tracks" abuse.
        """
        # Create fake detected tracks file
        with tempfile.NamedTemporaryFile(suffix='_synthetic_tracks.json', delete=False) as f:
            synthetic_tracks = Path(f.name)
        
        try:
            # Try to run Phase 4 with synthetic detected tracks
            with pytest.raises(Exception) as exc:
                self.orchestrator.run_phase('phase4_validate', {
                    'DetectedTracks': str(synthetic_tracks),
                    'IBTrACS': '/tmp/ibtracs.nc'
                })
            
            # Should fail due to synthetic detection
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
            
        finally:
            synthetic_tracks.unlink(missing_ok=True)
    
    def test_phase1_allows_synthetic_for_testing(self):
        """
        CONTROL TEST: Verify Phase 1 allows synthetic data.
        
        WHY THIS SHOULD SUCCEED:
        Phase 1 (ingestion) can use synthetic data for testing.
        This is allowed for pipeline structure testing.
        
        This confirms the rule is specific to production phases.
        """
        # Phase 1 should allow synthetic data
        result = self.orchestrator.run_phase('phase1_ingest', {}, metadata={'synthetic': True})
        
        # Should succeed
        assert result['success'] == True
        assert 'ForecastCube' in result['artifacts']
    
    def test_phase2_allows_synthetic_for_testing(self):
        """
        CONTROL TEST: Verify Phase 2 allows synthetic data.
        
        WHY THIS SHOULD SUCCEED:
        Phase 2 (features) can use synthetic data for testing.
        This is allowed for feature extraction testing.
        
        This confirms the rule is specific to production phases.
        """
        # First run Phase 1 to get ForecastCube
        result1 = self.orchestrator.run_phase('phase1_ingest', {})
        
        # Phase 2 should allow synthetic data
        result2 = self.orchestrator.run_phase('phase2_features', {
            'ForecastCube': result1['artifacts']['ForecastCube']
        }, metadata={'synthetic': True})
        
        # Should succeed
        assert result2['success'] == True
        assert 'FeatureCube' in result2['artifacts']
    
    def test_cannot_bypass_synthetic_detection_with_metadata_trick(self):
        """
        ABUSE ATTEMPT: Try to bypass synthetic detection with metadata trick.
        
        WHY THIS SHOULD FAIL:
        System 1 should detect synthetic data regardless of metadata tricks.
        Cannot hide synthetic nature with clever metadata.
        
        This tests the "I'll override the synthetic flag" abuse.
        """
        # Try to override synthetic detection
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase3a_detect', {
                'FeatureCube': '/tmp/synthetic_features.zarr'
            }, metadata={
                'synthetic': False,  # Try to lie about it
                'override_synthetic_check': True,  # Try to bypass
                'data_source': 'production'  # Try to fake source
            })
        
        # Should still detect synthetic data
        assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
    
    def test_cannot_use_synthetic_data_in_real_execution_path(self):
        """
        ABUSE ATTEMPT: Try to use synthetic data in real execution path.
        
        WHY THIS SHOULD FAIL:
        Even if synthetic flag is not set, real synthetic data should be detected.
        System 1 should be smarter than just checking flags.
        
        This tests the "I'll just not mark it as synthetic" abuse.
        """
        # Create a synthetic-looking file in temp directory
        synthetic_dir = Path('/tmp/synthetic_data')
        synthetic_dir.mkdir(exist_ok=True)
        
        synthetic_file = synthetic_dir / 'features.zarr'
        synthetic_file.touch()
        
        try:
            # Try to use it without synthetic flag
            with pytest.raises(Exception) as exc:
                self.orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': str(synthetic_file)
                })
            
            # Should detect synthetic from path
            assert 'synthetic' in str(exc.value).lower() or 'forbidden' in str(exc.value).lower()
            
        finally:
            synthetic_file.unlink(missing_ok=True)
            synthetic_dir.rmdir()


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v"])

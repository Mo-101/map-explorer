"""
Phase Order Enforcement Abuse Tests
=================================

PURPOSE:
    Prove that System 1 cannot be tricked into running phases out of order.
    
TEST PHILOSOPHY:
    - Act like a developer under pressure
    - Try every possible way to skip phases
    - Verify every attempt fails hard
    
EXPECTED OUTCOME:
    All tests MUST fail. If any test passes → System 1 is broken.
"""

import pytest
import sys
import os

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'orchestrator'))

from moscripts_orchestrator import MoScriptsOrchestrator
from contracts import PHASE_CONTRACTS


class TestPhaseOrderAbuse:
    """Adversarial tests to break phase order enforcement."""
    
    def setup_method(self):
        """Setup for each test."""
        self.orchestrator = MoScriptsOrchestrator(strict_mode=True)
    
    def test_cannot_run_phase3_without_phase2_inputs(self):
        """
        ABUSE ATTEMPT: Try to run detection without feature extraction.
        
        WHY THIS SHOULD FAIL:
        Phase 3 requires FeatureCube from Phase 2.
        Without Phase 2 output, Phase 3 cannot run.
        
        This tests the most common abuse: "I'll just skip feature extraction
        because I'm in a hurry."
        """
        # Try to run Phase 3 without Phase 2 inputs
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase3a_detect', {})
        
        # Verify it failed for the right reason
        assert 'missing' in str(exc.value).lower()
        assert 'FeatureCube' in str(exc.value)
    
    def test_cannot_run_phase4_without_phase3_outputs(self):
        """
        ABUSE ATTEMPT: Try to run validation without detection outputs.
        
        WHY THIS SHOULD FAIL:
        Phase 4 requires DetectedTracks from Phase 3.
        Without Phase 3 output, Phase 4 cannot run.
        
        This tests the "I'll just validate against empty tracks" abuse.
        """
        # Try to run Phase 4 without Phase 3 inputs
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase4_validate', {
                'IBTrACS': '/tmp/ibtracs.nc'  # Only provide IBTrACS, no DetectedTracks
            })
        
        # Verify it failed for the right reason
        assert 'missing' in str(exc.value).lower()
        assert 'DetectedTracks' in str(exc.value)
    
    def test_cannot_jump_from_phase1_to_phase3(self):
        """
        ABUSE ATTEMPT: Skip Phase 2 entirely.
        
        WHY THIS SHOULD FAIL:
        Phase 3 requires FeatureCube, which only Phase 2 produces.
        Cannot jump from Phase 1 → Phase 3.
        
        This tests the "feature extraction is optional" abuse.
        """
        # First run Phase 1 (should succeed)
        result1 = self.orchestrator.run_phase('phase1_ingest', {})
        assert result1['success'] == True
        
        # Now try to jump to Phase 3 (should fail)
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase3a_detect', {
                # Don't provide FeatureCube - try to use Phase 1 output
                'ForecastCube': result1['artifacts']['ForecastCube']
            })
        
        # Verify it failed because FeatureCube is missing
        assert 'missing' in str(exc.value).lower()
        assert 'FeatureCube' in str(exc.value)
    
    def test_cannot_run_phase2_without_phase1_output(self):
        """
        ABUSE ATTEMPT: Try to run feature extraction without forecast data.
        
        WHY THIS SHOULD FAIL:
        Phase 2 requires ForecastCube from Phase 1.
        Cannot run Phase 2 without Phase 1 output.
        
        This tests the "I'll use my own test data" abuse.
        """
        # Try to run Phase 2 without Phase 1 inputs
        with pytest.raises(Exception) as exc:
            self.orchestrator.run_phase('phase2_features', {})
        
        # Verify it failed for the right reason
        assert 'missing' in str(exc.value).lower()
        assert 'ForecastCube' in str(exc.value)
    
    def test_phase_order_is_enforced_even_with_correct_artifact_names(self):
        """
        ABUSE ATTEMPT: Provide correct artifact names but wrong sources.
        
        WHY THIS SHOULD FAIL:
        Even if artifact names match, they must come from correct phase.
        Cannot provide fake FeatureCube and expect Phase 3 to run.
        
        This tests the "I'll just create a file with the right name" abuse.
        """
        import tempfile
        from pathlib import Path
        
        # Create fake FeatureCube file
        with tempfile.NamedTemporaryFile(suffix='.zarr', delete=False) as f:
            fake_featurecube = Path(f.name)
        
        try:
            # Try to run Phase 3 with fake FeatureCube
            with pytest.raises(Exception) as exc:
                self.orchestrator.run_phase('phase3a_detect', {
                    'FeatureCube': str(fake_featurecube)
                })
            
            # Verify it failed because artifact doesn't exist or is invalid
            assert 'does not exist' in str(exc.value).lower() or 'missing' in str(exc.value).lower()
            
        finally:
            # Clean up
            fake_featurecube.unlink(missing_ok=True)
    
    def test_cannot_modify_phase_contracts_at_runtime(self):
        """
        ABUSE ATTEMPT: Try to modify phase contracts during execution.
        
        WHY THIS SHOULD FAIL:
        Phase contracts are frozen and immutable.
        Cannot change requirements at runtime.
        
        This tests the "I'll just remove the requirement" abuse.
        """
        # Try to modify the contracts dictionary
        original_contracts = PHASE_CONTRACTS.copy()
        
        # Attempt to remove requirements from Phase 3
        phase3_contract = PHASE_CONTRACTS['phase3a_detect']
        
        # This should not be possible (contracts are frozen)
        try:
            # Try to modify requires list
            phase3_contract.requires = []  # Remove all requirements
            
            # Try to run Phase 3 now (should still fail)
            with pytest.raises(Exception):
                self.orchestrator.run_phase('phase3a_detect', {})
                
        except (AttributeError, TypeError):
            # If we can't modify it, that's even better
            pass
        
        finally:
            # Restore original contracts
            PHASE_CONTRACTS.update(original_contracts)


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v"])

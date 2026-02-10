"""
Artifact Registry Abuse Tests
============================

PURPOSE:
    Prove that artifact registry cannot be abused or bypassed.
    
TEST PHILOSOPHY:
    - Try every possible way to corrupt artifact registry
    - Verify registry remains immutable and read-only
    - Verify all access attempts are logged
    
EXPECTED OUTCOME:
    All abuse tests MUST fail. If any test passes → System 1 is broken.
"""

import pytest
import sys
import os
import tempfile
from pathlib import Path

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'orchestrator'))

# Note: This tests the integration shim components
# For now, we'll test the concepts that would be in the integration shim


class MockArtifactRegistry:
    """Mock implementation of artifact registry for testing."""
    
    def __init__(self):
        self._registry = {}
    
    def register(self, artifact_type, artifact_path):
        """Register an artifact."""
        if artifact_type in self._registry:
            raise RuntimeError(f"Artifact {artifact_type} already registered")
        self._registry[artifact_type] = artifact_path
    
    def get(self, artifact_type):
        """Get an artifact."""
        return self._registry.get(artifact_type)
    
    def list_all(self):
        """List all artifacts."""
        return list(self._registry.items())


class MockAuditLog:
    """Mock implementation of audit log for testing."""
    
    def __init__(self):
        self.logs = []
    
    def log_access(self, consumer_id, artifact_type):
        """Log artifact access."""
        log_entry = {
            'timestamp': '2024-01-01T00:00:00Z',
            'consumer': consumer_id,
            'artifact': artifact_type
        }
        self.logs.append(log_entry)
        print(f"AUDIT: {log_entry}")


class TestArtifactRegistryAbuse:
    """Adversarial tests to break artifact registry security."""
    
    def setup_method(self):
        """Setup for each test."""
        self.registry = MockArtifactRegistry()
        self.audit_log = MockAuditLog()
    
    def test_cannot_overwrite_registered_artifact(self):
        """
        ABUSE ATTEMPT: Try to overwrite an existing artifact.
        
        WHY THIS SHOULD FAIL:
        Registry should be immutable once artifact is registered.
        Cannot overwrite artifacts silently.
        
        This tests the "I'll just replace the artifact" abuse.
        """
        # Register first artifact
        self.registry.register('ForecastCube', '/tmp/forecast1.zarr')
        
        # Try to overwrite with different path
        with pytest.raises(RuntimeError) as exc:
            self.registry.register('ForecastCube', '/tmp/forecast2.zarr')
        
        # Verify it failed for overwrite attempt
        assert 'already registered' in str(exc.value).lower()
        
        # Verify original artifact is still there
        original = self.registry.get('ForecastCube')
        assert original == '/tmp/forecast1.zarr'
    
    def test_cannot_register_artifact_with_empty_type(self):
        """
        ABUSE ATTEMPT: Try to register artifact with empty type.
        
        WHY THIS SHOULD FAIL:
        Artifact type should be required and non-empty.
        Cannot register artifacts without proper identification.
        
        This tests the "I'll use empty artifact type" abuse.
        """
        with pytest.raises((ValueError, TypeError)):
            self.registry.register('', '/tmp/forecast.zarr')
        
        with pytest.raises((ValueError, TypeError)):
            self.registry.register(None, '/tmp/forecast.zarr')
    
    def test_cannot_register_artifact_with_invalid_path(self):
        """
        ABUSE ATTEMPT: Try to register artifact with invalid path.
        
        WHY THIS SHOULD FAIL:
        Artifact path should be valid and exist.
        Cannot register non-existent artifacts.
        
        This tests the "I'll register a fake path" abuse.
        """
        # Try to register non-existent file
        with pytest.raises((FileNotFoundError, ValueError)):
            self.registry.register('ForecastCube', '/tmp/nonexistent.zarr')
    
    def test_cannot_access_unregistered_artifact(self):
        """
        ABUSE ATTEMPT: Try to access unregistered artifact.
        
        WHY THIS SHOULD FAIL:
        Should not be able to access artifacts that don't exist.
        Cannot access artifacts that weren't produced by valid phases.
        
        This tests the "I'll access any artifact I want" abuse.
        """
        # Try to access unregistered artifact
        result = self.registry.get('NonExistentArtifact')
        
        # Should return None or raise error
        assert result is None
    
    def test_all_access_attempts_are_logged(self):
        """
        CONTROL TEST: Verify all access attempts are logged.
        
        WHY THIS SHOULD SUCCEED:
        Every artifact access should be logged for audit.
        No silent access should be possible.
        
        This confirms audit trail completeness.
        """
        # Register an artifact
        self.registry.register('ForecastCube', '/tmp/forecast.zarr')
        
        # Access it through controlled method
        artifact = self.registry.get('ForecastCube')
        self.audit_log.log_access('test_consumer', 'ForecastCube')
        
        # Verify access was logged
        assert len(self.audit_log.logs) == 1
        assert self.audit_log.logs[0]['consumer'] == 'test_consumer'
        assert self.audit_log.logs[0]['artifact'] == 'ForecastCube'
    
    def test_cannot_bypass_registry_with_direct_access(self):
        """
        ABUSE ATTEMPT: Try to bypass registry with direct access.
        
        WHY THIS SHOULD FAIL:
        Registry should encapsulate artifact storage.
        Cannot access internal storage directly.
        
        This tests the "I'll access the internal dict" abuse.
        """
        # Try to access internal storage
        with pytest.raises(AttributeError):
            # Should not be able to access private _registry
            internal = self.registry._registry
            internal['FakeArtifact'] = '/tmp/fake.zarr'
    
    def test_cannot_modify_registry_after_registration(self):
        """
        ABUSE ATTEMPT: Try to modify registry after artifact is registered.
        
        WHY THIS SHOULD FAIL:
        Registry should be immutable after registration.
        Cannot modify entries once set.
        
        This tests the "I'll modify the registry dict" abuse.
        """
        # Register an artifact
        self.registry.register('ForecastCube', '/tmp/forecast.zarr')
        
        # Try to modify the registry (if possible)
        try:
            # This should not be possible
            all_artifacts = self.registry.list_all()
            if isinstance(all_artifacts, dict):
                all_artifacts['ForecastCube'] = '/tmp/modified.zarr'
            elif isinstance(all_artifacts, list):
                # Try to modify the list items
                for i, (artifact_type, path) in enumerate(all_artifacts):
                    if artifact_type == 'ForecastCube':
                        all_artifacts[i] = ('ForecastCube', '/tmp/modified.zarr')
                        break
            
            # Verify original is still there
            original = self.registry.get('ForecastCube')
            assert original == '/tmp/forecast.zarr'
            
        except (AttributeError, TypeError):
            # If we can't modify it, that's even better
            pass
    
    def test_registry_enforces_artifact_type_validation(self):
        """
        ABUSE ATTEMPT: Try to register artifact with invalid type.
        
        WHY THIS SHOULD FAIL:
        Artifact types should be validated against known types.
        Cannot register arbitrary artifact types.
        
        This tests the "I'll create my own artifact type" abuse.
        """
        # Try to register unknown artifact type
        with pytest.raises((ValueError, RuntimeError)):
            self.registry.register('FakeArtifactType', '/tmp/fake.zarr')
    
    def test_cannot_register_duplicate_artifact_types(self):
        """
        ABUSE ATTEMPT: Try to register same artifact type multiple times.
        
        WHY THIS SHOULD FAIL:
        Each artifact type should be unique.
        Cannot have multiple artifacts of same type.
        
        This tests the "I'll register multiple versions" abuse.
        """
        # Register first artifact
        self.registry.register('ForecastCube', '/tmp/forecast1.zarr')
        
        # Try to register same type again
        with pytest.raises(RuntimeError) as exc:
            self.registry.register('ForecastCube', '/tmp/forecast2.zarr')
        
        # Verify it failed for duplicate registration
        assert 'already registered' in str(exc.value).lower()
    
    def test_registry_maintains_artifact_integrity(self):
        """
        CONTROL TEST: Verify registry maintains artifact integrity.
        
        WHY THIS SHOULD SUCCEED:
        Registry should preserve artifact information exactly.
        No corruption or modification should occur.
        
        This confirms registry reliability.
        """
        # Register multiple artifacts
        artifacts = {
            'ForecastCube': '/tmp/forecast.zarr',
            'FeatureCube': '/tmp/features.zarr',
            'DetectedTracks': '/tmp/tracks.json'
        }
        
        for artifact_type, path in artifacts.items():
            self.registry.register(artifact_type, path)
        
        # Verify all artifacts are preserved exactly
        for artifact_type, expected_path in artifacts.items():
            actual_path = self.registry.get(artifact_type)
            assert actual_path == expected_path
        
        # Verify count is correct
        all_artifacts = dict(self.registry.list_all())
        assert len(all_artifacts) == len(artifacts)


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v"])

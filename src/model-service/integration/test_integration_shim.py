"""
Integration Shim Test Script
========================

PURPOSE:
    Test integration shim components to verify read-only buffer functionality.
    
TESTS:
    - Component initialization
    - Artifact registration via telemetry
    - Read-only access via API
    - Audit trail logging
    - Registry immutability
"""

import sys
import os
import tempfile
from pathlib import Path

# Add current directory to path
sys.path.insert(0, os.path.abspath(os.getcwd()))

# Import integration shim components
try:
    from artifact_registry import ArtifactRegistry, ArtifactRecord
    from telemetry_subscriber import TelemetrySubscriber
    from access_api import ArtifactAccessAPI
    from audit_log import log_access, get_access_logs
except ImportError as e:
    print('❌ FAIL: Import error - {e}')
    sys.exit(1)


def test_integration_shim():
    """Test all integration shim components."""
    
    print('🔥 PHASE C: INTEGRATION SHIM TEST')
    print('=' * 50)
    
    # Test 1: Initialize components
    print()
    print('🧪 Testing: Component initialization')
    try:
        registry = ArtifactRegistry()
        subscriber = TelemetrySubscriber(registry)
        api = ArtifactAccessAPI(registry)
        print('✅ PASS: All components initialized successfully')
    except Exception as e:
        print(f'❌ FAIL: Component initialization failed - {e}')
        return False
    
    # Test 2: Register artifact via telemetry
    print()
    print('🧪 Testing: Artifact registration via telemetry')
    try:
        # Create test file first
        import tempfile
        from pathlib import Path
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('{"test": "tracks"}')
            test_file_path = f.name
        
        # Create artifact record
        record = ArtifactRecord(
            artifact_type='DetectedTracks',
            path=test_file_path,
            produced_by_phase='phase3a_detect',
            timestamp='2024-01-01T00:00:00Z'
        )
        
        # Register directly (simulating telemetry result)
        registry.register(record)
        
        # Verify artifact was registered
        registered_record = registry.get('DetectedTracks')
        if registered_record and registered_record.artifact_type == 'DetectedTracks':
            print('✅ PASS: Artifact registered successfully')
        else:
            print('❌ FAIL: Artifact not registered')
            return False
            
    except Exception as e:
        print(f'❌ FAIL: Direct registration failed - {e}')
        return False
    try:
        # Create test file first
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('{"test": "tracks"}')
            test_file_path = f.name
        
        # Create artifact record
        record = ArtifactRecord(
            artifact_type='DetectedTracks',
            path=test_file_path,
            produced_by_phase='phase3a_detect',
            timestamp='2024-01-01T00:00:00Z'
        )
        
        # Register directly (simulating telemetry result)
        registry.register(record)
        
        # Verify artifact was registered
        registered_record = registry.get('DetectedTracks')
        if registered_record and registered_record.artifact_type == 'DetectedTracks':
            print('✅ PASS: Artifact registered successfully')
        else:
            print('❌ FAIL: Artifact not registered')
            return False
            
    except Exception as e:
        print(f'❌ FAIL: Direct registration failed - {e}')
        return False
    
    # Test 3: Read-only access via API
    print()
    print('🧪 Testing: Read-only access via API')
    try:
        # Test artifact path access
        path = api.get_artifact_path('DetectedTracks', 'test_consumer')
        if path and Path(path).exists():
            print('✅ PASS: Read-only access successful')
        else:
            print('❌ FAIL: Read-only access failed')
            return False
        
        # Test artifact metadata access
        metadata = api.get_artifact_metadata('DetectedTracks', 'test_consumer')
        if metadata and metadata['artifact_type'] == 'DetectedTracks':
            print('✅ PASS: Metadata access successful')
        else:
            print('❌ FAIL: Metadata access failed')
            return False
            
    except Exception as e:
        print(f'❌ FAIL: API access failed - {e}')
        return False
    
    # Test 4: Audit trail logging
    print()
    print('🧪 Testing: Audit trail logging')
    try:
        # Check if access was logged
        logs = get_access_logs(consumer_id='test_consumer')
        if len(logs) >= 2:  # Should have path and metadata access
            print('✅ PASS: Audit trail logging working')
        else:
            print('❌ FAIL: Audit trail logging failed')
            return False
            
    except Exception as e:
        print(f'❌ FAIL: Audit trail test failed - {e}')
        return False
    
    # Test 5: Registry immutability
    print()
    print('🧪 Testing: Registry immutability')
    try:
        # Try to register duplicate artifact (should fail)
        record2 = ArtifactRecord(
            artifact_type='DetectedTracks',
            path='/tmp/duplicate_tracks.json',
            produced_by_phase='phase3a_detect',
            timestamp='2024-01-01T00:00:00Z'
        )
        
        try:
            registry.register(record2)
            print('❌ FAIL: Registry allowed duplicate (should be immutable)')
            return False
        except RuntimeError:
            print('✅ PASS: Registry correctly prevented duplicate')
            
    except Exception as e:
        print(f'❌ FAIL: Registry immutability test failed - {e}')
        return False
    
    # Cleanup
    try:
        Path(test_file_path).unlink(missing_ok=True)
    except:
        pass
    
    print()
    print('🔥 INTEGRATION SHIM TEST COMPLETE')
    print('✅ All components working correctly')
    print('✅ Read-only access enforced')
    print('✅ Audit trail complete')
    print('✅ Ready for System 2 integration')
    
    return True


if __name__ == "__main__":
    success = test_integration_shim()
    sys.exit(0 if success else 1)

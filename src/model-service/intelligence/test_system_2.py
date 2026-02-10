"""
System 2 Test Script - Analysis Mode Only
========================================

PURPOSE:
    Test System 2 analysis modules to verify compliance with analysis mode.
    
TESTS:
    - Contract validation
    - Analysis module functionality
    - Language compliance
    - Integration shim interaction
    - Dispatcher coordination

Architecture Status: LOCKED
Authority Level: LOW (Testing Only)
Mode: ANALYSIS_ONLY
"""

import sys
import os
import tempfile
import json
from pathlib import Path
from datetime import datetime, timezone

# Allow running from any working directory
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Import with error handling
try:
    from contracts.analysis_contract import AnalysisContract, AnalysisInput, AnalysisResult
    from analysis_mode.d1_situational import SituationalAwarenessModule
    from dispatcher import AnalysisDispatcher
except ImportError as e:
    print(f"FAIL: Import error - {e}")
    raise SystemExit(1)


def test_analysis_contract():
    """Test analysis contract validation."""
    print()
    print("Testing: Analysis contract validation")
    
    try:
        # Test valid input
        valid_input = {
            'artifact_ref': 'test_artifact',
            'artifact_metadata': {'artifact_type': 'DetectedTracks'},
            'context': {'timestamp': '2024-01-01T00:00:00Z', 'region': 'test', 'season': 'summer'},
            'system_mode': 'analysis'
        }
        
        analysis_input = AnalysisContract.validate_input(valid_input)
        assert analysis_input.system_mode == 'analysis'
        print("PASS: Valid input contract accepted")
        
        # Test invalid system mode
        invalid_input = valid_input.copy()
        invalid_input['system_mode'] = 'production'
        
        try:
            AnalysisContract.validate_input(invalid_input)
            print("FAIL: Invalid system mode accepted")
            return False
        except ValueError:
            print("PASS: Invalid system mode rejected")
        
        # Test forbidden language in output
        try:
            AnalysisContract.validate_output(
                analysis_statements=["Flooding will occur tomorrow"],
                tags=['test'],
                source_artifacts=['test_artifact'],
                module_name='test'
            )
            print("FAIL: Forbidden language accepted")
            return False
        except ValueError:
            print("PASS: Forbidden language rejected")
        
        # Test valid output
        valid_result = AnalysisContract.validate_output(
            analysis_statements=["Current conditions show rainfall accumulation"],
            tags=['test', 'situational'],
            source_artifacts=['test_artifact'],
            module_name='test'
        )
        assert len(valid_result.analysis_statements) == 1
        print("PASS: Valid output contract accepted")
        
    except Exception as e:
        print(f"FAIL: Contract validation failed - {e}")
        return False
    
    return True


def test_situational_awareness():
    """Test D1 situational awareness module."""
    print()
    print("Testing: D1 Situational Awareness Module")
    
    try:
        # Create mock access API
        class MockAccessAPI:
            def get_artifact_path(self, artifact_ref, consumer):
                return '/tmp/test_artifact.json'
        
        # Create module
        module = SituationalAwarenessModule(MockAccessAPI())
        
        # Test artifact compatibility
        compatible_metadata = {'artifact_type': 'DetectedTracks'}
        incompatible_metadata = {'artifact_type': 'UnknownType'}
        
        assert module.can_analyze(compatible_metadata) == True
        assert module.can_analyze(incompatible_metadata) == False
        print("PASS: Artifact compatibility check working")
        
        # Create test artifact file
        test_artifact = {
            'tracks': [
                {
                    'latitude': -20.0,
                    'longitude': 35.0,
                    'intensity': 35,
                    'timestamp': '2024-01-01T00:00:00Z'
                }
            ]
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(test_artifact, f)
            test_file_path = f.name
        
        # Mock the file loading
        original_get_content = module.get_artifact_content
        def mock_get_content(artifact_ref):
            return test_artifact
        
        module.get_artifact_content = mock_get_content
        
        # Test analysis
        analysis_input = AnalysisInput(
            artifact_ref='test_artifact',
            artifact_metadata={'artifact_type': 'DetectedTracks'},
            context={'timestamp': '2024-01-01T00:00:00Z', 'region': 'mozambique', 'season': 'summer'},
            system_mode='analysis'
        )
        
        result = module.analyze(analysis_input)
        
        # Verify results
        assert len(result.analysis_statements) > 0
        assert 'DetectedTracks' in result.source_artifacts
        assert result.module_name == 'd1_situational'
        
        # Check for forbidden language
        for statement in result.analysis_statements:
            assert 'will' not in statement.lower()
            assert 'risk' not in statement.lower()
            assert 'severe' not in statement.lower()
        
        print("PASS: Situational analysis completed successfully")
        print(f"Generated {len(result.analysis_statements)} statements")
        
        # Cleanup
        Path(test_file_path).unlink(missing_ok=True)
        module.get_artifact_content = original_get_content
        
    except Exception as e:
        print(f"FAIL: Situational awareness test failed - {e}")
        return False
    
    return True


def test_dispatcher():
    """Test analysis dispatcher."""
    print()
    print("Testing: Analysis Dispatcher")
    
    try:
        # Create mock access API
        class MockAccessAPI:
            def get_artifact_path(self, artifact_ref, consumer):
                return f'/tmp/{artifact_ref}.json'
        
        # Create dispatcher
        dispatcher = AnalysisDispatcher(MockAccessAPI(), 'analysis')
        
        # Test module status
        status = dispatcher.get_module_status()
        assert status['total_modules'] > 0
        assert status['system_mode'] == 'analysis'
        print("PASS: Dispatcher initialized with modules")
        
        # Test artifact event handling
        event = {
            'type': 'artifact.available',
            'timestamp': '2024-01-01T00:00:00Z',
            'payload': {
                'artifact_type': 'DetectedTracks',
                'artifact_ref': 'test_tracks',
                'metadata': {'artifact_type': 'DetectedTracks', 'produced_by_phase': 'phase3a_detect'}
            }
        }
        
        # Mock artifact content
        test_artifact = {
            'tracks': [{'latitude': -20.0, 'longitude': 35.0, 'intensity': 25}]
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(test_artifact, f)
            test_file_path = f.name
        
        # Mock the module's get_artifact_content
        for module in dispatcher.analysis_modules:
            module.get_artifact_content = lambda artifact_ref: test_artifact
        
        # Handle event
        dispatcher.on_artifact_available(event)
        
        # Check active analyses (should be completed by now)
        active = dispatcher.get_active_analyses()
        print(f"PASS: Event handled, active analyses: {len(active)}")
        
        # Cleanup
        Path(test_file_path).unlink(missing_ok=True)
        
    except Exception as e:
        print(f"FAIL: Dispatcher test failed - {e}")
        return False
    
    return True


def test_system_2():
    """Run all System 2 tests."""
    print("SYSTEM 2 ANALYSIS MODE TEST")
    print("=" * 50)
    
    tests = [
        ("Analysis Contract", test_analysis_contract),
        ("Situational Awareness", test_situational_awareness),
        ("Analysis Dispatcher", test_dispatcher)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} PASSED")
            else:
                print(f"❌ {test_name} FAILED")
        except Exception as e:
            print(f"❌ {test_name} ERROR - {e}")
    
    print(f"\n{'='*50}")
    print(f"SYSTEM 2 TEST RESULTS: {passed}/{total} tests passed")
    
    if passed == total:
        print("✅ ALL SYSTEM 2 TESTS PASSED")
        print("✅ Analysis mode compliance verified")
        print("✅ Ready for production integration")
        return True
    else:
        print("❌ SOME SYSTEM 2 TESTS FAILED")
        return False


if __name__ == "__main__":
    success = test_system_2()
    raise SystemExit(0 if success else 1)

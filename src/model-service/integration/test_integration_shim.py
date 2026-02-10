"""
Integration Shim Test Script
============================

PURPOSE:
    Test integration shim components to verify read-only buffer functionality.

TESTS:
    - Component initialization
    - Artifact registration
    - Read-only access via API
    - Audit trail logging
    - Registry immutability
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# Allow running from any working directory: `python test_integration_shim.py`
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from artifact_registry import ArtifactRecord, ArtifactRegistry
    from access_api import ArtifactAccessAPI
    from telemetry_subscriber import TelemetrySubscriber
    from audit_log import get_access_logs
except ImportError as e:
    print(f"FAIL: Import error - {e}")
    raise SystemExit(1)


def test_integration_shim() -> bool:
    print("PHASE C: INTEGRATION SHIM TEST")
    print("=" * 50)

    print()
    print("Testing: Component initialization")
    try:
        registry = ArtifactRegistry()
        _subscriber = TelemetrySubscriber(registry)
        api = ArtifactAccessAPI(registry)
        print("PASS: All components initialized successfully")
    except Exception as e:
        print(f"FAIL: Component initialization failed - {e}")
        return False

    print()
    print("Testing: Artifact registration")
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write('{"test": "tracks"}')
            test_file_path = f.name

        record = ArtifactRecord(
            artifact_type="DetectedTracks",
            path=test_file_path,
            produced_by_phase="phase3a_detect",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )

        registry.register(record)

        registered_record = registry.get("DetectedTracks")
        if not registered_record or registered_record.artifact_type != "DetectedTracks":
            print("FAIL: Artifact not registered")
            return False

        print("PASS: Artifact registered successfully")
    except Exception as e:
        print(f"FAIL: Artifact registration failed - {e}")
        return False

    print()
    print("Testing: Read-only access via API")
    try:
        path = api.get_artifact_path("DetectedTracks", "test_consumer")
        if not path or not Path(path).exists():
            print("FAIL: Read-only path access failed")
            return False
        print("PASS: Read-only path access successful")

        metadata = api.get_artifact_metadata("DetectedTracks", "test_consumer")
        if not metadata or metadata.get("artifact_type") != "DetectedTracks":
            print("FAIL: Metadata access failed")
            return False
        print("PASS: Metadata access successful")
    except Exception as e:
        print(f"FAIL: API access failed - {e}")
        return False

    print()
    print("Testing: Audit trail logging")
    try:
        logs = get_access_logs(consumer_id="test_consumer")
        if len(logs) < 2:
            print("FAIL: Audit trail logging failed")
            return False
        print("PASS: Audit trail logging working")
    except Exception as e:
        print(f"FAIL: Audit trail test failed - {e}")
        return False

    print()
    print("Testing: Registry immutability")
    try:
        record2 = ArtifactRecord(
            artifact_type="DetectedTracks",
            path="/tmp/duplicate_tracks.json",
            produced_by_phase="phase3a_detect",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
        try:
            registry.register(record2)
            print("FAIL: Registry allowed duplicate (should be immutable)")
            return False
        except RuntimeError:
            print("PASS: Registry correctly prevented duplicate")
    except Exception as e:
        print(f"FAIL: Registry immutability test failed - {e}")
        return False
    finally:
        try:
            Path(test_file_path).unlink(missing_ok=True)
        except Exception:
            pass

    print()
    print("INTEGRATION SHIM TEST COMPLETE")
    print("PASS: Ready for System 2 integration")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if test_integration_shim() else 1)


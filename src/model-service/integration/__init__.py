"""
Integration Shim - Read-Only Buffer Layer
========================================

PURPOSE:
    Read-only buffer that exposes validated artifacts from System 1 
    to downstream consumers without granting execution authority.
    
RESPONSIBILITIES:
    - Subscribe to factual telemetry events from System 1
    - Register artifact metadata for fast access
    - Provide read-only API for downstream systems
    - Validate artifact integrity before handoff
    - Log all access attempts (audit trail)
    
FORBIDDEN:
    ❌ Interpretation of artifact contents
    ❌ Decision making about severity/threats
    ❌ Alert generation or notifications
    ❌ Personality or voice lines
    ❌ Modification of artifacts
    ❌ Execution of phases
    
ALLOWED:
    ✅ Subscribe to telemetry events
    ✅ Register artifact metadata
    ✅ Provide read-only access
    ✅ Validate artifact integrity
    ✅ Log access attempts

Architecture Status: LOCKED
Authority Level: MEDIUM (Buffer Only)
"""

from .artifact_registry import ArtifactRegistry, ArtifactRecord
from .telemetry_subscriber import TelemetrySubscriber
from .access_api import ArtifactAccessAPI
from .audit_log import log_access

__all__ = [
    'ArtifactRegistry',
    'ArtifactRecord',
    'TelemetrySubscriber',
    'ArtifactAccessAPI',
    'log_access',
]

__version__ = '1.0.0'
__status__ = 'LOCKED'

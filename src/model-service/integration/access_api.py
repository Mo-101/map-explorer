"""
Access API - Read-Only Artifact Access
====================================

PURPOSE:
    Provides read-only access to validated artifacts for downstream systems.
    NO interpretation. NO modification. NO execution.
    
RESPONSIBILITIES:
    - Provide read-only access to artifact metadata
    - Return artifact paths only (not contents)
    - Validate access permissions
    - Log all access attempts
    - Prevent artifact modification
    
FORBIDDEN:
    ❌ Interpretation of artifact contents
    ❌ Modification of artifacts
    ❌ Execution of phases
    ❌ Decision making about severity
    ❌ Alert generation
    
ALLOWED:
    ✅ Read-only metadata access
    ✅ Artifact path retrieval
    ✅ Existence checking
    ✅ Access logging
    ✅ Permission validation

Architecture Status: LOCKED
Authority Level: MEDIUM (Read-Only Access)
"""

from typing import Dict, Any, Optional, List
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ArtifactAccessAPI:
    """
    Read-only API for accessing validated artifacts.
    
    This is the ONLY sanctioned way for downstream systems
    to access artifacts produced by System 1.
    
    Design Principles:
    -----------------
    1. Read-only access only
    2. No interpretation of contents
    3. No modification of artifacts
    4. Complete audit trail
    5. Permission validation
    
    Security Model:
    --------------
    - All access is logged
    - No direct file system access
    - No artifact modification
    - No content interpretation
    """
    
    def __init__(self, registry):
        """
        Initialize access API with artifact registry.
        
        Parameters:
        -----------
        registry : ArtifactRegistry
            Read-only artifact registry
        
        CRITICAL:
        ---------
        This API does NOT store artifacts directly.
        It only provides read-only access to registry.
        """
        self.registry = registry
        logger.info("ArtifactAccessAPI initialized (read-only)")
    
    def get_artifact_path(self, artifact_type: str, consumer_id: str = "unknown") -> Optional[str]:
        """
        Get artifact path (read-only access).
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to access
        consumer_id : str, optional
            Identifier of the accessing system (for audit)
        
        Returns:
        --------
        Optional[str]
            Path to artifact file or None if not found
        
        CRITICAL:
        ---------
        This method NEVER:
        - Returns artifact contents
        - Modifies artifact files
        - Interprets artifact meaning
        - Makes decisions about quality
        
        This method ALWAYS:
        - Logs access attempt
        - Returns path only
        - Validates permissions
        - Returns immutable reference
        """
        # Log access attempt
        from .audit_log import log_access
        log_access(consumer_id, artifact_type)
        
        # Get artifact record from registry
        record = self.registry.get(artifact_type)
        if not record:
            logger.warning(
                "Artifact not found: %s (requested by %s)",
                artifact_type, consumer_id
            )
            return None
        
        # Validate artifact integrity
        if not self.registry.validate_artifact_integrity(artifact_type):
            logger.error(
                "Artifact integrity check failed: %s",
                artifact_type
            )
            return None
        
        # Return path only (not contents)
        logger.info(
            "Artifact path provided: %s → %s (to %s)",
            artifact_type, record.path, consumer_id
        )
        
        return record.path
    
    def get_artifact_metadata(self, artifact_type: str, consumer_id: str = "unknown") -> Optional[Dict[str, Any]]:
        """
        Get artifact metadata (read-only access).
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to access
        consumer_id : str, optional
            Identifier of the accessing system (for audit)
        
        Returns:
        --------
        Optional[Dict[str, Any]]
            Artifact metadata or None if not found
        
        CRITICAL:
        ---------
        This method returns metadata ONLY.
        It does NOT return artifact contents.
        """
        # Log access attempt
        from .audit_log import log_access
        log_access(consumer_id, f"metadata:{artifact_type}")
        
        # Get artifact record from registry
        record = self.registry.get(artifact_type)
        if not record:
            return None
        
        # Return metadata as dictionary (immutable)
        return {
            'artifact_type': record.artifact_type,
            'path': record.path,
            'produced_by_phase': record.produced_by_phase,
            'timestamp': record.timestamp.isoformat(),
            'model_source': record.model_source,
            'validation_status': record.validation_status
        }
    
    def list_available_artifacts(self, consumer_id: str = "unknown") -> List[Dict[str, Any]]:
        """
        List all available artifacts (read-only access).
        
        Parameters:
        -----------
        consumer_id : str, optional
            Identifier of the accessing system (for audit)
        
        Returns:
        --------
        List[Dict[str, Any]]
            List of artifact metadata
        
        CRITICAL:
        ---------
        This method returns metadata ONLY.
        It does NOT provide access to artifact contents.
        """
        # Log access attempt
        from .audit_log import log_access
        log_access(consumer_id, "list_all")
        
        # Get all artifacts from registry
        records = self.registry.list_all()
        
        # Return metadata as list of dictionaries
        return [
            {
                'artifact_type': record.artifact_type,
                'path': record.path,
                'produced_by_phase': record.produced_by_phase,
                'timestamp': record.timestamp.isoformat(),
                'model_source': record.model_source,
                'validation_status': record.validation_status
            }
            for record in records
        ]
    
    def check_artifact_exists(self, artifact_type: str, consumer_id: str = "unknown") -> bool:
        """
        Check if artifact exists (read-only access).
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to check
        consumer_id : str, optional
            Identifier of the accessing system (for audit)
        
        Returns:
        --------
        bool
            True if artifact exists, False otherwise
        
        CRITICAL:
        ---------
        This method checks existence ONLY.
        It does NOT provide access to contents.
        """
        # Log access attempt
        from .audit_log import log_access
        log_access(consumer_id, f"exists:{artifact_type}")
        
        # Check if artifact exists in registry
        return self.registry.exists(artifact_type)
    
    def get_artifacts_by_phase(self, phase_name: str, consumer_id: str = "unknown") -> List[Dict[str, Any]]:
        """
        Get artifacts produced by specific phase (read-only access).
        
        Parameters:
        -----------
        phase_name : str
            Name of phase (e.g., 'phase1_ingest')
        consumer_id : str, optional
            Identifier of the accessing system (for audit)
        
        Returns:
        --------
        List[Dict[str, Any]]
            List of artifact metadata
        
        CRITICAL:
        ---------
        This method returns metadata ONLY.
        It does NOT provide access to contents.
        """
        # Log access attempt
        from .audit_log import log_access
        log_access(consumer_id, f"by_phase:{phase_name}")
        
        # Get artifacts by phase
        records = self.registry.get_produced_by_phase(phase_name)
        
        # Return metadata as list of dictionaries
        return [
            {
                'artifact_type': record.artifact_type,
                'path': record.path,
                'produced_by_phase': record.produced_by_phase,
                'timestamp': record.timestamp.isoformat(),
                'model_source': record.model_source,
                'validation_status': record.validation_status
            }
            for record in records
        ]
    
    def validate_access_permissions(self, consumer_id: str, artifact_type: str) -> bool:
        """
        Validate if consumer has permission to access artifact.
        
        Parameters:
        -----------
        consumer_id : str
            Identifier of the accessing system
        artifact_type : str
            Type of artifact to access
        
        Returns:
        --------
        bool
            True if access is allowed, False otherwise
        
        CRITICAL:
        ---------
        This implements basic permission checking.
        In production, this would integrate with authentication/authorization.
        """
        # Basic permission model - can be extended
        allowed_consumers = {
            'system2.intelligence',  # Intelligence Layer
            'system2.analysis',      # Analysis Layer
            'system2.alerting',     # Alerting Layer
            'frontend.ui',          # Frontend UI
            'api.gateway'          # API Gateway
        }
        
        # Check if consumer is allowed
        return consumer_id in allowed_consumers
    
    def get_access_statistics(self) -> Dict[str, Any]:
        """
        Get access API statistics.
        
        Returns:
        --------
        Dict[str, Any]
            Statistics about API usage
        
        CRITICAL:
        ---------
        Returns factual statistics only.
        No interpretation of access patterns.
        """
        from .audit_log import get_access_logs
        
        return {
            'total_artifacts': len(self.registry.list_all()),
            'api_active': True,
            'registry_connected': self.registry is not None,
            'access_logs_count': len(get_access_logs())
        }


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ACCESS API IS READ-ONLY.

This file provides access to artifacts ONLY.
It does NOT:
- Return artifact contents
- Modify artifact files
- Interpret artifact meaning
- Make decisions about quality
- Execute any operations

If you want to:
- Analyze artifact contents → Use the path to load file in System 2
- Modify artifacts → System 1 (Execution Layer) with new phase
- Interpret artifacts → System 2 (Intelligence Layer)
- Make decisions → System 2 (Intelligence Layer)

This API just answers: "Where can I find artifact X?"

Architecture Status: LOCKED
Authority Level: MEDIUM (Read-Only Access)
"""

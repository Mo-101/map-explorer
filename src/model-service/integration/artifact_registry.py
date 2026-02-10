"""
Artifact Registry - Read-Only Metadata Storage
==========================================

PURPOSE:
    Stores metadata for artifacts produced by System 1.
    Read-only access for downstream systems.
    NO interpretation. NO mutation.
    
RESPONSIBILITIES:
    - Register validated artifacts
    - Provide read-only access to metadata
    - Prevent artifact modification
    - Maintain audit trail
    
FORBIDDEN:
    ❌ Interpretation of artifact contents
    ❌ Modification of artifact metadata
    ❌ Deletion of artifacts
    ❌ Creation of fake artifacts
    
ALLOWED:
    ✅ Read-only access to metadata
    ✅ Artifact existence validation
    ✅ Audit trail logging
    ✅ Metadata queries

Architecture Status: LOCKED
Authority Level: MEDIUM (Read-Only)
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ArtifactRecord:
    """
    Immutable record for validated artifact metadata.
    
    This is a frozen dataclass - cannot be modified after creation.
    
    Attributes:
    ----------
    artifact_type: str
        Type of artifact (e.g., 'ForecastCube', 'DetectedTracks')
    path: str
        Filesystem or object store path to artifact
    produced_by_phase: str
        Which System 1 phase produced this artifact
    timestamp: datetime
        When artifact was produced
    model_source: Optional[str]
        Source model (e.g., 'WeatherNext2')
    validation_status: Optional[str]
        Whether artifact has been validated
    """
    artifact_type: str
    path: str
    produced_by_phase: str
    timestamp: datetime
    model_source: Optional[str] = None
    validation_status: Optional[str] = None


class ArtifactRegistry:
    """
    Read-only registry for validated artifacts.
    
    This is the authoritative source of truth for what artifacts exist
    and where to find them. It is deliberately read-only.
    
    Design Principles:
    -----------------
    1. Immutable once registered
    2. No modification after creation
    3. No interpretation of contents
    4. Complete audit trail
    5. Fast read access
    """
    
    def __init__(self):
        """Initialize empty registry."""
        self._registry: Dict[str, ArtifactRecord] = {}
        logger.info("ArtifactRegistry initialized (read-only)")
    
    def register(self, record: ArtifactRecord) -> None:
        """
        Register a validated artifact.
        
        This method can ONLY be called by System 1 orchestrator
        when a phase successfully completes.
        
        Parameters:
        -----------
        record : ArtifactRecord
            Immutable artifact record
        
        Raises:
        -------
        RuntimeError
            If artifact already exists (registry is immutable)
        
        CRITICAL:
        ---------
        This method does NOT:
        - Interpret artifact contents
        - Modify existing artifacts
        - Delete artifacts
        - Create fake artifacts
        
        This method ONLY:
        - Store metadata
        - Validate uniqueness
        - Log registration
        """
        if record.artifact_type in self._registry:
            raise RuntimeError(
                f"Artifact {record.artifact_type} already registered. "
                f"Registry is immutable - cannot overwrite."
            )
        
        # Validate artifact exists on disk
        from pathlib import Path
        artifact_path = Path(record.path)
        if not artifact_path.exists():
            raise RuntimeError(
                f"Artifact path does not exist: {record.path}. "
                f"Cannot register non-existent artifact."
            )
        
        # Store immutable record
        self._registry[record.artifact_type] = record
        
        logger.info(
            "Artifact registered: %s at %s (from %s)",
            record.artifact_type,
            record.path,
            record.produced_by_phase
        )
    
    def get(self, artifact_type: str) -> Optional[ArtifactRecord]:
        """
        Get artifact metadata (read-only).
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to retrieve
        
        Returns:
        --------
        Optional[ArtifactRecord]
            Immutable artifact record or None if not found
        
        CRITICAL:
        ---------
        This method NEVER:
        - Modifies the artifact
        - Interprets artifact contents
        - Returns artifact data
        
        This method ALWAYS:
        - Returns metadata only
        - Logs access attempt
        - Returns immutable record
        """
        # Log access attempt
        from .audit_log import log_access
        log_access("integration.registry", artifact_type)
        
        # Return immutable copy
        record = self._registry.get(artifact_type)
        return record
    
    def list_all(self) -> List[ArtifactRecord]:
        """
        List all registered artifacts.
        
        Returns:
        --------
        List[ArtifactRecord]
            List of all immutable artifact records
        
        CRITICAL:
        ---------
        Returns copies, not references to internal storage.
        """
        # Log access attempt
        from .audit_log import log_access
        log_access("integration.registry", "list_all")
        
        # Return copies to prevent modification
        return list(self._registry.values())
    
    def exists(self, artifact_type: str) -> bool:
        """
        Check if artifact is registered.
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to check
        
        Returns:
        --------
        bool
            True if artifact exists, False otherwise
        """
        return artifact_type in self._registry
    
    def get_produced_by_phase(self, phase_name: str) -> List[ArtifactRecord]:
        """
        Get all artifacts produced by a specific phase.
        
        Parameters:
        -----------
        phase_name : str
            Name of phase (e.g., 'phase1_ingest')
        
        Returns:
        --------
        List[ArtifactRecord]
            List of artifacts produced by the phase
        """
        # Log access attempt
        from .audit_log import log_access
        log_access("integration.registry", f"by_phase:{phase_name}")
        
        return [
            record for record in self._registry.values()
            if record.produced_by_phase == phase_name
        ]
    
    def validate_artifact_integrity(self, artifact_type: str) -> bool:
        """
        Validate artifact file integrity.
        
        Parameters:
        -----------
        artifact_type : str
            Type of artifact to validate
        
        Returns:
        --------
        bool
            True if artifact file exists and is readable
        
        CRITICAL:
        ---------
        This method checks file existence and readability ONLY.
        It does NOT interpret or validate artifact contents.
        """
        record = self._registry.get(artifact_type)
        if not record:
            return False
        
        from pathlib import Path
        artifact_path = Path(record.path)
        
        # Check file exists and is readable
        return artifact_path.exists() and artifact_path.is_file()
    
    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get registry statistics.
        
        Returns:
        --------
        Dict[str, Any]
            Statistics about registered artifacts
        
        CRITICAL:
        ---------
        Returns factual statistics only.
        No interpretation of artifact quality or contents.
        """
        return {
            'total_artifacts': len(self._registry),
            'artifact_types': list(self._registry.keys()),
            'phases_represented': list(set(
                record.produced_by_phase for record in self._registry.values()
            )),
            'models_represented': list(set(
                record.model_source for record in self._registry.values()
                if record.model_source
            ))
        }
    
    def _prevent_modification(self):
        """
        Internal method to prevent modification attempts.
        
        This method raises RuntimeError if called to prevent
        any attempt to modify internal registry state.
        """
        raise RuntimeError(
            "ArtifactRegistry is read-only and immutable. "
            "Cannot modify registry state after initialization."
        )
    
    # Prevent modification attempts
    def __setitem__(self, key, value):
        """Prevent direct assignment."""
        self._prevent_modification()
    
    def __delitem__(self, key):
        """Prevent direct deletion."""
        self._prevent_modification()
    
    def clear(self):
        """Prevent registry clearing."""
        self._prevent_modification()
    
    def update(self, *args, **kwargs):
        """Prevent registry updates."""
        self._prevent_modification()
    
    def pop(self, *args, **kwargs):
        """Prevent registry pop operations."""
        self._prevent_modification()


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ARTIFACT REGISTRY IS READ-ONLY.

This file stores metadata ONLY.
It does NOT:
- Interpret artifact contents
- Modify artifact files
- Create fake artifacts
- Delete existing artifacts
- Make decisions about artifact quality

If you want to:
- Analyze artifact contents → System 2 (Intelligence Layer)
- Modify artifacts → System 1 (Execution Layer) with new phase
- Delete artifacts → System 1 (Execution Layer) with cleanup phase
- Create artifacts → System 1 (Execution Layer) with production phase

This registry just answers: "What artifacts exist and where are they?"

Architecture Status: LOCKED
Authority Level: MEDIUM (Read-Only)
"""

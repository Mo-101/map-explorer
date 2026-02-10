"""
Phase Contracts - Input/Output Validation
==========================================

PURPOSE:
    Define and enforce phase contracts (what goes in, what comes out).
    
RESPONSIBILITIES:
    - Validate phase inputs
    - Validate phase outputs
    - Check required artifacts
    - Verify data types/formats
    
FORBIDDEN:
    ❌ Interpreting artifact contents
    ❌ Deciding if results are "good"
    ❌ Making assumptions about missing data

Architecture Status: LOCKED
Authority Level: HIGH (Data Integrity)
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PhaseContract:
    """
    Contract definition for a scientific phase.
    
    Specifies:
    ----------
    - Required inputs (artifacts that must exist)
    - Required outputs (artifacts that must be produced)
    - Allowed model sources
    - Forbidden data types (e.g., synthetic)
    
    Does NOT specify:
    -----------------
    - Whether results are "good" or "bad"
    - Interpretation of contents
    - Alert generation logic
    """
    phase_name: str
    requires: List[str]  # Required input artifact names
    produces: List[str]  # Required output artifact names
    model_constraint: Optional[str] = None  # e.g., "WeatherNext2"
    allow_synthetic: bool = False  # Whether synthetic data is allowed
    
    def __post_init__(self):
        """Validate contract definition."""
        if not self.phase_name:
            raise ValueError("Phase contract must have a name")
        if not self.produces:
            raise ValueError("Phase contract must specify outputs")


# ============================================================================
# PHASE CONTRACTS (AUTHORITATIVE SOURCE OF TRUTH)
# ============================================================================

PHASE_CONTRACTS = {
    'phase1_ingest': PhaseContract(
        phase_name='phase1_ingest',
        requires=[],  # No inputs required
        produces=['ForecastCube'],
        model_constraint='WeatherNext2',
        allow_synthetic=True  # Synthetic allowed for testing pipeline structure
    ),
    
    'phase2_features': PhaseContract(
        phase_name='phase2_features',
        requires=['ForecastCube'],
        produces=['FeatureCube'],
        allow_synthetic=True  # Synthetic allowed for testing feature extraction
    ),
    
    'phase3a_detect': PhaseContract(
        phase_name='phase3a_detect',
        requires=['FeatureCube'],
        produces=['DetectedTracks'],  # Standardized name
        allow_synthetic=False  # NEVER allow synthetic for detection
    ),
    
    'phase4_validate': PhaseContract(
        phase_name='phase4_validate',
        requires=['DetectedTracks', 'IBTrACS'],
        produces=['ValidationMetrics'],
        model_constraint='WeatherNext2',
        allow_synthetic=False  # NEVER allow synthetic for validation
    ),
}


def validate_contract(
    contract: PhaseContract,
    artifacts: Dict[str, Any],
    is_input: bool = True
) -> None:
    """
    Validate artifacts against phase contract.
    
    Parameters:
    -----------
    contract : PhaseContract
        Contract to validate against
    artifacts : Dict[str, Any]
        Artifacts to validate (paths or objects)
    is_input : bool
        Whether validating inputs (True) or outputs (False)
    
    Raises:
    -------
    ContractViolationError
        If artifacts don't match contract
    
    IMPORTANT:
    ----------
    This function checks STRUCTURE only, not MEANING.
    It verifies that required artifacts exist and have correct types.
    It does NOT interpret if contents are "good" or "bad".
    """
    artifact_type = 'inputs' if is_input else 'outputs'
    required = contract.requires if is_input else contract.produces
    
    logger.info(
        "Validating %s for phase: %s",
        artifact_type,
        contract.phase_name
    )
    
    # Check required artifacts exist
    missing = []
    for required_artifact in required:
        if required_artifact not in artifacts:
            missing.append(required_artifact)
    
    if missing:
        raise ContractViolationError(
            f"Phase {contract.phase_name} {artifact_type} missing: {', '.join(missing)}"
        )
    
    # Check artifact paths are valid (if they're paths)
    for artifact_name, artifact_value in artifacts.items():
        if isinstance(artifact_value, (str, Path)):
            artifact_path = Path(artifact_value)
            if not artifact_path.exists():
                raise ContractViolationError(
                    f"Artifact does not exist: {artifact_path}"
                )
    
    logger.info(
        "Contract validated: %s %s ✓",
        contract.phase_name,
        artifact_type
    )


def get_contract(phase_name: str) -> Optional[PhaseContract]:
    """
    Get contract for a specific phase.
    
    Parameters:
    -----------
    phase_name : str
        Name of phase
        
    Returns:
    --------
    Optional[PhaseContract]
        Contract definition or None if not found
    """
    return PHASE_CONTRACTS.get(phase_name)


def list_contracts() -> List[str]:
    """
    List all available phase contracts.
    
    Returns:
    --------
    List[str]
        List of phase names with contracts
    """
    return list(PHASE_CONTRACTS.keys())


# ============================================================================
# EXCEPTIONS
# ============================================================================

class ContractViolationError(Exception):
    """Raised when artifacts don't match contract."""
    pass


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
CONTRACTS CHECK STRUCTURE, NOT MEANING.

This file validates that:
✅ Required artifacts exist
✅ Paths are valid
✅ Types are correct
✅ Model constraints are met

This file does NOT validate:
❌ Whether results are scientifically valid
❌ Whether thresholds are exceeded
❌ Whether alerts should be generated
❌ Whether data is "good enough"

Those decisions belong in System 2 (Intelligence Layer).

Architecture Status: LOCKED
"""

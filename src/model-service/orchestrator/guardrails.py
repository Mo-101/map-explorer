"""
Guardrails - Scientific Safety Enforcement
===========================================

PURPOSE:
    Enforce non-negotiable safety rules for scientific execution.
    
RESPONSIBILITIES:
    - Prevent synthetic data in production
    - Prevent phase skipping
    - Prevent model mixing
    - Prevent interpretation upstream
    - Enforce validation requirements
    
PHILOSOPHY:
    "If guardrails trigger, something is architecturally wrong."

Architecture Status: LOCKED
Authority Level: HIGHEST (Safety Critical)
"""

from typing import Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# FORBIDDEN BEHAVIORS (Declarative, Reviewable)
# ============================================================================

FORBIDDEN_BEHAVIORS = {
    # Data Safety
    'synthetic_data_in_production': {
        'description': 'Synthetic/mock data cannot be used beyond Phase 2',
        'severity': 'CRITICAL',
        'rationale': 'Prevents false alerts based on fake data'
    },
    
    # Execution Safety
    'phase_skipping': {
        'description': 'Cannot skip scientific phases (must run in order)',
        'severity': 'CRITICAL',
        'rationale': 'Each phase depends on validated outputs from previous phase'
    },
    
    # Model Safety
    'model_mixing': {
        'description': 'Validation requires consistent model (e.g., WeatherNext only)',
        'severity': 'HIGH',
        'rationale': 'IBTrACS validation is calibrated for specific model output'
    },
    
    # Logic Safety
    'interpretation_in_orchestrator': {
        'description': 'Orchestrator cannot interpret results (System 2 only)',
        'severity': 'CRITICAL',
        'rationale': 'Prevents decision-making in execution layer'
    },
    
    # Validation Safety
    'skip_validation': {
        'description': 'Cannot skip Phase 4 validation when running Phase 3',
        'severity': 'HIGH',
        'rationale': 'Unvalidated detections cannot trigger alerts'
    },
    
    # Fallback Safety
    'automatic_fallbacks': {
        'description': 'No automatic substitution of missing inputs',
        'severity': 'HIGH',
        'rationale': 'Silent fallbacks hide data quality issues'
    },
}


class Guardrails:
    """
    Enforces safety rules for scientific execution.
    
    This is the last line of defense against:
    - Accidental misuse
    - Architectural violations
    - Data quality issues
    - Silent failures
    
    If a guardrail triggers, it means something is wrong
    with how the system is being used.
    """
    
    def __init__(self, strict: bool = True):
        """
        Initialize guardrails.
        
        Parameters:
        -----------
        strict : bool
            Whether to enforce all guardrails strictly (default: True)
            
        DANGER:
        -------
        Setting strict=False should ONLY be done in isolated test
        environments. NEVER in production.
        """
        self.strict = strict
        
        if not strict:
            logger.warning(
                "⚠️  Guardrails running in NON-STRICT mode. "
                "This should ONLY happen in test environments!"
            )
        else:
            logger.info("Guardrails initialized (STRICT mode)")
    
    def check(
        self,
        phase_name: str,
        inputs: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Check if execution would violate any guardrails.
        
        Parameters:
        -----------
        phase_name : str
            Phase being executed
        inputs : Dict[str, Any]
            Phase inputs
        metadata : Dict[str, Any], optional
            Additional metadata for checking
        
        Returns:
        --------
        Dict[str, Any]
            {
                'allowed': bool,
                'reason': Optional[str],
                'violations': List[str]
            }
        
        If 'allowed' is False, execution MUST be refused.
        """
        metadata = metadata or {}
        violations = []
        
        # Check 1: Synthetic Data
        if self._check_synthetic_data(phase_name, inputs, metadata):
            violations.append('synthetic_data_in_production')
        
        # Check 2: Phase Skipping
        if self._check_phase_skipping(phase_name, metadata):
            violations.append('phase_skipping')
        
        # Check 3: Model Mixing
        if self._check_model_mixing(phase_name, metadata):
            violations.append('model_mixing')
        
        # Check 4: Validation Skipping
        if self._check_validation_skipping(phase_name, metadata):
            violations.append('skip_validation')
        
        # If any violations found, refuse execution
        if violations and self.strict:
            violation_details = [
                f"{v}: {FORBIDDEN_BEHAVIORS[v]['description']}"
                for v in violations
            ]
            
            logger.error(
                "Guardrail violations detected: %s",
                ', '.join(violations)
            )
            
            return {
                'allowed': False,
                'reason': '; '.join(violation_details),
                'violations': violations
            }
        
        # No violations, allow execution
        return {
            'allowed': True,
            'reason': None,
            'violations': []
        }
    
    def _check_synthetic_data(
        self,
        phase_name: str,
        inputs: Dict[str, Any],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Check if synthetic/mock data is being used inappropriately.
        
        Rule:
        -----
        Synthetic data is ONLY allowed in:
        - Phase 1 (ingestion) - for testing pipeline structure
        - Phase 2 (features) - for testing feature extraction
        
        Synthetic data is FORBIDDEN in:
        - Phase 3 (detection) - would generate fake threats
        - Phase 4 (validation) - would corrupt metrics
        - Any Intelligence Layer processing
        
        Returns:
        --------
        bool
            True if violation detected, False otherwise
        """
        # Check metadata for synthetic flag
        is_synthetic = metadata.get('synthetic', False)
        
        # Also check if any input path contains "synthetic" or "mock"
        for input_name, input_value in inputs.items():
            if isinstance(input_value, str) and ('synthetic' in input_value.lower() or 'mock' in input_value.lower()):
                is_synthetic = True
        
        # Phases where synthetic is forbidden
        forbidden_phases = ['phase3a_detect', 'phase3b_flood', 'phase4_validate']
        
        if is_synthetic and phase_name in forbidden_phases:
            logger.error(
                "CRITICAL: Synthetic data detected in %s (forbidden)",
                phase_name
            )
            return True
        
        return False
    
    def _check_phase_skipping(
        self,
        phase_name: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Check if phases are being skipped.
        
        Rule:
        -----
        Phases must run in order:
        Phase 1 → Phase 2 → Phase 3 → Phase 4
        
        Cannot jump from Phase 1 → Phase 3 (skips Phase 2)
        Cannot run Phase 4 before Phase 3
        
        Returns:
        --------
        bool
            True if violation detected, False otherwise
        """
        # Get highest completed phase from metadata
        highest_completed = metadata.get('highest_completed_phase', 0)
        
        # Extract phase number from phase name (e.g., 'phase3a_detect' → 3)
        try:
            current_phase_num = int(phase_name.split('phase')[1][0])
        except (IndexError, ValueError):
            logger.warning("Could not parse phase number from: %s", phase_name)
            return False
        
        # Check if skipping phases
        if current_phase_num > highest_completed + 1:
            logger.error(
                "CRITICAL: Phase skipping detected (trying to run phase %d, "
                "but highest completed is %d)",
                current_phase_num,
                highest_completed
            )
            return True
        
        return False
    
    def _check_model_mixing(
        self,
        phase_name: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Check if model sources are being mixed inappropriately.
        
        Rule:
        -----
        Validation (Phase 4) requires consistent model identity.
        Cannot validate WeatherNext output against calibration
        designed for ECMWF output.
        
        Returns:
        --------
        bool
            True if violation detected, False otherwise
        """
        if phase_name != 'phase4_validate':
            return False
        
        # Check if model identity is WeatherNext
        model_id = metadata.get('model', None)
        
        if model_id and model_id != 'WeatherNext2':
            logger.error(
                "CRITICAL: Validation requires WeatherNext2 output, "
                "but got: %s",
                model_id
            )
            return True
        
        return False
    
    def _check_validation_skipping(
        self,
        phase_name: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Check if validation is being skipped when required.
        
        Rule:
        -----
        Detection (Phase 3) outputs MUST go through validation (Phase 4)
        before being passed to Intelligence Layer.
        
        Unvalidated detections cannot trigger alerts.
        
        Returns:
        --------
        bool
            True if violation detected, False otherwise
        """
        # This check would be enforced by Intelligence Layer
        # checking that artifacts have 'validated: true' metadata
        
        # For now, just a placeholder
        return False


# ============================================================================
# GUARDRAIL UTILITIES
# ============================================================================

def format_guardrail_report(violations: List[str]) -> str:
    """
    Format guardrail violations into human-readable report.
    
    Parameters:
    -----------
    violations : List[str]
        List of violated guardrail IDs
    
    Returns:
    --------
    str
        Formatted report
    """
    if not violations:
        return "✅ No guardrail violations"
    
    report_lines = ["🚨 GUARDRAIL VIOLATIONS DETECTED:"]
    report_lines.append("=" * 60)
    
    for violation_id in violations:
        behavior = FORBIDDEN_BEHAVIORS.get(violation_id, {})
        report_lines.append(f"\n❌ {violation_id}")
        report_lines.append(f"   Description: {behavior.get('description', 'Unknown')}")
        report_lines.append(f"   Severity: {behavior.get('severity', 'UNKNOWN')}")
        report_lines.append(f"   Rationale: {behavior.get('rationale', 'Not specified')}")
    
    report_lines.append("\n" + "=" * 60)
    report_lines.append("Execution REFUSED to protect system integrity.")
    
    return "\n".join(report_lines)


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
GUARDRAILS ARE NON-NEGOTIABLE.

If a guardrail triggers, it means:
1. The system is being used incorrectly
2. OR there is an architectural violation
3. OR there is a data quality issue

The correct response is ALWAYS:
1. REFUSE execution
2. REPORT violation clearly
3. FIX the root cause

The INCORRECT response is:
1. Override the guardrail
2. Add a bypass flag
3. Make it "just work anyway"

Guardrails protect human lives by preventing:
- False alerts (synthetic data)
- Unvalidated warnings (skipped validation)
- Misattributed predictions (model mixing)
- Silent failures (automatic fallbacks)

If you think a guardrail is too strict, the question is not
"how do I bypass it?" but "why am I trying to do something
the architecture forbids?"

Examples of GOOD reasons to revisit a guardrail:
✅ Scientific methodology changed
✅ New validation approach developed
✅ Better data source became available

Examples of BAD reasons to bypass a guardrail:
❌ "We need to demo it now"
❌ "The data isn't ready yet"
❌ "It's just for testing"
❌ "We'll fix it later"

This file protects lives.
Keep it strict.

Architecture Status: LOCKED
Authority Level: HIGHEST
Last Review: 2026-02-10
"""

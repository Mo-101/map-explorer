"""
MoScripts Orchestrator - Main Execution Harness
===============================================

PURPOSE:
    Primary interface for running scientific phases with strict guarantees.
    
WHAT THIS IS:
    A boring, predictable, audit-safe execution coordinator.
    
WHAT THIS IS NOT:
    ❌ An intelligence system
    ❌ A decision engine
    ❌ A narrator
    ❌ A UI controller
    ❌ A workflow engine that "figures things out"
    
PHILOSOPHY:
    "Launch. Validate. Refuse. Report. Nothing else."
    
Architecture Status: LOCKED
Authority Level: HIGHEST
"""

from typing import Dict, Any, Optional
from pathlib import Path
import logging

from contracts import PHASE_CONTRACTS, validate_contract, get_contract
from telemetry import Telemetry
from guardrails import Guardrails, format_guardrail_report

logger = logging.getLogger(__name__)


class MoScriptsOrchestrator:
    """
    Strict execution harness for AFRO STORM scientific phases.
    
    Guarantees:
    -----------
    1. Exactly one phase runs at a time
    2. All inputs are validated before execution
    3. Guardrails are enforced (cannot be bypassed)
    4. Only factual telemetry is emitted
    5. No interpretation of results
    6. No automatic chaining
    
    Non-Guarantees:
    ---------------
    - Does NOT decide if results are "good" or "bad"
    - Does NOT generate alerts or warnings
    - Does NOT interpret meaning
    - Does NOT make decisions about human safety
    
    Those responsibilities belong to Intelligence Layer (System 2).
    """
    
    def __init__(
        self,
        telemetry_enabled: bool = True,
        strict_mode: bool = True
    ):
        """
        Initialize orchestrator.
        
        Parameters:
        -----------
        telemetry_enabled : bool
            Whether to emit telemetry events (default: True)
        strict_mode : bool
            Whether to enforce all guardrails strictly (default: True)
            NOTE: Setting this to False is DANGEROUS and should only
                  be done in isolated test environments.
        
        Raises:
        -------
        ValueError
            If strict_mode=False in production environment
        """
        self.telemetry = Telemetry(enabled=telemetry_enabled)
        self.guardrails = Guardrails(strict=strict_mode)
        
        logger.info("MoScripts Orchestrator initialized (strict=%s)", strict_mode)
    
    def run_phase(
        self,
        phase_name: str,
        inputs: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute exactly one scientific phase with full validation.
        
        Execution Flow:
        ---------------
        1. Emit: phase.started
        2. Validate: inputs match contract
        3. Check: guardrails (refuse if violated)
        4. Execute: phase logic (isolated)
        5. Validate: outputs match contract (if requested)
        6. Emit: phase.completed OR phase.failed
        7. Return: execution result
        
        Parameters:
        -----------
        phase_name : str
            Name of phase to execute (e.g., 'phase1_ingest', 'phase3a_detect')
        inputs : Dict[str, Any]
            Phase inputs (must match contract)
        metadata : Dict[str, Any], optional
            Additional execution metadata
        
        Returns:
        --------
        Dict[str, Any]
            Execution result containing:
            - 'success': bool
            - 'phase': str
            - 'artifacts': Dict[str, Path]
            - 'metadata': Dict[str, Any]
            - 'telemetry': List[Dict]
        
        Raises:
        -------
        ContractViolationError
            If inputs or outputs don't match contract
        GuardrailViolationError
            If execution would violate a guardrail
        PhaseExecutionError
            If phase execution fails
        
        CRITICAL NOTES:
        ---------------
        1. This method NEVER interprets results
        2. This method NEVER decides if results are "good"
        3. This method ONLY reports what happened factually
        4. All decision-making happens in Intelligence Layer (System 2)
        """
        metadata = metadata or {}
        
        # STEP 1: Emit start telemetry (factual only)
        self.telemetry.emit('phase.started', {
            'phase': phase_name,
            'timestamp': self._get_timestamp()
        })
        
        try:
            # STEP 2: Validate inputs against contract
            contract = get_contract(phase_name)
            if contract:
                validate_contract(contract, inputs, is_input=True)
                self.telemetry.emit('contract.validated', {
                    'phase': phase_name,
                    'contract_type': 'input'
                })
            
            # STEP 3: Check guardrails (refuse if violated)
            guardrail_check = self.guardrails.check(phase_name, inputs, metadata)
            if not guardrail_check['allowed']:
                self.telemetry.emit('guardrail.violated', {
                    'phase': phase_name,
                    'violations': guardrail_check['violations'],
                    'reason': guardrail_check['reason']
                })
                
                # Format and raise error with clear report
                report = format_guardrail_report(guardrail_check['violations'])
                raise GuardrailViolationError(f"Guardrail violations:\n{report}")
            
            # STEP 4: Execute phase (isolated, no side effects allowed)
            result = self._execute_phase(phase_name, inputs, metadata)
            
            # STEP 5: Validate outputs (if contract exists)
            if contract:
                validate_contract(contract, result['artifacts'], is_input=False)
                self.telemetry.emit('contract.validated', {
                    'phase': phase_name,
                    'contract_type': 'output'
                })
            
            # STEP 6: Emit completion telemetry
            self.telemetry.emit('phase.completed', {
                'phase': phase_name,
                'artifacts': list(result['artifacts'].keys()),
                'execution_time_ms': result.get('execution_time_ms', 0)
            })
            
            # STEP 7: Return factual result (no interpretation)
            return {
                'success': True,
                'phase': phase_name,
                'artifacts': result['artifacts'],
                'metadata': result.get('metadata', {}),
                'telemetry': self.telemetry.get_events(phase_name)
            }
            
        except Exception as e:
            # Emit failure telemetry (factual, no blame assignment)
            self.telemetry.emit('phase.failed', {
                'phase': phase_name,
                'error_type': type(e).__name__,
                'error_message': str(e)
            })
            
            logger.error("Phase execution failed: %s - %s", phase_name, str(e))
            raise
    
    def get_telemetry(self, phase_name: Optional[str] = None) -> list:
        """
        Retrieve telemetry events (factual observations only).
        
        Parameters:
        -----------
        phase_name : str, optional
            Filter events by phase name. If None, return all events.
        
        Returns:
        --------
        List[Dict]
            Telemetry events (factual only, no interpretation)
        """
        return self.telemetry.get_events(phase_name)
    
    def list_available_phases(self) -> List[str]:
        """
        List all available phases with contracts.
        
        Returns:
        --------
        List[str]
            List of phase names that can be executed
        """
        return list(PHASE_CONTRACTS.keys())
    
    def _execute_phase(
        self,
        phase_name: str,
        inputs: Dict[str, Any],
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a specific phase implementation.
        
        This is a placeholder that would load and execute the actual
        phase implementation. For now, it creates mock outputs
        for testing the orchestrator structure.
        
        Parameters:
        -----------
        phase_name : str
            Name of phase to execute
        inputs : Dict[str, Any]
            Phase inputs
        metadata : Dict[str, Any]
            Execution metadata
        
        Returns:
        --------
        Dict[str, Any]
            Phase execution result
        """
        import time
        from pathlib import Path
        
        # For now, create mock outputs to test orchestrator
        # In real implementation, this would load and execute the actual phase
        
        if phase_name == 'phase1_ingest':
            # Mock ForecastCube output
            output_path = Path('/tmp/ForecastCube.zarr')
            return {
                'artifacts': {'ForecastCube': output_path},
                'metadata': {
                    'model': 'WeatherNext2',
                    'init_time': '2024-08-01T00:00:00Z',
                    'horizon_hrs': 120
                }
            }
        
        elif phase_name == 'phase2_features':
            # Mock FeatureCube output
            output_path = Path('/tmp/FeatureCube.zarr')
            return {
                'artifacts': {'FeatureCube': output_path},
                'metadata': {
                    'features': ['wind_speed', 'vorticity', 'pressure_gradient'],
                    'grid_shape': [180, 360],
                    'timesteps': 48
                }
            }
        
        elif phase_name == 'phase3a_detect':
            # Mock DetectedTracks output
            output_path = Path('/tmp/DetectedTracks.json')
            return {
                'artifacts': {'DetectedTracks': output_path},
                'metadata': {
                    'num_tracks': 5,
                    'detection_thresholds': {
                        'vorticity_percentile': 95,
                        'wind_percentile': 90
                    }
                }
            }
        
        elif phase_name == 'phase4_validate':
            # Mock ValidationMetrics output
            output_path = Path('/tmp/ValidationMetrics.json')
            return {
                'artifacts': {'ValidationMetrics': output_path},
                'metadata': {
                    'validation_period': '2024-08-01 to 2024-09-30',
                    'ibtracs_storms': 39,
                    'detected_storms': 25
                }
            }
        
        else:
            raise PhaseExecutionError(f"Unknown phase: {phase_name}")
    
    def _get_timestamp(self) -> str:
        """Get current timestamp (UTC, ISO 8601)."""
        from datetime import datetime
        return datetime.utcnow().isoformat() + 'Z'


# ============================================================================
# EXCEPTIONS (Explicit, Never Ambiguous)
# ============================================================================

class ContractViolationError(Exception):
    """Raised when phase inputs or outputs violate contract."""
    pass


class GuardrailViolationError(Exception):
    """Raised when execution would violate a safety guardrail."""
    pass


class PhaseExecutionError(Exception):
    """Raised when phase execution fails for any reason."""
    pass


# ============================================================================
# CRITICAL REMINDERS (FOR ANYONE WHO EDITS THIS FILE)
# ============================================================================

"""
⚠️  EDITING THIS FILE? READ THIS FIRST:

1. This file is BORING BY LAW
   - No clever shortcuts
   - No "helpful" defaults
   - No automatic behavior
   
2. This file NEVER interprets results
   - No severity assessment
   - No alert generation
   - No human-facing narratives
   
3. This file ONLY emits factual telemetry
   - phase.started
   - phase.completed
   - phase.failed
   - contract.validated
   - guardrail.violated
   
4. All intelligence belongs in System 2 (intelligence/)
   - Alert narration
   - Threat assessment
   - Decision support
   
5. If you add personality here, you break the architecture
   - No voice lines
   - No sass
   - No "magic"
   
6. This file protects human lives by being predictable
   - Boring = Trustworthy
   - Strict = Safe
   - Factual = Defensible

If you think you need to make this file "smarter", you probably need
to add functionality to System 2 (Intelligence Layer) instead.

Architecture Status: LOCKED
Authority Level: HIGHEST
Last Review: 2026-02-10
"""

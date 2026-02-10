"""
AFRO STORM - Scientific Orchestrator Package
============================================

SYSTEM 1: MoScripts Orchestrator

PURPOSE:
    Strict execution harness for scientific phases.
    No interpretation. No intelligence. No personality.
    
RESPONSIBILITIES:
    - Run exactly one phase at a time
    - Validate phase contracts
    - Enforce guardrails
    - Emit factual telemetry only
    
FORBIDDEN:
    ❌ Interpretation of results
    ❌ Decision making about severity/threats/alerts
    ❌ Personality or voice lines
    ❌ Auto-chaining phases
    ❌ Mock data generation
    ❌ Fallback logic
    
ALLOWED:
    ✅ Phase execution
    ✅ Contract validation
    ✅ Guardrail enforcement
    ✅ Telemetry emission (factual only)

Architecture Status: LOCKED
Last Modified: 2026-02-10
Authority Level: HIGHEST (Scientific Integrity)
"""

from .moscripts_orchestrator import MoScriptsOrchestrator
from .contracts import PhaseContract, validate_contract, get_contract, PHASE_CONTRACTS
from .telemetry import Telemetry
from .guardrails import Guardrails

__all__ = [
    'MoScriptsOrchestrator',
    'PhaseContract',
    'validate_contract',
    'get_contract',
    'PHASE_CONTRACTS',
    'Telemetry',
    'Guardrails',
]

__version__ = '1.0.0'
__status__ = 'LOCKED'

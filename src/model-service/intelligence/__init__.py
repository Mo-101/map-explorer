"""
Intelligence Layer - System 2 Analysis Mode
==========================================

PURPOSE:
    Translate validated artifacts into situational intelligence
    without prediction, authority, or alerts.
    
RESPONSIBILITIES:
    - Consume artifacts via Integration Shim (read-only)
    - Generate descriptive intelligence statements
    - Maintain analysis discipline (no predictions)
    - Provide situational context and historical analogs
    
FORBIDDEN:
    ❌ Emit alerts or warnings
    ❌ Assign severity, confidence, or probability
    ❌ Use future-tense causal language
    ❌ Trigger System 1 execution
    ❌ Write or modify artifacts
    
ALLOWED:
    ✅ Read-only artifact access via Integration Shim
    ✅ Historical pattern comparisons
    ✅ Descriptive intelligence statements
    ✅ Situational context and analogs
    ✅ Personality and clarity in language

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
Mode: ANALYSIS_ONLY
"""

from .contracts.analysis_contract import AnalysisContract, AnalysisResult
from .analysis_mode.base import AnalysisModule
from .dispatcher import AnalysisDispatcher

__all__ = [
    'AnalysisContract',
    'AnalysisResult', 
    'AnalysisModule',
    'AnalysisDispatcher',
]

__version__ = '1.0.0'
__status__ = 'ANALYSIS_MODE_ONLY'

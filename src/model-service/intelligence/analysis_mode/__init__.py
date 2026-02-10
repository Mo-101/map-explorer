"""
Analysis Mode - System 2 Intelligence Modules
============================================

PURPOSE:
    Implement analysis modules that translate artifacts into situational intelligence.
    Strict analysis mode only - no predictions, no authority, no alerts.
    
RESPONSIBILITIES:
    - Consume artifacts via Integration Shim
    - Generate descriptive intelligence statements
    - Maintain analysis discipline
    - Provide situational context
    
FORBIDDEN:
    ❌ Predictions or forecasts
    ❌ Severity or risk assessments
    ❌ Recommendations or actions
    ❌ Alert generation
    ❌ Future-tense language
    
ALLOWED:
    ✅ Descriptive statements
    ✅ Historical comparisons
    ✅ Pattern observations
    ✅ Contextual information
    ✅ Factual relationships

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
Mode: ANALYSIS_ONLY
"""

from .base import AnalysisModule

__all__ = [
    'AnalysisModule',
]

__version__ = '1.0.0'
__status__ = 'ANALYSIS_MODE_ONLY'

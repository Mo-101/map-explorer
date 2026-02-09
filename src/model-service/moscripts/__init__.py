"""
MoScripts Backend Package
======================

Event-driven intelligence modules for AFRO STORM backend with personality and sass.

Available MoScripts:
- mo_graphcast_detector: Weather anomaly detection with GraphCast
- mo_mostar_ai: Multi-Model AI (Azure + Gemini) with Mesh synthesis

Usage:
    from moscripts.mo_graphcast_detector import detect_weather_anomalies
    from moscripts.mo_mostar_ai import analyze_with_mostar
    
    # Use in FastAPI endpoints
    result = detect_weather_anomalies(weather_data)
    analysis = analyze_with_mostar(query, context)
"""

# Import main MoScripts for easy access
from moscripts.mo_graphcast_detector import (
    detect_weather_anomalies,
    graphcast_orchestrator,
    MoGraphCastDetector,
    MoCycloneDetector,
    MoFloodDetector,
    MoLandslideDetector
)

from moscripts.mo_mostar_ai import (
    analyze_with_mostar,
    mostar_ai,
    MoAzureSoul,
    MoGeminiMind,
    MoMeshSynthesizer
)

# Import base classes
from moscripts.moscript_base import MoScript, MoScriptOrchestrator

__all__ = [
    # GraphCast Detection
    'detect_weather_anomalies',
    'graphcast_orchestrator',
    'MoGraphCastDetector',
    'MoCycloneDetector',
    'MoFloodDetector',
    'MoLandslideDetector',
    
    # AI Analysis
    'analyze_with_mostar',
    'mostar_ai',
    'MoAzureSoul',
    'MoGeminiMind',
    'MoMeshSynthesizer',
    
    # Base Classes
    'MoScript',
    'MoScriptOrchestrator'
]

__version__ = "1.0.0"
__author__ = "MoScripts Team"
__description__ = "Event-driven intelligence modules for AFRO STORM"

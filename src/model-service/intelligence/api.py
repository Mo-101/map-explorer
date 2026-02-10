"""
Analysis API - Frontend Surface Endpoint
======================================

PURPOSE:
    Expose System 2 analysis outputs to frontend via read-only API.
    No new logic, no predictions, no authority.
    
RESPONSIBILITIES:
    - Serve analysis outputs exactly as produced
    - Maintain analysis mode discipline
    - Provide clean JSON interface
    - Enforce read-only access
    
FORBIDDEN:
    ❌ Modify analysis outputs
    ❌ Add predictions or authority
    ❌ Generate alerts or warnings
    ❌ Bypass Integration Shim
    
ALLOWED:
    ✅ Serve analysis outputs as-is
    ✅ Provide metadata and provenance
    ✅ Maintain analysis mode labeling
    ✅ Read-only access only

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
Mode: ANALYSIS_ONLY
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Import with error handling
try:
    from .dispatcher import AnalysisDispatcher
    from .contracts.analysis_contract import AnalysisContract
except ImportError:
    # Fallback for direct execution
    from dispatcher import AnalysisDispatcher
    from contracts.analysis_contract import AnalysisContract


class AnalysisAPI:
    """
    Frontend API for System 2 analysis outputs.
    
    This class provides a read-only interface to expose analysis
    results to the frontend without modifying or interpreting them.
    
    Design Principles:
    -----------------
    1. Read-only access only
    2. No modification of analysis outputs
    3. No prediction or authority
    4. Clean JSON interface
    5. Complete provenance
    
    Mental Model:
    -------------
    "Show exactly what System 2 produced, nothing more."
    """
    
    def __init__(self, dispatcher: AnalysisDispatcher):
        """
        Initialize analysis API.
        
        Parameters:
        -----------
        dispatcher : AnalysisDispatcher
            System 2 analysis dispatcher
        """
        self.dispatcher = dispatcher
        self.analysis_history: List[Dict[str, Any]] = []
        
        logger.info("AnalysisAPI initialized (read-only)")
    
    def get_latest_analysis(self) -> Dict[str, Any]:
        """
        Get latest analysis results for frontend.
        
        Returns:
        --------
        Dict[str, Any]
            Analysis results in frontend format
            
        CRITICAL:
        ---------
        This method returns analysis outputs EXACTLY as produced.
        No modification, no interpretation, no authority.
        """
        try:
            # Get latest analysis results from dispatcher
            # In production, this would query a database
            latest_results = self._get_latest_results()
            
            if not latest_results:
                return self._empty_response()
            
            # Format for frontend (no modification of content)
            response = {
                "mode": "analysis",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "artifacts_used": latest_results.get("source_artifacts", []),
                "analysis": self._format_analysis(latest_results),
                "metadata": {
                    "modules_active": self.dispatcher.get_module_status()["module_names"],
                    "system_mode": "analysis",
                    "provenance": "System 2 Analysis Mode"
                }
            }
            
            logger.info(f"Served analysis response: {len(response['analysis'])} statements")
            return response
            
        except Exception as e:
            logger.error(f"Failed to serve analysis: {e}")
            return self._error_response(str(e))
    
    def _get_latest_results(self) -> Optional[Dict[str, Any]]:
        """
        Get latest analysis results.
        
        In production, this would query a database for the latest
        analysis results. For now, we simulate with recent history.
        
        Returns:
        --------
        Optional[Dict[str, Any]]
            Latest analysis results or None
        """
        # In production, this would be:
        # return db.get_latest_analysis_results()
        
        # For now, return the most recent from history
        if self.analysis_history:
            return self.analysis_history[-1]
        
        return None
    
    def _format_analysis(self, results: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Format analysis results for frontend.
        
        Parameters:
        -----------
        results : Dict[str, Any]
            Analysis results from System 2
            
        Returns:
        --------
        List[Dict[str, Any]]
            Formatted analysis statements
            
        CRITICAL:
        ---------
        This method formats ONLY, does not modify content.
        No interpretation, no authority, no predictions.
        """
        formatted = []
        
        # Extract analysis statements
        statements = results.get("analysis_statements", [])
        tags = results.get("tags", [])
        module_name = results.get("module_name", "unknown")
        timestamp = results.get("analysis_timestamp", datetime.utcnow().isoformat())
        
        # Group statements by module
        module_statements = {
            module_name: statements
        }
        
        # Format each module's output
        for module, stmts in module_statements.items():
            formatted.append({
                "module": module,
                "text": stmts[0] if stmts else "No analysis available",
                "timestamp": timestamp,
                "tags": tags
            })
        
        return formatted
    
    def _empty_response(self) -> Dict[str, Any]:
        """
        Return empty analysis response.
        
        Returns:
        --------
        Dict[str, Any]
            Empty response with analysis mode label
        """
        return {
            "mode": "analysis",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "artifacts_used": [],
            "analysis": [
                {
                    "module": "system",
                    "text": "No analysis available at this time.",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "tags": ["no_data"]
                }
            ],
            "metadata": {
                "modules_active": self.dispatcher.get_module_status()["module_names"],
                "system_mode": "analysis",
                "provenance": "System 2 Analysis Mode"
            }
        }
    
    def _error_response(self, error_message: str) -> Dict[str, Any]:
        """
        Return error response.
        
        Parameters:
        -----------
        error_message : str
            Error message to include
            
        Returns:
        --------
        Dict[str, Any]
            Error response with analysis mode label
        """
        return {
            "mode": "analysis",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "artifacts_used": [],
            "analysis": [
                {
                    "module": "system",
                    "text": f"Analysis temporarily unavailable: {error_message}",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "tags": ["error"]
                }
            ],
            "metadata": {
                "modules_active": [],
                "system_mode": "analysis",
                "provenance": "System 2 Analysis Mode"
            }
        }
    
    def store_analysis_result(self, result):
        """
        Store analysis result for API access.
        
        Parameters:
        -----------
        result : AnalysisResult
            Analysis result to store
            
        CRITICAL:
        ---------
        This method stores results EXACTLY as produced.
        No modification, no interpretation.
        """
        try:
            # Convert to dictionary for storage
            result_dict = {
                "analysis_statements": result.analysis_statements,
                "tags": result.tags,
                "source_artifacts": result.source_artifacts,
                "analysis_timestamp": result.analysis_timestamp.isoformat(),
                "module_name": result.module_name
            }
            
            # Store in history (in production, use database)
            self.analysis_history.append(result_dict)
            
            # Keep only recent results (prevent memory growth)
            if len(self.analysis_history) > 100:
                self.analysis_history = self.analysis_history[-50:]
            
            logger.debug(f"Stored analysis result: {result.module_name}")
            
        except Exception as e:
            logger.error(f"Failed to store analysis result: {e}")
    
    def get_analysis_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent analysis history.
        
        Parameters:
        -----------
        limit : int
            Maximum number of results to return
            
        Returns:
        --------
        List[Dict[str, Any]]
            Recent analysis results
        """
        return self.analysis_history[-limit:] if self.analysis_history else []


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ANALYSIS API IS READ-ONLY.

This API serves analysis outputs ONLY.
It does NOT:
- Modify analysis content
- Add predictions or authority
- Generate alerts or warnings
- Interpret analysis results

If you want to:
- Modify analysis → System 2 (Analysis Layer)
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Add predictions → System 3 (Alerting Layer) - NOT YET IMPLEMENTED

This API just answers: "What did System 2 analyze?"

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
"""

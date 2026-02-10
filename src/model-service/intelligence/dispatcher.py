"""
Analysis Dispatcher - System 2 Event Handler
===========================================

PURPOSE:
    Subscribe to Integration Shim events and dispatch analysis modules.
    Coordinate System 2 analysis without violating boundaries.
    
RESPONSIBILITIES:
    - Subscribe to artifact availability events
    - Dispatch appropriate analysis modules
    - Enforce analysis mode constraints
    - Emit System 2 telemetry only
    
FORBIDDEN:
    ❌ Trigger System 1 execution
    ❌ Modify artifacts
    ❌ Generate alerts or warnings
    ❌ Bypass Integration Shim
    
ALLOWED:
    ✅ Subscribe to shim events
    ✅ Dispatch analysis modules
    ✅ Emit System 2 telemetry
    ✅ Coordinate analysis workflow

Architecture Status: LOCKED
Authority Level: LOW (Coordination Only)
Mode: ANALYSIS_ONLY
"""

from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Import with error handling
try:
    from .analysis_mode.base import AnalysisModule
    from .analysis_mode.d1_situational import SituationalAwarenessModule
    from .contracts.analysis_contract import AnalysisContract
except ImportError:
    # Fallback for direct execution
    from analysis_mode.base import AnalysisModule
    from analysis_mode.d1_situational import SituationalAwarenessModule
    from contracts.analysis_contract import AnalysisContract


class AnalysisDispatcher:
    """
    Dispatcher for System 2 analysis modules.
    
    This class coordinates analysis by subscribing to Integration Shim
    events and dispatching appropriate analysis modules.
    
    Design Principles:
    -----------------
    1. Read-only artifact access
    2. No System 1 interaction
    3. Analysis mode only
    4. Event-driven coordination
    5. Complete audit trail
    
    Mental Model:
    -------------
    "When new artifacts arrive, run appropriate analysis modules
    and emit descriptive intelligence."
    """
    
    def __init__(self, access_api, system_mode: str = 'analysis'):
        """
        Initialize analysis dispatcher.
        
        Parameters:
        -----------
        access_api : ArtifactAccessAPI
            Integration shim access API (read-only)
        system_mode : str
            Current system mode (must be 'analysis')
        """
        self.access_api = access_api
        self.system_mode = system_mode
        self.analysis_modules: List[AnalysisModule] = []
        self.active_analyses: Dict[str, Any] = {}
        
        # Initialize analysis modules
        self._initialize_modules()
        
        logger.info(f"AnalysisDispatcher initialized in {system_mode} mode")
    
    def _initialize_modules(self):
        """Initialize all available analysis modules."""
        try:
            # D1 - Situational Awareness
            d1_module = SituationalAwarenessModule(self.access_api)
            self.analysis_modules.append(d1_module)
            
            logger.info(f"Initialized {len(self.analysis_modules)} analysis modules")
            
        except Exception as e:
            logger.error(f"Failed to initialize analysis modules: {e}")
    
    def on_artifact_available(self, event: Dict[str, Any]):
        """
        Handle artifact availability event from Integration Shim.
        
        Expected event shape:
        {
            "type": "artifact.available",
            "timestamp": "2024-01-01T00:00:00Z",
            "payload": {
                "artifact_type": "DetectedTracks",
                "artifact_ref": "DetectedTracks_20240101_000000",
                "metadata": {...}
            }
        }
        
        Parameters:
        -----------
        event : Dict[str, Any]
            Artifact availability event
        """
        try:
            # Validate event structure
            if not self._validate_artifact_event(event):
                logger.warning("Invalid artifact event received")
                return
            
            # Check if analysis is allowed
            if not AnalysisContract.is_analysis_allowed(self.system_mode):
                logger.info(f"Analysis not active in mode: {self.system_mode}")
                return
            
            # Extract event data
            payload = event.get('payload', {})
            artifact_type = payload.get('artifact_type')
            artifact_ref = payload.get('artifact_ref')
            metadata = payload.get('metadata', {})
            
            logger.info(f"Artifact available for analysis: {artifact_type}")
            
            # Create analysis input
            analysis_input = self._create_analysis_input(artifact_ref, metadata)
            
            # Dispatch to appropriate modules
            self._dispatch_analysis(analysis_input)
            
        except Exception as e:
            logger.error(f"Failed to handle artifact event: {e}")
    
    def _validate_artifact_event(self, event: Dict[str, Any]) -> bool:
        """Validate artifact event structure."""
        required_fields = ['type', 'payload']
        for field in required_fields:
            if field not in event:
                return False
        
        if event['type'] != 'artifact.available':
            return False
        
        payload = event['payload']
        required_payload = ['artifact_type', 'artifact_ref', 'metadata']
        for field in required_payload:
            if field not in payload:
                return False
        
        return True
    
    def _create_analysis_input(self, artifact_ref: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Create analysis input from artifact metadata."""
        return {
            'artifact_ref': artifact_ref,
            'artifact_metadata': metadata,
            'context': {
                'timestamp': datetime.utcnow().isoformat(),
                'region': 'southern_africa',  # Default region
                'season': 'summer'  # Default season
            },
            'system_mode': self.system_mode
        }
    
    def _dispatch_analysis(self, analysis_input: Dict[str, Any]):
        """Dispatch analysis to appropriate modules."""
        artifact_metadata = analysis_input['artifact_metadata']
        artifact_ref = analysis_input['artifact_ref']
        
        # Find modules that can analyze this artifact
        capable_modules = [
            module for module in self.analysis_modules
            if module.can_analyze(artifact_metadata)
        ]
        
        if not capable_modules:
            logger.info(f"No analysis modules available for artifact: {artifact_ref}")
            return
        
        logger.info(f"Dispatching {artifact_ref} to {len(capable_modules)} modules")
        
        # Run analysis for each capable module
        for module in capable_modules:
            try:
                # Track active analysis
                analysis_id = f"{module.module_name}_{artifact_ref}"
                self.active_analyses[analysis_id] = {
                    'module': module.module_name,
                    'artifact': artifact_ref,
                    'started': datetime.utcnow()
                }
                
                # Run analysis
                result = module.run_analysis(analysis_input)
                
                if result:
                    logger.info(f"Analysis completed: {module.module_name} for {artifact_ref}")
                    
                    # Store result (in production, this would go to database)
                    self._store_analysis_result(result)
                else:
                    logger.warning(f"Analysis failed: {module.module_name} for {artifact_ref}")
                
                # Clean up tracking
                del self.active_analyses[analysis_id]
                
            except Exception as e:
                logger.error(f"Analysis error in {module.module_name}: {e}")
                
                # Clean up tracking
                analysis_id = f"{module.module_name}_{artifact_ref}"
                self.active_analyses.pop(analysis_id, None)
    
    def _store_analysis_result(self, result):
        """
        Store analysis result for later retrieval.
        
        In production, this would store to a database.
        For now, we just log the result.
        
        Parameters:
        -----------
        result : AnalysisResult
            Analysis result to store
        """
        # Log analysis result
        logger.info(f"Analysis result stored: {result.module_name}")
        logger.debug(f"Statements: {result.analysis_statements}")
        logger.debug(f"Tags: {result.tags}")
        
        # In production, store to database:
        # db.store_analysis_result(result)
    
    def get_active_analyses(self) -> List[Dict[str, Any]]:
        """
        Get list of currently active analyses.
        
        Returns:
        --------
        List[Dict[str, Any]]
            List of active analysis information
        """
        return [
            {
                'analysis_id': analysis_id,
                'module': info['module'],
                'artifact': info['artifact'],
                'started': info['started'].isoformat()
            }
            for analysis_id, info in self.active_analyses.items()
        ]
    
    def get_module_status(self) -> Dict[str, Any]:
        """
        Get status of all analysis modules.
        
        Returns:
        --------
        Dict[str, Any]
            Module status information
        """
        return {
            'total_modules': len(self.analysis_modules),
            'module_names': [module.module_name for module in self.analysis_modules],
            'system_mode': self.system_mode,
            'active_analyses': len(self.active_analyses)
        }
    
    def set_system_mode(self, mode: str):
        """
        Set system mode (must be 'analysis').
        
        Parameters:
        -----------
        mode : str
            New system mode
        """
        if mode != 'analysis':
            raise ValueError(f"System 2 only supports 'analysis' mode, got: {mode}")
        
        self.system_mode = mode
        logger.info(f"System mode set to: {mode}")


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ANALYSIS DISPATCHER IS NON-NEGOTIABLE.

This dispatcher coordinates analysis ONLY.
It does NOT:
- Trigger System 1 execution
- Modify artifacts
- Generate alerts or warnings
- Bypass Integration Shim

If you want to:
- Execute phases → System 1 (Execution Layer)
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Modify artifacts → System 1 (Execution Layer)

This dispatcher just coordinates: "Run analysis on new artifacts."

Architecture Status: LOCKED
Authority Level: LOW (Coordination Only)
"""

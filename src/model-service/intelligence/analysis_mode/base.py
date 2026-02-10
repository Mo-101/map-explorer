"""
Base Analysis Module - System 2 Interface
=========================================

PURPOSE:
    Define the base interface for all System 2 analysis modules.
    Enforce analysis discipline and provide common functionality.
    
RESPONSIBILITIES:
    - Define standard analysis module interface
    - Provide common artifact access patterns
    - Enforce analysis mode constraints
    - Handle telemetry emission for analysis
    
FORBIDDEN:
    ❌ Direct artifact modification
    ❌ System 1 execution triggers
    ❌ Predictions or authority
    ❌ Alert generation
    
ALLOWED:
    ✅ Read-only artifact access
    ✅ Descriptive analysis
    ✅ Historical comparisons
    ✅ Contextual information

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
Mode: ANALYSIS_ONLY
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

# Import contracts with error handling
try:
    from ..contracts.analysis_contract import AnalysisInput, AnalysisResult, AnalysisContract
except ImportError:
    # Fallback for direct execution
    from contracts.analysis_contract import AnalysisInput, AnalysisResult, AnalysisContract


class AnalysisModule(ABC):
    """
    Base class for all System 2 analysis modules.
    
    This class defines the interface that all analysis modules must implement.
    It enforces analysis discipline and provides common functionality.
    
    Design Principles:
    -----------------
    1. Read-only artifact access
    2. No side effects
    3. Analysis mode only
    4. Descriptive intelligence
    5. Complete audit trail
    
    Mental Model:
    -------------
    "This looks like X, based on Y, which mattered historically because Z."
    """
    
    def __init__(self, module_name: str, access_api):
        """
        Initialize analysis module.
        
        Parameters:
        -----------
        module_name : str
            Name of the analysis module (for audit)
        access_api : ArtifactAccessAPI
            Integration shim access API (read-only)
        """
        self.module_name = module_name
        self.access_api = access_api
        
        logger.info(f"AnalysisModule initialized: {module_name}")
    
    @abstractmethod
    def can_analyze(self, artifact_metadata: Dict[str, Any]) -> bool:
        """
        Check if this module can analyze the given artifact.
        
        Parameters:
        -----------
        artifact_metadata : Dict[str, Any]
            Artifact metadata from Integration Shim
            
        Returns:
        --------
        bool
            True if module can analyze this artifact
        """
        pass
    
    @abstractmethod
    def analyze(self, analysis_input: AnalysisInput) -> AnalysisResult:
        """
        Analyze artifact and generate descriptive intelligence.
        
        Parameters:
        -----------
        analysis_input : AnalysisInput
            Validated analysis input contract
            
        Returns:
        --------
        AnalysisResult
            Analysis result contract (validated)
            
        Raises:
        -------
        ValueError
            If analysis violates contract constraints
        """
        pass
    
    def get_artifact_content(self, artifact_ref: str) -> Optional[Dict[str, Any]]:
        """
        Get artifact content via Integration Shim.
        
        Parameters:
        -----------
        artifact_ref : str
            Reference to artifact
            
        Returns:
        --------
        Optional[Dict[str, Any]]
            Artifact content or None if not found
            
        CRITICAL:
        ---------
        This method uses the Integration Shim ONLY.
        No direct file system access.
        """
        try:
            # Get artifact path from Integration Shim
            artifact_path = self.access_api.get_artifact_path(
                artifact_ref, 
                f"analysis.{self.module_name}"
            )
            
            if not artifact_path:
                logger.warning(f"Artifact not found: {artifact_ref}")
                return None
            
            # Load artifact content (read-only)
            import json
            from pathlib import Path
            
            artifact_file = Path(artifact_path)
            if not artifact_file.exists():
                logger.warning(f"Artifact file not found: {artifact_path}")
                return None
            
            with open(artifact_file, 'r') as f:
                content = json.load(f)
            
            logger.debug(f"Loaded artifact content: {artifact_ref}")
            return content
            
        except Exception as e:
            logger.error(f"Failed to load artifact {artifact_ref}: {e}")
            return None
    
    def validate_analysis_context(self, context: Dict[str, Any]) -> bool:
        """
        Validate analysis context for completeness.
        
        Parameters:
        -----------
        context : Dict[str, Any]
            Analysis context
            
        Returns:
        --------
        bool
            True if context is valid for analysis
        """
        required_context = ['timestamp', 'region', 'season']
        
        for field in required_context:
            if field not in context:
                logger.warning(f"Missing context field: {field}")
                return False
        
        return True
    
    def emit_analysis_telemetry(self, analysis_result: AnalysisResult):
        """
        Emit telemetry for analysis completion.
        
        Parameters:
        -----------
        analysis_result : AnalysisResult
            Analysis result to emit telemetry for
            
        CRITICAL:
        ---------
        This emits System 2 telemetry ONLY.
        No System 1 events are generated.
        """
        try:
            # Import telemetry with error handling
            try:
                from ..orchestrator.telemetry import Telemetry
            except ImportError:
                from orchestrator.telemetry import Telemetry
            
            telemetry = Telemetry(enabled=True)
            
            # Emit analysis completion event
            telemetry.emit('analysis.completed', {
                'module': analysis_result.module_name,
                'statements_count': len(analysis_result.analysis_statements),
                'source_artifacts': analysis_result.source_artifacts,
                'analysis_timestamp': analysis_result.analysis_timestamp.isoformat()
            })
            
            logger.info(f"Analysis telemetry emitted: {self.module_name}")
            
        except Exception as e:
            logger.warning(f"Failed to emit analysis telemetry: {e}")
    
    def run_analysis(self, raw_input: Dict[str, Any]) -> Optional[AnalysisResult]:
        """
        Run complete analysis with validation.
        
        Parameters:
        -----------
        raw_input : Dict[str, Any]
            Raw input data to analyze
            
        Returns:
        --------
        Optional[AnalysisResult]
            Validated analysis result or None if failed
            
        CRITICAL:
        ---------
        This method enforces all contracts and constraints.
        No analysis proceeds without validation.
        """
        try:
            # Validate input contract
            analysis_input = AnalysisContract.validate_input(raw_input)
            
            # Check if analysis is allowed
            if not AnalysisContract.is_analysis_allowed(analysis_input.system_mode):
                logger.warning(f"Analysis not allowed in mode: {analysis_input.system_mode}")
                return None
            
            # Check if this module can analyze the artifact
            if not self.can_analyze(analysis_input.artifact_metadata):
                logger.info(f"Module {self.module_name} cannot analyze this artifact")
                return None
            
            # Validate analysis context
            if not self.validate_analysis_context(analysis_input.context):
                logger.warning("Invalid analysis context")
                return None
            
            # Run analysis
            logger.info(f"Running analysis: {self.module_name}")
            analysis_result = self.analyze(analysis_input)
            
            # Emit telemetry
            self.emit_analysis_telemetry(analysis_result)
            
            logger.info(f"Analysis completed: {self.module_name}")
            return analysis_result
            
        except Exception as e:
            logger.error(f"Analysis failed: {self.module_name} - {e}")
            return None


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ANALYSIS MODULE BASE IS NON-NEGOTIABLE.

This base class enforces analysis discipline.
It does NOT:
- Allow direct artifact modification
- Permit System 1 execution triggers
- Enable predictions or authority
- Support alert generation

If you want to:
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Make predictions → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Execute phases → System 1 (Execution Layer)

This base class just ensures: "Analysis stays analysis."

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
"""

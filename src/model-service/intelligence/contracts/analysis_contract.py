"""
Analysis Contract - System 2 Input/Output Constraints
====================================================

PURPOSE:
    Define strict contracts for System 2 analysis modules.
    Enforce analysis discipline and prevent authority drift.
    
RESPONSIBILITIES:
    - Define allowed input/output schemas
    - Enforce language constraints
    - Prevent prediction and authority
    - Validate analysis compliance
    
FORBIDDEN:
    ❌ Probability or confidence scores
    ❌ Severity or risk assessments
    ❌ Future-tense predictions
    ❌ Recommendations or actions
    ❌ Alert generation
    
ALLOWED:
    ✅ Descriptive statements
    ✅ Historical comparisons
    ✅ Pattern observations
    ✅ Contextual information
    ✅ Factual relationships

Architecture Status: LOCKED
Authority Level: LOW (Contract Enforcement)
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnalysisInput:
    """
    Input contract for System 2 analysis modules.
    
    This is the ONLY allowed input format for analysis.
    All modules must accept this exact structure.
    
    Attributes:
    ----------
    artifact_ref : str
        Reference to artifact (from Integration Shim)
    artifact_metadata : Dict[str, Any]
        Metadata from Integration Shim (read-only)
    context : Dict[str, Any]
        Analysis context (time, region, season)
    system_mode : str
        Must be 'analysis' (enforced)
    
    CRITICAL:
    ---------
    This input contract is read-only.
    Analysis modules cannot modify artifacts.
    """
    artifact_ref: str
    artifact_metadata: Dict[str, Any]
    context: Dict[str, Any]
    system_mode: str = 'analysis'
    
    def __post_init__(self):
        """Validate input contract compliance."""
        if self.system_mode != 'analysis':
            raise ValueError(
                f"Invalid system mode: {self.system_mode}. "
                f"System 2 only supports 'analysis' mode."
            )
        
        # Validate required fields
        required_fields = ['artifact_ref', 'artifact_metadata', 'context']
        for field in required_fields:
            if not getattr(self, field):
                raise ValueError(f"Missing required field: {field}")


@dataclass(frozen=True)
class AnalysisResult:
    """
    Output contract for System 2 analysis modules.
    
    This is the ONLY allowed output format for analysis.
    All modules must return this exact structure.
    
    Attributes:
    ----------
    analysis_statements : List[str]
        Descriptive intelligence statements (no predictions)
    tags : List[str]
        Non-evaluative tags for categorization
    source_artifacts : List[str]
        Artifacts used in analysis (for audit)
    analysis_timestamp : datetime
        When analysis was performed
    module_name : str
        Which analysis module produced this
    
    CRITICAL:
    ---------
    This output contract is strictly constrained.
    No predictions, no severity, no recommendations.
    """
    analysis_statements: List[str]
    tags: List[str]
    source_artifacts: List[str]
    analysis_timestamp: datetime
    module_name: str
    
    def __post_init__(self):
        """Validate output contract compliance."""
        # Validate analysis statements for forbidden content
        self._validate_statements()
        
        # Validate tags for evaluative content
        self._validate_tags()
        
        # Validate required fields
        if not self.analysis_statements:
            raise ValueError("Analysis must produce at least one statement")
        
        if not self.source_artifacts:
            raise ValueError("Analysis must reference source artifacts")
    
    def _validate_statements(self):
        """Validate analysis statements for forbidden content."""
        forbidden_patterns = [
            r'\bwill\b',           # Future tense
            r'\bexpected\b',        # Prediction
            r'\blikely\b',          # Probability
            r'\brisk\b',            # Risk assessment
            r'\bsevere\b',          # Severity
            r'\bcritical\b',        # Severity
            r'\bshould\b',          # Recommendation
            r'\bmust\b',            # Recommendation
            r'\bevacuat',           # Action recommendation
            r'\bwarning\b',         # Alert language
            r'\balert\b',           # Alert language
            r'\bconfidence\b',      # Confidence score
            r'\bprobability\b',     # Probability
        ]
        
        for statement in self.analysis_statements:
            for pattern in forbidden_patterns:
                if re.search(pattern, statement, re.IGNORECASE):
                    raise ValueError(
                        f"Forbidden content in analysis statement: '{statement}'. "
                        f"Pattern '{pattern}' is not allowed in analysis mode."
                    )
    
    def _validate_tags(self):
        """Validate tags for evaluative content."""
        forbidden_tags = [
            'severe', 'critical', 'high', 'medium', 'low',
            'urgent', 'emergency', 'warning', 'alert',
            'risk', 'danger', 'safe', 'normal'
        ]
        
        for tag in self.tags:
            if tag.lower() in forbidden_tags:
                raise ValueError(
                    f"Forbidden tag: '{tag}'. "
                    f"Evaluative tags are not allowed in analysis mode."
                )


class AnalysisContract:
    """
    Contract enforcement for System 2 analysis modules.
    
    This class validates that all analysis modules comply
    with the strict constraints of analysis mode.
    
    Design Principles:
    -----------------
    1. No prediction or authority
    2. No severity or risk assessment
    3. No recommendations or actions
    4. Only descriptive intelligence
    5. Complete audit trail
    """
    
    @staticmethod
    def validate_input(input_data: Dict[str, Any]) -> AnalysisInput:
        """
        Validate and create AnalysisInput from raw data.
        
        Parameters:
        -----------
        input_data : Dict[str, Any]
            Raw input data to validate
            
        Returns:
        --------
        AnalysisInput
            Validated input contract
            
        Raises:
        -------
        ValueError
            If input violates contract constraints
        """
        try:
            return AnalysisInput(**input_data)
        except TypeError as e:
            raise ValueError(f"Invalid input structure: {e}")
        except ValueError as e:
            raise ValueError(f"Input contract violation: {e}")
    
    @staticmethod
    def validate_output(
        analysis_statements: List[str],
        tags: List[str],
        source_artifacts: List[str],
        module_name: str
    ) -> AnalysisResult:
        """
        Validate and create AnalysisResult from analysis output.
        
        Parameters:
        -----------
        analysis_statements : List[str]
            Analysis statements to validate
        tags : List[str]
            Tags to validate
        source_artifacts : List[str]
            Source artifacts to reference
        module_name : str
            Name of analysis module
            
        Returns:
        --------
        AnalysisResult
            Validated output contract
            
        Raises:
        -------
        ValueError
            If output violates contract constraints
        """
        try:
            return AnalysisResult(
                analysis_statements=analysis_statements,
                tags=tags,
                source_artifacts=source_artifacts,
                analysis_timestamp=datetime.utcnow(),
                module_name=module_name
            )
        except ValueError as e:
            raise ValueError(f"Output contract violation: {e}")
    
    @staticmethod
    def is_analysis_allowed(system_mode: str) -> bool:
        """
        Check if analysis is allowed in current system mode.
        
        Parameters:
        -----------
        system_mode : str
            Current system mode
            
        Returns:
        --------
        bool
            True if analysis is allowed, False otherwise
        """
        return system_mode == 'analysis'
    
    @staticmethod
    def validate_language_compliance(text: str) -> bool:
        """
        Validate text for analysis mode compliance.
        
        Parameters:
        -----------
        text : str
            Text to validate
            
        Returns:
        --------
        bool
            True if compliant, False otherwise
        """
        forbidden_patterns = [
            r'\bwill\b',
            r'\bexpected\b',
            r'\blikely\b',
            r'\brisk\b',
            r'\bsevere\b',
            r'\bcritical\b',
            r'\bshould\b',
            r'\bmust\b',
            r'\bevacuat',
            r'\bwarning\b',
            r'\balert\b',
            r'\bconfidence\b',
            r'\bprobability\b',
        ]
        
        for pattern in forbidden_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return False
        
        return True


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ANALYSIS CONTRACT IS NON-NEGOTIABLE.

This contract enforces analysis discipline.
It does NOT:
- Allow predictions or authority
- Permit severity or risk assessment
- Enable recommendations or actions
- Support alert generation

If you want to:
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Make predictions → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Assign severity → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Provide recommendations → System 3 (Alerting Layer) - NOT YET IMPLEMENTED

This contract just ensures: "Analysis stays analysis."

Architecture Status: LOCKED
Authority Level: LOW (Contract Enforcement)
"""

"""
D1 - Situational Awareness Analysis Module
=========================================

PURPOSE:
    Provide situational awareness by describing current conditions
    without prediction, authority, or alerts.
    
RESPONSIBILITIES:
    - Describe current artifact conditions
    - Add temporal and spatial context
    - Provide factual observations only
    - Maintain analysis discipline
    
FORBIDDEN:
    ❌ Predictions about future conditions
    ❌ Severity or risk assessments
    ❌ Recommendations or actions
    ❌ Alert generation
    
ALLOWED:
    ✅ Descriptive statements about current state
    ✅ Temporal and spatial context
    ✅ Factual observations
    ✅ Historical comparisons (factual only)

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
Mode: ANALYSIS_ONLY
"""

from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Import base and contracts with error handling
try:
    from .base import AnalysisModule
    from ..contracts.analysis_contract import AnalysisInput, AnalysisResult, AnalysisContract
except ImportError:
    # Fallback for direct execution
    from base import AnalysisModule
    from contracts.analysis_contract import AnalysisInput, AnalysisResult, AnalysisContract


class SituationalAwarenessModule(AnalysisModule):
    """
    Situational Awareness Analysis Module (D1).
    
    This module provides descriptive intelligence about current conditions
    without making predictions or issuing alerts.
    
    Mental Model:
    -------------
    "Current conditions are X, which is Y compared to historical patterns."
    
    Examples (allowed):
    - "Rainfall accumulation over the past 72 hours exceeds the historical median for February."
    - "Surface pressure patterns indicate a broad low-pressure area rather than a compact circulation."
    
    Examples (forbidden):
    - "Flooding is likely." ❌
    - "Conditions will worsen." ❌
    - "Evacuation may be required." ❌
    """
    
    def __init__(self, access_api):
        """Initialize situational awareness module."""
        super().__init__("d1_situational", access_api)
        self.supported_artifacts = [
            'DetectedTracks',
            'ForecastCube',
            'FeatureCube',
            'AccumulationGrid'
        ]
    
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
        artifact_type = artifact_metadata.get('artifact_type')
        return artifact_type in self.supported_artifacts
    
    def analyze(self, analysis_input: AnalysisInput) -> AnalysisResult:
        """
        Analyze artifact for situational awareness.
        
        Parameters:
        -----------
        analysis_input : AnalysisInput
            Validated analysis input contract
            
        Returns:
        --------
        AnalysisResult
            Analysis result contract (validated)
        """
        artifact_type = analysis_input.artifact_metadata.get('artifact_type')
        context = analysis_input.context
        
        logger.info(f"Analyzing {artifact_type} for situational awareness")
        
        # Get artifact content
        content = self.get_artifact_content(analysis_input.artifact_ref)
        if not content:
            raise ValueError(f"Cannot load artifact content: {analysis_input.artifact_ref}")
        
        # Generate analysis statements based on artifact type
        if artifact_type == 'DetectedTracks':
            statements = self._analyze_tracks(content, context)
        elif artifact_type == 'ForecastCube':
            statements = self._analyze_forecast(content, context)
        elif artifact_type == 'FeatureCube':
            statements = self._analyze_features(content, context)
        elif artifact_type == 'AccumulationGrid':
            statements = self._analyze_accumulation(content, context)
        else:
            statements = [f"Artifact type {artifact_type} detected with situational data available."]
        
        # Generate tags
        tags = self._generate_tags(artifact_type, content, context)
        
        # Create analysis result
        return AnalysisContract.validate_output(
            analysis_statements=statements,
            tags=tags,
            source_artifacts=[analysis_input.artifact_ref],
            module_name=self.module_name
        )
    
    def _analyze_tracks(self, content: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
        """Analyze detected tracks for situational awareness."""
        statements = []
        
        # Extract track information
        tracks = content.get('tracks', [])
        if not tracks:
            statements.append("No detected tracks present in current analysis window.")
            return statements
        
        # Count tracks
        track_count = len(tracks)
        statements.append(f"Current analysis shows {track_count} detected track(s) present.")
        
        # Analyze track characteristics
        if track_count > 0:
            # Get general track information
            first_track = tracks[0]
            if 'intensity' in first_track:
                max_intensity = max(track.get('intensity', 0) for track in tracks)
                statements.append(f"Maximum detected intensity among tracks is {max_intensity}.")
            
            # Location context
            if 'latitude' in first_track and 'longitude' in first_track:
                lats = [track.get('latitude', 0) for track in tracks]
                lons = [track.get('longitude', 0) for track in tracks]
                
                lat_range = max(lats) - min(lats)
                lon_range = max(lons) - min(lons)
                
                statements.append(f"Tracks are distributed over approximately {lat_range:.1f}° latitude and {lon_range:.1f}° longitude.")
        
        return statements
    
    def _analyze_forecast(self, content: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
        """Analyze forecast cube for situational awareness."""
        statements = []
        
        # Extract forecast information
        variables = content.get('variables', [])
        if not variables:
            statements.append("Forecast cube contains no variable data for situational analysis.")
            return statements
        
        # Analyze key variables
        for var in variables:
            var_name = var.get('name', 'unknown')
            var_data = var.get('data', [])
            
            if var_data:
                mean_value = sum(var_data) / len(var_data)
                max_value = max(var_data)
                min_value = min(var_data)
                
                statements.append(f"{var_name} shows mean value of {mean_value:.2f}, ranging from {min_value:.2f} to {max_value:.2f}.")
        
        # Time context
        time_steps = content.get('time_steps', 0)
        if time_steps > 0:
            statements.append(f"Forecast covers {time_steps} time steps for situational assessment.")
        
        return statements
    
    def _analyze_features(self, content: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
        """Analyze feature cube for situational awareness."""
        statements = []
        
        # Extract feature information
        features = content.get('features', [])
        if not features:
            statements.append("Feature cube contains no extracted features for situational analysis.")
            return statements
        
        # Analyze feature statistics
        for feature in features:
            feature_name = feature.get('name', 'unknown')
            feature_values = feature.get('values', [])
            
            if feature_values:
                mean_val = sum(feature_values) / len(feature_values)
                max_val = max(feature_values)
                min_val = min(feature_values)
                
                statements.append(f"Feature '{feature_name}' has mean value {mean_val:.3f} with range [{min_val:.3f}, {max_val:.3f}].")
        
        return statements
    
    def _analyze_accumulation(self, content: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
        """Analyze accumulation grid for situational awareness."""
        statements = []
        
        # Extract accumulation information
        accumulation_data = content.get('accumulation', [])
        if not accumulation_data:
            statements.append("No accumulation data available for situational analysis.")
            return statements
        
        # Calculate accumulation statistics
        total_accumulation = sum(accumulation_data)
        max_accumulation = max(accumulation_data)
        mean_accumulation = total_accumulation / len(accumulation_data)
        
        statements.append(f"Total accumulated precipitation is {total_accumulation:.1f} mm.")
        statements.append(f"Maximum accumulation at any point is {max_accumulation:.1f} mm.")
        statements.append(f"Mean accumulation across the region is {mean_accumulation:.1f} mm.")
        
        # Spatial context
        region = context.get('region', 'unknown')
        statements.append(f"Accumulation analysis covers the {region} region.")
        
        return statements
    
    def _generate_tags(self, artifact_type: str, content: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
        """Generate non-evaluative tags for analysis."""
        tags = [artifact_type.lower()]
        
        # Add temporal context
        timestamp = context.get('timestamp')
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                tags.append(dt.strftime('%Y%m%d'))
                tags.append(dt.strftime('%B').lower())
            except:
                pass
        
        # Add spatial context
        region = context.get('region')
        if region:
            tags.append(region.lower().replace(' ', '_'))
        
        # Add data-specific tags
        if artifact_type == 'DetectedTracks':
            tracks = content.get('tracks', [])
            if tracks:
                tags.append('tracks_present')
        elif artifact_type == 'AccumulationGrid':
            accumulation = content.get('accumulation', [])
            if accumulation and max(accumulation) > 50:
                tags.append('high_accumulation')
        
        return tags


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
SITUATIONAL AWARENESS MODULE IS NON-NEGOTIABLE.

This module provides descriptive intelligence ONLY.
It does NOT:
- Make predictions about future conditions
- Assess severity or risk
- Provide recommendations
- Generate alerts

If you want to:
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Make predictions → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Assess risk → System 3 (Alerting Layer) - NOT YET IMPLEMENTED

This module just answers: "What are the current conditions?"

Architecture Status: LOCKED
Authority Level: LOW (Analysis Only)
"""

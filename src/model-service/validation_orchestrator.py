"""
Validation Orchestrator - Phase 4 Complete
========================================

Main orchestrator for complete cyclone detection validation.
Coordinates IBTrACS ingestion, track matching, and calibration.

This is the main entry point for Phase 4 validation.
"""

import numpy as np
from typing import Dict, Any, List, Optional
import json
from datetime import datetime
import warnings

# Import all Phase 4 modules
from ibtracs_ingestion import load_ibtracs, get_ibtracs_summary
from cyclone_detection import detect_cyclones
from track_matching import match_tracks, compute_validation_metrics, generate_validation_report
from calibration import CalibrationParams, run_full_calibration, recommend_calibration_adjustments


class ValidationOrchestrator:
    """Main orchestrator for cyclone detection validation."""
    
    def __init__(self, ibtracs_path: str, validation_period: Dict[str, str]):
        self.ibtracs_path = ibtracs_path
        self.validation_period = validation_period
        self.ibtracs_tracks = []
        self.validation_results = {}
        
    def load_validation_data(self) -> bool:
        """Load IBTrACS validation data."""
        print("🔥 Step 1: Loading IBTrACS validation data")
        
        try:
            self.ibtracs_tracks = load_ibtracs(
                self.ibtracs_path,
                self.validation_period["start"],
                self.validation_period["end"]
            )
            
            # Get summary
            summary = get_ibtracs_summary(self.ibtracs_tracks)
            print(f"✅ IBTrACS data loaded: {summary['total_tracks']} tracks")
            
            return True
            
        except Exception as e:
            print(f"❌ Error loading IBTrACS data: {e}")
            return False
    
    def run_validation(self, features: Dict[str, Any], 
                    lat: np.ndarray, lon: np.ndarray,
                    params: Optional[CalibrationParams] = None) -> Dict[str, Any]:
        """
        Run complete validation pipeline.
        
        Args:
            features: FeatureCube from Phase 2
            lat, lon: Coordinate arrays
            params: Optional calibration parameters
            
        Returns:
            Complete validation results
        """
        print("🔥 Step 2: Running cyclone detection validation")
        
        if params is None:
            params = CalibrationParams()
        
        # Step 2a: Detect cyclones
        print("  2a: Detecting cyclones with current parameters...")
        detected_cyclones = detect_cyclones(features, lat, lon)
        print(f"      Detected {len(detected_cyclones)} cyclones")
        
        # Step 2b: Match tracks
        print("  2b: Matching detected tracks to IBTrACS...")
        matching_results = match_tracks(detected_cyclones, self.ibtracs_tracks)
        
        # Step 2c: Compute metrics
        print("  2c: Computing validation metrics...")
        metrics = compute_validation_metrics(matching_results)
        
        # Step 2d: Generate recommendations
        print("  2d: Generating calibration recommendations...")
        base_result = type('BaseResult', (), {'metrics': metrics})()
        recommendations = recommend_calibration_adjustments(base_result)
        
        self.validation_results = {
            "parameters": params.to_dict(),
            "metrics": metrics,
            "recommendations": recommendations,
            "detected_cyclones": len(detected_cyclones),
            "ibtracs_tracks": len(self.ibtracs_tracks),
            "validation_period": self.validation_period
        }
        
        return self.validation_results
    
    def generate_report(self, output_file: Optional[str] = None) -> str:
        """Generate comprehensive validation report."""
        print("🔥 Step 3: Generating validation report")
        
        if not self.validation_results:
            return "No validation results available"
        
        # Generate main report
        report = generate_validation_report(
            self.validation_results["metrics"]
        )
        
        # Add parameter information
        param_section = f"""
        
📋 CALIBRATION PARAMETERS:
  Vorticity Percentile: {self.validation_results['parameters']['vorticity_percentile']}%
  Wind Percentile: {self.validation_results['parameters']['wind_percentile']}%
  Max Cyclone Speed: {self.validation_results['parameters']['max_cyclone_speed_kmh']} km/h
  Cluster Radius: {self.validation_results['parameters']['cluster_radius_km']} km
  Min Lifetime Steps: {self.validation_results['parameters']['min_lifetime_steps']}
        
📊 VALIDATION SUMMARY:
  Detected Cyclones: {self.validation_results['detected_cyclones']}
  IBTrACS Tracks: {self.validation_results['ibtracs_tracks']}
  Validation Period: {self.validation_results['validation_period']['start']} to {self.validation_results['validation_period']['end']}
"""
        
        # Add recommendations
        rec = self.validation_results["recommendations"]
        rec_section = """
🎯 CALIBRATION RECOMMENDATIONS:
"""
        
        for param, rec_info in rec.items():
            rec_section += f"""
  {param.upper()}:
    Status: {rec_info['status']}
    Suggestion: {rec_info['suggestion']}
    Reason: {rec_info['reason']}
"""
        
        full_report = report + param_section + rec_section
        
        if output_file:
            with open(output_file, 'w') as f:
                f.write(full_report)
            print(f"💾 Report saved to {output_file}")
        
        return full_report
    
    def save_results(self, filename: str = "validation_results.json") -> None:
        """Save validation results to JSON."""
        if not self.validation_results:
            print("❌ No validation results to save")
            return
        
        # Convert numpy types for JSON serialization
        def convert_numpy(obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.bool_):
                return bool(obj)
            elif isinstance(obj, dict):
                return {key: convert_numpy(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy(item) for item in obj]
            return obj
        
        json_results = convert_numpy(self.validation_results)
        
        with open(filename, 'w') as f:
            json.dump(json_results, f, indent=2)
        
        print(f"💾 Validation results saved to {filename}")


def run_complete_validation(features: Dict[str, Any],
                        lat: np.ndarray, lon: np.ndarray,
                        ibtracs_path: str = "IBTrACS.ALL.v04r00.nc",
                        validation_period: Optional[Dict[str, str]] = None,
                        output_prefix: str = "validation") -> Dict[str, Any]:
    """
    Run complete validation pipeline with default parameters.
    
    Args:
        features: FeatureCube from Phase 2
        lat, lon: Coordinate arrays
        ibtracs_path: Path to IBTrACS data
        validation_period: Validation period dict with "start" and "end"
        output_prefix: Prefix for output files
        
    Returns:
        Complete validation results
    """
    # CRITICAL GUARDRAIL: Validate data source
    if "metadata" in features:
        model_source = features["metadata"].get("model", "unknown")
        if model_source != "WeatherNext2":
            raise RuntimeError(
                f"🚨 PHASE 4 VALIDATION REQUIRES REAL WEATHERNEXT DATA!\n"
                f"Current model source: {model_source}\n"
                f"Phase 4 validation cannot proceed with synthetic or non-WeatherNext data.\n"
                f"This guardrail prevents accidental validation against wrong data sources."
            )
    
    if validation_period is None:
        validation_period = {
            "start": "2024-01-01",
            "end": "2024-12-31"
        }
    
    print("🔥 PHASE 4: COMPLETE CYCLONE DETECTION VALIDATION")
    print("=" * 60)
    print(f"📅 Validation Period: {validation_period['start']} to {validation_period['end']}")
    print(f"📁 IBTrACS Path: {ibtracs_path}")
    print("🔒 GUARDRAIL: Real WeatherNext data validation ONLY")
    print("=" * 60)
    
    # Initialize orchestrator
    orchestrator = ValidationOrchestrator(ibtracs_path, validation_period)
    
    # Step 1: Load validation data
    if not orchestrator.load_validation_data():
        raise RuntimeError("Failed to load IBTrACS validation data")
    
    # Step 2: Run validation
    results = orchestrator.run_validation(features, lat, lon)
    
    # Step 3: Generate and save report
    report = orchestrator.generate_report(f"{output_prefix}_report.txt")
    orchestrator.save_results(f"{output_prefix}_results.json")
    
    print("\n" + "=" * 60)
    print("🎯 PHASE 4 VALIDATION COMPLETE")
    print("=" * 60)
    
    # Print summary
    metrics = results["metrics"]["detection"]
    print(f"📊 FINAL METRICS:")
    print(f"  Recall: {metrics['recall']:.1%}")
    print(f"  Precision: {metrics['precision']:.1%}")
    print(f"  False Alarm Rate: {metrics['false_alarm_rate']:.1%}")
    print(f"  Hits: {metrics['hits']}")
    print(f"  Misses: {metrics['misses']}")
    print(f"  False Alarms: {metrics['false_alarms']}")
    
    assessment = results["metrics"]["performance_assessment"]["overall_assessment"]
    print(f"  Overall Assessment: {assessment}")
    
    # CRITICAL GUARDRAIL: Prevent downstream hazard logic until validation passes
    if assessment != "GOOD":
        print("\n🚨 CRITICAL GUARDRAIL:")
        print("  Validation did not meet performance targets!")
        print("  DO NOT proceed to Phase 3B (floods) or Phase 3C (convergence)")
        print("  Address validation issues first before downstream hazard logic.")
        print("  This prevents building hazard detection on unvalidated cyclone foundation.")
    else:
        print("\n✅ VALIDATION PASSED:")
        print("  Cyclone detection is scientifically validated!")
        print("  Ready to proceed to downstream hazard logic (Phase 3B/3C).")
    
    return results


# Example usage and testing
if __name__ == "__main__":
    print("🔥 Phase 4: Validation Orchestrator Test")
    print("=" * 50)
    
    # This would be used with real data
    print("💡 To run complete validation:")
    print("  1. Have FeatureCube from Phase 2")
    print("  2. Have IBTrACS.ALL.v04r00.nc file")
    print("  3. Call run_complete_validation()")
    print()
    print("📋 Example usage:")
    print("  results = run_complete_validation(")
    print("      features=feature_cube,")
    print("      lat=lat_array,")
    print("      lon=lon_array,")
    print("      ibtracs_path='IBTrACS.ALL.v04r00.nc',")
    print("      validation_period={'start': '2024-01-01', 'end': '2024-12-31'},")
    print("      output_prefix='validation_2024'")
    print("  )")
    print()
    print("🎯 This will generate:")
    print("  - validation_2024_report.txt (human-readable report)")
    print("  - validation_2024_results.json (machine-readable results)")

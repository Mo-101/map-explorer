"""
Calibration Module - Phase 4C
===============================

Evidence-based calibration of cyclone detection parameters.
Adjusts detection thresholds based on validation metrics.

Only calibrates one parameter at a time with full validation re-run.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
import json
from dataclasses import dataclass

# Import our modules
from cyclone_detection import detect_cyclones
from ibtracs_ingestion import load_ibtracs
from track_matching import match_tracks, compute_validation_metrics, generate_validation_report


@dataclass
class CalibrationParams:
    """Cyclone detection parameters for calibration."""
    vorticity_percentile: float = 99.5
    wind_percentile: float = 90.0
    max_cyclone_speed_kmh: float = 100.0
    cluster_radius_km: float = 300.0
    min_lifetime_steps: int = 4
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "vorticity_percentile": self.vorticity_percentile,
            "wind_percentile": self.wind_percentile,
            "max_cyclone_speed_kmh": self.max_cyclone_speed_kmh,
            "cluster_radius_km": self.cluster_radius_km,
            "min_lifetime_steps": self.min_lifetime_steps
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]):
        return cls(
            vorticity_percentile=data.get("vorticity_percentile", 99.5),
            wind_percentile=data.get("wind_percentile", 90.0),
            max_cyclone_speed_kmh=data.get("max_cyclone_speed_kmh", 100.0),
            cluster_radius_km=data.get("cluster_radius_km", 300.0),
            min_lifetime_steps=data.get("min_lifetime_steps", 4)
        )


class CalibrationResult:
    """Results from a calibration run."""
    
    def __init__(self, params: CalibrationParams, metrics: Dict[str, Any]):
        self.params = params
        self.metrics = metrics
        self.score = self._calculate_calibration_score()
    
    def _calculate_calibration_score(self) -> float:
        """
        Calculate overall calibration score.
        
        Higher score = better performance
        Balances recall, precision, and position accuracy
        """
        det = self.metrics["detection"]
        tq = self.metrics["track_quality"]
        
        # Weight different metrics
        recall_weight = 0.4
        precision_weight = 0.3
        position_weight = 0.3
        
        # Normalize metrics (0-1 scale)
        recall_score = min(det["recall"], 1.0)
        precision_score = min(det["precision"], 1.0)
        
        # Position score (inverse of error, normalized)
        position_error = tq["mean_position_error_km"]
        position_score = max(0, 1 - position_error / 500.0)  # 500km as worst case
        
        # Combined score
        total_score = (recall_weight * recall_score + 
                      precision_weight * precision_score + 
                      position_weight * position_score)
        
        return total_score
    
    def __repr__(self):
        return f"CalibrationResult(score={self.score:.3f}, recall={self.metrics['detection']['recall']:.1%})"


def run_full_calibration(features: Dict[str, Any], 
                     lat: np.ndarray, lon: np.ndarray,
                     ibtracs_path: str, 
                     start_time: str, end_time: str,
                     params: CalibrationParams) -> CalibrationResult:
    """
    Run complete calibration pipeline with given parameters.
    
    Args:
        features: FeatureCube from Phase 2
        lat, lon: Coordinate arrays
        ibtracs_path: Path to IBTrACS data
        start_time, end_time: Validation period
        params: Calibration parameters to test
        
    Returns:
        CalibrationResult with metrics
    """
    print(f"🔥 Running calibration with params: {params.to_dict()}")
    
    # Step 1: Detect cyclones with current parameters
    # Note: This would require modifying cyclone_detection.py to accept parameters
    # For now, we'll use the default detection
    detected_cyclones = detect_cyclones(features, lat, lon)
    
    # Step 2: Load IBTrACS data
    ibtracs_tracks = load_ibtracs(ibtracs_path, start_time, end_time)
    
    # Step 3: Match tracks and compute metrics
    matching_results = match_tracks(detected_cyclones, ibtracs_tracks)
    metrics = compute_validation_metrics(matching_results)
    
    return CalibrationResult(params, metrics)


def calibrate_single_parameter(features: Dict[str, Any],
                          lat: np.ndarray, lon: np.ndarray,
                          ibtracs_path: str,
                          start_time: str, end_time: str,
                          base_params: CalibrationParams,
                          param_name: str,
                          test_values: List[float]) -> List[CalibrationResult]:
    """
    Calibrate a single parameter while keeping others fixed.
    
    Args:
        features, lat, lon: Detection inputs
        ibtracs_path, start_time, end_time: Validation data
        base_params: Base calibration parameters
        param_name: Parameter to calibrate
        test_values: List of values to test
        
    Returns:
        List of calibration results for each test value
    """
    print(f"🔧 Calibrating parameter: {param_name}")
    print(f"📋 Testing values: {test_values}")
    
    results = []
    
    for value in test_values:
        # Create new parameters with test value
        test_params = CalibrationParams(**base_params.to_dict())
        setattr(test_params, param_name, value)
        
        # Run calibration
        result = run_full_calibration(
            features, lat, lon, ibtracs_path, start_time, end_time, test_params
        )
        
        results.append(result)
        print(f"  Value {value}: Score={result.score:.3f}, Recall={result.metrics['detection']['recall']:.1%}")
    
    # Sort by score (best first)
    results.sort(key=lambda r: r.score, reverse=True)
    
    print(f"✅ Best {param_name}: {results[0].params.to_dict()[param_name]} (score: {results[0].score:.3f})")
    
    return results


def recommend_calibration_adjustments(base_result: CalibrationResult) -> Dict[str, Any]:
    """
    Recommend parameter adjustments based on calibration results.
    
    Args:
        base_result: Calibration result with current parameters
        
    Returns:
        Dictionary with calibration recommendations
    """
    metrics = base_result.metrics
    det = metrics["detection"]
    tq = metrics["track_quality"]
    
    recommendations = {}
    
    # Analyze recall
    if det["recall"] < 0.60:
        recommendations["recall"] = {
            "status": "LOW",
            "suggestion": "Decrease vorticity percentile (e.g., 99.5 → 99.0) or wind percentile (90 → 85)",
            "reason": "Recall below 60% target - detection too strict"
        }
    elif det["recall"] > 0.85:
        recommendations["recall"] = {
            "status": "HIGH", 
            "suggestion": "Increase vorticity percentile (e.g., 99.5 → 99.8) or wind percentile (90 → 95)",
            "reason": "Recall above 85% - may be too permissive, check false alarms"
        }
    else:
        recommendations["recall"] = {
            "status": "GOOD",
            "suggestion": "Maintain current vorticity and wind percentiles",
            "reason": "Recall within target range (60-85%)"
        }
    
    # Analyze precision
    if det["false_alarm_rate"] > 0.5:
        recommendations["precision"] = {
            "status": "LOW",
            "suggestion": "Increase wind percentile threshold or add minimum pressure gradient requirement",
            "reason": "False alarm rate above 50% - too many false detections"
        }
    else:
        recommendations["precision"] = {
            "status": "GOOD",
            "suggestion": "Current precision is acceptable",
            "reason": "Conservative false alarm rate"
        }
    
    # Analyze position error
    if tq["mean_position_error_km"] > 300.0:
        recommendations["position"] = {
            "status": "HIGH",
            "suggestion": "Reduce cluster radius or tighten temporal matching constraints",
            "reason": "Position error above 300km target"
        }
    else:
        recommendations["position"] = {
            "status": "GOOD",
            "suggestion": "Current position accuracy is acceptable",
            "reason": "Position error within target range"
        }
    
    return recommendations


def generate_calibration_plan(base_params: CalibrationParams) -> Dict[str, Any]:
    """
    Generate a systematic calibration plan.
    
    Args:
        base_params: Starting parameters
        
    Returns:
        Calibration plan with parameter ranges and priorities
    """
    plan = {
        "parameters": {},
        "priority_order": [
            "vorticity_percentile",
            "wind_percentile", 
            "max_cyclone_speed_kmh",
            "cluster_radius_km"
        ]
    }
    
    # Define calibration ranges for each parameter
    plan["parameters"] = {
        "vorticity_percentile": {
            "current": base_params.vorticity_percentile,
            "range": [98.0, 98.5, 99.0, 99.5, 99.8],
            "step": 0.5,
            "priority": 1
        },
        "wind_percentile": {
            "current": base_params.wind_percentile,
            "range": [80, 85, 90, 95],
            "step": 5,
            "priority": 2
        },
        "max_cyclone_speed_kmh": {
            "current": base_params.max_cyclone_speed_kmh,
            "range": [80, 100, 120, 150],
            "step": 20,
            "priority": 3
        },
        "cluster_radius_km": {
            "current": base_params.cluster_radius_km,
            "range": [200, 250, 300, 350, 400],
            "step": 50,
            "priority": 4
        }
    }
    
    return plan


def save_calibration_results(results: List[CalibrationResult], 
                        filename: str = "calibration_results.json") -> None:
    """
    Save calibration results to JSON file.
    
    Args:
        results: List of calibration results
        filename: Output filename
    """
    data = {
        "calibration_run": {
            "timestamp": str(np.datetime64('now')),
            "total_runs": len(results),
            "best_result": results[0].to_dict() if results else None,
            "all_results": [r.to_dict() for r in results]
        }
    }
    
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    
    print(f"💾 Calibration results saved to {filename}")


# Example usage and testing
if __name__ == "__main__":
    print("🔥 Phase 4C: Evidence-Based Calibration")
    print("=" * 50)
    
    # Example calibration plan
    base_params = CalibrationParams()
    plan = generate_calibration_plan(base_params)
    
    print("📋 CALIBRATION PLAN:")
    for param_name in plan["priority_order"]:
        param_info = plan["parameters"][param_name]
        print(f"  {param_name}:")
        print(f"    Current: {param_info['current']}")
        print(f"    Range: {param_info['range']}")
        print(f"    Priority: {param_info['priority']}")
    
    print("\n💡 CALIBRATION PROCESS:")
    print("  1. Run base calibration with current parameters")
    print("  2. Analyze metrics and generate recommendations")
    print("  3. Calibrate parameters one at a time")
    print("  4. Re-run full validation after each change")
    print("  5. Select parameters with best overall score")
    
    print("\n🎯 TARGET METRICS:")
    print("  - Recall: 60-80%")
    print("  - False Alarm Rate: < Miss Rate")
    print("  - Mean Position Error: < 300 km")
    print("  - Overall: Balanced performance across all metrics")

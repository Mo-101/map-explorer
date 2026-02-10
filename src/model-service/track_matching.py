"""
Track Matching Module - Phase 4B
=================================

Spatatiotemporal track matching between detected cyclones and IBTrACS best-tracks.
Computes objective validation metrics for cyclone detection performance.

Implements the three-criteria matching principle:
1. Temporal overlap ≥ 24h
2. Mean spatial distance ≤ 300km  
3. At least one point within 150km
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from math import radians, cos, sin, asin, sqrt
from datetime import timedelta
import warnings

from ibtracs_ingestion import IBTrACSTrack
from cyclone_detection import CycloneTrack


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great-circle distance between two points on Earth.
    
    Args:
        lat1, lon1: First point in degrees
        lat2, lon2: Second point in degrees
        
    Returns:
        Distance in kilometers
    """
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Earth's radius in kilometers
    R = 6371.0
    
    return R * c


def compute_track_distance_series(detected_track: CycloneTrack, 
                             ibtracs_track: IBTrACSTrack) -> np.ndarray:
    """
    Compute distance series between detected and IBTrACS tracks.
    
    Args:
        detected_track: Detected cyclone track
        ibtracs_track: IBTrACS best-track
        
    Returns:
        Array of distances for each detected track point
    """
    distances = []
    
    for det_time, det_lat, det_lon in zip(detected_track.times, detected_track.lats, detected_track.lons):
        # Find closest IBTrACS point in time
        time_diffs = np.abs(ibtracs_track.times - det_time)
        closest_time_idx = np.argmin(time_diffs)
        
        # Only consider points within reasonable time window (12h)
        if time_diffs[closest_time_idx] > np.timedelta64(12, 'h'):
            distances.append(np.inf)
            continue
        
        # Calculate distance to closest IBTrACS point
        ibtracs_lat = ibtracs_track.lats[closest_time_idx]
        ibtracs_lon = ibtracs_track.lons[closest_time_idx]
        
        distance = haversine_distance(det_lat, det_lon, ibtracs_lat, ibtracs_lon)
        distances.append(distance)
    
    return np.array(distances)


def check_temporal_overlap(detected_track: CycloneTrack, 
                        ibtracs_track: IBTrACSTrack, 
                        min_overlap_hours: int = 24) -> bool:
    """
    Check if two tracks have sufficient temporal overlap.
    
    Args:
        detected_track: Detected cyclone track
        ibtracs_track: IBTrACS best-track
        min_overlap_hours: Minimum required overlap in hours
        
    Returns:
        True if tracks overlap sufficiently in time
    """
    det_start, det_end = detected_track.time_range()
    ibtracs_start, ibtracs_end = ibtracs_track.time_range()
    
    # Calculate overlap
    overlap_start = max(det_start, ibtracs_start)
    overlap_end = min(det_end, ibtracs_end)
    
    if overlap_end <= overlap_start:
        return False
    
    overlap_duration = (overlap_end - overlap_start) / np.timedelta64(1, 'h')
    return overlap_duration >= min_overlap_hours


def check_spatial_proximity(detected_track: CycloneTrack, 
                          ibtracs_track: IBTrACSTrack,
                          max_mean_distance_km: float = 300.0,
                          max_min_distance_km: float = 150.0) -> Tuple[bool, float, float]:
    """
    Check if two tracks are spatially close enough.
    
    Args:
        detected_track: Detected cyclone track
        ibtracs_track: IBTrACS best-track
        max_mean_distance_km: Maximum mean distance threshold
        max_min_distance_km: Maximum minimum distance threshold
        
    Returns:
        Tuple of (passes_criteria, mean_distance, min_distance)
    """
    # Compute distance series
    distances = compute_track_distance_series(detected_track, ibtracs_track)
    
    # Filter out infinite distances (time gaps)
    finite_distances = distances[distances != np.inf]
    
    if len(finite_distances) == 0:
        return False, np.inf, np.inf
    
    mean_distance = np.mean(finite_distances)
    min_distance = np.min(finite_distances)
    
    passes_criteria = (mean_distance <= max_mean_distance_km and 
                     min_distance <= max_min_distance_km)
    
    return passes_criteria, mean_distance, min_distance


def match_tracks(detected_tracks: List[CycloneTrack], 
                ibtracs_tracks: List[IBTrACSTrack]) -> Dict[str, Any]:
    """
    Match detected tracks to IBTrACS tracks using three-criteria principle.
    
    Args:
        detected_tracks: List of detected cyclone tracks
        ibtracs_tracks: List of IBTrACS best-tracks
        
    Returns:
        Dictionary with matching results and metrics
    """
    print("🔥 Phase 4B: Track Matching & Metrics")
    print(f"📊 Input: {len(detected_tracks)} detected, {len(ibtracs_tracks)} IBTrACS tracks")
    
    matches = []
    unmatched_detected = list(range(len(detected_tracks)))
    unmatched_ibtracs = set(range(len(ibtracs_tracks)))
    
    # Match each detected track to best IBTrACS track
    for det_idx, detected_track in enumerate(detected_tracks):
        best_match = None
        best_score = np.inf
        best_metrics = None
        
        for ibtracs_idx in unmatched_ibtracs:
            ibtracs_track = ibtracs_tracks[ibtracs_idx]
            
            # Check temporal overlap
            if not check_temporal_overlap(detected_track, ibtracs_track):
                continue
            
            # Check spatial proximity
            spatial_pass, mean_dist, min_dist = check_spatial_proximity(detected_track, ibtracs_track)
            
            if not spatial_pass:
                continue
            
            # Calculate combined score (lower is better)
            # Weight mean distance more heavily
            score = mean_dist + 0.5 * min_dist
            
            if score < best_score:
                best_score = score
                best_match = ibtracs_idx
                best_metrics = {
                    "mean_distance_km": mean_dist,
                    "min_distance_km": min_dist,
                    "temporal_overlap_hours": None
                }
        
        if best_match is not None:
            # Calculate temporal overlap
            ibtracs_track = ibtracs_tracks[best_match]
            det_start, det_end = detected_track.time_range()
            ibtracs_start, ibtracs_end = ibtracs_track.time_range()
            
            overlap_start = max(det_start, ibtracs_start)
            overlap_end = min(det_end, ibtracs_end)
            overlap_duration = (overlap_end - overlap_start) / np.timedelta64(1, 'h')
            
            best_metrics["temporal_overlap_hours"] = overlap_duration
            
            matches.append({
                "detected_idx": det_idx,
                "ibtracs_idx": best_match,
                "detected_track": detected_track,
                "ibtracs_track": ibtracs_track,
                "metrics": best_metrics
            })
            
            unmatched_detected.remove(det_idx)
            unmatched_ibtracs.remove(best_match)
    
    print(f"✅ Matching complete: {len(matches)} matches, {len(unmatched_detected)} unmatched detected, {len(unmatched_ibtracs)} unmatched IBTrACS")
    
    return {
        "matches": matches,
        "unmatched_detected": unmatched_detected,
        "unmatched_ibtracs": list(unmatched_ibtracs),
        "total_detected": len(detected_tracks),
        "total_ibtracs": len(ibtracs_tracks)
    }


def compute_validation_metrics(matching_results: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute objective validation metrics from track matching results.
    
    Args:
        matching_results: Results from match_tracks()
        
    Returns:
        Dictionary of validation metrics
    """
    matches = matching_results["matches"]
    total_detected = matching_results["total_detected"]
    total_ibtracs = matching_results["total_ibtracs"]
    unmatched_detected = len(matching_results["unmatched_detected"])
    unmatched_ibtracs = len(matching_results["unmatched_ibtracs"])
    
    # Detection metrics
    hits = len(matches)
    misses = unmatched_ibtracs
    false_alarms = unmatched_detected
    
    recall = hits / total_ibtracs if total_ibtracs > 0 else 0
    false_alarm_rate = false_alarms / total_detected if total_detected > 0 else 0
    precision = hits / total_detected if total_detected > 0 else 0
    
    # Track quality metrics
    if matches:
        mean_distances = [m["metrics"]["mean_distance_km"] for m in matches]
        min_distances = [m["metrics"]["min_distance_km"] for m in matches]
        overlap_hours = [m["metrics"]["temporal_overlap_hours"] for m in matches]
        
        mean_position_error = np.mean(mean_distances)
        max_position_error = np.max(mean_distances)
        mean_overlap = np.mean(overlap_hours)
        max_overlap = np.max(overlap_hours)
    else:
        mean_position_error = max_position_error = np.nan
        mean_overlap = max_overlap = np.nan
    
    metrics = {
        # Detection metrics
        "detection": {
            "total_detected": total_detected,
            "total_ibtracs": total_ibtracs,
            "hits": hits,
            "misses": misses,
            "false_alarms": false_alarms,
            "recall": recall,
            "false_alarm_rate": false_alarm_rate,
            "precision": precision
        },
        
        # Track quality metrics
        "track_quality": {
            "mean_position_error_km": mean_position_error,
            "max_position_error_km": max_position_error,
            "mean_overlap_hours": mean_overlap,
            "max_overlap_hours": max_overlap
        },
        
        # Performance targets check
        "performance_assessment": {
            "meets_recall_target": recall >= 0.60,  # 60% target
            "meets_precision_target": precision >= 0.50,  # Conservative
            "meets_position_error_target": mean_position_error <= 300.0,  # 300km target
            "overall_assessment": "GOOD" if (recall >= 0.60 and precision >= 0.50 and mean_position_error <= 300.0) else "NEEDS_IMPROVEMENT"
        }
    }
    
    return metrics


def analyze_errors_by_basin(matching_results: Dict[str, Any], 
                          ibtracs_tracks: List[IBTrACSTrack]) -> Dict[str, Any]:
    """
    Analyze detection errors by basin to identify systematic biases.
    
    Args:
        matching_results: Results from match_tracks()
        ibtracs_tracks: List of IBTrACS tracks
        
    Returns:
        Basin-specific error analysis
    """
    matches = matching_results["matches"]
    unmatched_ibtracs_indices = set(matching_results["unmatched_ibtracs"])
    
    # Group tracks by basin
    basin_stats = {}
    
    # Process matched tracks
    for match in matches:
        ibtracs_track = match["ibtracs_track"]
        basin = ibtracs_track.basin
        
        if basin not in basin_stats:
            basin_stats[basin] = {
                "total_ibtracs": 0,
                "detected": 0,
                "missed": 0,
                "position_errors": []
            }
        
        basin_stats[basin]["detected"] += 1
        basin_stats[basin]["position_errors"].append(match["metrics"]["mean_distance_km"])
    
    # Process unmatched tracks
    for ibtracs_idx in unmatched_ibtracs_indices:
        ibtracs_track = ibtracs_tracks[ibtracs_idx]
        basin = ibtracs_track.basin
        
        if basin not in basin_stats:
            basin_stats[basin] = {
                "total_ibtracs": 0,
                "detected": 0,
                "missed": 0,
                "position_errors": []
            }
        
        basin_stats[basin]["missed"] += 1
    
    # Calculate totals and rates
    for basin in basin_stats:
        stats = basin_stats[basin]
        
        # Count total IBTrACS tracks in this basin
        basin_total = sum(1 for track in ibtracs_tracks if track.basin == basin)
        stats["total_ibtracs"] = basin_total
        
        # Calculate rates
        stats["recall"] = stats["detected"] / basin_total if basin_total > 0 else 0
        stats["mean_position_error"] = np.mean(stats["position_errors"]) if stats["position_errors"] else np.nan
    
    return basin_stats


def generate_validation_report(metrics: Dict[str, Any], 
                         basin_analysis: Optional[Dict[str, Any]] = None) -> str:
    """
    Generate a comprehensive validation report.
    
    Args:
        metrics: Validation metrics
        basin_analysis: Optional basin-specific analysis
        
    Returns:
        Formatted report string
    """
    report = []
    report.append("=" * 60)
    report.append("CYCLONE DETECTION VALIDATION REPORT")
    report.append("=" * 60)
    
    # Detection metrics
    det = metrics["detection"]
    report.append("\n📊 DETECTION METRICS:")
    report.append(f"  Total IBTrACS Storms: {det['total_ibtracs']}")
    report.append(f"  Total Detected Storms: {det['total_detected']}")
    report.append(f"  Hits: {det['hits']}")
    report.append(f"  Misses: {det['misses']}")
    report.append(f"  False Alarms: {det['false_alarms']}")
    report.append(f"  Recall: {det['recall']:.1%}")
    report.append(f"  Precision: {det['precision']:.1%}")
    report.append(f"  False Alarm Rate: {det['false_alarm_rate']:.1%}")
    
    # Track quality
    tq = metrics["track_quality"]
    report.append("\n📏 TRACK QUALITY:")
    report.append(f"  Mean Position Error: {tq['mean_position_error_km']:.1f} km")
    report.append(f"  Max Position Error: {tq['max_position_error_km']:.1f} km")
    report.append(f"  Mean Overlap: {tq['mean_overlap_hours']:.1f} hours")
    report.append(f"  Max Overlap: {tq['max_overlap_hours']:.1f} hours")
    
    # Performance assessment
    pa = metrics["performance_assessment"]
    report.append("\n🎯 PERFORMANCE ASSESSMENT:")
    report.append(f"  Meets Recall Target (≥60%): {'✅' if pa['meets_recall_target'] else '❌'}")
    report.append(f"  Meets Precision Target (≥50%): {'✅' if pa['meets_precision_target'] else '❌'}")
    report.append(f"  Meets Position Error Target (≤300km): {'✅' if pa['meets_position_error_target'] else '❌'}")
    report.append(f"  Overall Assessment: {pa['overall_assessment']}")
    
    # Basin analysis
    if basin_analysis:
        report.append("\n🌍 BASIN-SPECIFIC ANALYSIS:")
        for basin, stats in basin_analysis.items():
            report.append(f"  {basin}:")
            report.append(f"    Total: {stats['total_ibtracs']}")
            report.append(f"    Detected: {stats['detected']}")
            report.append(f"    Recall: {stats['recall']:.1%}")
            if not np.isnan(stats['mean_position_error']):
                report.append(f"    Mean Error: {stats['mean_position_error']:.1f} km")
    
    report.append("\n" + "=" * 60)
    
    return "\n".join(report)


# Example usage and testing
if __name__ == "__main__":
    print("🔥 Phase 4B: Track Matching Test")
    print("=" * 50)
    
    # This would be used with real data from Phase 3A and 4A
    print("💡 This module requires:")
    print("  - Detected tracks from cyclone_detection.py")
    print("  - IBTrACS tracks from ibtracs_ingestion.py")
    print("  - Run match_tracks() then compute_validation_metrics()")
    print("  - Use generate_validation_report() for results")
    
    print("\n🎯 Matching Criteria:")
    print("  1. Temporal overlap ≥ 24 hours")
    print("  2. Mean spatial distance ≤ 300 km")
    print("  3. At least one point within 150 km")
    print("  4. One-to-one matching enforced")

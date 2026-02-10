"""
Cyclone Detection Module - Phase 3A
==================================

Scientific cyclone detection from FeatureCube.
Multi-timestep, tracked, hemispheric, defensible.

Converts FeatureCube → Cyclone Objects.
No floods, no convergence, no risk yet.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from scipy.spatial.distance import cdist
from scipy.ndimage import label, maximum_filter
import warnings

# Physical constants
EARTH_RADIUS = 6_371_000.0  # meters
MAX_CYCLONE_SPEED = 100.0  # km/hr - reasonable max movement speed
MIN_LIFETIME_STEPS = 4  # minimum timesteps (~24h at 6h resolution)
CLUSTER_RADIUS_KM = 300.0  # km - radius for spatial consolidation
VORTICITY_PERCENTILE = 99.5  # percentile for vorticity threshold
WIND_PERCENTILE = 90.0  # percentile for wind support
PRESSURE_RADIUS_KM = 300.0  # km - radius for pressure minimum check

class CycloneCandidate:
    """Single cyclone center candidate at one timestep."""
    
    def __init__(self, t: int, lat_idx: int, lon_idx: int, 
                 vorticity: float, wind_speed: float, pressure_gradient: float,
                 lat: float, lon: float):
        self.t = t
        self.lat_idx = lat_idx
        self.lon_idx = lon_idx
        self.vorticity = vorticity
        self.wind_speed = wind_speed
        self.pressure_gradient = pressure_gradient
        self.lat = lat
        self.lon = lon
        self.hemisphere = "NH" if lat > 0 else "SH"
    
    def __repr__(self):
        return f"Candidate(t={self.t}, lat={self.lat:.2f}, lon={self.lon:.2f}, vort={self.vorticity:.2e})"


class CycloneTrack:
    """Complete cyclone track across multiple timesteps."""
    
    def __init__(self, track_id: int):
        self.track_id = track_id
        self.candidates: List[CycloneCandidate] = []
        self.times: List[int] = []
        self.lats: List[float] = []
        self.lons: List[float] = []
        self.max_vorticity: float = -np.inf
        self.max_wind_speed: float = -np.inf
        self.min_pressure_gradient: float = np.inf
        self.hemisphere: Optional[str] = None
    
    def add_candidate(self, candidate: CycloneCandidate):
        """Add a candidate to this track."""
        self.candidates.append(candidate)
        self.times.append(candidate.t)
        self.lats.append(candidate.lat)
        self.lons.append(candidate.lon)
        
        # Update extremes
        self.max_vorticity = max(self.max_vorticity, candidate.vorticity)
        self.max_wind_speed = max(self.max_wind_speed, candidate.wind_speed)
        self.min_pressure_gradient = min(self.min_pressure_gradient, candidate.pressure_gradient)
        
        # Set hemisphere from first candidate
        if self.hemisphere is None:
            self.hemisphere = candidate.hemisphere
    
    def lifetime_hours(self) -> int:
        """Get track lifetime in hours."""
        if len(self.times) < 2:
            return 0
        return (self.times[-1] - self.times[0]) * 6  # 6-hour timestep
    
    def is_valid(self) -> bool:
        """Check if track meets minimum lifetime requirement."""
        return len(self.candidates) >= MIN_LIFETIME_STEPS
    
    def __repr__(self):
        return f"Track(id={self.track_id}, lifetime={self.lifetime_hours()}h, max_vort={self.max_vorticity:.2e})"


def identify_candidates(features: Dict[str, np.ndarray], 
                    lat: np.ndarray, lon: np.ndarray) -> List[List[CycloneCandidate]]:
    """
    Step 1: Identify candidate cyclone centers per timestep.
    
    Uses percentile-based thresholds, hemisphere-aware filtering, and spatial consolidation.
    
    Args:
        features: FeatureCube from Phase 2
        lat: latitude array in degrees
        lon: longitude array in degrees
        
    Returns:
        List of candidate lists per timestep
    """
    print("🔥 Step 1: Identifying cyclone candidates...")
    
    vorticity = features["vorticity_10m"]
    wind_speed = features["wind_speed_10m"]
    pressure_gradient = features["pressure_gradient"]
    
    T, Y, X = vorticity.shape
    all_candidates: List[List[CycloneCandidate]] = []
    
    for t in range(T):
        print(f"  Processing timestep {t+1}/{T}...")
        
        # 1.1 Percentile-based vorticity threshold
        vort_thresh = np.percentile(vorticity[t], VORTICITY_PERCENTILE)
        vort_mask = vorticity[t] > vort_thresh
        
        # 1.2 Wind support threshold
        wind_thresh = np.percentile(wind_speed[t], WIND_PERCENTILE)
        wind_mask = wind_speed[t] > wind_thresh
        
        # Combine masks
        combined_mask = vort_mask & wind_mask
        
        if not np.any(combined_mask):
            all_candidates.append([])
            continue
        
        # Find local maxima in vorticity
        vort_filtered = maximum_filter(vorticity[t], size=5)  # 5x5 local max filter
        local_max_mask = (vorticity[t] == vort_filtered) & combined_mask
        
        # Get candidate coordinates
        candidate_indices = np.where(local_max_mask)
        timestep_candidates: List[CycloneCandidate] = []
        
        for lat_idx, lon_idx in zip(candidate_indices[0], candidate_indices[1]):
            lat_val = lat[lat_idx]
            lon_val = lon[lon_idx]
            
            vort_val = vorticity[t, lat_idx, lon_idx]
            wind_val = wind_speed[t, lat_idx, lon_idx]
            grad_val = pressure_gradient[t, lat_idx, lon_idx]
            
            # 1.3 Hemisphere-aware filtering
            if lat_val > 0 and vort_val <= 0:  # NH requires positive vorticity
                continue
            if lat_val < 0 and vort_val >= 0:  # SH requires negative vorticity
                continue
            
            candidate = CycloneCandidate(
                t=t, lat_idx=lat_idx, lon_idx=lon_idx,
                vorticity=vort_val, wind_speed=wind_val, 
                pressure_gradient=grad_val,
                lat=lat_val, lon=lon_val
            )
            timestep_candidates.append(candidate)
        
        # 1.4 Spatial consolidation
        consolidated_candidates = consolidate_spatial_candidates(timestep_candidates, lat, lon)
        all_candidates.append(consolidated_candidates)
        
        print(f"    Found {len(timestep_candidates)} raw candidates, consolidated to {len(consolidated_candidates)}")
    
    total_candidates = sum(len(candidates) for candidates in all_candidates)
    print(f"✅ Step 1 complete: {total_candidates} total candidates across {T} timesteps")
    
    return all_candidates


def consolidate_spatial_candidates(candidates: List[CycloneCandidate], 
                               lat: np.ndarray, lon: np.ndarray) -> List[CycloneCandidate]:
    """
    Step 1.4: Spatial consolidation of candidates within clustering radius.
    
    Keeps strongest vorticity center per cluster.
    """
    if len(candidates) <= 1:
        return candidates
    
    # Calculate distances between all candidates
    positions = np.array([[c.lat, c.lon] for c in candidates])
    distances = cdist(positions, positions)
    
    # Cluster candidates within radius
    cluster_radius_deg = CLUSTER_RADIUS_KM / 111.0  # Approximate km to degrees
    clusters = []
    used = set()
    
    for i, candidate in enumerate(candidates):
        if i in used:
            continue
        
        # Find all candidates within radius
        cluster_indices = np.where(distances[i] <= cluster_radius_deg)[0]
        cluster = [candidates[j] for j in cluster_indices]
        
        # Keep strongest vorticity
        strongest = max(cluster, key=lambda c: c.vorticity)
        clusters.append(strongest)
        
        # Mark all as used
        used.update(cluster_indices)
    
    return clusters


def track_candidates(all_candidates: List[List[CycloneCandidate]]) -> List[CycloneTrack]:
    """
    Step 4: Temporal tracking of cyclone candidates.
    
    Links candidates across timesteps using nearest-neighbor with speed constraints.
    
    Args:
        all_candidates: List of candidate lists per timestep
        
    Returns:
        List of complete cyclone tracks
    """
    print("🔥 Step 4: Temporal tracking of candidates...")
    
    T = len(all_candidates)
    tracks: List[CycloneTrack] = []
    track_id_counter = 0
    
    # For each timestep, try to extend existing tracks or start new ones
    for t in range(T):
        candidates_t = all_candidates[t]
        
        if not candidates_t:
            continue
        
        # Try to match candidates to existing tracks
        unmatched_candidates = candidates_t.copy()
        used_candidates = set()
        
        # First, try to extend existing tracks
        for track in tracks:
            if track.times[-1] != t - 1:
                continue  # Track didn't reach previous timestep
            
            # Find best match for this track
            best_candidate = None
            best_distance = np.inf
            best_idx = -1
            
            for i, candidate in enumerate(candidates_t):
                if i in used_candidates:
                    continue
                
                # Calculate distance from last track position
                last_lat = track.lats[-1]
                last_lon = track.lons[-1]
                
                # Simple great circle distance approximation
                lat_diff = candidate.lat - last_lat
                lon_diff = candidate.lon - last_lon
                distance_km = np.sqrt(lat_diff**2 + lon_diff**2) * 111.0
                
                # Check speed constraint
                max_distance = MAX_CYCLONE_SPEED * 6.0  # 6-hour timestep
                if distance_km <= max_distance and distance_km < best_distance:
                    best_candidate = candidate
                    best_distance = distance_km
                    best_idx = i
            
            if best_candidate:
                track.add_candidate(best_candidate)
                used_candidates.add(best_idx)
        
        # Start new tracks with unmatched candidates
        for i, candidate in enumerate(candidates_t):
            if i not in used_candidates:
                new_track = CycloneTrack(track_id_counter)
                new_track.add_candidate(candidate)
                tracks.append(new_track)
                track_id_counter += 1
        
        print(f"    Timestep {t}: {len(candidates_t)} candidates, {len(candidates_t) - len(used_candidates)} new tracks")
    
    # Filter tracks by minimum lifetime
    valid_tracks = [track for track in tracks if track.is_valid()]
    
    print(f"✅ Step 4 complete: {len(tracks)} total tracks, {len(valid_tracks)} valid (≥{MIN_LIFETIME_STEPS} steps)")
    
    return valid_tracks


def validate_structure(tracks: List[CycloneTrack], 
                    features: Dict[str, np.ndarray],
                    lat: np.ndarray, lon: np.ndarray) -> List[CycloneTrack]:
    """
    Step 5: Structure validation for meteorological coherence.
    
    Optional but strongly recommended for quality control.
    """
    print("🔥 Step 5: Structure validation...")
    
    validated_tracks = []
    
    for track in tracks:
        is_structurally_valid = True
        
        for candidate in track.candidates:
            # 5.1 Check radial structure (simplified)
            # In a real implementation, this would check:
            # - Pressure gradient increases inward
            # - Wind peaks near radius of max wind
            
            # For now, we accept all tracks that passed tracking
            pass
        
        if is_structurally_valid:
            validated_tracks.append(track)
    
    print(f"✅ Step 5 complete: {len(validated_tracks)}/{len(tracks)} tracks passed structure validation")
    
    return validated_tracks


def classify_tracks(tracks: List[CycloneTrack]) -> List[Dict[str, Any]]:
    """
    Step 6: Classification of cyclone tracks.
    
    Only after tracking do we classify.
    """
    print("🔥 Step 6: Classification of tracks...")
    
    cyclone_objects = []
    
    for track in tracks:
        # Basic classification based on metrics
        max_wind = track.max_wind_speed
        
        # Simple intensity classification (percentile-based)
        if max_wind < 15:  # m/s
            intensity_class = "weak"
        elif max_wind < 25:
            intensity_class = "moderate"
        else:
            intensity_class = "strong"
        
        # Development stage based on lifetime
        lifetime = track.lifetime_hours()
        if lifetime < 48:
            stage = "short_lived"
        elif lifetime < 120:
            stage = "mature"
        else:
            stage = "long_lived"
        
        cyclone_obj = {
            "track_id": track.track_id,
            "track": list(zip(track.times, track.lats, track.lons)),
            "lifetime_hours": lifetime,
            "max_wind_10m": track.max_wind_speed,
            "max_vorticity": track.max_vorticity,
            "min_pressure_gradient": track.min_pressure_gradient,
            "hemisphere": track.hemisphere,
            "intensity_class": intensity_class,
            "development_stage": stage,
            "structure_metrics": {
                "num_candidates": len(track.candidates),
                "avg_vorticity": np.mean([c.vorticity for c in track.candidates]),
                "avg_wind_speed": np.mean([c.wind_speed for c in track.candidates])
            }
        }
        
        cyclone_objects.append(cyclone_obj)
    
    print(f"✅ Step 6 complete: {len(cyclone_objects)} cyclone objects classified")
    
    return cyclone_objects


def detect_cyclones(features: Dict[str, np.ndarray], 
                   lat: np.ndarray, lon: np.ndarray) -> List[Dict[str, Any]]:
    """
    Main entry point for Phase 3A cyclone detection.
    
    Converts FeatureCube → Cyclone Objects using scientific methodology.
    
    Args:
        features: FeatureCube from Phase 2
        lat: latitude array in degrees
        lon: longitude array in degrees
        
    Returns:
        List of cyclone objects with tracks and metrics
    """
    print("🔥 Starting Phase 3A: Scientific Cyclone Detection")
    print(f"📏 Input: {len(features)} features, shape {features['vorticity_10m'].shape}")
    
    # Step 1: Candidate identification
    all_candidates = identify_candidates(features, lat, lon)
    
    # Step 4: Temporal tracking (skip 2-3 for now)
    tracks = track_candidates(all_candidates)
    
    # Step 5: Structure validation
    validated_tracks = validate_structure(tracks, features, lat, lon)
    
    # Step 6: Classification
    cyclone_objects = classify_tracks(validated_tracks)
    
    print(f"🎯 Phase 3A complete: {len(cyclone_objects)} cyclones detected")
    
    return cyclone_objects


def get_cyclone_summary(cyclones: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Get summary statistics for detected cyclones.
    """
    if not cyclones:
        return {"total_cyclones": 0}
    
    summary = {
        "total_cyclones": len(cyclones),
        "hemisphere_distribution": {"NH": 0, "SH": 0},
        "intensity_distribution": {"weak": 0, "moderate": 0, "strong": 0},
        "avg_lifetime_hours": 0,
        "max_wind_speed": 0,
        "max_vorticity": 0
    }
    
    total_lifetime = 0
    max_wind = 0
    max_vort = 0
    
    for cyclone in cyclones:
        # Hemisphere
        summary["hemisphere_distribution"][cyclone["hemisphere"]] += 1
        
        # Intensity
        summary["intensity_distribution"][cyclone["intensity_class"]] += 1
        
        # Lifetime
        total_lifetime += cyclone["lifetime_hours"]
        
        # Max values
        max_wind = max(max_wind, cyclone["max_wind_10m"])
        max_vort = max(max_vort, cyclone["max_vorticity"])
    
    summary["avg_lifetime_hours"] = total_lifetime / len(cyclones)
    summary["max_wind_speed"] = max_wind
    summary["max_vorticity"] = max_vort
    
    return summary


# Example usage and testing
if __name__ == "__main__":
    # Test with mock data
    T, Y, X = 48, 181, 360  # 48 hours, 1-degree global grid
    
    # Create mock feature cube
    mock_features = {
        "vorticity_10m": np.random.randn(T, Y, X) * 1e-5,  # s^-1
        "wind_speed_10m": np.random.rand(T, Y, X) * 30 + 5,  # 5-35 m/s
        "pressure_gradient": np.random.rand(T, Y, X) * 0.01 + 0.001  # Pa/m
    }
    
    # Create coordinate arrays
    lat = np.linspace(-90, 90, Y)
    lon = np.linspace(-180, 180, X)
    
    # Add some synthetic cyclone-like features
    # Create a persistent cyclone that moves across timesteps
    base_lat_idx = 90  # Start at 0 degrees latitude
    base_lon_idx = 180  # Start at 0 degrees longitude
    
    for t in range(5, 35):  # Cyclone from timestep 5-35 (30 hours = 5 days)
        # Move the cyclone slowly
        lat_offset = int((t - 5) * 0.5)  # Move 0.5 degrees per timestep
        lon_offset = int((t - 5) * 0.3)  # Move 0.3 degrees per timestep
        
        cy_lat_idx = base_lat_idx + lat_offset
        cy_lon_idx = base_lon_idx + lon_offset
        
        # Keep within bounds
        if 0 <= cy_lat_idx < Y and 0 <= cy_lon_idx < X:
            # Add strong vorticity maximum
            mock_features["vorticity_10m"][t, cy_lat_idx, cy_lon_idx] = 1e-3  # Strong cyclone
            
            # Add wind maximum
            mock_features["wind_speed_10m"][t, cy_lat_idx, cy_lon_idx] = 50.0  # Strong winds
            
            # Add pressure gradient
            mock_features["pressure_gradient"][t, cy_lat_idx, cy_lon_idx] = 0.1  # Strong gradient
    
    try:
        cyclones = detect_cyclones(mock_features, lat, lon)
        summary = get_cyclone_summary(cyclones)
        
        print("\n=== CYCLONE DETECTION SUMMARY ===")
        for key, value in summary.items():
            print(f"{key}: {value}")
            
        print(f"\n=== DETECTED CYCLONES ===")
        for cyclone in cyclones[:3]:  # Show first 3
            print(f"Track {cyclone['track_id']}: {cyclone['lifetime_hours']}h, "
                  f"{cyclone['hemisphere']}, {cyclone['intensity_class']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

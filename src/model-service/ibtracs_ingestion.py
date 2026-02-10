"""
IBTrACS Ingestion Module - Phase 4A
==================================

Authoritative IBTrACS v4 NetCDF ingestion for cyclone validation.
Loads, normalizes, and structures best-track data for validation.

Canonical structure for track matching and metrics computation.
"""

import xarray as xr
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import warnings

class IBTrACSTrack:
    """Canonical IBTrACS track object for validation."""
    
    def __init__(self, storm_id: str, basin: str, times: np.ndarray, 
                 lats: np.ndarray, lons: np.ndarray,
                 max_wind: Optional[np.ndarray] = None,
                 mslp: Optional[np.ndarray] = None):
        self.storm_id = storm_id
        self.basin = basin
        self.times = times
        self.lats = lats
        self.lons = lons
        self.max_wind = max_wind
        self.mslp = mslp
    
    def lifetime_hours(self) -> int:
        """Get track lifetime in hours."""
        if len(self.times) < 2:
            return 0
        return int((self.times[-1] - self.times[0]) / np.timedelta64(1, 'h'))
    
    def time_range(self) -> tuple:
        """Get time range (start, end)."""
        return self.times[0], self.times[-1]
    
    def spatial_bounds(self) -> tuple:
        """Get spatial bounds (min_lat, max_lat, min_lon, max_lon)."""
        return (np.min(self.lats), np.max(self.lats), 
                np.min(self.lons), np.max(self.lons))
    
    def __repr__(self):
        return f"IBTrACS({self.storm_id}, {self.basin}, {self.lifetime_hours()}h)"


def load_ibtracs(nc_path: str, start_time: str, end_time: str) -> List[IBTrACSTrack]:
    """
    Load IBTrACS NetCDF and normalize to canonical structure.
    
    Args:
        nc_path: Path to IBTrACS NetCDF file
        start_time: Start time for validation (ISO format)
        end_time: End time for validation (ISO format)
        
    Returns:
        List of IBTrACS track objects
    """
    print(f"🔥 Loading IBTrACS from: {nc_path}")
    print(f"📅 Validation period: {start_time} to {end_time}")
    
    try:
        # Load NetCDF dataset
        ds = xr.open_dataset(nc_path)
        print(f"✅ IBTrACS loaded successfully")
        print(f"📏 Dataset dimensions: {dict(ds.sizes)}")
        
        # Convert time strings to datetime64
        start_dt = np.datetime64(start_time)
        end_dt = np.datetime64(end_time)
        
        # IBTrACS uses a 2D structure: (storm, date_time)
        # We need to find storms active during our validation period
        active_storms = []
        
        print(f"� Finding storms active in validation period...")
        
        for storm_idx in range(len(ds.storm)):
            storm_id = ds.sid.values[storm_idx]
            
            # Get all time steps for this storm
            storm_times = ds.time.values[storm_idx, :]
            
            # Remove NaT values
            valid_times = storm_times[~np.isnat(storm_times)]
            
            if len(valid_times) == 0:
                continue
            
            # Check if storm is active during validation period
            storm_start = np.min(valid_times)
            storm_end = np.max(valid_times)
            
            # Check for any overlap with validation period
            if storm_end < start_dt or storm_start > end_dt:
                continue
            
            # Filter times to validation period
            time_mask = (valid_times >= start_dt) & (valid_times <= end_dt)
            valid_period_times = valid_times[time_mask]
            
            if len(valid_period_times) < 4:  # Minimum 24h at 6h resolution
                continue
            
            # Get corresponding indices
            time_indices = np.where(time_mask)[0]
            
            # Extract track data for validation period
            lats = ds.lat.values[storm_idx, time_indices]
            lons = ds.lon.values[storm_idx, time_indices]
            
            # Remove NaN positions
            valid_mask = ~(np.isnan(lats) | np.isnan(lons))
            if not np.any(valid_mask):
                continue
            
            lats = lats[valid_mask]
            lons = lons[valid_mask]
            valid_period_times = valid_period_times[valid_mask]
            
            if len(lats) < 4:  # Minimum 24h
                continue
            
            # Extract optional intensity data
            max_wind = None
            mslp = None
            
            # Use WMO data if available, otherwise USA data
            if 'wmo_wind' in ds:
                wind_data = ds.wmo_wind.values[storm_idx, time_indices][valid_mask]
                max_wind = wind_data
            elif 'usa_wind' in ds:
                wind_data = ds.usa_wind.values[storm_idx, time_indices][valid_mask]
                max_wind = wind_data
            
            if 'wmo_pres' in ds:
                pres_data = ds.wmo_pres.values[storm_idx, time_indices][valid_mask]
                mslp = pres_data
            elif 'usa_pres' in ds:
                pres_data = ds.usa_pres.values[storm_idx, time_indices][valid_mask]
                mslp = pres_data
            
            # Get basin information (use first non-empty value)
            basin = 'UNKNOWN'
            if 'basin' in ds:
                basin_data = ds.basin.values[storm_idx, time_indices][valid_mask]
                # Remove empty bytes
                valid_basins = [b for b in basin_data if b and b.strip()]
                if valid_basins:
                    basin = valid_basins[0].decode('utf-8') if isinstance(valid_basins[0], bytes) else str(valid_basins[0])
            
            # Create track object
            track = IBTrACSTrack(
                storm_id=str(storm_id.decode('utf-8')) if isinstance(storm_id, bytes) else str(storm_id),
                basin=basin,
                times=valid_period_times,
                lats=lats,
                lons=lons,
                max_wind=max_wind,
                mslp=mslp
            )
            
            active_storms.append(track)
        
        print(f"✅ Successfully processed {len(active_storms)} tracks")
        print(f"📊 Track statistics:")
        
        # Basic statistics
        if active_storms:
            lifetimes = [track.lifetime_hours() for track in active_storms]
            print(f"  Average lifetime: {np.mean(lifetimes):.1f} hours")
            print(f"  Lifetime range: {np.min(lifetimes):.1f} - {np.max(lifetimes):.1f} hours")
            
            # Basin distribution
            basins = {}
            for track in active_storms:
                basin = track.basin
                basins[basin] = basins.get(basin, 0) + 1
            print(f"  Basin distribution: {basins}")
        
        return active_storms
        
    except FileNotFoundError:
        raise FileNotFoundError(f"IBTrACS NetCDF file not found: {nc_path}")
    except Exception as e:
        raise RuntimeError(f"Error loading IBTrACS data: {str(e)}")


def get_ibtracs_summary(tracks: List[IBTrACSTrack]) -> Dict[str, Any]:
    """
    Get summary statistics for IBTrACS tracks.
    
    Args:
        tracks: List of IBTrACS track objects
        
    Returns:
        Summary statistics dictionary
    """
    if not tracks:
        return {"total_tracks": 0}
    
    summary = {
        "total_tracks": len(tracks),
        "basin_distribution": {},
        "lifetime_stats": {},
        "temporal_range": {},
        "spatial_bounds": {}
    }
    
    # Basin distribution
    for track in tracks:
        basin = track.basin
        summary["basin_distribution"][basin] = summary["basin_distribution"].get(basin, 0) + 1
    
    # Lifetime statistics
    lifetimes = [track.lifetime_hours() for track in tracks]
    summary["lifetime_stats"] = {
        "mean": np.mean(lifetimes),
        "std": np.std(lifetimes),
        "min": np.min(lifetimes),
        "max": np.max(lifetimes)
    }
    
    # Temporal range
    all_times = np.concatenate([track.times for track in tracks])
    summary["temporal_range"] = {
        "start": str(np.min(all_times)),
        "end": str(np.max(all_times))
    }
    
    # Spatial bounds
    all_lats = np.concatenate([track.lats for track in tracks])
    all_lons = np.concatenate([track.lons for track in tracks])
    summary["spatial_bounds"] = {
        "lat_min": float(np.min(all_lats)),
        "lat_max": float(np.max(all_lats)),
        "lon_min": float(np.min(all_lons)),
        "lon_max": float(np.max(all_lons))
    }
    
    return summary


def filter_tracks_by_criteria(tracks: List[IBTrACSTrack], 
                           min_lifetime_hours: int = 24,
                           basins: Optional[List[str]] = None) -> List[IBTrACSTrack]:
    """
    Filter IBTrACS tracks by validation criteria.
    
    Args:
        tracks: List of IBTrACS tracks
        min_lifetime_hours: Minimum lifetime in hours
        basins: List of basins to include (None for all)
        
    Returns:
        Filtered list of tracks
    """
    filtered = []
    
    for track in tracks:
        # Lifetime filter
        if track.lifetime_hours() < min_lifetime_hours:
            continue
        
        # Basin filter
        if basins is not None and track.basin not in basins:
            continue
        
        filtered.append(track)
    
    return filtered


# Example usage and testing
if __name__ == "__main__":
    # Example usage with assumed file path
    ibtracs_path = "IBTrACS.ALL.v04r00.nc"
    start_time = "2024-01-01"
    end_time = "2024-12-31"
    
    try:
        print("🔥 Phase 4A: IBTrACS Ingestion Test")
        print("=" * 50)
        
        # Load IBTrACS data
        tracks = load_ibtracs(ibtracs_path, start_time, end_time)
        
        # Get summary
        summary = get_ibtracs_summary(tracks)
        
        print("\n=== IBTrACS SUMMARY ===")
        for key, value in summary.items():
            print(f"{key}: {value}")
        
        # Filter by criteria
        filtered_tracks = filter_tracks_by_criteria(tracks, min_lifetime_hours=24)
        
        print(f"\n=== FILTERED TRACKS ===")
        print(f"Original: {len(tracks)} tracks")
        print(f"Filtered (≥24h): {len(filtered_tracks)} tracks")
        
        # Show example tracks
        print(f"\n=== EXAMPLE TRACKS ===")
        for track in tracks[:3]:
            print(f"{track}")
            print(f"  Time range: {track.time_range()}")
            print(f"  Spatial bounds: {track.spatial_bounds()}")
            print(f"  Lifetime: {track.lifetime_hours()} hours")
            print()
        
    except FileNotFoundError:
        print("❌ IBTrACS file not found - this is expected in testing")
        print("💡 Replace 'IBTrACS.ALL.v04r00.nc' with actual file path")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

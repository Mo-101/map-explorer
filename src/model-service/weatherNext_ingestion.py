"""
WeatherNext 2 Ingestion Module
================================

Canonical ingestion for WeatherNext 2 (Vertex AI) Zarr outputs.
Transforms WeatherNext data into standardized ForecastCube structure.

This module ONLY:
1. Loads Zarr from GCS
2. Selects ensemble member(s)
3. Harmonizes time axis
4. Maps variables → ForecastCube
5. Validates shapes & units
6. Returns ForecastCube

NO hazard logic. NO science. Just structure.
"""

import xarray as xr
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime
import warnings

# Standard pressure levels for WeatherNext
PRESSURE_LEVELS = np.array([1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 50])

def stack_levels(ds: xr.Dataset, variable_base: str, ensemble: int = 0) -> np.ndarray:
    """
    Stack pressure level variables into (T, L, Y, X) array.
    
    Args:
        ds: WeatherNext xarray Dataset
        variable_base: Base variable name (e.g., "u_component_of_wind")
        ensemble: Ensemble member index
        
    Returns:
        np.ndarray: Shape (T, L, Y, X) where L = len(PRESSURE_LEVELS)
    """
    level_arrays = []
    
    for level in PRESSURE_LEVELS:
        var_name = f"{level}hPa_{variable_base}"
        
        # Check if variable exists in dataset
        if var_name not in ds.variables:
            available_vars = [v for v in ds.variables if variable_base in v]
            raise ValueError(
                f"Variable '{var_name}' not found in dataset. "
                f"Available {variable_base} variables: {available_vars}"
            )
        
        # Extract ensemble member and convert to numpy
        level_data = ds[var_name].isel(ensemble=ensemble).values
        level_arrays.append(level_data)
    
    # Stack along pressure level dimension (axis=1)
    stacked = np.stack(level_arrays, axis=1)
    
    return stacked


def validate_forecast_cube(cube: Dict[str, Any]) -> bool:
    """
    Validate ForecastCube structure and shapes.
    
    Args:
        cube: ForecastCube dictionary
        
    Returns:
        bool: True if valid
        
    Raises:
        ValueError: If structure is invalid
    """
    # Check required top-level keys
    required_keys = ["time", "lat", "lon", "surface", "upper_air", "metadata"]
    for key in required_keys:
        if key not in cube:
            raise ValueError(f"Missing required key: {key}")
    
    # Check surface variables
    surface_required = ["u10", "v10", "msl", "tp6"]
    for var in surface_required:
        if var not in cube["surface"]:
            raise ValueError(f"Missing surface variable: {var}")
    
    # Check upper air variables
    upper_required = ["u", "v", "z", "t", "level"]
    for var in upper_required:
        if var not in cube["upper_air"]:
            raise ValueError(f"Missing upper air variable: {var}")
    
    # Validate shapes
    T = len(cube["time"])
    Y = len(cube["lat"])
    X = len(cube["lon"])
    L = len(cube["upper_air"]["level"])
    
    # Surface: (T, Y, X)
    for var in ["u10", "v10", "msl", "tp6"]:
        shape = cube["surface"][var].shape
        if shape != (T, Y, X):
            raise ValueError(f"Surface variable {var} has shape {shape}, expected {(T, Y, X)}")
    
    # Upper air: (T, L, Y, X)
    for var in ["u", "v", "z", "t"]:
        shape = cube["upper_air"][var].shape
        if shape != (T, L, Y, X):
            raise ValueError(f"Upper air variable {var} has shape {shape}, expected {(T, L, Y, X)}")
    
    # Validate pressure levels
    expected_levels = PRESSURE_LEVELS
    if not np.array_equal(cube["upper_air"]["level"], expected_levels):
        raise ValueError(f"Pressure levels mismatch. Expected {expected_levels}, got {cube['upper_air']['level']}")
    
    return True


def load_weathernext_zarr(
    zarr_path: str, 
    ensemble: int = 0,
    time_slice: Optional[slice] = None,
    lat_slice: Optional[slice] = None,
    lon_slice: Optional[slice] = None
) -> Dict[str, Any]:
    """
    Load WeatherNext 2 Zarr data and convert to canonical ForecastCube.
    
    Args:
        zarr_path: GCS path or local path to Zarr dataset
        ensemble: Ensemble member index (default: 0)
        time_slice: Optional time slice (e.g., slice(0, 48) for first 48 hours)
        lat_slice: Optional latitude slice
        lon_slice: Optional longitude slice
        
    Returns:
        Dict[str, Any]: Canonical ForecastCube structure
        
    Raises:
        ValueError: If required variables are missing
        FileNotFoundError: If Zarr path doesn't exist
    """
    print(f"🔥 Loading WeatherNext 2 from: {zarr_path}")
    print(f"📊 Ensemble member: {ensemble}")
    
    try:
        # Load Zarr dataset
        ds = xr.open_zarr(zarr_path, consolidated=True)
        print(f"✅ Zarr loaded successfully")
        print(f"📏 Dataset dimensions: {dict(ds.dims)}")
        
        # Apply spatial/temporal slicing if requested
        if time_slice:
            ds = ds.isel(time=time_slice)
        if lat_slice:
            ds = ds.isel(latitude=lat_slice)
        if lon_slice:
            ds = ds.isel(longitude=lon_slice)
        
        # Extract coordinate arrays
        time_vals = ds.time.values
        lat_vals = ds.latitude.values
        lon_vals = ds.longitude.values
        
        print(f"📅 Time range: {time_vals[0]} to {time_vals[-1]} ({len(time_vals)} steps)")
        print(f"🌍 Lat range: {lat_vals[0]:.2f} to {lat_vals[-1]:.2f} ({len(lat_vals)} points)")
        print(f"🌍 Lon range: {lon_vals[0]:.2f} to {lon_vals[-1]:.2f} ({len(lon_vals)} points)")
        
        # Build ForecastCube structure
        cube = {
            "time": time_vals,
            "lat": lat_vals,
            "lon": lon_vals,
            
            "surface": {
                "u10": ds["10m_u_component_of_wind"].isel(ensemble=ensemble).values,
                "v10": ds["10m_v_component_of_wind"].isel(ensemble=ensemble).values,
                "msl": ds["mean_sea_level_pressure"].isel(ensemble=ensemble).values,
                "tp6": ds["total_precipitation_6hr"].isel(ensemble=ensemble).values,
                "sst": ds.get("sea_surface_temperature", {}).isel(ensemble=ensemble).values 
                        if "sea_surface_temperature" in ds else None
            },
            
            "upper_air": {
                "u": stack_levels(ds, "u_component_of_wind", ensemble),
                "v": stack_levels(ds, "v_component_of_wind", ensemble),
                "z": stack_levels(ds, "geopotential", ensemble),
                "t": stack_levels(ds, "temperature", ensemble),
                "level": PRESSURE_LEVELS
            },
            
            "metadata": {
                "model": "WeatherNext2",
                "ensemble_member": ensemble,
                "init_time": ds.attrs.get("forecast_init_time"),
                "source_path": zarr_path,
                "variables": list(ds.variables.keys())
            }
        }
        
        # Validate the structure
        validate_forecast_cube(cube)
        
        print(f"✅ ForecastCube validated successfully")
        print(f"📊 Surface variables: {list(cube['surface'].keys())}")
        print(f"📊 Upper air levels: {len(cube['upper_air']['level'])}")
        
        return cube
        
    except FileNotFoundError:
        raise FileNotFoundError(f"Zarr dataset not found at: {zarr_path}")
    except Exception as e:
        raise RuntimeError(f"Error loading WeatherNext data: {str(e)}")


def get_forecast_cube_info(cube: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get summary information about a ForecastCube.
    
    Args:
        cube: ForecastCube dictionary
        
    Returns:
        Dict[str, Any]: Summary information
    """
    T = len(cube["time"])
    Y = len(cube["lat"])
    X = len(cube["lon"])
    L = len(cube["upper_air"]["level"])
    
    info = {
        "time_steps": T,
        "lat_points": Y,
        "lon_points": X,
        "pressure_levels": L,
        "surface_shape": (T, Y, X),
        "upper_air_shape": (T, L, Y, X),
        "time_range": {
            "start": str(cube["time"][0]),
            "end": str(cube["time"][-1])
        },
        "spatial_range": {
            "lat_min": float(cube["lat"][0]),
            "lat_max": float(cube["lat"][-1]),
            "lon_min": float(cube["lon"][0]),
            "lon_max": float(cube["lon"][-1])
        },
        "metadata": cube["metadata"]
    }
    
    return info


# Example usage and testing
if __name__ == "__main__":
    # Example usage - replace with actual Zarr path
    example_zarr_path = "gs://weather-bucket/forecasts/20260210_00z.zarr"
    
    try:
        cube = load_weathernext_zarr(example_zarr_path, ensemble=0)
        info = get_forecast_cube_info(cube)
        
        print("\n=== FORECASTCUBE SUMMARY ===")
        for key, value in info.items():
            print(f"{key}: {value}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        print("💡 Make sure you have a valid WeatherNext Zarr path")

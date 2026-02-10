"""
Feature Extraction Module - Phase 2
==================================

Pure diagnostics from WeatherNext ForecastCube.
No heuristics, no classifications, no geography assumptions.
Only physically meaningful fields derived from WeatherNext output.

All features are time-aware and reproducible.
"""

import numpy as np
from typing import Dict, Any, Tuple
import warnings

# Physical constants
EARTH_RADIUS = 6_371_000.0  # meters
API_DECAY_FACTOR = 0.85  # Standard hydrology constant

def wind_speed(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """
    Calculate wind speed magnitude from u and v components.
    
    Physics: |V| = sqrt(u² + v²)
    
    Args:
        u: np.ndarray (T, Y, X) m/s - eastward wind component
        v: np.ndarray (T, Y, X) m/s - northward wind component
        
    Returns:
        np.ndarray (T, Y, X) m/s - wind speed magnitude
        
    Units:
        Input: m/s
        Output: m/s
    """
    return np.sqrt(u**2 + v**2)


def relative_vorticity(u: np.ndarray, v: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """
    Calculate relative vorticity on a sphere.
    
    Physics: ζ = (1/(a*cos(φ))) * (∂v/∂λ - ∂(u*cos(φ))/∂φ)
    
    This is the single most important field for cyclone detection.
    
    Args:
        u: np.ndarray (T, Y, X) m/s - eastward wind component
        v: np.ndarray (T, Y, X) m/s - northward wind component
        lat: np.ndarray (Y,) degrees - latitude coordinates
        lon: np.ndarray (X,) degrees - longitude coordinates
        
    Returns:
        np.ndarray (T, Y, X) s⁻¹ - relative vorticity
        
    Units:
        Input: m/s, degrees
        Output: s⁻¹
    """
    # Convert to radians
    lat_rad = np.deg2rad(lat)
    lon_rad = np.deg2rad(lon)
    
    # Calculate grid spacing in radians
    dlat = np.gradient(lat_rad)
    dlon = np.gradient(lon_rad)
    
    # Calculate spatial derivatives using finite differences
    # ∂v/∂λ (longitude derivative)
    dvdx = np.gradient(v, axis=-1) / (EARTH_RADIUS * np.cos(lat_rad)[None, :, None] * dlon[None, None, :])
    
    # ∂u/∂φ (latitude derivative) - simplified version
    dudy = np.gradient(u, axis=-2) / (EARTH_RADIUS * dlat[None, :, None])
    
    # Relative vorticity (simplified spherical approximation)
    vorticity = dvdx - dudy
    
    return vorticity


def divergence(u: np.ndarray, v: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """
    Calculate horizontal divergence.
    
    Physics: ∇·V = (1/(a*cos(φ))) * (∂u/∂λ + ∂(v*cos(φ))/∂φ)
    
    Useful for convergence zones, tropical organization, flood-enhancing systems.
    
    Args:
        u: np.ndarray (T, Y, X) m/s - eastward wind component
        v: np.ndarray (T, Y, X) m/s - northward wind component
        lat: np.ndarray (Y,) degrees - latitude coordinates
        lon: np.ndarray (X,) degrees - longitude coordinates
        
    Returns:
        np.ndarray (T, Y, X) s⁻¹ - horizontal divergence
        
    Units:
        Input: m/s, degrees
        Output: s⁻¹
    """
    # Convert to radians
    lat_rad = np.deg2rad(lat)
    lon_rad = np.deg2rad(lon)
    
    # Calculate grid spacing in radians
    dlat = np.gradient(lat_rad)
    dlon = np.gradient(lon_rad)
    
    # Calculate spatial derivatives
    # ∂u/∂λ
    dudx = np.gradient(u, axis=-1) / (EARTH_RADIUS * np.cos(lat_rad)[None, :, None] * dlon[None, None, :])
    
    # ∂v/∂φ (simplified version)
    dvdy = np.gradient(v, axis=-2) / (EARTH_RADIUS * dlat[None, :, None])
    
    # Divergence (simplified spherical approximation)
    div = dudx + dvdy
    
    return div


def pressure_gradient(pressure: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """
    Calculate pressure gradient magnitude.
    
    Physics: |∇p| = sqrt((∂p/∂x)² + (∂p/∂y)²)
    
    Cyclones are not "low pressure", they are "strong gradients".
    
    Args:
        pressure: np.ndarray (T, Y, X) Pa - pressure field
        lat: np.ndarray (Y,) degrees - latitude coordinates
        lon: np.ndarray (X,) degrees - longitude coordinates
        
    Returns:
        np.ndarray (T, Y, X) Pa/m - pressure gradient magnitude
        
    Units:
        Input: Pa, degrees
        Output: Pa/m
    """
    # Convert to radians
    lat_rad = np.deg2rad(lat)
    lon_rad = np.deg2rad(lon)
    
    # Calculate grid spacing in radians
    dlat = np.gradient(lat_rad)
    dlon = np.gradient(lon_rad)
    
    # Calculate pressure gradients
    # ∂p/∂x (longitude derivative)
    dpdx = np.gradient(pressure, axis=-1) / (EARTH_RADIUS * np.cos(lat_rad)[None, :, None] * dlon[None, None, :])
    
    # ∂p/∂y (latitude derivative)
    dpdy = np.gradient(pressure, axis=-2) / (EARTH_RADIUS * dlat[None, :, None])
    
    # Gradient magnitude
    grad_magnitude = np.sqrt(dpdx**2 + dpdy**2)
    
    return grad_magnitude


def rolling_accumulation(precip: np.ndarray, window_steps: int) -> np.ndarray:
    """
    Calculate rolling precipitation accumulation.
    
    WeatherNext gives 6-hour increments. Flood physics needs memory.
    
    Args:
        precip: np.ndarray (T, Y, X) meters - 6-hour precipitation
        window_steps: int - number of time steps to accumulate
                     (e.g., 4 for 24h, 12 for 72h)
        
    Returns:
        np.ndarray (T, Y, X) meters - accumulated precipitation
        
    Units:
        Input: meters (6-hour accumulation)
        Output: meters (window accumulation)
    """
    T, Y, X = precip.shape
    accumulated = np.zeros_like(precip)
    
    # Use convolution for efficient rolling sum
    for t in range(window_steps, T):
        accumulated[t] = precip[t-window_steps:t].sum(axis=0)
    
    # Handle early time steps
    for t in range(window_steps):
        accumulated[t] = precip[:t+1].sum(axis=0)
    
    return accumulated


def antecedent_precipitation_index(precip: np.ndarray, k: float = API_DECAY_FACTOR) -> np.ndarray:
    """
    Calculate Antecedent Precipitation Index (API).
    
    Physics: API_t = P_t + k * API_{t-1}
    
    This captures soil wetness memory without soil data.
    Standard hydrology with k = 0.85.
    
    Args:
        precip: np.ndarray (T, Y, X) meters - 6-hour precipitation
        k: float - decay factor (default: 0.85)
        
    Returns:
        np.ndarray (T, Y, X) meters - antecedent precipitation index
        
    Units:
        Input: meters
        Output: meters
    """
    T, Y, X = precip.shape
    api = np.zeros_like(precip)
    
    # API_0 = 0 (dry initial conditions)
    for t in range(1, T):
        api[t] = precip[t] + k * api[t-1]
    
    return api


def extract_features(forecast_cube: Dict[str, Any]) -> Dict[str, np.ndarray]:
    """
    Extract all physical features from ForecastCube.
    
    This is the main entry point for Phase 2.
    
    Args:
        forecast_cube: Dict[str, Any] - Canonical ForecastCube from Phase 1
        
    Returns:
        Dict[str, np.ndarray] - FeatureCube with all extracted fields
        
    FeatureCube structure:
        wind_speed_10m: (T, Y, X) m/s
        vorticity_10m: (T, Y, X) s⁻¹
        divergence_10m: (T, Y, X) s⁻¹
        pressure_gradient: (T, Y, X) Pa/m
        precip_24h: (T, Y, X) meters
        precip_72h: (T, Y, X) meters
        api: (T, Y, X) meters
    """
    print("🔥 Extracting physical features from ForecastCube...")
    
    # Extract coordinates
    lat = forecast_cube["lat"]
    lon = forecast_cube["lon"]
    
    # Extract surface fields
    u10 = forecast_cube["surface"]["u10"]
    v10 = forecast_cube["surface"]["v10"]
    msl = forecast_cube["surface"]["msl"]
    tp6 = forecast_cube["surface"]["tp6"]
    
    print(f"📏 Input shapes: u10={u10.shape}, v10={v10.shape}, msl={msl.shape}, tp6={tp6.shape}")
    
    # Extract features
    features = {}
    
    # 1. Wind speed (10m)
    features["wind_speed_10m"] = wind_speed(u10, v10)
    print("✅ Wind speed calculated")
    
    # 2. Relative vorticity (10m)
    features["vorticity_10m"] = relative_vorticity(u10, v10, lat, lon)
    print("✅ Relative vorticity calculated")
    
    # 3. Divergence (10m)
    features["divergence_10m"] = divergence(u10, v10, lat, lon)
    print("✅ Divergence calculated")
    
    # 4. Pressure gradient magnitude
    features["pressure_gradient"] = pressure_gradient(msl, lat, lon)
    print("✅ Pressure gradient calculated")
    
    # 5. Rolling precipitation accumulations
    features["precip_24h"] = rolling_accumulation(tp6, window_steps=4)  # 4 * 6h = 24h
    features["precip_72h"] = rolling_accumulation(tp6, window_steps=12)  # 12 * 6h = 72h
    print("✅ Rolling precipitation calculated (24h, 72h)")
    
    # 6. Antecedent Precipitation Index
    features["api"] = antecedent_precipitation_index(tp6)
    print("✅ Antecedent precipitation index calculated")
    
    # Validate feature shapes
    for name, feature in features.items():
        if feature.shape != (len(forecast_cube["time"]), len(lat), len(lon)):
            raise ValueError(f"Feature {name} has shape {feature.shape}, expected {(len(forecast_cube['time']), len(lat), len(lon))}")
    
    print(f"✅ All {len(features)} features extracted and validated")
    
    return features


def get_feature_info(features: Dict[str, np.ndarray]) -> Dict[str, Any]:
    """
    Get summary information about extracted features.
    
    Args:
        features: Dict[str, np.ndarray] - FeatureCube
        
    Returns:
        Dict[str, Any] - Summary information
    """
    info = {
        "num_features": len(features),
        "features": {}
    }
    
    for name, feature in features.items():
        feature_info = {
            "shape": feature.shape,
            "dtype": str(feature.dtype),
            "min": float(np.min(feature)),
            "max": float(np.max(feature)),
            "mean": float(np.mean(feature)),
            "std": float(np.std(feature)),
            "has_nan": bool(np.any(np.isnan(feature)))
        }
        info["features"][name] = feature_info
    
    return info


# Example usage and testing
if __name__ == "__main__":
    # Test with mock data
    T, Y, X = 48, 721, 1440  # 48 hours, full global grid
    
    # Mock forecast cube
    mock_cube = {
        "time": np.arange(T),
        "lat": np.linspace(-90, 90, Y),
        "lon": np.linspace(-180, 180, X),
        "surface": {
            "u10": np.random.randn(T, Y, X) * 10,  # m/s
            "v10": np.random.randn(T, Y, X) * 10,  # m/s
            "msl": 101325 + np.random.randn(T, Y, X) * 1000,  # Pa
            "tp6": np.random.exponential(0.001, (T, Y, X))  # meters
        }
    }
    
    try:
        features = extract_features(mock_cube)
        info = get_feature_info(features)
        
        print("\n=== FEATURE EXTRACTION SUMMARY ===")
        print(f"Total features: {info['num_features']}")
        for name, finfo in info['features'].items():
            print(f"{name}:")
            print(f"  Shape: {finfo['shape']}")
            print(f"  Range: [{finfo['min']:.3e}, {finfo['max']:.3e}]")
            print(f"  Mean: {finfo['mean']:.3e} ± {finfo['std']:.3e}")
            print(f"  Has NaN: {finfo['has_nan']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

# AFRO STORM - Interface Contracts
# =====================================

**LOCKED INTERFACES FOR PHASE 4 VALIDATION**
*No scope creep while waiting for WeatherNext access*

---

## 📋 DATA STRUCTURE CONTRACTS

### 1️⃣ ForecastCube (Phase 1 Output)
```python
ForecastCube = {
    "metadata": {
        "model": "WeatherNext2",  # REQUIRED: Must be WeatherNext2
        "init_time": str,        # ISO format
        "horizon_hrs": int,      # Forecast horizon
        "ensemble": int,          # Ensemble member
        "grid_shape": tuple       # (T, Y, X) or (T, L, Y, X)
    },
    "data": {
        # Surface fields (T, Y, X)
        "u10": np.ndarray,        # 10m u-wind (m/s)
        "v10": np.ndarray,        # 10m v-wind (m/s)
        "msl": np.ndarray,        # Mean sea level pressure (Pa)
        "tp6": np.ndarray,        # 6-hourly precipitation (m)
        
        # Pressure level fields (T, L, Y, X)
        "u": np.ndarray,          # u-wind by level (m/s)
        "v": np.ndarray,          # v-wind by level (m/s)
        "pressure_levels": np.ndarray,  # Pressure levels (hPa)
    },
    "coords": {
        "time": np.ndarray,       # T timesteps (datetime64)
        "lat": np.ndarray,        # Y latitudes (degrees)
        "lon": np.ndarray,        # X longitudes (degrees)
    }
}
```

### 2️⃣ FeatureCube (Phase 2 Output)
```python
FeatureCube = {
    "metadata": {
        "source": "ForecastCube",
        "extraction_method": "physics_based",
        "units_documented": True,
    },
    "features": {
        # All (T, Y, X) arrays
        "wind_speed_10m": np.ndarray,     # m/s
        "vorticity_10m": np.ndarray,       # s^-1
        "divergence_10m": np.ndarray,       # s^-1
        "pressure_gradient": np.ndarray,       # Pa/m
        "precip_24h": np.ndarray,          # meters
        "precip_72h": np.ndarray,          # meters
        "api": np.ndarray,                   # meters
    }
}
```

### 3️⃣ CycloneObject (Phase 3A Output)
```python
CycloneObject = {
    "track_id": int,
    "track": List[Tuple[int, float, float]],  # [(time, lat, lon), ...]
    "lifetime_hours": int,
    "max_wind_10m": float,        # m/s
    "max_vorticity": float,         # s^-1
    "min_pressure_gradient": float,   # Pa/m
    "hemisphere": str,             # "NH" or "SH"
    "intensity_class": str,         # "weak", "moderate", "strong"
    "development_stage": str,        # "short_lived", "mature", "long_lived"
    "structure_metrics": {
        "num_candidates": int,
        "avg_vorticity": float,
        "avg_wind_speed": float,
    }
}
```

### 4️⃣ IBTrACSTrack (Phase 4A Input)
```python
IBTrACSTrack = {
    "storm_id": str,               # WMO storm identifier
    "basin": str,                 # Basin code (NA, EP, WP, etc.)
    "times": np.ndarray,           # datetime64 array
    "lats": np.ndarray,           # latitude array (degrees)
    "lons": np.ndarray,           # longitude array (degrees)
    "max_wind": np.ndarray,        # Optional: wind speed (m/s)
    "mslp": np.ndarray,           # Optional: pressure (Pa)
}
```

---

## 🎯 VALIDATION CRITERIA CONTRACTS

### 1️⃣ Track Matching (Phase 4B)
**ALL THREE MUST BE SATISFIED:**
- Temporal overlap ≥ 24 hours
- Mean spatial distance ≤ 300 km
- At least one point within 150 km

### 2️⃣ Performance Targets (Phase 4C)
| Metric | Target | Acceptable Range |
|--------|---------|-----------------|
| Recall | 60-80% | ≥60% (conservative under-detection) |
| False Alarm Rate | < Miss Rate | Conservative approach |
| Mean Position Error | < 300 km | Acceptable at genesis |
| Overall Assessment | "GOOD" | Balanced performance |

---

## 🚫 GUARDRAILS (MANDATORY)

### 1️⃣ Model Source Validation
```python
def validate_forecast_source(forecast_cube: ForecastCube) -> bool:
    """CRITICAL: Must be WeatherNext2, not ERA5 or other data"""
    return forecast_cube["metadata"]["model"] == "WeatherNext2"
```

### 2️⃣ No Synthetic Validation
```python
def prevent_synthetic_validation():
    """CRITICAL: No fake storms, no invented metrics"""
    if detected_tracks is []:
        # OK for plumbing test
        pass
    else:
        # Must be real WeatherNext output
        assert source_is_weathernext()
```

### 3️⃣ No Premature Hazard Logic
```python
def validate_phase_scope():
    """CRITICAL: Phase 4 = validation only"""
    # ❌ FORBIDDEN in Phase 4:
    # - Flood risk calculation
    # - Multi-hazard convergence
    # - Impact assessment
    # - Emergency recommendations
    # ✅ ALLOWED in Phase 4:
    # - Cyclone detection
    # - Track matching
    # - Metrics computation
    # - Parameter calibration
    return True
```

---

## 📊 OUTPUT FORMAT CONTRACTS

### 1️⃣ Validation Metrics Table
```markdown
| Metric | Value | Target | Status |
|---------|--------|---------|---------|
| IBTrACS storms | X | - | - |
| Detected storms | Y | - | - |
| Hits | Z | - | - |
| Misses | X-Z | - | - |
| False positives | Y-Z | - | - |
| Mean track error | XXX km | <300 km | ✅/❌ |
| Recall | XX% | 60-80% | ✅/❌ |
| False alarm rate | XX% | <miss rate | ✅/❌ |
```

### 2️⃣ Calibration Recommendations
```python
CalibrationRecommendations = {
    "recall": {
        "status": "LOW" | "GOOD" | "HIGH",
        "suggestion": str,
        "reason": str
    },
    "precision": {
        "status": "LOW" | "GOOD" | "HIGH", 
        "suggestion": str,
        "reason": str
    },
    "position": {
        "status": "GOOD" | "HIGH",
        "suggestion": str,
        "reason": str
    }
}
```

---

## 🔒 INTERFACE STABILITY CONTRACTS

### 1️⃣ No Breaking Changes
- **Phase 1**: `load_weathernext_zarr()` signature locked
- **Phase 2**: `extract_features()` signature locked
- **Phase 3A**: `detect_cyclones()` signature locked
- **Phase 4**: `match_tracks()` signature locked

### 2️⃣ Backward Compatibility
- All existing tests must pass
- No parameter signature changes
- No output format changes

### 3️⃣ Version Control
- Tag validation-ready commit
- Document exact WeatherNext version used
- Record IBTrACS version (v04r01)

---

## 🎯 EXECUTION READINESS CHECKLIST

When WeatherNext access is approved, verify:

- [ ] WeatherNext config file ready (`configs/weathernext_validation.yaml`)
- [ ] IBTrACS file accessible (`data/ibtracs/IBTrACS.ALL.v04r01.nc`)
- [ ] All modules import successfully
- [ ] Guardrails in place and tested
- [ ] Output directories created
- [ ] Validation pipeline tested with empty data

**Only when ALL checked should proceed to real execution.**

---

*Document Version: 1.0*
*Status: LOCKED FOR PHASE 4 VALIDATION*
*Next Update: After first real validation results*

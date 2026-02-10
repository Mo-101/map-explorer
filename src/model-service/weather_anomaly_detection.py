"""
AFRO STORM - Weather Anomaly Detection Module
============================================

Advanced algorithms for detecting cyclones, floods, landslides, and convergence zones
from GraphCast forecast data and weather observations.

Built for MoStar Industries | Multi-Model Mesh Intelligence
"""

import numpy as np
import scipy.ndimage as ndimage
from scipy.spatial.distance import cdist
from geopy.distance import geodesic
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
import math

class WeatherAnomalyDetector:
    """
    Advanced weather anomaly detection using GraphCast forecast data.
    
    Capabilities:
    - Cyclone detection with intensity classification
    - Flood risk assessment from precipitation patterns  
    - Landslide susceptibility analysis
    - Multi-hazard convergence zone identification
    """
    
    def __init__(self):
        self.cyclone_thresholds = {
            'tropical_depression': {'wind_speed': 61, 'pressure_drop': 5},
            'tropical_storm': {'wind_speed': 88, 'pressure_drop': 10},
            'category_1': {'wind_speed': 119, 'pressure_drop': 15},
            'category_2': {'wind_speed': 154, 'pressure_drop': 20},
            'category_3': {'wind_speed': 178, 'pressure_drop': 25},
            'category_4': {'wind_speed': 208, 'pressure_drop': 30},
            'category_5': {'wind_speed': 251, 'pressure_drop': 35}
        }
        
        self.flood_thresholds = {
            'heavy_rain': {'mm_per_hour': 50, 'duration_hours': 3},
            'extreme_rain': {'mm_per_hour': 100, 'duration_hours': 1},
            'flash_flood': {'mm_per_hour': 150, 'duration_hours': 0.5}
        }
        
        self.landslide_factors = {
            'steep_slope': 30,  # degrees
            'soil_saturation': 0.8,  # 80% saturation
            'rainfall_intensity': 75,  # mm per day
            'seismic_activity': 4.0  # richter scale
        }

    def detect_all_hazards(self, graphcast_data: Dict[str, Any]) -> Dict[str, List[Dict]]:
        """
        Detect all weather hazards from GraphCast forecast data.
        
        Args:
            graphcast_data: Dictionary containing forecast fields
            
        Returns:
            Dictionary with detected hazards by type
        """
        results = {
            'cyclones': self.detect_cyclones(graphcast_data),
            'floods': self.detect_floods(graphcast_data),
            'landslides': self.detect_landslides(graphcast_data),
            'convergences': self.detect_convergence_zones(graphcast_data)
        }
        
        return results

    def detect_cyclones(self, data: Dict[str, Any]) -> List[Dict]:
        """
        Detect cyclones using wind speed, pressure, and vorticity patterns.
        """
        cyclones = []
        
        # Extract wind and pressure fields
        wind_u = data.get('u_component_of_wind', [])
        wind_v = data.get('v_component_of_wind', [])
        pressure = data.get('sea_level_pressure', [])
        
        if not wind_u or not wind_v or not pressure:
            return cyclones
        
        # Calculate wind speed and vorticity
        wind_speed = np.sqrt(np.array(wind_u)**2 + np.array(wind_v)**2)
        vorticity = self._calculate_vorticity(wind_u, wind_v)
        
        # Find low pressure centers with high vorticity
        pressure_array = np.array(pressure)
        low_pressure_centers = self._find_local_minima(pressure_array, threshold=1010)
        
        for center in low_pressure_centers:
            lat_idx, lon_idx = center
            
            # Extract values at this location
            center_wind_speed = wind_speed[lat_idx, lon_idx]
            center_vorticity = vorticity[lat_idx, lon_idx]
            center_pressure = pressure_array[lat_idx, lon_idx]
            
            # Classify cyclone intensity
            intensity = self._classify_cyclone_intensity(center_wind_speed, center_pressure)
            
            if intensity != 'none':
                # Calculate cyclone characteristics
                radius = self._estimate_cyclone_radius(wind_speed, center)
                forward_speed = self._calculate_forward_speed(wind_u, wind_v, center)
                
                cyclone = {
                    'id': f"cyclone-{datetime.now().strftime('%Y%m%d%H%M')}-{lat_idx}-{lon_idx}",
                    'type': 'cyclone',
                    'intensity': intensity,
                    'center_lat': self._index_to_lat(lat_idx),
                    'center_lon': self._index_to_lon(lon_idx),
                    'max_wind_speed': float(center_wind_speed),
                    'min_pressure': float(center_pressure),
                    'vorticity': float(center_vorticity),
                    'radius_km': radius,
                    'forward_speed_kmh': forward_speed,
                    'detection_confidence': self._calculate_cyclone_confidence(
                        center_wind_speed, center_vorticity, center_pressure
                    ),
                    'timestamp': datetime.now().isoformat(),
                    'affected_regions': self._get_affected_regions(center, radius)
                }
                
                cyclones.append(cyclone)
        
        return cyclones

    def detect_floods(self, data: Dict[str, Any]) -> List[Dict]:
        """
        Detect flood risk from precipitation patterns and accumulated rainfall.
        """
        floods = []
        
        # Extract precipitation data
        precipitation = data.get('total_precipitation', [])
        if not precipitation:
            return floods
        
        precip_array = np.array(precipitation)
        
        # Find areas with heavy precipitation
        heavy_rain_areas = np.where(precip_array > self.flood_thresholds['heavy_rain']['mm_per_hour'] / 24)
        
        for lat_idx, lon_idx in zip(heavy_rain_areas[0], heavy_rain_areas[1]):
            precip_value = precip_array[lat_idx, lon_idx]
            
            # Calculate flood risk factors
            risk_score = self._calculate_flood_risk(
                precip_value, lat_idx, lon_idx, data
            )
            
            if risk_score > 0.5:  # Moderate risk threshold
                flood = {
                    'id': f"flood-{datetime.now().strftime('%Y%m%d%H%M')}-{lat_idx}-{lon_idx}",
                    'type': 'flood',
                    'severity': self._classify_flood_severity(risk_score),
                    'center_lat': self._index_to_lat(lat_idx),
                    'center_lon': self._index_to_lon(lon_idx),
                    'precipitation_mm_per_hour': float(precip_value * 24),
                    'risk_score': float(risk_score),
                    'affected_area_km2': self._estimate_flood_area(lat_idx, lon_idx, data),
                    'duration_hours': self._estimate_flood_duration(precip_value),
                    'detection_confidence': min(0.95, risk_score + 0.1),
                    'timestamp': datetime.now().isoformat(),
                    'affected_regions': self._get_affected_regions((lat_idx, lon_idx), 50)
                }
                
                floods.append(flood)
        
        return floods

    def detect_landslides(self, data: Dict[str, Any]) -> List[Dict]:
        """
        Detect landslide susceptibility from rainfall, terrain, and soil conditions.
        """
        landslides = []
        
        # Extract relevant data
        precipitation = data.get('total_precipitation', [])
        soil_moisture = data.get('soil_moisture', [])
        
        if not precipitation:
            return landslides
        
        precip_array = np.array(precipitation)
        
        # Find high-risk areas (simplified - in production would use terrain data)
        high_rainfall_areas = np.where(precip_array > self.landslide_factors['rainfall_intensity'] / 24)
        
        for lat_idx, lon_idx in zip(high_rainfall_areas[0], high_rainfall_areas[1]):
            precip_value = precip_array[lat_idx, lon_idx]
            
            # Calculate landslide risk
            risk_score = self._calculate_landslide_risk(
                precip_value, lat_idx, lon_idx, data
            )
            
            if risk_score > 0.4:  # Lower threshold for landslides
                landslide = {
                    'id': f"landslide-{datetime.now().strftime('%Y%m%d%H%M')}-{lat_idx}-{lon_idx}",
                    'type': 'landslide',
                    'severity': self._classify_landslide_severity(risk_score),
                    'center_lat': self._index_to_lat(lat_idx),
                    'center_lon': self._index_to_lon(lon_idx),
                    'trigger_rainfall_mm': float(precip_value * 24),
                    'risk_score': float(risk_score),
                    'slope_angle': self._estimate_slope_angle(lat_idx, lon_idx),  # Simplified
                    'soil_saturation': self._estimate_soil_saturation(lat_idx, lon_idx, data),
                    'detection_confidence': min(0.9, risk_score + 0.15),
                    'timestamp': datetime.now().isoformat(),
                    'affected_regions': self._get_affected_regions((lat_idx, lon_idx), 25)
                }
                
                landslides.append(landslide)
        
        return landslides

    def detect_convergence_zones(self, data: Dict[str, Any]) -> List[Dict]:
        """
        Detect multi-hazard convergence zones where multiple risks overlap.
        """
        convergences = []
        
        # Get all detected hazards
        cyclones = self.detect_cyclones(data)
        floods = self.detect_floods(data)
        landslides = self.detect_landslides(data)
        
        # Find overlapping areas
        all_hazards = cyclones + floods + landslides
        
        if len(all_hazards) < 2:
            return convergences
        
        # Group hazards by proximity
        hazard_groups = self._group_hazards_by_proximity(all_hazards, radius_km=200)
        
        for group in hazard_groups:
            if len(group) >= 2:  # Convergence zone requires 2+ hazards
                # Calculate convergence characteristics
                center_lat = np.mean([h['center_lat'] for h in group])
                center_lon = np.mean([h['center_lon'] for h in group])
                
                convergence = {
                    'id': f"convergence-{datetime.now().strftime('%Y%m%d%H%M')}",
                    'type': 'convergence',
                    'severity': self._calculate_convergence_severity(group),
                    'center_lat': float(center_lat),
                    'center_lon': float(center_lon),
                    'involved_hazards': [h['id'] for h in group],
                    'hazard_types': list(set([h['type'] for h in group])),
                    'interaction_radius_km': self._calculate_interaction_radius(group),
                    'risk_multiplier': self._calculate_risk_multiplier(group),
                    'detection_confidence': min(0.98, np.mean([h['detection_confidence'] for h in group])),
                    'timestamp': datetime.now().isoformat(),
                    'affected_regions': list(set(sum([h.get('affected_regions', []) for h in group], []))),
                    'recommendations': self._generate_convergence_recommendations(group)
                }
                
                convergences.append(convergence)
        
        return convergences

    # Helper methods for calculations
    def _calculate_vorticity(self, u: List, v: List) -> np.ndarray:
        """Calculate relative vorticity from wind components."""
        u_array = np.array(u)
        v_array = np.array(v)
        
        # Simple vorticity calculation (simplified for demonstration)
        dv_dx = np.gradient(v_array, axis=1)
        du_dy = np.gradient(u_array, axis=0)
        
        return dv_dx - du_dy

    def _find_local_minima(self, array: np.ndarray, threshold: float) -> List[Tuple[int, int]]:
        """Find local minima below threshold."""
        minima = []
        
        # Use scipy's minimum filter to find local minima
        local_min = ndimage.minimum_filter(array, size=3)
        minima_mask = (array == local_min) & (array < threshold)
        
        minima_indices = np.where(minima_mask)
        for i, j in zip(minima_indices[0], minima_indices[1]):
            minima.append((i, j))
        
        return minima

    def _classify_cyclone_intensity(self, wind_speed: float, pressure: float) -> str:
        """Classify cyclone intensity based on wind speed and pressure."""
        for category, thresholds in reversed(list(self.cyclone_thresholds.items())):
            if wind_speed >= thresholds['wind_speed']:
                return category
        return 'none'

    def _estimate_cyclone_radius(self, wind_speed: np.ndarray, center: Tuple[int, int]) -> float:
        """Estimate cyclone radius from wind speed field."""
        lat_idx, lon_idx = center
        
        # Find where wind speed drops below threshold
        threshold = 25  # km/h
        radius_pixels = 0
        
        for radius in range(1, 20):  # Search up to 20 pixels
            lat_start = max(0, lat_idx - radius)
            lat_end = min(wind_speed.shape[0], lat_idx + radius + 1)
            lon_start = max(0, lon_idx - radius)
            lon_end = min(wind_speed.shape[1], lon_idx + radius + 1)
            
            ring_wind = wind_speed[lat_start:lat_end, lon_start:lon_end]
            if np.mean(ring_wind) < threshold:
                radius_pixels = radius
                break
        
        # Convert to km (rough approximation)
        return radius_pixels * 25  # ~25km per pixel at this resolution

    def _calculate_forward_speed(self, u: List, v: List, center: Tuple[int, int]) -> float:
        """Calculate cyclone forward speed."""
        # Simplified - would track movement over time in production
        return 15.0  # km/h average

    def _calculate_cyclone_confidence(self, wind_speed: float, vorticity: float, pressure: float) -> float:
        """Calculate detection confidence for cyclone."""
        confidence = 0.0
        
        if wind_speed > 60:
            confidence += 0.3
        if vorticity > 1e-4:
            confidence += 0.3
        if pressure < 1000:
            confidence += 0.3
            
        return min(0.95, confidence + 0.1)

    def _calculate_flood_risk(self, precipitation: float, lat_idx: int, lon_idx: int, data: Dict) -> float:
        """Calculate flood risk score."""
        risk = 0.0
        
        # Base risk from precipitation
        if precipitation > 0.05:  # 50mm/day
            risk += 0.4
        if precipitation > 0.1:   # 100mm/day
            risk += 0.3
        if precipitation > 0.15:  # 150mm/day
            risk += 0.2
            
        # Add factors from soil moisture, terrain (simplified)
        risk += 0.1  # Base risk factor
        
        return min(1.0, risk)

    def _classify_flood_severity(self, risk_score: float) -> str:
        """Classify flood severity."""
        if risk_score > 0.8:
            return 'extreme'
        elif risk_score > 0.6:
            return 'high'
        elif risk_score > 0.4:
            return 'moderate'
        else:
            return 'low'

    def _estimate_flood_area(self, lat_idx: int, lon_idx: int, data: Dict) -> float:
        """Estimate affected flood area in km²."""
        # Simplified calculation
        return 100.0  # km²

    def _estimate_flood_duration(self, precipitation: float) -> float:
        """Estimate flood duration in hours."""
        if precipitation > 0.15:
            return 24.0
        elif precipitation > 0.1:
            return 12.0
        else:
            return 6.0

    def _calculate_landslide_risk(self, precipitation: float, lat_idx: int, lon_idx: int, data: Dict) -> float:
        """Calculate landslide risk score."""
        risk = 0.0
        
        # Risk from rainfall
        if precipitation > 0.08:  # 80mm/day
            risk += 0.4
        if precipitation > 0.12:  # 120mm/day
            risk += 0.3
            
        # Add slope and soil factors (simplified)
        risk += 0.2  # Assumed steep slopes in mountainous regions
        risk += 0.1  # Soil moisture factor
        
        return min(1.0, risk)

    def _classify_landslide_severity(self, risk_score: float) -> str:
        """Classify landslide severity."""
        if risk_score > 0.7:
            return 'high'
        elif risk_score > 0.5:
            return 'moderate'
        else:
            return 'low'

    def _estimate_slope_angle(self, lat_idx: int, lon_idx: int) -> float:
        """Estimate slope angle (simplified)."""
        # Would use terrain data in production
        return 35.0  # degrees

    def _estimate_soil_saturation(self, lat_idx: int, lon_idx: int, data: Dict) -> float:
        """Estimate soil saturation."""
        # Would use soil moisture data in production
        return 0.85  # 85% saturation

    def _group_hazards_by_proximity(self, hazards: List[Dict], radius_km: float) -> List[List[Dict]]:
        """Group hazards by geographic proximity."""
        if not hazards:
            return []
            
        groups = []
        used = set()
        
        for i, hazard1 in enumerate(hazards):
            if i in used:
                continue
                
            group = [hazard1]
            used.add(i)
            
            for j, hazard2 in enumerate(hazards):
                if j <= i or j in used:
                    continue
                    
                distance = self._calculate_distance(
                    hazard1['center_lat'], hazard1['center_lon'],
                    hazard2['center_lat'], hazard2['center_lon']
                )
                
                if distance <= radius_km:
                    group.append(hazard2)
                    used.add(j)
            
            groups.append(group)
        
        return groups

    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in km."""
        return geodesic((lat1, lon1), (lat2, lon2)).kilometers

    def _calculate_convergence_severity(self, hazards: List[Dict]) -> str:
        """Calculate convergence zone severity."""
        severity_score = 0
        
        for hazard in hazards:
            if hazard['type'] == 'cyclone':
                severity_score += 0.4
            elif hazard['type'] == 'flood':
                severity_score += 0.3
            elif hazard['type'] == 'landslide':
                severity_score += 0.2
                
        if severity_score > 0.7:
            return 'extreme'
        elif severity_score > 0.5:
            return 'high'
        elif severity_score > 0.3:
            return 'moderate'
        else:
            return 'low'

    def _calculate_interaction_radius(self, hazards: List[Dict]) -> float:
        """Calculate interaction radius for convergence zone."""
        # Base radius plus hazard-specific additions
        base_radius = 100.0  # km
        
        for hazard in hazards:
            if hazard['type'] == 'cyclone':
                base_radius += hazard.get('radius_km', 100)
            elif hazard['type'] == 'flood':
                base_radius += hazard.get('affected_area_km2', 100) ** 0.5
                
        return base_radius

    def _calculate_risk_multiplier(self, hazards: List[Dict]) -> float:
        """Calculate risk multiplier for hazard interactions."""
        base_multiplier = 1.0
        
        # Add multiplicative effects
        if len(hazards) >= 3:
            base_multiplier *= 2.5
        elif len(hazards) >= 2:
            base_multiplier *= 1.8
            
        # Type-specific interactions
        hazard_types = [h['type'] for h in hazards]
        if 'cyclone' in hazard_types and 'flood' in hazard_types:
            base_multiplier *= 1.5  # Storm surge effect
            
        return base_multiplier

    def _generate_convergence_recommendations(self, hazards: List[Dict]) -> List[str]:
        """Generate recommendations for convergence zones."""
        recommendations = []
        
        hazard_types = [h['type'] for h in hazards]
        
        if 'cyclone' in hazard_types and 'flood' in hazard_types:
            recommendations.append("Immediate evacuation recommended due to storm surge risk")
            recommendations.append("Prepare emergency shelters inland")
            
        if 'landslide' in hazard_types:
            recommendations.append("Avoid mountainous areas and steep slopes")
            recommendations.append("Monitor road conditions for blockages")
            
        if len(hazards) >= 3:
            recommendations.append("Activate emergency response protocols")
            recommendations.append("Issue multi-hazard warnings to public")
            
        return recommendations

    def _index_to_lat(self, index: int) -> float:
        """Convert array index to latitude (simplified)."""
        return -90 + (index * 180 / 180)  # Assuming 180 latitude points

    def _index_to_lon(self, index: int) -> float:
        """Convert array index to longitude (simplified)."""
        return -180 + (index * 360 / 360)  # Assuming 360 longitude points

    def _get_affected_regions(self, center: Tuple[int, int], radius_km: float) -> List[str]:
        """Get list of affected regions (simplified)."""
        # Would use geographic boundaries in production
        lat, lon = self._index_to_lat(center[0]), self._index_to_lon(center[1])
        
        regions = []
        if -20 <= lat <= 20:  # Tropical Africa
            regions.extend(["West Africa", "Central Africa"])
        if 20 <= lat <= 40:  # North Africa
            regions.append("North Africa")
        if -40 <= lat <= -20:  # Southern Africa
            regions.append("Southern Africa")
            
        return regions


# -----------------------------------------------------------------------------
# Thin wrapper detectors used by backend MoScripts
# -----------------------------------------------------------------------------

class CycloneDetector:
    def __init__(self):
        self._detector = WeatherAnomalyDetector()

    def detect(self, graphcast_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self._detector.detect_cyclones(graphcast_data)


class FloodDetector:
    def __init__(self):
        self._detector = WeatherAnomalyDetector()

    def detect(self, graphcast_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self._detector.detect_floods(graphcast_data)


class LandslideDetector:
    def __init__(self):
        self._detector = WeatherAnomalyDetector()

    def detect(self, graphcast_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self._detector.detect_landslides(graphcast_data)

# Example usage and testing
if __name__ == "__main__":
    detector = WeatherAnomalyDetector()
    
    # Example GraphCast data structure (simplified)
    sample_data = {
        'u_component_of_wind': [[10, 15, 20], [25, 30, 35], [40, 45, 50]],
        'v_component_of_wind': [[5, 10, 15], [20, 25, 30], [35, 40, 45]],
        'sea_level_pressure': [[1010, 1005, 1000], [995, 990, 985], [980, 975, 970]],
        'total_precipitation': [[0.01, 0.05, 0.1], [0.15, 0.2, 0.25], [0.3, 0.35, 0.4]],
        'soil_moisture': [[0.6, 0.7, 0.8], [0.85, 0.9, 0.95], [0.9, 0.95, 1.0]]
    }
    
    results = detector.detect_all_hazards(sample_data)
    print("Weather Anomaly Detection Results:")
    print(f"Cyclones: {len(results['cyclones'])}")
    print(f"Floods: {len(results['floods'])}")
    print(f"Landslides: {len(results['landslides'])}")
    print(f"Convergence Zones: {len(results['convergences'])}")

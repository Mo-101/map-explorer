#!/usr/bin/env python3
"""
Test GraphCast Analysis to understand current detection behavior
"""

import sys
sys.path.append('.')
from weather_anomaly_detection import WeatherAnomalyDetector

def test_graphcast_analysis():
    """Test current GraphCast analysis with sample data"""
    
    detector = WeatherAnomalyDetector()
    
    # Sample data that mimics current mock structure
    sample_data = {
        'u_component_of_wind': [[10, 15, 20, 25, 30], [35, 40, 45, 50, 55], [60, 65, 70, 75, 80], 
                               [85, 90, 95, 100, 105], [110, 115, 120, 125, 130]],
        'v_component_of_wind': [[5, 10, 15, 20, 25], [30, 35, 40, 45, 50], [55, 60, 65, 70, 75],
                               [80, 85, 90, 95, 100], [105, 110, 115, 120, 125]],
        'sea_level_pressure': [[1010, 1005, 1000, 995, 990], [985, 980, 975, 970, 965], [960, 955, 950, 945, 940],
                               [935, 930, 925, 920, 915], [910, 905, 900, 895, 890]],
        'total_precipitation': [[0.01, 0.05, 0.1, 0.15, 0.2], [0.25, 0.3, 0.35, 0.4, 0.45], [0.5, 0.55, 0.6, 0.65, 0.7],
                               [0.75, 0.8, 0.85, 0.9, 0.95], [1.0, 1.05, 1.1, 1.15, 1.2]],
        'soil_moisture': [[0.6, 0.7, 0.8, 0.85, 0.9], [0.92, 0.94, 0.96, 0.98, 1.0], [0.95, 0.97, 0.99, 1.0, 1.0],
                               [0.9, 0.92, 0.94, 0.96, 0.98], [0.85, 0.87, 0.89, 0.91, 0.93]]
    }
    
    results = detector.detect_all_hazards(sample_data)
    
    print('=== GRAPHCAST ANALYSIS RESULTS ===')
    print(f'Cyclones detected: {len(results["cyclones"])}')
    print(f'Floods detected: {len(results["floods"])}') 
    print(f'Landslides detected: {len(results["landslides"])}')
    print(f'Convergence zones: {len(results["convergences"])}')
    
    print('\n=== DETAILED CYCLONE ANALYSIS ===')
    for cyclone in results['cyclones']:
        print(f'Cyclone ID: {cyclone["id"]}')
        print(f'  Location: {cyclone["center_lat"]:.2f}, {cyclone["center_lon"]:.2f}')
        print(f'  Intensity: {cyclone["intensity"]}')
        print(f'  Max Wind: {cyclone["max_wind_speed"]:.1f} kt')
        print(f'  Min Pressure: {cyclone["min_pressure"]:.1f} hPa')
        print(f'  Confidence: {cyclone["detection_confidence"]:.2f}')
        print(f'  Radius: {cyclone["radius_km"]:.1f} km')
    
    print('\n=== DETAILED FLOOD ANALYSIS ===')
    for flood in results['floods']:
        print(f'Flood ID: {flood["id"]}')
        print(f'  Location: {flood["center_lat"]:.2f}, {flood["center_lon"]:.2f}')
        print(f'  Severity: {flood["severity"]}')
        print(f'  Expected Runoff: {flood["expected_runoff_mm"]:.1f} mm')
        print(f'  Confidence: {flood["detection_confidence"]:.2f}')
    
    print('\n=== ANALYSIS METHOD EXPLANATION ===')
    print('1. CYCLONE DETECTION:')
    print('   - Scans wind speed arrays for cyclonic rotation')
    print('   - Looks for pressure drops below 1000 hPa')
    print('   - Calculates vorticity (rotation)')
    print('   - Classifies by Saffir-Simpson scale')
    print('   - Estimates radius and forward speed')
    
    print('\n2. FLOOD DETECTION:')
    print('   - Scans precipitation arrays')
    print('   - Identifies areas > 50mm/24hr (heavy rain)')
    print('   - Checks soil moisture saturation')
    print('   - Calculates flood risk based on intensity')
    
    print('\n3. LANDSLIDE DETECTION:')
    print('   - Analyzes slope stability factors')
    print('   - Checks soil saturation levels')
    print('   - Evaluates rainfall intensity')
    print('   - Calculates susceptibility scores')
    
    print('\n4. CONVERGENCE DETECTION:')
    print('   - Groups hazards by geographic proximity')
    print('   - Identifies multi-hazard zones')
    print('   - Applies risk multipliers')
    print('   - Generates compound emergency recommendations')
    
    return results

if __name__ == "__main__":
    test_graphcast_analysis()

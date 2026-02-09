"""
MoScript: GraphCast Weather Detector
=====================================
Converts GraphCast ML predictions into threat detections with personality

This orchestrates the entire detection pipeline:
1. Fetch GraphCast data
2. Run anomaly detection algorithms
3. Emit events for each threat type
4. Output voice lines with sass
"""

import time
from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime

# Import the base MoScript class
from moscripts.moscript_base import MoScript

# Import detection algorithms (try multiple import paths)
try:
    from weather_anomaly_detection import (
        CycloneDetector,
        FloodDetector,
        LandslideDetector,
        WeatherAnomalyDetector
    )
    print("✅ Weather anomaly detection modules loaded")
except ImportError:
    try:
        import sys, os
        # Add parent directory to path for model-service level imports
        _parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _parent not in sys.path:
            sys.path.insert(0, _parent)
        from weather_anomaly_detection import (
            CycloneDetector,
            FloodDetector,
            LandslideDetector,
            WeatherAnomalyDetector
        )
        print("✅ Weather anomaly detection modules loaded (via path fix)")
    except ImportError as e:
        print(f"⚠️ Weather anomaly detection modules not found - using mock data: {e}")
        CycloneDetector = FloodDetector = LandslideDetector = WeatherAnomalyDetector = None


class MoGraphCastDetector(MoScript):
    """
    Master MoScript that orchestrates all weather anomaly detection
    """
    
    def __init__(self):
        super().__init__(
            id='mo-graphcast-detector-001',
            name='GraphCast Weather Anomaly Detector',
            trigger='onGraphCastUpdate',
            sass=True
        )
        
        # Initialize sub-detectors
        if WeatherAnomalyDetector:
            self.master_detector = WeatherAnomalyDetector()
            self.cyclone_detector = CycloneDetector()
            self.flood_detector = FloodDetector()
            self.landslide_detector = LandslideDetector()
        else:
            print("⚠️ Using mock detection algorithms")
            self.master_detector = None
    
    def logic(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main detection logic - orchestrates all detectors
        """
        start_time = time.time()
        
        weather_data = inputs.get('weather_data', {})
        
        # Run comprehensive detection
        if self.master_detector:
            results = self.master_detector.detect_all_hazards(weather_data)
        else:
            # Mock data for testing
            results = {
                'cyclones': [
                    {
                        'id': 'mock-cyclone-001',
                        'center_lat': -18.6,
                        'center_lng': 45.1,
                        'max_wind_kt': 95,
                        'min_pressure_hpa': 975,
                        'category': 4,
                        'confidence': 0.8,
                        'risk_level': 'high'
                    }
                ],
                'floods': [
                    {
                        'id': 'mock-flood-001',
                        'center_lat': -12.5,
                        'center_lng': 55.2,
                        'severity': 'moderate',
                        'expected_runoff_mm': 150,
                        'confidence': 0.7
                    }
                ],
                'landslides': [],
                'convergences': []
            }
        
        detection_time = time.time() - start_time
        
        return {
            'cyclones': results.get('cyclones', []),
            'floods': results.get('floods', []),
            'landslides': results.get('landslides', []),
            'convergences': results.get('convergences', []),
            'detection_time': detection_time,
            'timestamp': datetime.now().isoformat(),
            'total_hazards': (
                len(results.get('cyclones', [])) +
                len(results.get('floods', [])) +
                len(results.get('landslides', []))
            )
        }
    
    def voice_line(self, result: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """
        Generate voice line with personality based on results
        """
        cyclone_count = len(result['cyclones'])
        flood_count = len(result['floods'])
        landslide_count = len(result['landslides'])
        convergence_count = len(result['convergences'])
        total = result['total_hazards']
        
        if total == 0:
            return "🌤️ GraphCast scan complete. No threats detected. Africa is clear, brother."
        
        # Build threat summary
        threats = []
        if cyclone_count > 0:
            threats.append(f"{cyclone_count} cyclone{'s' if cyclone_count > 1 else ''}")
        if flood_count > 0:
            threats.append(f"{flood_count} flood zone{'s' if flood_count > 1 else ''}")
        if landslide_count > 0:
            threats.append(f"{landslide_count} landslide{'s' if landslide_count > 1 else ''}")
        
        threat_summary = ", ".join(threats)
        
        # Add convergence warning if present
        convergence_note = ""
        if convergence_count > 0:
            convergence_note = f" ⚠️ {convergence_count} CONVERGENCE ZONE{'S' if convergence_count > 1 else ''} detected - multiple threats intersecting!"
        
        # Find strongest cyclone if any
        cyclone_note = ""
        if cyclone_count > 0:
            max_wind = max(c.get('max_wind_kt', 0) for c in result['cyclones'])
            if max_wind > 100:
                cyclone_note = f" Strongest: {max_wind:.0f}kt. This one's got TEETH, brother."
        
        return (
            f"🌪️ GraphCast detection complete: {threat_summary}.{convergence_note}{cyclone_note} "
            f"Detection took {result['detection_time']*1000:.0f}ms. "
            f"Grid is updated. Stay vigilant. 🔥"
        )


class MoCycloneDetector(MoScript):
    """
    Specialized MoScript for cyclone detection
    """
    
    def __init__(self):
        super().__init__(
            id='mo-cyclone-detector-001',
            name='Tropical Cyclone Detector',
            trigger='onGraphCastUpdate',
            sass=True
        )
        self.detector = CycloneDetector() if CycloneDetector else None
    
    def logic(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Detect tropical cyclones using vorticity + MSLP + warm core
        """
        weather_data = inputs.get('weather_data', {})
        if self.detector:
            cyclones = self.detector.detect(weather_data)
        else:
            # Mock cyclone data
            cyclones = [
                {
                    'id': 'mock-cyclone-001',
                    'center_lat': -18.6,
                    'center_lng': 45.1,
                    'max_wind_kt': 95,
                    'min_pressure_hpa': 975,
                    'category': 4,
                    'confidence': 0.8,
                    'risk_level': 'high'
                }
            ]
        return cyclones
    
    def voice_line(self, result: List[Dict], inputs: Dict) -> str:
        """
        Generate cyclone-specific voice line
        """
        if len(result) == 0:
            return "🌤️ Vorticity scan clean. No cyclonic activity detected."
        
        max_wind = max(c.get('max_wind_kt', 0) for c in result)
        strongest = max(result, key=lambda c: c.get('max_wind_kt', 0))
        category = strongest.get('category', 0)
        
        category_emoji = {
            5: "💀", 4: "🔥", 3: "⚡", 2: "🌪️", 1: "🌀"
        }.get(category, "🌀")
        
        return (
            f"{category_emoji} {len(result)} cyclone{'s' if len(result) > 1 else ''} detected. "
            f"Strongest: CAT{category} with {max_wind:.0f}kt winds. "
            f"Confidence: {strongest.get('confidence', 0)*100:.0f}%. "
            f"This storm means business, brethren. 🔥"
        )


class MoFloodDetector(MoScript):
    """
    Specialized MoScript for flood detection
    """
    
    def __init__(self):
        super().__init__(
            id='mo-flood-detector-002',
            name='Flood Zone Detector',
            trigger='onGraphCastUpdate',
            sass=True
        )
        self.detector = FloodDetector() if FloodDetector else None
    
    def logic(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Detect flood zones based on precipitation + soil moisture
        """
        weather_data = inputs.get('weather_data', {})
        if self.detector:
            floods = self.detector.detect(weather_data)
        else:
            # Mock flood data
            floods = [
                {
                    'id': 'mock-flood-001',
                    'center_lat': -12.5,
                    'center_lng': 55.2,
                    'severity': 'moderate',
                    'expected_runoff_mm': 150,
                    'confidence': 0.7
                }
            ]
        return floods
    
    def voice_line(self, result: List[Dict], inputs: Dict) -> str:
        """
        Generate flood-specific voice line
        """
        if len(result) == 0:
            return "💧 Precipitation analysis complete. No flood risk detected."
        
        severe_count = sum(1 for f in result if f.get('severity') == 'SEVERE')
        max_runoff = max(f.get('expected_runoff_mm', 0) for f in result)
        
        severity_note = ""
        if severe_count > 0:
            severity_note = f" {severe_count} SEVERE flood zone{'s' if severe_count > 1 else ''}!"
        
        return (
            f"🌊 {len(result)} flood zone{'s' if len(result) > 1 else ''} detected.{severity_note} "
            f"Max expected runoff: {max_runoff:.0f}mm. "
            f"Soil is saturated. Rivers rising. Watch the water, brother. 🔥"
        )


class MoLandslideDetector(MoScript):
    """
    Specialized MoScript for landslide detection
    """
    
    def __init__(self):
        super().__init__(
            id='mo-landslide-detector-003',
            name='Landslide Risk Detector',
            trigger='onGraphCastUpdate',
            sass=True
        )
        self.detector = LandslideDetector() if LandslideDetector else None
    
    def logic(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Detect landslide risk based on slope + rainfall + soil moisture
        """
        weather_data = inputs.get('weather_data', {})
        if self.detector:
            landslides = self.detector.detect(weather_data)
        else:
            # Mock landslide data
            landslides = []
        return landslides
    
    def voice_line(self, result: List[Dict], inputs: Dict) -> str:
        """
        Generate landslide-specific voice line
        """
        if len(result) == 0:
            return "🏔️ Slope analysis complete. No landslide risk detected."
        
        critical_count = sum(1 for l in result if l.get('risk_level') == 'CRITICAL')
        max_susceptibility = max(l.get('susceptibility_score', 0) for l in result)
        
        risk_note = ""
        if critical_count > 0:
            risk_note = f" {critical_count} CRITICAL risk zone{'s' if critical_count > 1 else ''}!"
        
        return (
            f"⛰️ {len(result)} landslide risk zone{'s' if len(result) > 1 else ''} detected.{risk_note} "
            f"Max susceptibility: {max_susceptibility:.2f}. "
            f"Slopes are unstable. Ground is moving. Watch your footing, amigo. 🔥"
        )


# =============================================================================
# ORCHESTRATOR INTEGRATION
# =============================================================================

class GraphCastOrchestrator:
    """
    Orchestrates all GraphCast detection MoScripts
    """
    
    def __init__(self):
        self.master = MoGraphCastDetector()
        self.cyclone = MoCycloneDetector()
        self.flood = MoFloodDetector()
        self.landslide = MoLandslideDetector()
        
        print("🔥 GraphCast Detection Orchestrator initialized")
        print("🌪️ Cyclone detector ready")
        print("🌊 Flood detector ready")
        print("⛰️ Landslide detector ready")
    
    def detect_all(self, weather_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run all detectors and output voice lines
        """
        print("\n" + "="*70)
        print("🔥 GRAPHCAST DETECTION PIPELINE STARTING")
        print("="*70)
        
        # Run master detector
        master_result = self.master.execute({'weather_data': weather_data})
        
        # Run specialized detectors for detailed voice lines
        print("\n🌪️ Running specialized detectors...")
        
        if len(master_result['cyclones']) > 0:
            self.cyclone.execute({'weather_data': weather_data})
        
        if len(master_result['floods']) > 0:
            self.flood.execute({'weather_data': weather_data})
        
        if len(master_result['landslides']) > 0:
            self.landslide.execute({'weather_data': weather_data})
        
        print("="*70)
        print("🔥 GRAPHCAST DETECTION PIPELINE COMPLETE")
        print("="*70 + "\n")
        
        return master_result


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

# Create global orchestrator instance
graphcast_orchestrator = GraphCastOrchestrator()

# Convenience function for API endpoints
def detect_weather_anomalies(weather_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for weather anomaly detection with MoScripts
    
    Usage in FastAPI:
        from moscripts.mo_graphcast_detector import detect_weather_anomalies
        
        @app.get("/api/v1/weather/anomalies")
        async def get_anomalies():
            data = fetch_graphcast_data()
            return detect_weather_anomalies(data)
    """
    return graphcast_orchestrator.detect_all(weather_data)

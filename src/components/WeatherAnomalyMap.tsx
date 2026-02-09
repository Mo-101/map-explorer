/**
 * AFRO STORM - Weather Anomaly Map Component
 * ==========================================
 * 
 * Advanced visualization for weather anomalies including:
 * - Cyclone tracking with intensity classification
 * - Flood risk zones with severity levels
 * - Landslide susceptibility areas
 * - Multi-hazard convergence zones
 * 
 * Built for MoStar Industries | Multi-Model Mesh Intelligence
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type * as maptilersdk from '@maptiler/sdk';
import { AlertTriangle, CloudRain, Mountain, Wind, Info } from 'lucide-react';
import type { Feature, GeoJsonProperties } from 'geojson';

interface WeatherAnomaly {
  id: string;
  type: 'cyclone' | 'flood' | 'landslide' | 'convergence';
  center_lat: number;
  center_lon: number;
  severity?: string;
  intensity?: string;
  risk_score?: number;
  detection_confidence: number;
  timestamp: string;
  affected_regions?: string[];
  // Cyclone specific
  max_wind_speed?: number;
  min_pressure?: number;
  radius_km?: number;
  // Flood specific
  precipitation_mm_per_hour?: number;
  affected_area_km2?: number;
  // Landslide specific
  trigger_rainfall_mm?: number;
  slope_angle?: number;
  // Convergence specific
  involved_hazards?: string[];
  hazard_types?: string[];
  risk_multiplier?: number;
  recommendations?: string[];
}

interface WeatherAnomalyMapProps {
  apiBaseUrl: string;
  initialCenter: [number, number];
  initialZoom: number;
  className?: string;
}

const WeatherAnomalyMap: React.FC<WeatherAnomalyMapProps> = ({
  apiBaseUrl,
  initialCenter,
  initialZoom,
  className = ''
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maptilersdk.Map | null>(null);
  const [anomalies, setAnomalies] = useState<{
    cyclones: WeatherAnomaly[];
    floods: WeatherAnomaly[];
    landslides: WeatherAnomaly[];
    convergences: WeatherAnomaly[];
  }>({ cyclones: [], floods: [], landslides: [], convergences: [] });
  const [selectedAnomaly, setSelectedAnomaly] = useState<WeatherAnomaly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // MapTiler API key
  const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_KEY || 'DXNUJcQaD4RiI1AqBoLx';

  // Fetch weather anomalies
  const fetchAnomalies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/api/v1/weather/anomalies`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setAnomalies({
        cyclones: data.cyclones || [],
        floods: data.floods || [],
        landslides: data.landslides || [],
        convergences: data.convergences || []
      });
      setLastUpdate(data.timestamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch anomalies');
      console.error('Error fetching weather anomalies:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  // Update map layers when anomalies change
  const updateAnomalyLayers = useCallback(() => {
    if (!map.current) return;

    // Remove existing anomaly layers
    ['anomaly-cyclones', 'anomaly-floods', 'anomaly-landslides', 'anomaly-convergences'].forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current?.removeLayer(layerId);
      }
      if (map.current?.getSource(layerId)) {
        map.current?.removeSource(layerId);
      }
    });
  }, [anomalies]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Import MapTiler SDK dynamically
    import('@maptiler/sdk').then((maptilersdk) => {
      maptilersdk.config.apiKey = MAPTILER_API_KEY;

      map.current = new maptilersdk.Map({
        container: mapContainer.current as HTMLElement,
        style: maptilersdk.MapStyle.BACKDROP,
        center: initialCenter,
        zoom: initialZoom,
        hash: true,
        projectionControl: true,
        projection: 'globe'
      });

      map.current.on('load', () => {
        if (map.current) {
          map.current.setPaintProperty('Water', 'fill-color', 'rgba(0, 0, 0, 0.4)');
          fetchAnomalies();
        }
      });

      // Add click handler for anomaly selection
      map.current.on('click', (e) => {
        const features = map.current?.queryRenderedFeatures(e.point);
        if (features && features.length > 0) {
          const anomalyFeature = features.find(f => f.layer?.id?.startsWith('anomaly-'));
          if (anomalyFeature && anomalyFeature.properties) {
            setSelectedAnomaly(anomalyFeature.properties as WeatherAnomaly);
          }
        }
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialCenter, initialZoom, MAPTILER_API_KEY, fetchAnomalies]);

  // Fetch weather anomalies
  const fetchAnomalies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/api/v1/weather/anomalies`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setAnomalies({
        cyclones: data.cyclones || [],
        floods: data.floods || [],
        landslides: data.landslides || [],
        convergences: data.convergences || []
      });
      setLastUpdate(data.timestamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch anomalies');
      console.error('Error fetching weather anomalies:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  // Auto-refresh anomalies every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchAnomalies, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  // Update map layers when anomalies change
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    updateAnomalyLayers();
  }, [anomalies, updateAnomalyLayers]);

  const updateAnomalyLayers = () => {
    if (!map.current) return;

    // Remove existing anomaly layers
    ['anomaly-cyclones', 'anomaly-floods', 'anomaly-landslides', 'anomaly-convergences'].forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current?.removeLayer(layerId);
      }
      if (map.current?.getSource(layerId)) {
        map.current?.removeSource(layerId);
      }
    });

    // Add cyclone layer
    if (anomalies.cyclones.length > 0) {
      const cycloneFeatures: Feature[] = anomalies.cyclones.map(cyclone => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [cyclone.center_lon, cyclone.center_lat]
        },
        properties: cyclone
      }));

      map.current?.addSource('anomaly-cyclones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: cycloneFeatures
        }
      });

      map.current?.addLayer({
        id: 'anomaly-cyclones',
        type: 'circle',
        source: 'anomaly-cyclones',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'max_wind_speed'],
            61, 8,    // Tropical depression
            88, 10,   // Tropical storm
            119, 12,  // Category 1
            154, 15,  // Category 2
            178, 18,  // Category 3
            208, 22,  // Category 4
            251, 25   // Category 5
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'max_wind_speed'],
            61, '#FFD700',    // Gold - Tropical depression
            88, '#FFA500',    // Orange - Tropical storm
            119, '#FF6347',   // Tomato - Category 1
            154, '#FF4500',   // Orange red - Category 2
            178, '#DC143C',   // Crimson - Category 3
            208, '#8B0000',   // Dark red - Category 4
            251, '#4B0000'    // Dark brown - Category 5
          ],
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }

    // Add flood layer
    if (anomalies.floods.length > 0) {
      const floodFeatures: Feature[] = anomalies.floods.map(flood => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [flood.center_lon, flood.center_lat]
        },
        properties: flood
      }));

      map.current?.addSource('anomaly-floods', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: floodFeatures
        }
      });

      map.current?.addLayer({
        id: 'anomaly-floods',
        type: 'circle',
        source: 'anomaly-floods',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.4, 10,
            0.6, 15,
            0.8, 20,
            1.0, 25
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.4, '#4169E1',    // Royal blue - Low risk
            0.6, '#1E90FF',    // Dodger blue - Moderate risk
            0.8, '#0000CD',    // Medium blue - High risk
            1.0, '#000080'     // Navy - Extreme risk
          ],
          'circle-opacity': 0.6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }

    // Add landslide layer
    if (anomalies.landslides.length > 0) {
      const landslideFeatures: Feature[] = anomalies.landslides.map(landslide => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [landslide.center_lon, landslide.center_lat]
        },
        properties: landslide
      }));

      map.current?.addSource('anomaly-landslides', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: landslideFeatures
        }
      });

      map.current?.addLayer({
        id: 'anomaly-landslides',
        type: 'circle',
        source: 'anomaly-landslides',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.4, 8,
            0.6, 12,
            0.8, 16,
            1.0, 20
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk_score'],
            0.4, '#8B7355',    // Burlywood - Low risk
            0.6, '#A0522D',    // Sienna - Moderate risk
            0.8, '#8B4513',    // Saddle brown - High risk
            1.0, '#654321'     // Dark brown - Extreme risk
          ],
          'circle-opacity': 0.7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }

    // Add convergence layer
    if (anomalies.convergences.length > 0) {
      const convergenceFeatures: Feature[] = anomalies.convergences.map(convergence => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [convergence.center_lon, convergence.center_lat]
        },
        properties: convergence
      }));

      map.current?.addSource('anomaly-convergences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: convergenceFeatures
        }
      });

      map.current?.addLayer({
        id: 'anomaly-convergences',
        type: 'circle',
        source: 'anomaly-convergences',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'risk_multiplier'],
            1.0, 15,
            1.5, 20,
            2.0, 25,
            2.5, 30
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk_multiplier'],
            1.0, '#9400D3',    // Violet - Low multiplier
            1.5, '#8B008B',    // Dark magenta - Moderate multiplier
            2.0, '#4B0082',    // Indigo - High multiplier
            2.5, '#000000'     // Black - Extreme multiplier
          ],
          'circle-opacity': 0.6,
          'circle-stroke-color': '#FFD700',
          'circle-stroke-width': 3
        }
      });
    }
  };

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case 'cyclone':
        return <Wind className="w-5 h-5" />;
      case 'flood':
        return <CloudRain className="w-5 h-5" />;
      case 'landslide':
        return <Mountain className="w-5 h-5" />;
      case 'convergence':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getAnomalyColor = (type: string, severity?: string) => {
    if (type === 'convergence') return 'text-purple-600';
    
    switch (severity) {
      case 'low':
        return 'text-blue-600';
      case 'moderate':
        return 'text-yellow-600';
      case 'high':
        return 'text-orange-600';
      case 'extreme':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Weather Anomalies</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchAnomalies}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-700">Loading weather anomalies...</span>
          </div>
        </div>
      )}

      {/* Anomaly Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg max-w-xs">
        <h3 className="font-semibold text-gray-900 mb-3">Weather Anomalies</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2">
            <Wind className="w-4 h-4 text-orange-500" />
            <span>Cyclones ({anomalies.cyclones.length})</span>
          </div>
          <div className="flex items-center space-x-2">
            <CloudRain className="w-4 h-4 text-blue-500" />
            <span>Floods ({anomalies.floods.length})</span>
          </div>
          <div className="flex items-center space-x-2">
            <Mountain className="w-4 h-4 text-brown-500" />
            <span>Landslides ({anomalies.landslides.length})</span>
          </div>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-purple-500" />
            <span>Convergence Zones ({anomalies.convergences.length})</span>
          </div>
        </div>

        {lastUpdate && (
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </div>
        )}
      </div>

      {/* Selected Anomaly Details */}
      {selectedAnomaly && (
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              {getAnomalyIcon(selectedAnomaly.type)}
              <h3 className="font-semibold text-gray-900 capitalize">{selectedAnomaly.type}</h3>
            </div>
            <button
              onClick={() => setSelectedAnomaly(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {selectedAnomaly.intensity && (
              <div>
                <span className="font-medium">Intensity:</span>{' '}
                <span className={`capitalize ${getAnomalyColor(selectedAnomaly.type, selectedAnomaly.intensity)}`}>
                  {selectedAnomaly.intensity.replace('_', ' ')}
                </span>
              </div>
            )}

            {selectedAnomaly.max_wind_speed && (
              <div>
                <span className="font-medium">Max Wind Speed:</span>{' '}
                {selectedAnomaly.max_wind_speed.toFixed(1)} km/h
              </div>
            )}

            {selectedAnomaly.min_pressure && (
              <div>
                <span className="font-medium">Min Pressure:</span>{' '}
                {selectedAnomaly.min_pressure.toFixed(0)} hPa
              </div>
            )}

            {selectedAnomaly.precipitation_mm_per_hour && (
              <div>
                <span className="font-medium">Precipitation:</span>{' '}
                {selectedAnomaly.precipitation_mm_per_hour.toFixed(1)} mm/h
              </div>
            )}

            {selectedAnomaly.risk_score && (
              <div>
                <span className="font-medium">Risk Score:</span>{' '}
                {(selectedAnomaly.risk_score * 100).toFixed(0)}%
              </div>
            )}

            {selectedAnomaly.detection_confidence && (
              <div>
                <span className="font-medium">Confidence:</span>{' '}
                {(selectedAnomaly.detection_confidence * 100).toFixed(0)}%
              </div>
            )}

            {selectedAnomaly.affected_regions && selectedAnomaly.affected_regions.length > 0 && (
              <div>
                <span className="font-medium">Affected Regions:</span>{' '}
                {selectedAnomaly.affected_regions.join(', ')}
              </div>
            )}

            {selectedAnomaly.recommendations && selectedAnomaly.recommendations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <span className="font-medium">Recommendations:</span>
                <ul className="mt-1 space-y-1 text-xs text-gray-600">
                  {selectedAnomaly.recommendations.map((rec, idx) => (
                    <li key={idx}>• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
        <button
          onClick={fetchAnomalies}
          disabled={loading}
          className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Refreshing...' : 'Refresh Anomalies'}
        </button>
      </div>
    </div>
  );
};

export default WeatherAnomalyMap;

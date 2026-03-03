import { useEffect, useRef } from 'react';
import type * as maptilersdk from '@maptiler/sdk';

interface ThreatCluster {
  cluster_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  center_lat: number;
  center_lng: number;
  threat_count: number;
  threats?: any[];
  hull: [number, number][];
  max_intensity: number;
  avg_intensity: number;
  sources: string[];
}

interface ClusterPolygonLayerProps {
  map: maptilersdk.Map;
  clusters: ThreatCluster[];
  onClusterClick?: (cluster: ThreatCluster) => void;
}

const typeColors: Record<string, { fill: string; stroke: string; label: string }> = {
  cyclone: { fill: 'rgba(239, 68, 68, 0.15)', stroke: 'rgba(239, 68, 68, 0.7)', label: '#ef4444' },
  storm: { fill: 'rgba(251, 146, 60, 0.15)', stroke: 'rgba(251, 146, 60, 0.7)', label: '#fb923c' },
  flood: { fill: 'rgba(59, 130, 246, 0.15)', stroke: 'rgba(59, 130, 246, 0.7)', label: '#3b82f6' },
  drought: { fill: 'rgba(234, 179, 8, 0.12)', stroke: 'rgba(234, 179, 8, 0.6)', label: '#eab308' },
  outbreak: { fill: 'rgba(168, 85, 247, 0.12)', stroke: 'rgba(168, 85, 247, 0.6)', label: '#a855f7' },
  cholera: { fill: 'rgba(168, 85, 247, 0.12)', stroke: 'rgba(168, 85, 247, 0.6)', label: '#a855f7' },
};

const severityOpacity: Record<string, number> = {
  extreme: 1.0,
  high: 0.8,
  moderate: 0.6,
  low: 0.4,
};

const SOURCE_ID = 'threat-clusters';
const FILL_LAYER = 'threat-cluster-fill';
const STROKE_LAYER = 'threat-cluster-stroke';
const LABEL_LAYER = 'threat-cluster-labels';
const CENTER_LAYER = 'threat-cluster-centers';

const ClusterPolygonLayer = ({ map, clusters, onClusterClick }: ClusterPolygonLayerProps) => {
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);

  useEffect(() => {
    if (!map || clusters.length === 0) {
      // Cleanup
      try {
        [LABEL_LAYER, CENTER_LAYER, STROKE_LAYER, FILL_LAYER].forEach(id => {
          if (map?.getLayer(id)) map.removeLayer(id);
        });
        if (map?.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* ignore */ }
      return;
    }

    // Build GeoJSON features for polygon fills
    const polygonFeatures = clusters
      .filter(c => c.hull && c.hull.length >= 3)
      .map(c => {
        const colors = typeColors[c.type] || typeColors.storm;
        const opacity = severityOpacity[c.severity] || 0.6;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [c.hull],
          },
          properties: {
            cluster_id: c.cluster_id,
            type: c.type,
            severity: c.severity,
            title: c.title,
            threat_count: c.threat_count,
            fill_color: colors.fill,
            stroke_color: colors.stroke,
            opacity,
            label: c.threat_count > 1
              ? `${c.threat_count} ${c.type}s`
              : c.title.split('—')[0]?.trim() || c.type,
          },
        };
      });

    // Center point features for labels
    const centerFeatures = clusters.map(c => {
      const colors = typeColors[c.type] || typeColors.storm;
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [c.center_lng, c.center_lat],
        },
        properties: {
          cluster_id: c.cluster_id,
          type: c.type,
          severity: c.severity,
          threat_count: c.threat_count,
          label: c.threat_count > 1
            ? `${c.threat_count}×${c.type}`
            : c.type,
          label_color: colors.label,
          center_size: Math.min(8 + c.threat_count * 2, 20),
        },
      };
    });

    const geojson = {
      type: 'FeatureCollection' as const,
      features: [...polygonFeatures, ...centerFeatures],
    };

    try {
      // Source
      if (map.getSource(SOURCE_ID)) {
        (map.getSource(SOURCE_ID) as any).setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson as any });
      }

      // Fill layer
      if (!map.getLayer(FILL_LAYER)) {
        map.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: SOURCE_ID,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': [
              'match', ['get', 'type'],
              'cyclone', 'rgba(239, 68, 68, 0.12)',
              'storm', 'rgba(251, 146, 60, 0.1)',
              'flood', 'rgba(59, 130, 246, 0.12)',
              'drought', 'rgba(234, 179, 8, 0.1)',
              'outbreak', 'rgba(168, 85, 247, 0.1)',
              'cholera', 'rgba(168, 85, 247, 0.1)',
              'rgba(100, 116, 139, 0.1)'
            ],
            'fill-opacity': ['get', 'opacity'],
          },
        });
      }

      // Stroke layer
      if (!map.getLayer(STROKE_LAYER)) {
        map.addLayer({
          id: STROKE_LAYER,
          type: 'line',
          source: SOURCE_ID,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'line-color': [
              'match', ['get', 'type'],
              'cyclone', 'rgba(239, 68, 68, 0.6)',
              'storm', 'rgba(251, 146, 60, 0.5)',
              'flood', 'rgba(59, 130, 246, 0.6)',
              'drought', 'rgba(234, 179, 8, 0.5)',
              'outbreak', 'rgba(168, 85, 247, 0.5)',
              'cholera', 'rgba(168, 85, 247, 0.5)',
              'rgba(100, 116, 139, 0.4)'
            ],
            'line-width': 1.5,
            'line-dasharray': [3, 2],
          },
        });
      }

      // Center dots
      if (!map.getLayer(CENTER_LAYER)) {
        map.addLayer({
          id: CENTER_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': ['get', 'center_size'],
            'circle-color': ['get', 'label_color'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
          },
        });
      }

      // Labels
      if (!map.getLayer(LABEL_LAYER)) {
        map.addLayer({
          id: LABEL_LAYER,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-offset': [0, 2],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0, 0, 0, 0.7)',
            'text-halo-width': 1,
          },
        });
      }

      // Click handler for clusters
      if (clickHandlerRef.current) {
        map.off('click', CENTER_LAYER, clickHandlerRef.current);
      }
      if (onClusterClick) {
        const handler = (e: any) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const clusterId = feature.properties?.cluster_id;
          const cluster = clusters.find(c => c.cluster_id === clusterId);
          if (cluster) onClusterClick(cluster);
        };
        map.on('click', CENTER_LAYER, handler);
        clickHandlerRef.current = handler;
      }

      // Cursor on hover
      map.on('mouseenter', CENTER_LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', CENTER_LAYER, () => {
        map.getCanvas().style.cursor = '';
      });

    } catch (e) {
      console.warn('Cluster polygon layer error:', e);
    }

    return () => {
      try {
        if (clickHandlerRef.current) {
          map.off('click', CENTER_LAYER, clickHandlerRef.current);
          clickHandlerRef.current = null;
        }
        [LABEL_LAYER, CENTER_LAYER, STROKE_LAYER, FILL_LAYER].forEach(id => {
          if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* ignore */ }
    };
  }, [map, clusters, onClusterClick]);

  return null;
};

export default ClusterPolygonLayer;

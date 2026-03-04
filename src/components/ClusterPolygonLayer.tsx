import { useEffect, useRef } from 'react';
import * as maptilersdk from '@maptiler/sdk';

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
  earthquake: { fill: 'rgba(168, 85, 247, 0.12)', stroke: 'rgba(168, 85, 247, 0.6)', label: '#a855f7' },
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

function clusterTooltipHtml(cluster: ThreatCluster) {
  const colors = typeColors[cluster.type] || typeColors.storm;
  const sevColor = cluster.severity === 'extreme' ? 'rgba(239,68,68,0.7)' :
    cluster.severity === 'high' ? 'rgba(245,158,11,0.7)' :
    cluster.severity === 'moderate' ? 'rgba(234,179,8,0.7)' : 'rgba(16,185,129,0.7)';

  // Check for GDACS data in cluster threats
  let gdacsInfo = '';
  const firstGdacs = cluster.threats?.find(t => t.metadata?.gdacs || t.source_artifact?.gdacs);
  if (firstGdacs) {
    const g = firstGdacs.metadata?.gdacs || firstGdacs.source_artifact?.gdacs;
    if (g) {
      const levelBg = g.level === 'red' ? 'rgba(239,68,68,0.15)' : g.level === 'orange' ? 'rgba(251,146,60,0.15)' : 'rgba(34,197,94,0.15)';
      const levelBorder = g.level === 'red' ? 'rgba(239,68,68,0.3)' : g.level === 'orange' ? 'rgba(251,146,60,0.3)' : 'rgba(34,197,94,0.3)';
      gdacsInfo = `
        <div style="margin-top:6px;padding:4px 8px;border-radius:6px;background:${levelBg};border:1px solid ${levelBorder};font-size:9px;display:flex;gap:6px;align-items:center">
          <span style="font-weight:700;text-transform:uppercase">GDACS ${g.level}</span>
          ${g.score != null ? `<span>Score: ${Number(g.score).toFixed(2)}</span>` : ''}
          ${g.category ? `<span>${g.category}</span>` : ''}
          ${g.vulnerability != null ? `<span>Vuln: ${(g.vulnerability * 100).toFixed(0)}%</span>` : ''}
        </div>`;
    }
  }

  const sources = cluster.sources?.length ? cluster.sources.join(', ') : '—';

  return `
    <div style="
      min-width:240px;max-width:320px;
      background:linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(10,15,30,0.9) 100%);
      backdrop-filter:blur(24px) saturate(1.4);
      -webkit-backdrop-filter:blur(24px) saturate(1.4);
      border:1px solid rgba(148,163,184,0.12);
      border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
      padding:0;font-family:'Inter',system-ui,sans-serif;overflow:hidden;
    ">
      <div style="height:2px;background:linear-gradient(90deg,transparent 5%,${sevColor} 50%,transparent 95%)"></div>
      <div style="padding:12px 14px 10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:${colors.label}"></span>
          <span style="font-weight:700;font-size:12px;color:rgba(226,232,240,0.95)">${cluster.title}</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:${sevColor.replace('0.7','0.15')};border:1px solid ${sevColor.replace('0.7','0.25')};color:rgba(226,232,240,0.9)">${cluster.severity}</span>
          <span style="font-size:10px;color:rgba(203,213,225,0.7)">${cluster.threat_count} threats</span>
        </div>
        <div style="font-size:10px;color:rgba(148,163,184,0.7);line-height:1.5">${cluster.description?.slice(0, 200) || ''}</div>
        <div style="margin-top:6px;font-size:9px;color:rgba(148,163,184,0.5)">
          Sources: ${sources} · Intensity: ${cluster.max_intensity?.toFixed(1) || '—'}
        </div>
        ${gdacsInfo}
        <div style="margin-top:8px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.08);display:flex;align-items:center;gap:4px">
          <span style="width:4px;height:4px;border-radius:50%;background:rgba(14,165,233,0.6);animation:pulse 2s infinite"></span>
          <span style="font-size:8px;font-family:monospace;color:rgba(148,163,184,0.4)">Cluster Intelligence</span>
        </div>
      </div>
    </div>`;
}

const ClusterPolygonLayer = ({ map, clusters, onClusterClick }: ClusterPolygonLayerProps) => {
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);
  const popupRef = useRef<any>(null);

  useEffect(() => {
    if (!map || clusters.length === 0) {
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
        const opacity = severityOpacity[c.severity] || 0.6;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Polygon' as const, coordinates: [c.hull] },
          properties: {
            cluster_id: c.cluster_id,
            type: c.type,
            severity: c.severity,
            title: c.title,
            threat_count: c.threat_count,
            opacity,
            label: c.threat_count > 1
              ? `${c.threat_count} ${c.type}s`
              : c.title.split('—')[0]?.trim() || c.type,
          },
        };
      });

    // Center point features
    const centerFeatures = clusters.map(c => {
      const colors = typeColors[c.type] || typeColors.storm;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.center_lng, c.center_lat] },
        properties: {
          cluster_id: c.cluster_id,
          type: c.type,
          severity: c.severity,
          threat_count: c.threat_count,
          label: c.threat_count > 1 ? `${c.threat_count}×${c.type}` : c.type,
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
              'earthquake', 'rgba(168, 85, 247, 0.1)',
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
              'earthquake', 'rgba(168, 85, 247, 0.5)',
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

      // ── Hover tooltip for cluster centers ──
      const maptilersdk = (window as any).maptilersdk || {};
      let popup = popupRef.current;
      if (!popup) {
        try {
          popup = new maptilersdk.Popup({ closeButton: false, closeOnClick: false, maxWidth: '380px', className: 'moscripts-popup' });
          popupRef.current = popup;
        } catch {
          // If popup creation fails, still proceed without hover tooltips
        }
      }

      const onCenterEnter = (e: any) => {
        map.getCanvas().style.cursor = 'pointer';
        if (!popup) return;
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const cluster = clusters.find(c => c.cluster_id === clusterId);
        if (!cluster) return;
        const coords = feature.geometry?.coordinates;
        if (!Array.isArray(coords)) return;
        popup.setLngLat(coords).setHTML(clusterTooltipHtml(cluster)).addTo(map);
      };

      const onCenterLeave = () => {
        map.getCanvas().style.cursor = '';
        try { popup?.remove(); } catch { /* ignore */ }
      };

      // Also add hover to polygon fill
      const onPolyEnter = (e: any) => {
        if (!popup) return;
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const cluster = clusters.find(c => c.cluster_id === clusterId);
        if (!cluster) return;
        const lngLat = e.lngLat;
        popup.setLngLat([lngLat.lng, lngLat.lat]).setHTML(clusterTooltipHtml(cluster)).addTo(map);
      };

      const onPolyLeave = () => {
        try { popup?.remove(); } catch { /* ignore */ }
      };

      map.on('mouseenter', CENTER_LAYER, onCenterEnter);
      map.on('mouseleave', CENTER_LAYER, onCenterLeave);
      map.on('mouseenter', FILL_LAYER, onPolyEnter);
      map.on('mouseleave', FILL_LAYER, onPolyLeave);

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

    } catch (e) {
      console.warn('Cluster polygon layer error:', e);
    }

    return () => {
      try {
        popupRef.current?.remove();
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

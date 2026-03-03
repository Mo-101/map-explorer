import { useEffect, useRef, useState, useCallback } from 'react';
import type * as maptilersdk from '@maptiler/sdk';

interface PrecipPoint {
  lat: number;
  lon: number;
  name: string;
  accum24h: number;
  accum72h: number;
}

interface IMERGRainfallLayerProps {
  map: maptilersdk.Map;
  visible: boolean;
  mode: '24h' | '72h';
}

// Color scale for rainfall accumulation (mm)
function precipColor(mm: number, alpha = 0.7): string {
  if (mm < 5) return `rgba(200, 200, 200, ${alpha * 0.3})`;
  if (mm < 20) return `rgba(120, 200, 255, ${alpha})`;
  if (mm < 50) return `rgba(50, 140, 255, ${alpha})`;
  if (mm < 100) return `rgba(255, 200, 0, ${alpha})`;
  if (mm < 200) return `rgba(255, 100, 0, ${alpha})`;
  return `rgba(255, 30, 30, ${alpha})`;
}

function precipRadius(mm: number): number {
  if (mm < 5) return 8;
  if (mm < 20) return 14;
  if (mm < 50) return 22;
  if (mm < 100) return 32;
  if (mm < 200) return 42;
  return 55;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const IMERGRainfallLayer = ({ map, visible, mode }: IMERGRainfallLayerProps) => {
  const [data, setData] = useState<PrecipPoint[]>([]);
  const markersRef = useRef<any[]>([]);
  const fetchedRef = useRef(false);

  // Fetch IMERG data from the edge function
  const fetchData = useCallback(async () => {
    if (fetchedRef.current) return;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ingest-gpm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!resp.ok) return;
      const result = await resp.json();
      if (result.precip_grid && Array.isArray(result.precip_grid)) {
        setData(result.precip_grid);
        fetchedRef.current = true;
      }
    } catch (e) {
      console.warn('IMERG fetch error:', e);
    }
  }, []);

  useEffect(() => {
    if (visible && data.length === 0) {
      fetchData();
    }
  }, [visible, data.length, fetchData]);

  // Render circles on the map using GeoJSON source + circle layer
  useEffect(() => {
    if (!map || !visible || data.length === 0) {
      // Remove layer if hidden
      if (map) {
        try {
          if (map.getLayer('imerg-circles')) map.removeLayer('imerg-circles');
          if (map.getLayer('imerg-labels')) map.removeLayer('imerg-labels');
          if (map.getSource('imerg-data')) map.removeSource('imerg-data');
        } catch { /* ignore */ }
      }
      return;
    }

    const features = data
      .filter(pt => {
        const val = mode === '24h' ? pt.accum24h : pt.accum72h;
        return val > 1; // Only show points with measurable precip
      })
      .map(pt => {
        const val = mode === '24h' ? pt.accum24h : pt.accum72h;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [pt.lon, pt.lat],
          },
          properties: {
            name: pt.name,
            value: val,
            radius: precipRadius(val),
            label: `${val.toFixed(0)} mm`,
          },
        };
      });

    const geojson = {
      type: 'FeatureCollection' as const,
      features,
    };

    try {
      if (map.getSource('imerg-data')) {
        (map.getSource('imerg-data') as any).setData(geojson);
      } else {
        map.addSource('imerg-data', { type: 'geojson', data: geojson as any });
      }

      if (!map.getLayer('imerg-circles')) {
        map.addLayer({
          id: 'imerg-circles',
          type: 'circle',
          source: 'imerg-data',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'value'],
              0, 'rgba(200, 200, 200, 0.2)',
              5, 'rgba(120, 200, 255, 0.5)',
              20, 'rgba(50, 140, 255, 0.6)',
              50, 'rgba(255, 200, 0, 0.65)',
              100, 'rgba(255, 100, 0, 0.7)',
              200, 'rgba(255, 30, 30, 0.75)',
            ],
            'circle-blur': 0.6,
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(255, 255, 255, 0.3)',
          },
        });
      }

      if (!map.getLayer('imerg-labels')) {
        map.addLayer({
          id: 'imerg-labels',
          type: 'symbol',
          source: 'imerg-data',
          layout: {
            'text-field': ['concat', ['get', 'label'], '\n', ['get', 'name']],
            'text-size': 10,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0, 0, 0, 0.7)',
            'text-halo-width': 1,
          },
        });
      }
    } catch (e) {
      console.warn('IMERG layer error:', e);
    }

    return () => {
      try {
        if (map.getLayer('imerg-circles')) map.removeLayer('imerg-circles');
        if (map.getLayer('imerg-labels')) map.removeLayer('imerg-labels');
        if (map.getSource('imerg-data')) map.removeSource('imerg-data');
      } catch { /* ignore cleanup errors */ }
    };
  }, [map, visible, data, mode]);

  return null;
};

export default IMERGRainfallLayer;

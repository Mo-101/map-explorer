import { useEffect, useRef, useState, useCallback } from 'react';
import type * as maptilersdk from '@maptiler/sdk';
import { RAINFALL_POINTS } from '@/data/rainfallPoints';

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



const IMERGRainfallLayer = ({ map, visible, mode }: IMERGRainfallLayerProps) => {
  const [data, setData] = useState<PrecipPoint[]>([]);
  const [status, setStatus] = useState("Loading rainfall?");
  const inFlight = useRef(false);
  const fetchedRef = useRef(false);

  // Read weather observations without triggering an ingestion job or database writes.
  const fetchData = useCallback(async () => {
    if (fetchedRef.current || inFlight.current) return;
    inFlight.current = true;
    setStatus("Loading rainfall?");
    try {
      const params = new URLSearchParams({
        latitude: RAINFALL_POINTS.map(p => p.lat).join(","),
        longitude: RAINFALL_POINTS.map(p => p.lon).join(","),
        hourly: "precipitation", past_days: "3", forecast_days: "1", timezone: "UTC",
      });
      const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Rainfall provider returned HTTP " + response.status);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : [payload];
      const now = Date.now();
      const points = rows.flatMap((row, index) => {
        const point = RAINFALL_POINTS[index];
        if (!point || !row.hourly?.time || !row.hourly?.precipitation) return [];
        const samples = row.hourly.time.map((time: string, i: number) => ({ time: Date.parse(time + "Z"), value: row.hourly.precipitation[i] }))
          .filter((sample: { time: number; value: number }) => sample.time <= now && sample.time > now - 72 * 3600000 && Number.isFinite(sample.value));
        if (samples.length < 72) return [];
        const sum = (hours: number) => samples.filter((sample: { time: number }) => sample.time > now - hours * 3600000)
          .reduce((total: number, sample: { value: number }) => total + sample.value, 0);
        return [{ ...point, accum24h: sum(24), accum72h: sum(72) }];
      });
      setData(points);
      fetchedRef.current = points.length > 0;
      setStatus(points.length ? points.length + " rainfall locations ? Open-Meteo" : "No rainfall observations available");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Rainfall unavailable");
    } finally { inFlight.current = false; }
  }, []);

  useEffect(() => {
    if (visible && data.length === 0) {
      fetchData();
    }
  }, [visible, data.length, fetchData]);

  // Render circles on the map using GeoJSON source + circle layer
  useEffect(() => {
    if (!map || data.length === 0) {
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
        return Number.isFinite(val);
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
  }, [map, data, mode]);

  useEffect(() => {
    for (const id of ["imerg-circles", "imerg-labels"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }, [map, visible, data, mode]);

  return visible ? <div role="status" className="absolute top-44 lg:top-36 left-5 z-20 neu-panel px-3 py-2 text-xs">{status} · {mode}</div> : null;
};

export default IMERGRainfallLayer;

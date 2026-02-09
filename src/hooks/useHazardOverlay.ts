import { useEffect, useRef, useState } from "react";
import * as maptilersdk from "@maptiler/sdk";
import { Hotspot, CycloneTrack, Scenario, getCycloneCategory } from "@/types/disaster";
import { fetchRealtimeThreats, fetchWeatherAnomalies } from "@/services/hazardsApi";

const sampleHotspots: Hotspot[] = [
  {
    id: "hs-001",
    forecast_id: "fc-001",
    disaster_type: "cyclone",
    latitude: -18.6,
    longitude: 45.1,
    lead_time_hours: 24,
    hurricane_prob: 0.72,
    wind_speed_kt: 95,
    pressure_hpa: 975,
    created_at: new Date().toISOString(),
  },
  {
    id: "hs-002",
    forecast_id: "fc-001",
    disaster_type: "cyclone",
    latitude: -12.5,
    longitude: 55.2,
    lead_time_hours: 48,
    hurricane_prob: 0.42,
    wind_speed_kt: 60,
    pressure_hpa: 992,
    created_at: new Date().toISOString(),
  },
];

const sampleTrack: CycloneTrack = {
  id: "trk-001",
  forecast_id: "fc-001",
  track_id: "mean",
  storm_name: "MO-01",
  basin: "SWIO",
  created_at: new Date().toISOString(),
  mean_track: {
    scenario_id: 0,
    probability: 0.65,
    track_points: [
      { lat: -19.0, lon: 44.5, intensity: 90, timestamp: new Date().toISOString() },
      { lat: -18.5, lon: 45.4, intensity: 95, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
      { lat: -18.0, lon: 46.3, intensity: 85, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      { lat: -17.6, lon: 47.0, intensity: 70, timestamp: new Date(Date.now() + 18 * 3600 * 1000).toISOString() },
    ],
  },
  scenarios: [
    {
      scenario_id: 1,
      probability: 0.2,
      track_points: [
        { lat: -19.2, lon: 44.2, intensity: 80, timestamp: new Date().toISOString() },
        { lat: -18.8, lon: 45.0, intensity: 78, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
        { lat: -18.3, lon: 45.9, intensity: 75, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      ],
    },
    {
      scenario_id: 2,
      probability: 0.15,
      track_points: [
        { lat: -18.9, lon: 44.7, intensity: 88, timestamp: new Date().toISOString() },
        { lat: -18.4, lon: 45.6, intensity: 82, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
        { lat: -17.8, lon: 46.6, intensity: 70, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      ],
    },
  ],
};

const HOTSPOT_SOURCE_ID = "afro-hotspots";
const HOTSPOT_LAYER_ID = "afro-hotspots-layer";
const HOTSPOT_PULSE_LAYER_ID = "afro-hotspots-pulse";
const HOTSPOT_PULSE_IMAGE_ID = "afro-hotspots-pulsing-dot";
const TRACK_SOURCE_ID = "afro-tracks";
const TRACK_LAYER_MEAN = "afro-track-mean";
const TRACK_LAYER_ENSEMBLE = "afro-track-ensemble";

const getCoords = (t: any) => {
  const lat = t.center_lat ?? t.latitude ?? t.lat ?? t.centerLat;
  const lng = t.center_lng ?? t.center_lon ?? t.longitude ?? t.lng ?? t.lon ?? t.centerLon;
  return { lat: Number(lat), lng: Number(lng) };
};

const fmtNum = (n: any, digits = 2) => {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "--";
  return v.toFixed(digits);
};

const titleCase = (s: any) => {
  const v = String(s || "").trim();
  if (!v) return "Unknown";
  return v.charAt(0).toUpperCase() + v.slice(1);
};

const tooltipHtml = (props: any) => {
  const type = titleCase(props?.type || props?.disaster_type);
  const severity = props?.severity ? titleCase(props.severity) : "--";
  const title = props?.title ? String(props.title) : `${type} detection`;
  const conf = props?.confidence;
  const leadH = props?.lead_time_hours;
  const wind = props?.wind_speed_kt;
  const pressure = props?.pressure_hpa;
  const cases = props?.cases;
  const deaths = props?.deaths;
  const when = props?.timestamp ? new Date(props.timestamp).toLocaleString() : "--";
  const lat = props?.lat;
  const lng = props?.lng;

  const summary: string[] = [];
  if (Number.isFinite(conf)) summary.push(`Confidence: ${(Number(conf) * 100).toFixed(0)}%`);
  if (Number.isFinite(leadH)) summary.push(`Lead time: ${Math.round(Number(leadH))}h`);
  if (Number.isFinite(wind)) summary.push(`Wind: ${Math.round(Number(wind))} kt`);
  if (Number.isFinite(pressure)) summary.push(`Pressure: ${Math.round(Number(pressure))} hPa`);
  if (Number.isFinite(cases)) summary.push(`Cases: ${Math.round(Number(cases))}`);
  if (Number.isFinite(deaths)) summary.push(`Deaths: ${Math.round(Number(deaths))}`);

  const geo = `(${fmtNum(lat, 4)}, ${fmtNum(lng, 4)})`;

  return `
    <div style="min-width:240px;max-width:320px">
      <div style="font-weight:700;font-size:13px;line-height:1.2">${title}</div>
      <div style="opacity:.85;font-size:12px;margin-top:4px">${type} · Severity: ${severity}</div>
      <div style="opacity:.85;font-size:12px;margin-top:4px">When: ${when}</div>
      <div style="opacity:.85;font-size:12px;margin-top:4px">Geo: ${geo}</div>
      ${summary.length ? `<div style="margin-top:8px;font-size:12px;line-height:1.35">${summary.map((x) => `- ${x}`).join("<br/>")}</div>` : ""}
      ${props?.description ? `<div style="margin-top:8px;font-size:12px;opacity:.9">${String(props.description)}</div>` : ""}
    </div>
  `;
};

export function useHazardOverlay(map: maptilersdk.Map | null) {
  const [hotspots, setHotspots] = useState<Hotspot[]>(sampleHotspots);
  const [track] = useState<CycloneTrack | null>(null);
  const hasAutoFitRef = useRef(false);

  // Fetch live threats from backend; fallback to samples
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await fetchRealtimeThreats();
        if (cancelled || !data) return;

        const mapped: Hotspot[] = (data.threats || [])
          .map((t: any, idx: number) => {
            const { lat, lng } = getCoords(t);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              id: t.id || `rt-${idx}`,
              forecast_id: "live",
              disaster_type: t.type || t.disaster_type || "unknown",
              latitude: lat,
              longitude: lng,
              lead_time_hours: t.lead_time_days ? t.lead_time_days * 24 : t.lead_time_hours ?? 12,
              hurricane_prob: t.detection_details?.track_probability ?? t.confidence ?? t.prob ?? 0.5,
              wind_speed_kt: t.detection_details?.wind_speed ?? t.wind_speed_kt ?? 60,
              pressure_hpa: t.detection_details?.min_pressure_hpa ?? t.pressure_hpa ?? 990,
              created_at: t.created_at || t.timestamp,
              title: t.title,
              description: t.description,
              severity: t.severity,
              confidence: t.confidence,
              cases: t.detection_details?.cases ?? t.cases,
              deaths: t.detection_details?.deaths ?? t.deaths,
            } as any;
          })
          .filter(Boolean);

        setHotspots(mapped.length ? mapped : sampleHotspots);
      } catch (err) {
        console.warn("Hazard fetch failed, keeping samples", err);
      }
    };

    refresh();
    const pollMsRaw = (import.meta as any).env?.VITE_THREATS_POLL_MS;
    const pollMs = Math.max(30_000, Number(pollMsRaw || 1_800_000));
    const id = window.setInterval(refresh, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const addLayers = () => {
      // Build GeoJSON for hotspots
      const hotspotGeojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: hotspots.map((h) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [h.longitude, h.latitude] },
          properties: {
            id: h.id,
            disaster_type: h.disaster_type,
            type: h.disaster_type,
            prob: h.hurricane_prob ?? (h as any).track_prob ?? 0,
            wind_kt: h.wind_speed_kt ?? 0,
            lead_time: h.lead_time_hours,
            lead_time_hours: h.lead_time_hours,
            wind_speed_kt: h.wind_speed_kt ?? 0,
            pressure_hpa: h.pressure_hpa ?? 0,
            timestamp: h.created_at,
            lat: h.latitude,
            lng: h.longitude,
            title: (h as any).title,
            description: (h as any).description,
            severity: (h as any).severity,
            confidence: (h as any).confidence,
            cases: (h as any).cases,
            deaths: (h as any).deaths,
          },
        })),
      };

      // Build GeoJSON for tracks (mean + scenarios)
      const ensembleFeatures: GeoJSON.Feature[] = [];
      const meanFeatures: GeoJSON.Feature[] = [];

      const activeTrack = track || sampleTrack;

      const pushScenario = (scenario: Scenario | undefined, isMean = false) => {
        if (!scenario) return;
        const coords = scenario.track_points.map((p) => [p.lon, p.lat]);
        const intensities = scenario.track_points.map((p) => p.intensity);
        const maxWind = Math.max(...intensities);
        const cat = getCycloneCategory(maxWind);
        const feature: GeoJSON.Feature = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            id: `${activeTrack.id}-${scenario.scenario_id}`,
            prob: scenario.probability,
            maxWind,
            color: cat.color,
          },
        };
        (isMean ? meanFeatures : ensembleFeatures).push(feature);
      };

      pushScenario(activeTrack.mean_track, true);
      activeTrack.scenarios?.forEach((s) => pushScenario(s, false));

      const trackGeojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...meanFeatures, ...ensembleFeatures],
      };

      const meanIds = meanFeatures.map((f) => f.properties?.id).filter(Boolean) as string[];
      const meanFilter: any = ["in", ["get", "id"], ["literal", meanIds]];
      const ensembleFilter: any = ["!in", ["get", "id"], ["literal", meanIds]];

      // Add sources
      const hotspotSource = map.getSource(HOTSPOT_SOURCE_ID) as any;
      if (!hotspotSource) {
        map.addSource(HOTSPOT_SOURCE_ID, { type: "geojson", data: hotspotGeojson });
      } else if (typeof hotspotSource.setData === "function") {
        hotspotSource.setData(hotspotGeojson);
      }

      const trackSource = map.getSource(TRACK_SOURCE_ID) as any;
      if (!trackSource) {
        map.addSource(TRACK_SOURCE_ID, { type: "geojson", data: trackGeojson });
      } else if (typeof trackSource.setData === "function") {
        trackSource.setData(trackGeojson);
      }

      // Hotspot circles
      if (!map.getLayer(HOTSPOT_LAYER_ID)) {
        map.addLayer({
          id: HOTSPOT_LAYER_ID,
          type: "circle",
          source: HOTSPOT_SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 4,
              6, 8,
              8, 12,
              10, 16,
            ],
            "circle-color": [
              "case",
              ["has", "prob"],
              [
                "let",
                "p",
                ["coalesce", ["get", "prob"], 0],
                [
                  "case",
                  [">=", ["var", "p"], 0.8],
                  "hsl(0, 72%, 51%)",
                  [">=", ["var", "p"], 0.6],
                  "hsl(32, 95%, 50%)",
                  [">=", ["var", "p"], 0.4],
                  "hsl(48, 96%, 53%)",
                  [">=", ["var", "p"], 0.2],
                  "hsl(142, 71%, 45%)",
                  "hsl(210, 80%, 55%)",
                ],
              ],
              "hsl(210, 80%, 55%)",
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "white",
            "circle-opacity": 0.9,
          },
        });
      }

      // Pulsing marker symbol layer
      if (!(map as any).hasImage?.(HOTSPOT_PULSE_IMAGE_ID)) {
        const size = 120;
        const pulsingDot: any = {
          width: size,
          height: size,
          data: new Uint8Array(size * size * 4),
          context: null as CanvasRenderingContext2D | null,
          onAdd: function () {
            const canvas = document.createElement("canvas");
            canvas.width = this.width;
            canvas.height = this.height;
            this.context = canvas.getContext("2d");
          },
          render: function () {
            const duration = 1200;
            const t = (performance.now() % duration) / duration;
            const context = this.context as CanvasRenderingContext2D;
            const radius = (size / 2) * 0.18;
            const outerRadius = (size / 2) * (0.18 + 0.35 * t);

            context.clearRect(0, 0, this.width, this.height);

            context.beginPath();
            context.arc(this.width / 2, this.height / 2, outerRadius, 0, Math.PI * 2);
            context.fillStyle = `rgba(239, 68, 68, ${0.35 * (1 - t)})`;
            context.fill();

            context.beginPath();
            context.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
            context.fillStyle = "rgba(239, 68, 68, 1)";
            context.strokeStyle = "rgba(255, 255, 255, 1)";
            context.lineWidth = 4;
            context.fill();
            context.stroke();

            const img = context.getImageData(0, 0, this.width, this.height);
            this.data = img.data as any;
            (map as any).triggerRepaint?.();
            return true;
          },
        };

        map.addImage(HOTSPOT_PULSE_IMAGE_ID, pulsingDot as any, { pixelRatio: 2 });
      }

      if (!map.getLayer(HOTSPOT_PULSE_LAYER_ID)) {
        map.addLayer({
          id: HOTSPOT_PULSE_LAYER_ID,
          type: "symbol",
          source: HOTSPOT_SOURCE_ID,
          layout: {
            "icon-image": HOTSPOT_PULSE_IMAGE_ID,
            "icon-allow-overlap": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.25, 6, 0.35, 10, 0.5],
          },
        });
      }

      if (!hasAutoFitRef.current && hotspots.length) {
        const valid = hotspots
          .filter((h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude))
          .map((h) => [h.longitude, h.latitude] as [number, number]);

        if (valid.length) {
          let minLng = valid[0][0];
          let minLat = valid[0][1];
          let maxLng = valid[0][0];
          let maxLat = valid[0][1];
          for (const [lng, lat] of valid) {
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          }

          try {
            map.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              { padding: 80, maxZoom: 6, duration: 900 },
            );
            hasAutoFitRef.current = true;
          } catch {
            // ignore
          }
        }
      }

      // Mean track (solid)
      if (!map.getLayer(TRACK_LAYER_MEAN)) {
        map.addLayer({
          id: TRACK_LAYER_MEAN,
          type: "line",
          source: TRACK_SOURCE_ID,
          filter: meanFilter,
          paint: {
            "line-width": 3,
            "line-color": ["coalesce", ["get", "color"], "#e11d48"],
            "line-opacity": 0.95,
          },
        });
      } else {
        map.setFilter(TRACK_LAYER_MEAN, meanFilter);
      }

      // Ensemble tracks (dashed)
      if (!map.getLayer(TRACK_LAYER_ENSEMBLE)) {
        map.addLayer({
          id: TRACK_LAYER_ENSEMBLE,
          type: "line",
          source: TRACK_SOURCE_ID,
          filter: ensembleFilter,
          paint: {
            "line-width": 2,
            "line-color": ["coalesce", ["get", "color"], "#f97316"],
            "line-dasharray": [1, 1.5],
            "line-opacity": 0.7,
          },
        });
      } else {
        map.setFilter(TRACK_LAYER_ENSEMBLE, ensembleFilter);
      }
    };

    // Wait for style to be loaded before adding sources
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    // Tooltip
    const PopupCtor = (maptilersdk as any).Popup;
    const popup = PopupCtor
      ? new PopupCtor({ closeButton: false, closeOnClick: false, maxWidth: "340px" })
      : null;

    const onEnter = (e: any) => {
      try {
        const c = (map as any).getCanvas?.();
        if (c?.style) c.style.cursor = "pointer";
      } catch {
        // ignore
      }
      const feature = e?.features?.[0];
      if (!feature || !popup) return;
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      popup.setLngLat(coords).setHTML(tooltipHtml(feature.properties)).addTo(map);
    };

    const onLeave = () => {
      try {
        const c = (map as any).getCanvas?.();
        if (c?.style) c.style.cursor = "";
      } catch {
        // ignore
      }
      try {
        popup?.remove();
      } catch {
        // ignore
      }
    };

    const onClick = (e: any) => {
      const feature = e?.features?.[0];
      if (!feature || !popup) return;
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      popup.setLngLat(coords).setHTML(tooltipHtml(feature.properties)).addTo(map);
    };

    if (map.getLayer(HOTSPOT_PULSE_LAYER_ID)) {
      map.on("mouseenter", HOTSPOT_PULSE_LAYER_ID, onEnter);
      map.on("mouseleave", HOTSPOT_PULSE_LAYER_ID, onLeave);
      map.on("click", HOTSPOT_PULSE_LAYER_ID, onClick);
    } else if (map.getLayer(HOTSPOT_LAYER_ID)) {
      map.on("mouseenter", HOTSPOT_LAYER_ID, onEnter);
      map.on("mouseleave", HOTSPOT_LAYER_ID, onLeave);
      map.on("click", HOTSPOT_LAYER_ID, onClick);
    }

    // Cleanup on unmount
    return () => {
      try {
        popup?.remove();
      } catch {
        // ignore
      }
      if (map.getLayer(HOTSPOT_PULSE_LAYER_ID)) {
        map.off("mouseenter", HOTSPOT_PULSE_LAYER_ID, onEnter);
        map.off("mouseleave", HOTSPOT_PULSE_LAYER_ID, onLeave);
        map.off("click", HOTSPOT_PULSE_LAYER_ID, onClick);
        map.removeLayer(HOTSPOT_PULSE_LAYER_ID);
      }
      if (map.getLayer(TRACK_LAYER_ENSEMBLE)) map.removeLayer(TRACK_LAYER_ENSEMBLE);
      if (map.getLayer(TRACK_LAYER_MEAN)) map.removeLayer(TRACK_LAYER_MEAN);
      if (map.getLayer(HOTSPOT_LAYER_ID)) map.removeLayer(HOTSPOT_LAYER_ID);
      if (map.getSource(TRACK_SOURCE_ID)) map.removeSource(TRACK_SOURCE_ID);
      if (map.getSource(HOTSPOT_SOURCE_ID)) map.removeSource(HOTSPOT_SOURCE_ID);
      try {
        if ((map as any).hasImage?.(HOTSPOT_PULSE_IMAGE_ID)) map.removeImage(HOTSPOT_PULSE_IMAGE_ID);
      } catch {
        // ignore
      }
    };
  }, [map, hotspots, track]);
}

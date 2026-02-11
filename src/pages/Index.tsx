import { useState, useCallback, useEffect } from "react";
import type * as maptilersdk from "@maptiler/sdk";

import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";
import WeatherControls from "@/components/WeatherControls";
import BackendStatusBadge from "@/components/BackendStatusBadge";
import { useWeatherLayers } from "@/hooks/useWeatherLayers";
import { orchestrator, emit } from "@/moscripts";
import { mo_THREAT_RENDERER } from "@/moscripts";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

type ThreatLike = Record<string, any>;

function normalizeThreats(data: any): ThreatLike[] {
  if (!data) return [];

  const list: ThreatLike[] = Array.isArray(data.threats)
    ? data.threats
    : [];

  return list
    .map((t, idx) => {
      const lat = Number(t.center_lat ?? t.latitude ?? t.lat);
      const lng = Number(t.center_lng ?? t.center_lon ?? t.longitude ?? t.lng ?? t.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const threatType = String(t.threat_type ?? t.type ?? "unknown").toLowerCase();

      return {
        ...t,
        id: t.id ?? `th-${idx}`,
        threat_type: threatType,
        center_lat: lat,
        center_lng: lng,
      };
    })
    .filter(Boolean) as ThreatLike[];
}

const Index = () => {
  const [zoom, setZoom] = useState(2);
  const [coordinates, setCoordinates] = useState({ lng: 0, lat: 20 });
  const [mapInstance, setMapInstance] = useState<maptilersdk.Map | null>(null);

  const weather = useWeatherLayers(mapInstance);

  // Register MoScripts on mount
  useEffect(() => {
    orchestrator.register(mo_THREAT_RENDERER);
    return () => { orchestrator.clear(); };
  }, []);

  // Fetch and render threats
  useEffect(() => {
    if (!mapInstance) return;

    async function loadThreats() {
      try {
        const data = await fetchRealtimeThreats();
        const threats = normalizeThreats(data);
        console.log(`🌍 Loaded ${threats.length} threats from Neon DB`);
        
        if (threats.length > 0) {
          await emit('onThreatsUpdate', { threats, mapInstance });
        }
      } catch (error) {
        console.error('❌ Failed to load threats:', error);
      }
    }

    loadThreats();
    const interval = setInterval(loadThreats, 30000);
    return () => clearInterval(interval);
  }, [mapInstance]);

  const handleMapReady = useCallback((map: maptilersdk.Map) => {
    setMapInstance(map);
    emit('onMapLoad', { mapInstance: map });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <MapView
        onZoomChange={setZoom}
        onCenterChange={(lng, lat) => setCoordinates({ lng, lat })}
        onMapReady={handleMapReady}
      />
      <BackendStatusBadge />
      <MapControls zoom={zoom} coordinates={coordinates} />
      {weather.ready && (
        <WeatherControls
          activeLayer={weather.activeLayer}
          onChangeLayer={weather.changeWeatherLayer}
          isPlaying={weather.isPlaying}
          onTogglePlay={weather.togglePlayPause}
          timeText={weather.timeText}
          sliderValue={weather.sliderValue}
          sliderMin={weather.sliderMin}
          sliderMax={weather.sliderMax}
          onSliderChange={weather.onSliderChange}
          pointerValue={weather.pointerValue}
        />
      )}
    </div>
  );
};

export default Index;

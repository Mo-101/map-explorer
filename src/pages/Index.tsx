import { useState, useCallback, useEffect } from "react";
import type * as maptilersdk from "@maptiler/sdk";

import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";
import WeatherControls from "@/components/WeatherControls";
import BackendStatusBadge from "@/components/BackendStatusBadge";
import MoScriptsAnalysisPanel from "@/components/MoScriptsAnalysisPanel";
import { MoScriptsTest } from "@/components/MoScriptsTest";
import { useWeatherLayers } from "@/hooks/useWeatherLayers";
import { orchestrator, emit } from "@/moscripts";
import { mo_THREAT_RENDERER } from "@/moscripts";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

type ThreatLike = Record<string, any>;

function normalizeThreats(data: any): ThreatLike[] {
  if (!data) return [];

  const list: ThreatLike[] = Array.isArray(data.threats)
    ? data.threats
    : [
        ...(Array.isArray(data.cyclones)
          ? data.cyclones.map((t: ThreatLike) => ({ ...t, type: t.type ?? "cyclone" }))
          : []),
        ...(Array.isArray(data.floods)
          ? data.floods.map((t: ThreatLike) => ({ ...t, type: t.type ?? "flood" }))
          : []),
        ...(Array.isArray(data.landslides)
          ? data.landslides.map((t: ThreatLike) => ({ ...t, type: t.type ?? "landslide" }))
          : []),
        ...(Array.isArray(data.convergences)
          ? data.convergences.map((t: ThreatLike) => ({ ...t, type: t.type ?? "convergence" }))
          : []),
      ];

  return list
    .map((t, idx) => {
      const lat = Number(t.center_lat ?? t.latitude ?? t.lat);
      const lng = Number(t.center_lng ?? t.center_lon ?? t.longitude ?? t.lng ?? t.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const threatType = String(t.threat_type ?? t.type ?? t.disaster_type ?? "unknown").toLowerCase();

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
  const [terrainEnabled, setTerrainEnabled] = useState(false);

  const weather = useWeatherLayers(mapInstance);

  // Register MoScripts on mount
  useEffect(() => {
    console.log('🔥 Registering MoScripts...');
    
    // Register threat renderer MoScript
    orchestrator.register(mo_THREAT_RENDERER);
    
    // Log stats
    const stats = orchestrator.getStats();
    console.log('📊 Orchestrator stats:', stats);
    console.log('📋 Registered scripts:', orchestrator.getRegisteredScripts());
    
    return () => {
      // Cleanup on unmount
      orchestrator.clear();
    };
  }, []);

  // Fetch and render threats using MoScripts
  useEffect(() => {
    if (!mapInstance) return;

    async function loadThreats() {
      try {
        // 🔥 PAUSED: Backend not running in Analysis Mode
        // const data = await fetchRealtimeThreats();
        // const threats = normalizeThreats(data);
        
        // 🔥 TRIGGER MOSCRIPT via event (when backend available)
        // await emit('onThreatsUpdate', {
        //   threats,
        //   mapInstance
        // });
        
        console.log('🧠 Analysis Mode: Backend temporarily paused');
      } catch (error) {
        console.error('❌ Index: Failed to load threats:', error);
      }
    }

    // Initial load
    loadThreats();
    
    // 🔥 PAUSED: Polling disabled in Analysis Mode
    // const interval = setInterval(loadThreats, 30000);
    // return () => clearInterval(interval);
  }, [mapInstance]);

  const handleMapReady = useCallback((map: maptilersdk.Map) => {
    setMapInstance(map);
    
    // 🔥 TRIGGER MOSCRIPT via event when map loads
    emit('onMapLoad', { mapInstance: map });
  }, []);

  useEffect(() => {
    if (!mapInstance) return;

    const update = () => {
      try {
        const enabled = mapInstance.hasTerrain();
        setTerrainEnabled(enabled);
        mapInstance.easeTo({ pitch: enabled ? mapInstance.getMaxPitch() : 0, duration: 2000 });
      } catch {
        setTerrainEnabled(false);
      }
    };

    update();
    mapInstance.on("terrain", update);
    return () => {
      mapInstance.off("terrain", update);
    };
  }, [mapInstance]);

  const toggleTerrain = useCallback(async () => {
    if (!mapInstance) return;
    try {
      const currentlyEnabled = mapInstance.hasTerrain();
      if (currentlyEnabled) {
        setTerrainEnabled(false);
        await mapInstance.disableTerrain();
      } else {
        setTerrainEnabled(true);
        await mapInstance.enableTerrain(1.5);
      }
      setTerrainEnabled(mapInstance.hasTerrain());
    } catch {
      setTerrainEnabled(false);
    }
  }, [mapInstance]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <MoScriptsAnalysisPanel />
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
          terrainEnabled={terrainEnabled}
          onToggleTerrain={toggleTerrain}
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

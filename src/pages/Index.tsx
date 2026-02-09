import { useState, useCallback, useEffect } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";
import WeatherControls from "@/components/WeatherControls";
import BackendStatusBadge from "@/components/BackendStatusBadge";
import { MoScriptsTest } from "@/components/MoScriptsTest";
import { TooltipTest } from "@/components/TooltipTest";
import { useWeatherLayers } from "@/hooks/useWeatherLayers";
import { orchestrator, emit } from "@/moscripts";
import { mo_THREAT_RENDERER } from "@/moscripts";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

const Index = () => {
  const [zoom, setZoom] = useState(2);
  const [coordinates, setCoordinates] = useState({ lng: 0, lat: 20 });
  const [mapInstance, setMapInstance] = useState<maptilersdk.Map | null>(null);

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
        const data = await fetchRealtimeThreats();
        
        // 🔥 TRIGGER MOSCRIPT via event
        await emit('onThreatsUpdate', {
          threats: data?.threats || data?.cyclones || data?.floods || data?.landslides || [],
          mapInstance
        });
      } catch (error) {
        console.error('❌ Index: Failed to load threats:', error);
      }
    }

    // Initial load
    loadThreats();
    
    // Poll every 30 seconds
    const interval = setInterval(loadThreats, 30000);
    return () => clearInterval(interval);
  }, [mapInstance]);

  const handleMapReady = useCallback((map: maptilersdk.Map) => {
    setMapInstance(map);
    
    // 🔥 TRIGGER MOSCRIPT via event when map loads
    emit('onMapLoad', { mapInstance: map });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <TooltipTest />
      <MoScriptsTest />
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

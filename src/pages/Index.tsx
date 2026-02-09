import { useState, useCallback } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";
import WeatherControls from "@/components/WeatherControls";
import BackendStatusBadge from "@/components/BackendStatusBadge";
import AnomalyLayer from "@/components/AnomalyLayer";
import { useWeatherLayers } from "@/hooks/useWeatherLayers";
import { useHazardOverlay } from "@/hooks/useHazardOverlay";

const Index = () => {
  const [zoom, setZoom] = useState(2);
  const [coordinates, setCoordinates] = useState({ lng: 0, lat: 20 });
  const [mapInstance, setMapInstance] = useState<maptilersdk.Map | null>(null);

  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;

  const weather = useWeatherLayers(mapInstance);
  useHazardOverlay(mapInstance);

  const handleMapReady = useCallback((map: maptilersdk.Map) => {
    setMapInstance(map);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <MapView
        onZoomChange={setZoom}
        onCenterChange={(lng, lat) => setCoordinates({ lng, lat })}
        onMapReady={handleMapReady}
      />
      <AnomalyLayer map={mapInstance} apiBaseUrl={apiBase} />
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

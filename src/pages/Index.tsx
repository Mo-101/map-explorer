import { useState, useCallback, useEffect, useMemo } from "react";
import type * as maptilersdk from "@maptiler/sdk";

import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";
import WeatherControls from "@/components/WeatherControls";
import BackendStatusBadge from "@/components/BackendStatusBadge";
import SituationalTicker from "@/components/SituationalTicker";
import ThreatDetailsPanel from "@/components/ThreatDetailsPanel";
import IMERGRainfallLayer from "@/components/IMERGRainfallLayer";
import CopernicusFloodLayer from "@/components/CopernicusFloodLayer";
import ClusterPolygonLayer from "@/components/ClusterPolygonLayer";
import ClusterStatsBadge from "@/components/ClusterStatsBadge";
import GdacsRiskSummary from "@/components/GdacsRiskSummary";
import FloodComparisonPanel from "@/components/FloodComparisonPanel";
import { useWeatherLayers } from "@/hooks/useWeatherLayers";
import { orchestrator, emit } from "@/moscripts";
import { mo_THREAT_RENDERER } from "@/moscripts";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

type ThreatLike = Record<string, any>;

function normalizeThreats(data: any): ThreatLike[] {
  if (!data) return [];
  const list: ThreatLike[] = Array.isArray(data.threats) ? data.threats : [];
  return list
    .map((t, idx) => {
      const lat = Number(t.center_lat ?? t.latitude ?? t.lat);
      const lng = Number(t.center_lng ?? t.center_lon ?? t.longitude ?? t.lng ?? t.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const threatType = String(t.threat_type ?? t.type ?? "unknown").toLowerCase();
      return { ...t, id: t.id ?? `th-${idx}`, threat_type: threatType, center_lat: lat, center_lng: lng };
    })
    .filter(Boolean) as ThreatLike[];
}

const Index = () => {
  const [zoom, setZoom] = useState(2);
  const [coordinates, setCoordinates] = useState({ lng: 0, lat: 20 });
  const [mapInstance, setMapInstance] = useState<maptilersdk.Map | null>(null);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [selectedThreat, setSelectedThreat] = useState<any>(null);
  const [allThreats, setAllThreats] = useState<any[]>([]);
  const [imergEnabled, setImergEnabled] = useState(false);
  const [imergMode, setImergMode] = useState<'24h' | '72h'>('24h');
  const [clusters, setClusters] = useState<any[]>([]);
  const [copernicusFloodEnabled, setCopernicusFloodEnabled] = useState(false);
  const [copernicusGeoJson, setCopernicusGeoJson] = useState<any>(null);

  const weather = useWeatherLayers(mapInstance);

  // Load Copernicus GeoJSON for comparison panel
  useEffect(() => {
    fetch("/data/emsr867_flood_aois.json")
      .then((r) => r.json())
      .then(setCopernicusGeoJson)
      .catch(() => {});
  }, []);

  // Flood alerts for comparison
  const floodAlerts = useMemo(() => {
    const floodTypes = ["flood", "cyclone", "storm", "heavy rain", "precipitation"];
    return allThreats
      .filter((t) => {
        const type = (t.threat_type || t.type || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        return floodTypes.some((ft) => type.includes(ft) || title.includes(ft));
      })
      .map((t) => ({
        id: t.id,
        lat: t.center_lat ?? t.lat,
        lng: t.center_lng ?? t.lng,
        severity: t.severity || "medium",
        title: t.title || `${t.threat_type} alert`,
      }));
  }, [allThreats]);

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
        setAllThreats(threats);
        if (Array.isArray(data?.clusters)) setClusters(data.clusters);
        if (threats.length > 0) await emit('onThreatsUpdate', { threats, mapInstance });
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

  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      try {
        const enabled = mapInstance.hasTerrain();
        setTerrainEnabled(enabled);
        mapInstance.easeTo({ pitch: enabled ? mapInstance.getMaxPitch() : 0, duration: 2000 });
      } catch { setTerrainEnabled(false); }
    };
    update();
    mapInstance.on("terrain", update);
    return () => { mapInstance.off("terrain", update); };
  }, [mapInstance]);

  const toggleTerrain = useCallback(async () => {
    if (!mapInstance) return;
    try {
      const currentlyEnabled = mapInstance.hasTerrain();
      if (currentlyEnabled) { setTerrainEnabled(false); await mapInstance.disableTerrain(); }
      else { setTerrainEnabled(true); await mapInstance.enableTerrain(1.5); }
      setTerrainEnabled(mapInstance.hasTerrain());
    } catch { setTerrainEnabled(false); }
  }, [mapInstance]);

  const handleThreatSelect = useCallback((threat: any) => setSelectedThreat(threat), []);

  const handleFlyTo = useCallback((lng: number, lat: number, z = 8) => {
    mapInstance?.flyTo({ center: [lng, lat], zoom: z, duration: 1500 });
  }, [mapInstance]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <SituationalTicker mapInstance={mapInstance} onThreatSelect={handleThreatSelect} />
      <MapView
        onZoomChange={setZoom}
        onCenterChange={(lng, lat) => setCoordinates({ lng, lat })}
        onMapReady={handleMapReady}
      />
      <BackendStatusBadge />
      <MapControls zoom={zoom} coordinates={coordinates} />
      <ClusterStatsBadge clusterCount={clusters.length} rawThreatCount={allThreats.length} />

      {mapInstance && (
        <>
          <IMERGRainfallLayer map={mapInstance} visible={imergEnabled} mode={imergMode} />
          <CopernicusFloodLayer
            map={mapInstance}
            visible={copernicusFloodEnabled}
            floodAlerts={floodAlerts}
            showAlertMarkers={copernicusFloodEnabled}
          />
        </>
      )}

      {mapInstance && clusters.length > 0 && (
        <ClusterPolygonLayer
          map={mapInstance}
          clusters={clusters}
          onClusterClick={(cluster) => {
            mapInstance.flyTo({ center: [cluster.center_lng, cluster.center_lat], zoom: 6, duration: 1500 });
            if (cluster.threats?.[0]) {
              const t = cluster.threats[0];
              setSelectedThreat({
                id: t.id || cluster.cluster_id, title: cluster.title, type: cluster.type,
                severity: cluster.severity, description: cluster.description,
                lat: cluster.center_lat, lng: cluster.center_lng, intensity: cluster.max_intensity,
                source_artifact: t.source_artifact, data_source_run_id: t.data_source_run_id,
              });
            }
          }}
        />
      )}

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
          imergEnabled={imergEnabled}
          onToggleIMERG={() => setImergEnabled(v => !v)}
          imergMode={imergMode}
          onChangeIMERGMode={setImergMode}
          copernicusFloodEnabled={copernicusFloodEnabled}
          onToggleCopernicusFlood={() => setCopernicusFloodEnabled(v => !v)}
        />
      )}

      <FloodComparisonPanel
        allThreats={allThreats}
        copernicusGeoJson={copernicusGeoJson}
        copernicusVisible={copernicusFloodEnabled}
        onToggleCopernicus={() => setCopernicusFloodEnabled(v => !v)}
        onFlyTo={handleFlyTo}
      />

      <GdacsRiskSummary />

      <ThreatDetailsPanel
        threat={selectedThreat}
        onClose={() => setSelectedThreat(null)}
        allThreats={allThreats}
      />
    </div>
  );
};

export default Index;

import { useEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";

const MAPTILER_API_KEY = "19XDon3xsuxOLKdfcaZH";

interface MapViewProps {
  onZoomChange?: (zoom: number) => void;
  onCenterChange?: (lng: number, lat: number) => void;
}

const MapView = ({ onZoomChange, onCenterChange }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maptilersdk.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    maptilersdk.config.apiKey = MAPTILER_API_KEY;

    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: "https://api.maptiler.com/maps/backdrop-v4/style.json?key=19XDon3xsuxOLKdfcaZH",
      center: [0, 20],
      zoom: 2,
      pitch: 0,
      bearing: 0,
    });

    map.current.on("zoom", () => {
      if (map.current) {
        onZoomChange?.(Math.round(map.current.getZoom() * 10) / 10);
      }
    });

    map.current.on("move", () => {
      if (map.current) {
        const center = map.current.getCenter();
        onCenterChange?.(Math.round(center.lng * 1000) / 1000, Math.round(center.lat * 1000) / 1000);
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return <div ref={mapContainer} className="absolute inset-0 w-full h-full" />;
};

export default MapView;

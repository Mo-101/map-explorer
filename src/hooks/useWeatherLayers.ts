import { useCallback, useEffect, useRef, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import {
  WindLayer,
  PrecipitationLayer,
  TemperatureLayer,
  PressureLayer,
  RadarLayer,
  ColorRamp,
} from "@maptiler/weather";
import { WindArrowLayer } from "@/lib/windArrows";

export type WeatherLayerType =
  | "wind"
  | "wind-arrows"
  | "precipitation"
  | "pressure"
  | "radar"
  | "temperature";

interface WeatherLayerConfig {
  layer: any | null;
  value: string;
  units: string;
}

export function useWeatherLayers(map: maptilersdk.Map | null) {
  const weatherLayers = useRef<Record<WeatherLayerType, WeatherLayerConfig>>({
    precipitation: { layer: null, value: "value", units: " mm" },
    pressure: { layer: null, value: "value", units: " hPa" },
    radar: { layer: null, value: "value", units: " dBZ" },
    temperature: { layer: null, value: "value", units: " °C" },
    wind: { layer: null, value: "speedMetersPerSecond", units: " m/s" },
    "wind-arrows": { layer: null, value: "speedMetersPerSecond", units: " m/s" },
  });

  const [activeLayer, setActiveLayer] = useState<WeatherLayerType>("wind");
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeText, setTimeText] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderMin, setSliderMin] = useState(0);
  const [sliderMax, setSliderMax] = useState(0);
  const [pointerValue, setPointerValue] = useState("");
  const [ready, setReady] = useState(false);
  const PLAY_SPEED = 7200; // seconds per second (2x realtime) for smooth auto animation

  const currentTimeRef = useRef<number | null>(null);
  const pointerLngLatRef = useRef<{ lng: number; lat: number } | null>(null);
  const activeLayerRef = useRef<WeatherLayerType>(activeLayer);

  activeLayerRef.current = activeLayer;

  const updatePointerValue = useCallback((lngLat: { lng: number; lat: number } | null) => {
    if (!lngLat) return;
    pointerLngLatRef.current = lngLat;
    const current = activeLayerRef.current;
    const config = weatherLayers.current[current];
    if (config.layer) {
      const value = config.layer.pickAt(lngLat.lng, lngLat.lat);
      if (!value) {
        setPointerValue("");
        return;
      }
      setPointerValue(`${value[config.value].toFixed(1)}${config.units}`);
    }
  }, []);

  const refreshTime = useCallback(() => {
    const current = activeLayerRef.current;
    const wl = weatherLayers.current[current]?.layer;
    if (wl) {
      const d = wl.getAnimationTimeDate();
      setTimeText(d.toString());
      setSliderValue(+d);
    }
  }, []);

  const createWeatherLayer = useCallback((type: WeatherLayerType) => {
    let weatherLayer: any = null;
    switch (type) {
      case "precipitation":
        weatherLayer = new PrecipitationLayer({
          id: "precipitation",
          opacity: 0.9,
          smooth: true,
          colorramp: ColorRamp.builtin.PRECIPITATION,
        });
        break;
      case "pressure":
        weatherLayer = new PressureLayer({
          id: "pressure",
          opacity: 0.8,
        });
        break;
      case "radar":
        weatherLayer = new RadarLayer({
          id: "radar",
          opacity: 0.8,
          smooth: true,
          colorramp: ColorRamp.builtin.RADAR_CLOUD,
        });
        break;
      case "temperature":
        weatherLayer = new TemperatureLayer({
          colorramp: ColorRamp.builtin.TURBO.scale(-40, 50),
          opacity: 0.9,
          smooth: true,
          id: "temperature",
        });
        break;
      case "wind":
        weatherLayer = new WindLayer({
          id: "wind",
          opacity: 0.9,
          colorramp: ColorRamp.builtin.VIRIDIS.scale(0, 40),
        });
        break;
      case "wind-arrows":
        // Create wind arrows using custom implementation
        weatherLayer = new WindArrowLayer({
          id: "wind-arrows",
          opacity: 0.8,
          colorramp: ColorRamp.builtin.VIRIDIS.scale(0, 40),
        });
        break;
    }

    weatherLayer.on("tick", () => {
      refreshTime();
      updatePointerValue(pointerLngLatRef.current);
    });

    weatherLayer.on("animationTimeSet", () => {
      refreshTime();
    });

    weatherLayer.on("sourceReady", () => {
      const startDate = weatherLayer.getAnimationStartDate();
      const endDate = weatherLayer.getAnimationEndDate();
      if (sliderMin > 0 && currentTimeRef.current !== null) {
        weatherLayer.setAnimationTime(currentTimeRef.current);
      } else {
        const currentDate = weatherLayer.getAnimationTimeDate();
        setSliderMin(+startDate);
        setSliderMax(+endDate);
        setSliderValue(+currentDate);
      }
      // Auto-play as soon as data is ready with appropriate speed
      let animationSpeed = PLAY_SPEED;
      if (type === "radar" || type === "pressure") {
        animationSpeed = 3600; // 1x speed for radar and pressure
      }
      weatherLayer.animateByFactor(animationSpeed);
      setIsPlaying(true);
      refreshTime();
    });

    weatherLayers.current[type].layer = weatherLayer;
    return weatherLayer;
  }, [refreshTime, updatePointerValue, sliderMin]);

  const changeWeatherLayer = useCallback((type: WeatherLayerType) => {
    if (!map) return;
    const prev = activeLayerRef.current;

    if (type !== prev) {
      if (map.getLayer(prev)) {
        const prevLayer = weatherLayers.current[prev]?.layer;
        if (prevLayer) {
          currentTimeRef.current = prevLayer.getAnimationTime();
          // Handle different layer types
          if (prev === "wind-arrows") {
            prevLayer.setVisibility(false);
          } else {
            map.setLayoutProperty(prev, "visibility", "none");
          }
        }
      }
    }

    setActiveLayer(type);
    activeLayerRef.current = type;

    const weatherLayer = weatherLayers.current[type].layer || createWeatherLayer(type);

    if (type === "wind-arrows") {
      // Handle custom WindArrowLayer
      if (!(weatherLayer as any).isAdded) {
        (weatherLayer as WindArrowLayer).addTo(map, "Water");
        (weatherLayer as any).isAdded = true;
      } else {
        (weatherLayer as WindArrowLayer).setVisibility(true);
      }
    } else {
      // Handle standard MapTiler weather layers
      if (map.getLayer(type)) {
        map.setLayoutProperty(type, "visibility", "visible");
      } else {
        map.addLayer(weatherLayer, "Water");
      }
      // Set animation speed based on layer type
      let animationSpeed = PLAY_SPEED;
      if (type === "radar" || type === "pressure") {
        animationSpeed = 3600; // 1x speed for radar and pressure
      }
      weatherLayer.animateByFactor(animationSpeed);
    }
    setIsPlaying(true);
  }, [map, createWeatherLayer]);

  const togglePlayPause = useCallback(() => {
    const wl = weatherLayers.current[activeLayerRef.current]?.layer;
    if (!wl) return;
    if (isPlaying) {
      wl.animateByFactor(0);
      setIsPlaying(false);
    } else {
      // Use appropriate animation speed for different layers
      const currentType = activeLayerRef.current;
      let animationSpeed = 3600;
      if (currentType === "radar" || currentType === "pressure") {
        animationSpeed = 3600; // 1x speed for radar and pressure
      }
      wl.animateByFactor(animationSpeed);
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const onSliderChange = useCallback((val: number) => {
    setSliderValue(val);
    const wl = weatherLayers.current[activeLayerRef.current]?.layer;
    if (wl) {
      wl.setAnimationTime(val / 1000);
    }
  }, []);

  // Initialize on map load
  useEffect(() => {
    if (!map) return;

    const onLoad = () => {
      try {
        // Set water color as in the example
        map.setPaintProperty("Water", "fill-color", "rgba(0, 0, 0, 0.4)");
      } catch {
        // Water layer may not exist
      }
      // Start with wind layer by default
      changeWeatherLayer("wind");
      setReady(true);
    };

    if (map.loaded()) {
      onLoad();
    } else {
      map.on("load", onLoad);
    }

    const onMouseMove = (e: any) => {
      updatePointerValue(e.lngLat);
    };

    const onMouseOut = (e: any) => {
      // Clear pointer value when mouse leaves the map
      if (!e.originalEvent.relatedTarget) {
        setPointerValue("");
        pointerLngLatRef.current = null;
      }
    };

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseOut);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseOut);
    };
  }, [map, changeWeatherLayer, updatePointerValue]);

  return {
    activeLayer,
    changeWeatherLayer,
    isPlaying,
    togglePlayPause,
    timeText,
    sliderValue,
    sliderMin,
    sliderMax,
    onSliderChange,
    pointerValue,
    ready,
  };
}

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

export type WeatherLayerType =
  | "wind"
  | "wind-arrows"
  | "precipitation"
  | "pressure"
  | "radar"
  | "temperature"
  | "wind+temperature";

interface WeatherLayerConfig {
  layer: any | null;
  value: string;
  units: string;
}

interface MultiLayerConfig {
  primary: any | null;
  background: any | null;
  value: string;
  units: string;
}

export function useWeatherLayers(map: maptilersdk.Map | null) {
  const weatherLayers = useRef<Record<WeatherLayerType, WeatherLayerConfig>>({
    precipitation: { layer: null, value: "value", units: " mm" },
    pressure: { layer: null, value: "value", units: " hPa" },
    radar: { layer: null, value: "value", units: " dBZ" },
    temperature: { layer: null, value: "value", units: "°" },
    wind: { layer: null, value: "speedMetersPerSecond", units: " m/s" },
    "wind-arrows": { layer: null, value: "speedMetersPerSecond", units: " m/s" },
    "wind+temperature": { layer: null, value: "speedMetersPerSecond", units: " m/s" },
  });

  const multiLayers = useRef<Record<string, MultiLayerConfig>>({
    "wind+temperature": { 
      primary: null, 
      background: null, 
      value: "speedMetersPerSecond", 
      units: " m/s" 
    },
  });

  const [activeLayer, setActiveLayer] = useState<WeatherLayerType>("wind");
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeText, setTimeText] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderMin, setSliderMin] = useState(0);
  const [sliderMax, setSliderMax] = useState(0);
  const [pointerValue, setPointerValue] = useState("");
  const [ready, setReady] = useState(false);
  const ANIMATION_SPEED = 3600; // 1x speed for all weather layers

  const currentTimeRef = useRef<number | null>(null);
  const pointerLngLatRef = useRef<{ lng: number; lat: number } | null>(null);
  const activeLayerRef = useRef<WeatherLayerType>(activeLayer);

  activeLayerRef.current = activeLayer;

  const updatePointerValue = useCallback((lngLat: { lng: number; lat: number } | null) => {
    if (!lngLat) return;
    pointerLngLatRef.current = lngLat;
    const current = activeLayerRef.current;
    const config = weatherLayers.current[current];
    
    if (current === "wind+temperature") {
      // Handle multi-layer pointer values
      const multiConfig = multiLayers.current[current];
      if (multiConfig.primary && multiConfig.background) {
        const windValue = multiConfig.primary.pickAt(lngLat.lng, lngLat.lat);
        const tempValue = multiConfig.background.pickAt(lngLat.lng, lngLat.lat);
        if (!windValue || !tempValue) {
          setPointerValue("");
          return;
        }
        setPointerValue(`${tempValue.value.toFixed(1)}°C ${windValue.speedKilometersPerHour.toFixed(1)} km/h`);
      }
    } else if (config.layer) {
      // Handle single layer pointer values
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
    let backgroundLayer: any = null;
    
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
          colorramp: ColorRamp.builtin.TEMPERATURE_3,
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
      case "wind+temperature":
        // Create wind+temperature combination layer
        backgroundLayer = new TemperatureLayer({
          opacity: 0.8,
          id: "temp-bg",
        });
        
        weatherLayer = new WindLayer({
          id: "wind-particles",
          colorramp: ColorRamp.builtin.NULL,
          speed: 0.001,
          fadeFactor: 0.03,
          maxAmount: 256,
          density: 200,
          color: [0, 0, 0, 30],
          fastColor: [0, 0, 0, 100],
        });
        
        // Store both layers in multiLayers
        multiLayers.current[type] = {
          primary: weatherLayer,
          background: backgroundLayer,
          value: "speedMetersPerSecond",
          units: " m/s"
        };
        break;
      case "wind-arrows":
        // Wind arrows using WindLayer with arrow-style rendering
        weatherLayer = new WindLayer({
          id: "wind-arrows",
          opacity: 0.8,
          colorramp: ColorRamp.builtin.VIRIDIS.scale(0, 40),
        });
        break;
    }

    // Handle event listeners for multi-layer
    if (type === "wind+temperature" && backgroundLayer) {
      // Set up events for both layers
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
        const currentDate = weatherLayer.getAnimationTimeDate();
        
        console.log('🗓️ Weather Layer Timeline:');
        console.log('  Start Date:', new Date(startDate * 1000));
        console.log('  End Date:', new Date(endDate * 1000));
        console.log('  Current Date:', currentDate);
        console.log('  Forecast Hours:', (endDate - startDate) / 3600);
        
        if (sliderMin > 0 && currentTimeRef.current !== null) {
          weatherLayer.setAnimationTime(currentTimeRef.current);
          backgroundLayer.setAnimationTime(currentTimeRef.current);
        } else {
          const currentDate = weatherLayer.getAnimationTimeDate();
          setSliderMin(+startDate);
          setSliderMax(+endDate);
          setSliderValue(+currentDate);
        }
        // Auto-play as soon as data is ready
        weatherLayer.animateByFactor(ANIMATION_SPEED);
        backgroundLayer.animateByFactor(ANIMATION_SPEED);
        setIsPlaying(true);
        refreshTime();
      });

      weatherLayers.current[type].layer = weatherLayer;
      return weatherLayer;
    }

    // Handle single layer events
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
      const currentDate = weatherLayer.getAnimationTimeDate();
      
      console.log('🗓️ Weather Layer Timeline:');
      console.log('  Start Date:', new Date(startDate * 1000));
      console.log('  End Date:', new Date(endDate * 1000));
      console.log('  Current Date:', currentDate);
      console.log('  Forecast Hours:', (endDate - startDate) / 3600);
      
      if (sliderMin > 0 && currentTimeRef.current !== null) {
        weatherLayer.setAnimationTime(currentTimeRef.current);
      } else {
        const currentDate = weatherLayer.getAnimationTimeDate();
        setSliderMin(+startDate);
        setSliderMax(+endDate);
        setSliderValue(+currentDate);
      }
      // Auto-play as soon as data is ready
      weatherLayer.animateByFactor(ANIMATION_SPEED);
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
            map.setLayoutProperty(prev, "visibility", "none");
          } else {
            map.setLayoutProperty(prev, "visibility", "none");
          }
        }
      }
      
      // Handle multi-layer cleanup
      if (prev === "wind+temperature") {
        const multiConfig = multiLayers.current[prev];
        if (multiConfig.background) {
          if (map.getLayer("temp-bg")) {
            map.setLayoutProperty("temp-bg", "visibility", "none");
          }
        }
      }
    }

    setActiveLayer(type);
    activeLayerRef.current = type;

    const weatherLayer = weatherLayers.current[type].layer || createWeatherLayer(type);

    if (type === "wind-arrows") {
      // Handle MapTiler WindArrowLayer (standard layer, no custom logic)
      if (map.getLayer(type)) {
        map.setLayoutProperty(type, "visibility", "visible");
      } else {
        map.addLayer(weatherLayer, "Water");
      }
      weatherLayer.animateByFactor(ANIMATION_SPEED);
    } else if (type === "wind+temperature") {
      // Handle multi-layer addition
      const multiConfig = multiLayers.current[type];
      if (multiConfig.background) {
        if (map.getLayer("temp-bg")) {
          map.setLayoutProperty("temp-bg", "visibility", "visible");
        } else {
          map.addLayer(multiConfig.background, "Water");
        }
      }
      if (map.getLayer("wind-particles")) {
        map.setLayoutProperty("wind-particles", "visibility", "visible");
      } else {
        map.addLayer(weatherLayer, "Water");
      }
      // Set animation speed for both layers
      weatherLayer.animateByFactor(ANIMATION_SPEED);
      multiConfig.background.animateByFactor(ANIMATION_SPEED);
    } else {
      // Handle standard MapTiler weather layers
      if (map.getLayer(type)) {
        map.setLayoutProperty(type, "visibility", "visible");
      } else {
        map.addLayer(weatherLayer, "Water");
      }
      // Set animation speed for all layers
      weatherLayer.animateByFactor(ANIMATION_SPEED);
    }
    setIsPlaying(true);
  }, [map, createWeatherLayer]);

  const togglePlayPause = useCallback(() => {
    const current = activeLayerRef.current;
    const wl = weatherLayers.current[current]?.layer;
    if (!wl) return;
    
    if (isPlaying) {
      wl.animateByFactor(0);
      // Handle multi-layer pause
      if (current === "wind+temperature") {
        const multiConfig = multiLayers.current[current];
        if (multiConfig.background) {
          multiConfig.background.animateByFactor(0);
        }
      }
      setIsPlaying(false);
    } else {
      // Use consistent animation speed for all layers
      wl.animateByFactor(ANIMATION_SPEED);
      // Handle multi-layer play
      if (current === "wind+temperature") {
        const multiConfig = multiLayers.current[current];
        if (multiConfig.background) {
          multiConfig.background.animateByFactor(ANIMATION_SPEED);
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const onSliderChange = useCallback((val: number) => {
    setSliderValue(val);
    const current = activeLayerRef.current;
    const wl = weatherLayers.current[current]?.layer;
    if (wl) {
      wl.setAnimationTime(val / 1000);
      // Handle multi-layer time sync
      if (current === "wind+temperature") {
        const multiConfig = multiLayers.current[current];
        if (multiConfig.background) {
          multiConfig.background.setAnimationTime(val / 1000);
        }
      }
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

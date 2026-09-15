import { useCallback, useEffect, useRef, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import { WindLayer, PrecipitationLayer, TemperatureLayer, PressureLayer, RadarLayer, ColorRamp } from "@maptiler/weather";
import { updateWindArrows, removeWindArrows, setWindArrowsVisible } from "@/lib/weatherWindArrows";

export type WeatherLayerType = "wind" | "wind-arrows" | "precipitation" | "pressure" | "radar" | "temperature" | "wind+temperature";
type Bundle = { layers: any[]; ready: Set<string>; dispose: (() => void)[] };
const SPEED = 3600;

function createLayers(type: WeatherLayerType): any[] {
  switch (type) {
    case "wind": return [new WindLayer({ id: "weather-wind", opacity: 0.85, colorramp: ColorRamp.builtin.VIRIDIS.scale(0, 40) })];
    case "wind-arrows": return [new WindLayer({ id: "weather-arrows", opacity: 0.65, maxAmount: 1, density: 0, colorramp: ColorRamp.builtin.VIRIDIS.scale(0, 40) })];
    case "precipitation": return [new PrecipitationLayer({ id: "weather-precipitation", opacity: 0.85, smooth: true, colorramp: ColorRamp.builtin.PRECIPITATION })];
    case "pressure": return [new PressureLayer({ id: "weather-pressure", opacity: 0.8 })];
    case "radar": return [new RadarLayer({ id: "weather-radar", opacity: 0.8, smooth: true, colorramp: ColorRamp.builtin.RADAR_CLOUD })];
    case "temperature": return [new TemperatureLayer({ id: "weather-temperature", opacity: 0.85, smooth: true, colorramp: ColorRamp.builtin.TEMPERATURE_3 })];
    case "wind+temperature": return [
      new TemperatureLayer({ id: "weather-combined-temperature", opacity: 0.8, colorramp: ColorRamp.builtin.TEMPERATURE_3 }),
      new WindLayer({ id: "weather-combined-wind", colorramp: ColorRamp.builtin.NULL, maxAmount: 128, density: 2, color: [255, 255, 255, 180], fastColor: [255, 255, 255, 255] }),
    ];
  }
}

export function useWeatherLayers(map: maptilersdk.Map | null) {
  const [activeLayer, setActiveLayer] = useState<WeatherLayerType>("wind");
  const [displayedLayer, setDisplayedLayer] = useState<WeatherLayerType | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeText, setTimeText] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderMin, setSliderMin] = useState(0);
  const [sliderMax, setSliderMax] = useState(0);
  const [pointerValue, setPointerValue] = useState("");
  const control = useRef<{ select: (type: WeatherLayerType) => void; play: () => void; seek: (ms: number) => void } | null>(null);

  // One lifetime per map: timeline updates must not recreate layers or listeners.
  useEffect(() => {
    if (!map) return;
    const bundles = new Map<WeatherLayerType, Bundle>();
    let selected: WeatherLayerType = "wind";
    let displayed: WeatherLayerType | null = null;
    let playing = true;
    let time: number | null = null;
    let pointer: { lng: number; lat: number } | null = null;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let lastTick = 0;
    let lastArrows = 0;
    let transitionFrame = 0;
    const primary = (bundle: Bundle) => bundle.layers[bundle.layers.length - 1];
    const refresh = () => {
      if (!displayed || disposed) return;
      const bundle = bundles.get(displayed)!;
      const layer = primary(bundle);
      const date = layer.getAnimationTimeDate();
      if (Number.isFinite(+date)) {
        time = +date / 1000;
        setSliderValue(+date);
        setTimeText(date.toLocaleString());
      }
      if (pointer) {
        try {
          const value = layer.pickAt(pointer.lng, pointer.lat);
          if (displayed === "wind+temperature") {
            const temp = bundle.layers[0].pickAt(pointer.lng, pointer.lat);
            setPointerValue(value && temp ? `${temp.value.toFixed(1)}°C · ${value.speedMetersPerSecond.toFixed(1)} m/s` : "No data at this location");
          } else {
            const wind = displayed === "wind" || displayed === "wind-arrows";
            const number = wind ? value?.speedMetersPerSecond : value?.value;
            const units = wind ? " m/s" : displayed === "temperature" ? "°C" : displayed === "pressure" ? " hPa" : displayed === "radar" ? " dBZ" : " mm";
            setPointerValue(Number.isFinite(number) ? `${number.toFixed(1)}${units}` : "No data at this location");
          }
        } catch { setPointerValue("No data at this location"); }
      }
      if (displayed === "wind-arrows" && performance.now() - lastArrows > 1000) {
        lastArrows = performance.now();
        updateWindArrows(map, layer);
      }
    };
    const visibility = (bundle: Bundle, visible: boolean) => {
      for (const layer of bundle.layers) {
        if (map.getLayer(layer.id)) map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
        if (bundle.ready.has(layer.id)) layer.animateByFactor(visible && playing ? SPEED : 0);
      }
    };
    const activate = (type: WeatherLayerType) => {
      const bundle = bundles.get(type)!;
      if (disposed || selected !== type || bundle.ready.size !== bundle.layers.length) return;
      clearTimeout(timeout);
      const start = Math.max(...bundle.layers.map(layer => +layer.getAnimationStartDate()));
      const end = Math.min(...bundle.layers.map(layer => +layer.getAnimationEndDate()));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        setError("No forecast times are available for this layer."); setLoading(false); return;
      }
      const ms = Math.max(start, Math.min(end, time === null ? +primary(bundle).getAnimationTimeDate() : time * 1000));
      for (const layer of bundle.layers) layer.setAnimationTime(ms / 1000);
      const commit = () => {
        for (const [name, other] of bundles) {
          visibility(other, name === type);
          for (const layer of other.layers) layer.setOpacity?.(1);
        }
        displayed = type;
        setDisplayedLayer(type);
        setWindArrowsVisible(map, type === "wind-arrows");
        setSliderMin(start); setSliderMax(end); setLoading(false); setError(null);
        refresh(); map.triggerRepaint();
      };
      cancelAnimationFrame(transitionFrame);
      const previous = displayed ? bundles.get(displayed) : null;
      if (!previous || displayed === type || !bundle.layers.every(layer => typeof layer.setOpacity === "function")) return commit();
      for (const layer of bundle.layers) layer.setOpacity(0);
      visibility(bundle, true);
      const requestedAt = performance.now();
      let fadeStarted = 0;
      const transition = (now: number) => {
        if (disposed || selected !== type) return;
        const center = map.getCenter();
        const hasTiles = bundle.layers.every(layer => layer.pickAt(center.lng, center.lat) != null);
        if (!fadeStarted && !hasTiles) {
          if (now - requestedAt > 8000) {
            visibility(bundle, false);
            setLoading(false); setError("No weather data at this location. The previous layer remains visible.");
            return;
          }
          map.triggerRepaint();
          transitionFrame = requestAnimationFrame(transition);
          return;
        }
        fadeStarted ||= now;
        const fraction = Math.min(1, (now - fadeStarted) / 240);
        for (const layer of bundle.layers) layer.setOpacity(fraction);
        for (const layer of previous.layers) layer.setOpacity?.(1 - fraction);
        if (fraction === 1) commit();
        else transitionFrame = requestAnimationFrame(transition);
      };
      transitionFrame = requestAnimationFrame(transition);
    };
    const select = (type: WeatherLayerType) => {
      selected = type;
      setActiveLayer(type); setPointerValue(""); setError(null);
      clearTimeout(timeout);
      cancelAnimationFrame(transitionFrame);
      for (const [name, bundle] of bundles) {
        visibility(bundle, name === displayed);
        for (const layer of bundle.layers) layer.setOpacity?.(1);
      }
      const cached = bundles.get(type);
      setLoading(true);
      if (cached && cached.ready.size === cached.layers.length) return activate(type);
      timeout = setTimeout(() => {
        if (!disposed && selected === type) {
          setLoading(false);
          setError("Weather data is unavailable. Select the layer again to retry.");
          if (cached) return;
          const failed = bundles.get(type);
          if (failed && displayed !== type) {
            failed.dispose.forEach(fn => fn());
            for (const layer of failed.layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
            bundles.delete(type);
          }
        }
      }, 20000);
      if (cached) return;
      const bundle: Bundle = { layers: createLayers(type), ready: new Set(), dispose: [] };
      bundles.set(type, bundle);
      try {
        // Weather stays below labels and operational indicators on every style.
        const before = map.getStyle().layers?.find(layer => layer.type === "symbol" || /^(threat-|hazard-|cluster-|copernicus-|imerg-)/.test(layer.id))?.id;
        for (const layer of bundle.layers) {
          const onReady = () => {
            if (disposed || bundles.get(type) !== bundle) return;
            bundle.ready.add(layer.id);
            layer.animateByFactor(0);
            activate(type);
          };
          const onTick = () => {
            if (displayed !== type || performance.now() - lastTick < 150) return;
            lastTick = performance.now(); refresh();
          };
          layer.on("sourceReady", onReady); layer.on("tick", onTick);
          bundle.dispose.push(() => { layer.off("sourceReady", onReady); layer.off("tick", onTick); });
          map.addLayer(layer, before);
          map.setLayoutProperty(layer.id, "visibility", "none");
          if (layer.getIsSourceReady?.()) onReady();
        }
      } catch (cause) {
        clearTimeout(timeout);
        bundle.dispose.forEach(fn => fn());
        for (const layer of bundle.layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        bundles.delete(type);
        setLoading(false); setError(cause instanceof Error ? cause.message : "Unable to load weather layer");
      }
    };
    control.current = {
      select,
      play() {
        playing = !playing; setIsPlaying(playing);
        if (displayed) visibility(bundles.get(displayed)!, true);
      },
      seek(ms) {
        if (!displayed) return;
        const bundle = bundles.get(displayed)!;
        const start = Math.max(...bundle.layers.map(layer => +layer.getAnimationStartDate()));
        const end = Math.min(...bundle.layers.map(layer => +layer.getAnimationEndDate()));
        time = Math.max(start, Math.min(end, ms)) / 1000;
        for (const layer of bundle.layers) layer.setAnimationTime(time);
        refresh();
      },
    };
    const init = () => { setReady(true); select("wind"); };
    const onMove = (event: any) => { pointer = event.lngLat; refresh(); };
    const onLeave = () => { pointer = null; setPointerValue(""); };
    const onMoveEnd = () => { lastArrows = 0; refresh(); };
    map.on("mousemove", onMove); map.on("mouseout", onLeave); map.on("moveend", onMoveEnd);
    const pointerRefresh = setInterval(() => { if (displayed === "wind-arrows") refresh(); }, 1000);
    if (map.isStyleLoaded()) init(); else map.once("load", init);
    return () => {
      disposed = true; clearTimeout(timeout); control.current = null;
      cancelAnimationFrame(transitionFrame);
      clearInterval(pointerRefresh);
      map.off("load", init); map.off("mousemove", onMove); map.off("mouseout", onLeave); map.off("moveend", onMoveEnd);
      removeWindArrows(map);
      for (const bundle of bundles.values()) {
        bundle.dispose.forEach(fn => fn());
        for (const layer of bundle.layers) {
          if (bundle.ready.has(layer.id)) layer.animateByFactor(0);
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        }
      }
    };
  }, [map]);
  const changeWeatherLayer = useCallback((type: WeatherLayerType) => control.current?.select(type), []);
  const togglePlayPause = useCallback(() => control.current?.play(), []);
  const onSliderChange = useCallback((ms: number) => control.current?.seek(ms), []);
  return { activeLayer, displayedLayer, changeWeatherLayer, isPlaying, togglePlayPause, timeText, sliderValue, sliderMin, sliderMax, onSliderChange, pointerValue, ready, loading, error };
}

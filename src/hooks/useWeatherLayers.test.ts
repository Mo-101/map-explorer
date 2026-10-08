import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWeatherLayers, type WeatherLayerType } from "./useWeatherLayers";

const fake = vi.hoisted(() => ({ layers: new Map<string, any>() }));
vi.mock("@/lib/weatherWindArrows", () => ({ updateWindArrows: vi.fn(), removeWindArrows: vi.fn(), setWindArrowsVisible: vi.fn() }));
vi.mock("@maptiler/weather", () => {
  class Layer {
    id: string;
    ready = false;
    time = 150;
    speed = 0;
    listeners = new Map<string, Set<() => void>>();
    constructor(options: { id: string }) { this.id = options.id; fake.layers.set(this.id, this); }
    on(event: string, fn: () => void) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(fn); }
    off(event: string, fn: () => void) { this.listeners.get(event)?.delete(fn); }
    emitReady() { this.ready = true; this.listeners.get("sourceReady")?.forEach(fn => fn()); }
    getIsSourceReady() { return this.ready; }
    getAnimationStartDate() { return new Date(100000); }
    getAnimationEndDate() { return new Date(200000); }
    getAnimationTimeDate() { return new Date(this.time * 1000); }
    setAnimationTime(time: number) { this.time = time; }
    animateByFactor(speed: number) { this.speed = speed; }
    pickAt() { return { value: 20, speedMetersPerSecond: 5 }; }
  }
  return { WindLayer: Layer, PrecipitationLayer: Layer, TemperatureLayer: Layer, PressureLayer: Layer, RadarLayer: Layer, ColorRamp: { builtin: { VIRIDIS: { scale: vi.fn() }, NULL: {}, PRECIPITATION: {}, RADAR_CLOUD: {}, TEMPERATURE_3: {} } } };
});

function createMap() {
  const layers = new Map<string, any>();
  return {
    layers, isStyleLoaded: () => true,
    getStyle: () => ({ layers: [{ id: "base", type: "background" }, { id: "labels", type: "symbol" }] }),
    addLayer: vi.fn((layer, before) => { expect(before).toBe("labels"); layers.set(layer.id, { visibility: "visible" }); }),
    getLayer: (id: string) => layers.get(id), removeLayer: (id: string) => layers.delete(id),
    setLayoutProperty: (id: string, key: string, value: string) => { layers.get(id)[key] = value; },
    on: vi.fn(), off: vi.fn(), once: vi.fn(), triggerRepaint: vi.fn(),
  };
}
beforeEach(() => fake.layers.clear());
afterEach(() => vi.unstubAllGlobals());

describe("weather switching", () => {
  it("waits for incoming tiles before fading out the previous layer", () => {
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const map = { ...createMap(), getCenter: () => ({ lng: 0, lat: 0 }) };
    const { result, unmount } = renderHook(() => useWeatherLayers(map as never));
    const wind = fake.layers.get("weather-wind"); wind.setOpacity = vi.fn();
    act(() => wind.emitReady());
    act(() => result.current.changeWeatherLayer("temperature"));
    const temperature = fake.layers.get("weather-temperature");
    temperature.setOpacity = vi.fn(); temperature.pickAt = () => null;
    act(() => temperature.emitReady());
    const now = performance.now();
    act(() => frame(now + 100));
    expect(result.current.displayedLayer).toBe("wind");
    expect(wind.setOpacity).not.toHaveBeenCalledWith(0);
    temperature.pickAt = () => ({ value: 20 });
    act(() => frame(now + 200));
    act(() => frame(now + 500));
    expect(result.current.displayedLayer).toBe("temperature");
    expect(map.layers.get("weather-wind").visibility).toBe("none");
    unmount();
  });
  it("keeps the current layer while loading, preserves pause/time, and reuses cached layers", () => {
    const map = createMap();
    const { result, unmount } = renderHook(() => useWeatherLayers(map as never));
    act(() => fake.layers.get("weather-wind").emitReady());
    act(() => { result.current.onSliderChange(175000); result.current.togglePlayPause(); result.current.changeWeatherLayer("temperature"); });
    expect(result.current.displayedLayer).toBe("wind");
    expect(map.layers.get("weather-wind").visibility).toBe("visible");
    act(() => fake.layers.get("weather-temperature").emitReady());
    expect(result.current.sliderValue).toBe(175000);
    expect(result.current.isPlaying).toBe(false);
    expect(fake.layers.get("weather-temperature").speed).toBe(0);
    expect(map.layers.get("weather-wind").visibility).toBe("none");
    act(() => result.current.changeWeatherLayer("wind"));
    expect(map.addLayer).toHaveBeenCalledTimes(2);
    expect(result.current.activeLayer).toBe("wind");
    unmount();
  });

  it("ignores stale readiness events during rapid switching", () => {
    const map = createMap();
    const { result, unmount } = renderHook(() => useWeatherLayers(map as never));
    act(() => { result.current.changeWeatherLayer("radar"); result.current.changeWeatherLayer("pressure"); });
    act(() => fake.layers.get("weather-radar").emitReady());
    expect(result.current.activeLayer).toBe("pressure");
    expect(result.current.displayedLayer).toBeNull();
    act(() => fake.layers.get("weather-pressure").emitReady());
    expect(result.current.displayedLayer).toBe("pressure");
    expect(fake.layers.get("weather-radar").speed).toBe(0);
    unmount();
  });

  it("shows every option and hides both layers of the combined view", () => {
    const map = createMap();
    const { result, unmount } = renderHook(() => useWeatherLayers(map as never));
    for (const type of ["wind", "wind-arrows", "precipitation", "pressure", "radar", "temperature", "wind+temperature"] as WeatherLayerType[]) {
      act(() => result.current.changeWeatherLayer(type));
      act(() => fake.layers.forEach(layer => { if (!layer.ready) layer.emitReady(); }));
      expect(result.current.displayedLayer).toBe(type);
      expect(result.current.error).toBeNull();
      expect(result.current.sliderMin).toBe(100000);
      expect(result.current.sliderMax).toBe(200000);
    }
    act(() => result.current.changeWeatherLayer("wind"));
    expect(map.layers.get("weather-combined-temperature").visibility).toBe("none");
    expect(map.layers.get("weather-combined-wind").visibility).toBe("none");
    expect(fake.layers.get("weather-combined-wind").speed).toBe(0);
    unmount();
    expect(map.layers.size).toBe(0);
  });
});

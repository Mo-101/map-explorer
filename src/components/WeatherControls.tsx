import { Play, Pause, Wind, Navigation, CloudRain, Gauge, Radar, Thermometer } from "lucide-react";
import type { WeatherLayerType } from "@/hooks/useWeatherLayers";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

const LAYER_OPTIONS: { id: WeatherLayerType; label: string; short: string; tip: string; Icon: typeof Wind }[] = [
  { id: "wind", label: "Wind", short: "Wind", tip: "GFS wind speed and direction overlay.", Icon: Wind },
  { id: "wind-arrows", label: "Wind Arrows", short: "Arrows", tip: "Directional wind vectors showing atmospheric flow.", Icon: Navigation },
  { id: "precipitation", label: "Precipitation", short: "Precip", tip: "GFS precipitation forecast layer.", Icon: CloudRain },
  { id: "pressure", label: "Pressure", short: "Pres", tip: "Mean sea level pressure contours.", Icon: Gauge },
  { id: "radar", label: "Radar Forecast", short: "Radar", tip: "GFS model forecast of radar reflectivity.", Icon: Radar },
  { id: "temperature", label: "Temperature", short: "Temp", tip: "Surface temperature analysis.", Icon: Thermometer },
  { id: "wind+temperature", label: "Wind and Temperature", short: "Wind + Temp", tip: "Wind particles over surface temperature.", Icon: Wind },
];

interface WeatherControlsProps {
  activeLayer: WeatherLayerType;
  onChangeLayer: (type: WeatherLayerType) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  timeText: string;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  onSliderChange: (val: number) => void;
  pointerValue: string;
  loading?: boolean;
  error?: string | null;
  // legacy props kept optional so Index doesn't break; rendered inside WeatherCard now
  terrainEnabled?: boolean;
  onToggleTerrain?: () => void;
  imergEnabled?: boolean;
  onToggleIMERG?: () => void;
  imergMode?: '24h' | '72h';
  onChangeIMERGMode?: (mode: '24h' | '72h') => void;
  copernicusFloodEnabled?: boolean;
  onToggleCopernicusFlood?: () => void;
}

const WeatherControls = ({
  activeLayer,
  onChangeLayer,
  isPlaying,
  onTogglePlay,
  timeText,
  sliderValue,
  sliderMin,
  sliderMax,
  onSliderChange,
  pointerValue,
  loading,
  error,
}: WeatherControlsProps) => {
  const available = sliderMax > sliderMin;
  const progress = available ? Math.max(0, Math.min(1, (sliderValue - sliderMin) / (sliderMax - sliderMin))) : 0;
  const shortTime = sliderValue > 0 ? new Date(sliderValue).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }) : "Loading?";
  return (
    <>
      {/* Left side: vertical weather layer nav, below the stats / flood panels */}
      <div id="weather-layer-controls" className="absolute left-3 lg:left-5 top-1/2 -translate-y-1/2 z-20 w-40 max-h-[calc(100vh-200px)]">
        <div className="neu-panel-elevated overflow-hidden">
          <div className="neu-glow-line" />
          <div className="flex flex-col gap-1 px-2 py-2 overflow-y-auto no-scrollbar">
            {LAYER_OPTIONS.map((opt) => {
              const Icon = opt.Icon;
              const active = activeLayer === opt.id;
              return (
                <MoScriptsTooltip key={opt.id} title={opt.label} description={opt.tip} position="right">
                  <button
                    onClick={() => onChangeLayer(opt.id)}
                    aria-pressed={active}
                    aria-label={opt.label}
                    className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 shrink-0 ${
                      active
                        ? "neu-btn-active text-primary"
                        : "neu-btn text-foreground/80 hover:text-foreground"
                    }`}
                  >
                    <Icon size={12} className={active ? "text-primary" : "opacity-80"} />
                    <span>{opt.short}</span>
                  </button>
                </MoScriptsTooltip>
              );
            })}
            {pointerValue && (
              <span className="mt-1 pt-1.5 px-1 text-[11px] font-bold text-foreground/90 border-t border-border">
                {pointerValue}
              </span>
            )}
          </div>
          <div role="status" aria-live="polite" className="px-3 pb-2 text-[11px] text-muted-foreground">
            {error || (loading ? "Loading selected layer…" : `${LAYER_OPTIONS.find(option => option.id === activeLayer)?.label} · ${activeLayer === "radar" ? "Coverage varies by region" : "Move across the map to inspect values"}`)}
          </div>
        </div>
      </div>

      {/* Compact forecast playback, aligned with the collapsed map controls. */}
      <div className="absolute bottom-24 sm:bottom-14 left-1/2 -translate-x-1/2 z-20 w-64 max-w-[calc(100vw-24px)]">
        <MoScriptsTooltip title="Weather Timeline" description={`${timeText || "Waiting for forecast times"}. Drag to seek; play advances the weather forecast.`} position="top">
          <div className="neu-panel overflow-hidden">
            <div className="flex h-9 items-center gap-2 px-2.5">
              <button
                onClick={onTogglePlay}
                className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
                aria-label={isPlaying ? "Pause forecast playback" : "Play forecast playback"}
                aria-pressed={isPlaying}
                disabled={!available}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <div className="relative h-6 min-w-0 flex-1" data-playing={isPlaying && available}>
                <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-secondary">
                  <div className="absolute inset-0 origin-left rounded-full bg-primary/70 transition-transform duration-150 ease-linear" style={{ transform: `scaleX(${progress})` }} />
                  {isPlaying && available && (
                    <svg className="forecast-flow absolute inset-0 h-full w-full text-primary" viewBox="0 0 100 4" preserveAspectRatio="none">
                      <path d="M0 2 H100" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 9" />
                    </svg>
                  )}
                </div>
                <input
                  type="range"
                  aria-label="Forecast time"
                  aria-valuetext={timeText}
                  min={sliderMin}
                  max={sliderMax}
                  value={sliderValue}
                  disabled={!available}
                  step={60000}
                  onChange={e => onSliderChange(Number(e.target.value))}
                  className="forecast-seek absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                />
              </div>
              <time className="shrink-0 text-[11px] font-medium tabular-nums text-foreground/80" title={timeText}>
                {shortTime}
              </time>
            </div>
          </div>
        </MoScriptsTooltip>
      </div>
    </>
  );
};

export default WeatherControls;

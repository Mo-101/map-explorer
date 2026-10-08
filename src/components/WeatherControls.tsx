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
  return (
    <>
      {/* Top-center: horizontal weather layer nav, between MapView badge and BackendStatus badge */}
      <div id="weather-layer-controls" className="absolute top-20 lg:top-5 left-1/2 -translate-x-1/2 z-20 w-max max-w-[calc(100vw-24px)] lg:max-w-[calc(100vw-440px)]">
        <div className="neu-panel-elevated overflow-hidden">
          <div className="neu-glow-line" />
          <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
            {LAYER_OPTIONS.map((opt) => {
              const Icon = opt.Icon;
              const active = activeLayer === opt.id;
              return (
                <MoScriptsTooltip key={opt.id} title={opt.label} description={opt.tip} position="bottom">
                  <button
                    onClick={() => onChangeLayer(opt.id)}
                    aria-pressed={active}
                    aria-label={opt.label}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 shrink-0 ${
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
              <span className="ml-2 px-2 text-[11px] font-bold text-foreground/90 border-l border-border shrink-0">
                {pointerValue}
              </span>
            )}
          </div>
          <div role="status" aria-live="polite" className="px-3 pb-2 text-[10px] text-muted-foreground">
            {error || (loading ? "Loading selected layer…" : `${LAYER_OPTIONS.find(option => option.id === activeLayer)?.label} · ${activeLayer === "radar" ? "Coverage varies by region" : "Move across the map to inspect values"}`)}
          </div>
        </div>
      </div>

      {/* Bottom-center: time animation bar */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[60vw] max-w-2xl">
        <MoScriptsTooltip title="Weather Timeline" description="Scrub through forecast time steps or press play for animated playback." position="top">
          <div className="neu-panel-elevated overflow-hidden">
            <div className="neu-glow-line" />
            <div className="flex flex-col items-center gap-2 px-5 py-4">
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={onTogglePlay}
                  className="flex items-center justify-center w-9 h-9 neu-btn-active text-primary hover:text-primary-foreground hover:bg-primary/30 transition-all"
                  style={{ borderRadius: '10px' }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  disabled={sliderMax <= sliderMin}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  aria-label="Timeline"
                  min={sliderMin}
                  max={sliderMax}
                  value={sliderValue}
                  disabled={sliderMax <= sliderMin}
                  step={60000}
                  onChange={(e) => onSliderChange(Number(e.target.value))}
                  className="flex-1 h-1.5 appearance-none rounded-full bg-secondary cursor-pointer accent-primary"
                />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
                {timeText}
              </span>
            </div>
          </div>
        </MoScriptsTooltip>
      </div>
    </>
  );
};

export default WeatherControls;

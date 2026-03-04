import { Play, Pause, CloudRain } from "lucide-react";
import type { WeatherLayerType } from "@/hooks/useWeatherLayers";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

const LAYER_OPTIONS: { id: WeatherLayerType; label: string; tip: string }[] = [
  { id: "wind", label: "Wind", tip: "GFS wind speed and direction overlay. Shows surface-level wind patterns across the continent." },
  { id: "wind-arrows", label: "Wind Arrows", tip: "Directional wind vectors showing atmospheric flow. Useful for tracking storm movement trajectories." },
  { id: "precipitation", label: "Precipitation", tip: "GFS precipitation forecast layer. Displays predicted rainfall intensity across Africa." },
  { id: "pressure", label: "Pressure", tip: "Mean sea level pressure contours. Identifies high/low pressure systems driving weather patterns." },
  { id: "radar", label: "Radar", tip: "Near-real-time radar reflectivity. Shows current precipitation activity where radar coverage exists." },
  { id: "temperature", label: "Temperature", tip: "Surface temperature analysis from GFS model data. Color-coded from cool to extreme heat." },
];

interface WeatherControlsProps {
  activeLayer: WeatherLayerType;
  onChangeLayer: (type: WeatherLayerType) => void;
  terrainEnabled?: boolean;
  onToggleTerrain?: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  timeText: string;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  onSliderChange: (val: number) => void;
  pointerValue: string;
  imergEnabled?: boolean;
  onToggleIMERG?: () => void;
  imergMode?: '24h' | '72h';
  onChangeIMERGMode?: (mode: '24h' | '72h') => void;
}

const WeatherControls = ({
  activeLayer,
  onChangeLayer,
  terrainEnabled,
  onToggleTerrain,
  isPlaying,
  onTogglePlay,
  timeText,
  sliderValue,
  sliderMin,
  sliderMax,
  onSliderChange,
  pointerValue,
  imergEnabled,
  onToggleIMERG,
  imergMode,
  onChangeIMERGMode,
}: WeatherControlsProps) => {
  return (
    <>
      {/* Top-left: active layer name + pointer data */}
      <div className="absolute top-16 left-5 z-10 flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground/90 capitalize drop-shadow-lg">
          {activeLayer === "wind-arrows" ? "Wind Arrows" : activeLayer}
        </span>
        {pointerValue && (
          <span className="text-xl font-black text-foreground drop-shadow-lg">
            {pointerValue}
          </span>
        )}
      </div>

      {/* Left-side layer buttons */}
      <div className="absolute left-5 top-32 z-10 flex flex-col gap-1.5">
        {LAYER_OPTIONS.map((opt) => (
          <MoScriptsTooltip key={opt.id} title={opt.label} description={opt.tip} position="right">
            <button
              onClick={() => onChangeLayer(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                activeLayer === opt.id
                  ? "neu-btn-active text-primary"
                  : "neu-btn text-foreground/80 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          </MoScriptsTooltip>
        ))}

        {onToggleTerrain && (
          <MoScriptsTooltip title="3D Terrain" description="Toggle terrain exaggeration for topographic visualization. Reveals how elevation affects weather and hazard patterns." position="right">
            <button
              type="button"
              onClick={onToggleTerrain}
              className={`mt-2 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                terrainEnabled
                  ? "neu-btn-active text-primary"
                  : "neu-btn text-foreground/80 hover:text-foreground"
              }`}
            >
              Terrain
            </button>
          </MoScriptsTooltip>
        )}

        {/* IMERG Satellite Rainfall */}
        {onToggleIMERG && (
          <div className="mt-2 flex flex-col gap-1">
            <MoScriptsTooltip title="IMERG Satellite Rain" description="NASA GPM IMERG satellite rainfall estimates. Shows accumulated precipitation from space-based measurements — independent of ground radar." position="right">
              <button
                type="button"
                onClick={onToggleIMERG}
                className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  imergEnabled
                    ? "neu-btn-active text-primary"
                    : "neu-btn text-foreground/80 hover:text-foreground"
                }`}
              >
                <CloudRain size={12} />
                IMERG
              </button>
            </MoScriptsTooltip>
            {imergEnabled && onChangeIMERGMode && (
              <div className="flex gap-0.5">
                {(['24h', '72h'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => onChangeIMERGMode(m)}
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      imergMode === m
                        ? 'neu-btn-active text-primary'
                        : 'neu-inset text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-center: time animation bar */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[60vw] max-w-2xl">
        <MoScriptsTooltip title="Weather Timeline" description="Scrub through forecast time steps or press play for animated playback. Shows how weather conditions evolve over the forecast period." position="top">
          <div className="neu-panel-elevated overflow-hidden">
            <div className="neu-glow-line" />
            <div className="flex flex-col items-center gap-2 px-5 py-4">
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={onTogglePlay}
                  className="flex items-center justify-center w-9 h-9 neu-btn-active text-primary hover:text-primary-foreground hover:bg-primary/30 transition-all"
                  style={{ borderRadius: '10px' }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  aria-label="Timeline"
                  min={sliderMin}
                  max={sliderMax}
                  value={sliderValue}
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

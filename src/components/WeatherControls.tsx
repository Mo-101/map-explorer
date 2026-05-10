import { Play, Pause } from "lucide-react";
import type { WeatherLayerType } from "@/hooks/useWeatherLayers";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

const LAYER_OPTIONS: { id: WeatherLayerType; label: string; tip: string }[] = [
  { id: "wind", label: "Wind", tip: "GFS wind speed and direction overlay." },
  { id: "wind-arrows", label: "Wind Arrows", tip: "Directional wind vectors showing atmospheric flow." },
  { id: "precipitation", label: "Precipitation", tip: "GFS precipitation forecast layer." },
  { id: "pressure", label: "Pressure", tip: "Mean sea level pressure contours." },
  { id: "radar", label: "Radar", tip: "Near-real-time radar reflectivity." },
  { id: "temperature", label: "Temperature", tip: "Surface temperature analysis." },
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
}: WeatherControlsProps) => {
  return (
    <>
      {/* Top-center: horizontal weather layer nav, between MapView badge and BackendStatus badge */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10">
        <div className="neu-panel-elevated overflow-hidden">
          <div className="neu-glow-line" />
          <div className="flex items-center gap-1 px-2 py-1.5">
            {LAYER_OPTIONS.map((opt) => (
              <MoScriptsTooltip key={opt.id} title={opt.label} description={opt.tip} position="bottom">
                <button
                  onClick={() => onChangeLayer(opt.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${
                    activeLayer === opt.id
                      ? "neu-btn-active text-primary"
                      : "neu-btn text-foreground/80 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              </MoScriptsTooltip>
            ))}
            {pointerValue && (
              <span className="ml-2 px-2 text-[11px] font-bold text-foreground/90 border-l border-border">
                {pointerValue}
              </span>
            )}
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

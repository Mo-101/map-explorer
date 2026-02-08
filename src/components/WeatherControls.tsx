import { Play, Pause } from "lucide-react";
import type { WeatherLayerType } from "@/hooks/useWeatherLayers";

const LAYER_OPTIONS: { id: WeatherLayerType; label: string }[] = [
  { id: "wind", label: "Wind" },
  { id: "precipitation", label: "Precipitation" },
  { id: "pressure", label: "Pressure" },
  { id: "radar", label: "Radar" },
  { id: "temperature", label: "Temperature" },
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
      {/* Top-left: active layer name + pointer data */}
      <div className="absolute top-16 left-5 z-10 flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground/90 capitalize drop-shadow-lg">
          {activeLayer}
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
          <button
            key={opt.id}
            onClick={() => onChangeLayer(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md border transition-all duration-200 shadow-lg ${
              activeLayer === opt.id
                ? "bg-primary/90 text-primary-foreground border-primary/50"
                : "bg-card/80 text-foreground/80 border-border/50 hover:bg-secondary hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Bottom-center: time animation bar */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[60vw] max-w-2xl">
        <div className="flex flex-col items-center gap-2 px-5 py-4 rounded-xl bg-card/85 backdrop-blur-md border border-border/50 shadow-lg">
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={onTogglePlay}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/90 text-primary-foreground hover:bg-primary transition-all"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
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
    </>
  );
};

export default WeatherControls;

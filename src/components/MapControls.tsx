import { Plus, Minus, Locate, Layers } from "lucide-react";

interface MapControlsProps {
  zoom: number;
  coordinates: { lng: number; lat: number };
}

const ControlButton = ({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="flex items-center justify-center w-10 h-10 rounded-lg bg-card/90 text-foreground hover:bg-secondary hover:text-primary transition-all duration-200 backdrop-blur-md border border-border/50 shadow-lg"
  >
    {children}
  </button>
);

const MapControls = ({ zoom, coordinates }: MapControlsProps) => {
  return (
    <>
      {/* Top-left branding */}
      <div className="absolute top-5 left-5 z-10">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card/90 backdrop-blur-md border border-border/50 shadow-lg">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-semibold tracking-wide text-foreground">
            MapView
          </span>
        </div>
      </div>

      {/* Right-side controls */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
        <ControlButton label="Zoom in">
          <Plus size={18} />
        </ControlButton>
        <ControlButton label="Zoom out">
          <Minus size={18} />
        </ControlButton>
        <div className="h-2" />
        <ControlButton label="My location">
          <Locate size={18} />
        </ControlButton>
        <ControlButton label="Layers">
          <Layers size={18} />
        </ControlButton>
      </div>

      {/* Bottom-left coordinates */}
      <div className="absolute bottom-5 left-5 z-10">
        <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-card/90 backdrop-blur-md border border-border/50 shadow-lg text-xs text-muted-foreground font-mono">
          <span>
            {coordinates.lat}° N, {coordinates.lng}° E
          </span>
          <span className="text-border">|</span>
          <span>Zoom {zoom}</span>
        </div>
      </div>
    </>
  );
};

export default MapControls;

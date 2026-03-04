import { Plus, Minus, Locate, Layers } from "lucide-react";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

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
        <MoScriptsTooltip
          title="MapView Status"
          description="Real-time geospatial intelligence feed. Map data is refreshed every 30 seconds from multiple hazard sources."
          position="right"
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card/90 backdrop-blur-md border border-border/50 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold tracking-wide text-foreground">
              MapView
            </span>
          </div>
        </MoScriptsTooltip>
      </div>

      {/* Right-side controls */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
        <MoScriptsTooltip title="Zoom In" description="Increase map zoom level for closer inspection of threat clusters and weather patterns." position="left">
          <ControlButton label="Zoom in">
            <Plus size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <MoScriptsTooltip title="Zoom Out" description="Decrease map zoom level for a wider continental overview of active threats." position="left">
          <ControlButton label="Zoom out">
            <Minus size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <div className="h-2" />
        <MoScriptsTooltip title="Geolocate" description="Center the map on your current location to view nearby hazard alerts and weather conditions." position="left">
          <ControlButton label="My location">
            <Locate size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <MoScriptsTooltip title="Map Layers" description="Toggle between different base map styles and data visualization layers." position="left">
          <ControlButton label="Layers">
            <Layers size={18} />
          </ControlButton>
        </MoScriptsTooltip>
      </div>

      {/* Bottom-left coordinates */}
      <div className="absolute bottom-5 left-5 z-10">
        <MoScriptsTooltip
          title="Map Position"
          description={`Current center: ${coordinates.lat.toFixed(4)}°N, ${coordinates.lng.toFixed(4)}°E at zoom level ${zoom}. Coordinates update in real-time as you pan.`}
          position="top"
        >
          <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-card/90 backdrop-blur-md border border-border/50 shadow-lg text-xs text-muted-foreground font-mono">
            <span>
              {coordinates.lat}° N, {coordinates.lng}° E
            </span>
            <span className="text-border">|</span>
            <span>Zoom {zoom}</span>
          </div>
        </MoScriptsTooltip>
      </div>
    </>
  );
};

export default MapControls;

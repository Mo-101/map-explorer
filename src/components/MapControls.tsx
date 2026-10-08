import { Plus, Minus, Locate, Layers } from "lucide-react";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";
import type { Map } from "@maptiler/sdk";
import { toast } from "sonner";

interface MapControlsProps {
  zoom: number;
  coordinates: { lng: number; lat: number };
  map?: Map | null;
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
    className="flex items-center justify-center w-10 h-10 neu-btn text-foreground hover:text-primary transition-all duration-200"
  >
    {children}
  </button>
);

const MapControls = ({ zoom, coordinates, map }: MapControlsProps) => {
  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location is unavailable in this browser.");
    navigator.geolocation.getCurrentPosition(
      position => map?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 8, duration: 800 }),
      () => toast.error("Unable to access your location. You can pan to your area instead."),
      { timeout: 10000 },
    );
  };
  return (
    <>
      {/* Top-left branding */}
      <div className="absolute top-5 left-5 z-10">
        <MoScriptsTooltip
          title="MapView Status"
          description="Real-time geospatial intelligence feed. Map data is refreshed every 30 seconds from multiple hazard sources."
          position="right"
        >
          <div className="neu-panel-elevated overflow-hidden">
            <div className="neu-glow-line" />
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-semibold tracking-wide text-foreground">
                AFRO - STORM
              </span>
            </div>
          </div>
        </MoScriptsTooltip>
      </div>

      {/* Right-side controls */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
        <MoScriptsTooltip title="Zoom In" description="Increase map zoom level for closer inspection of threat clusters and weather patterns." position="left">
          <ControlButton label="Zoom in" onClick={() => map?.zoomIn({ duration: 300 })}>
            <Plus size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <MoScriptsTooltip title="Zoom Out" description="Decrease map zoom level for a wider continental overview of active threats." position="left">
          <ControlButton label="Zoom out" onClick={() => map?.zoomOut({ duration: 300 })}>
            <Minus size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <div className="h-2" />
        <MoScriptsTooltip title="Geolocate" description="Center the map on your current location to view nearby hazard alerts and weather conditions." position="left">
          <ControlButton label="My location" onClick={locate}>
            <Locate size={18} />
          </ControlButton>
        </MoScriptsTooltip>
        <MoScriptsTooltip title="Map Layers" description="Choose a weather layer from the layer controls." position="left">
          <ControlButton label="Layers" onClick={() => document.querySelector<HTMLButtonElement>('#weather-layer-controls button')?.focus()}>
            <Layers size={18} />
          </ControlButton>
        </MoScriptsTooltip>
      </div>

      {/* Bottom-left coordinates */}
      <div className="absolute bottom-5 left-5 z-10">
        <MoScriptsTooltip
          title="Map Position"
          description={`Current center: ${Math.abs(coordinates.lat).toFixed(4)}°${coordinates.lat < 0 ? "S" : "N"}, ${Math.abs(coordinates.lng).toFixed(4)}°${coordinates.lng < 0 ? "W" : "E"} at zoom level ${zoom}.`}
          position="top"
        >
          <div className="neu-panel px-4 py-2 text-xs text-muted-foreground font-mono flex items-center gap-4">
            <span>
              {Math.abs(coordinates.lat)}° {coordinates.lat < 0 ? "S" : "N"}, {Math.abs(coordinates.lng)}° {coordinates.lng < 0 ? "W" : "E"}
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

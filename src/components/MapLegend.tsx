import { useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

interface LegendEntry {
  color: string;
  label: string;
  shape: "circle" | "line" | "fill" | "droplet";
  active?: boolean;
}

interface MapLegendProps {
  threatCount: number;
  clusterCount: number;
  imergEnabled: boolean;
  copernicusEnabled: boolean;
  weatherLayer: string | null;
}

const THREAT_TYPES: LegendEntry[] = [
  { color: "#ef4444", label: "Cyclone", shape: "circle" },
  { color: "#3b82f6", label: "Flood", shape: "droplet" },
  { color: "#f97316", label: "Storm", shape: "circle" },
  { color: "#a855f7", label: "Earthquake", shape: "circle" },
  { color: "#ec4899", label: "Outbreak", shape: "circle" },
  { color: "#eab308", label: "Drought", shape: "circle" },
];

const ShapeIcon = ({ shape, color }: { shape: string; color: string }) => {
  if (shape === "droplet") {
    return (
      <div
        className="w-3.5 h-3.5 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${color}aa, ${color})`,
          boxShadow: `0 0 6px ${color}66`,
        }}
      />
    );
  }
  if (shape === "line") {
    return (
      <div className="w-4 h-0.5 rounded-full" style={{ background: color }} />
    );
  }
  if (shape === "fill") {
    return (
      <div
        className="w-3.5 h-3.5 rounded-sm border"
        style={{
          background: `${color}33`,
          borderColor: `${color}88`,
        }}
      />
    );
  }
  return (
    <div
      className="w-3 h-3 rounded-full border-2"
      style={{
        background: `${color}dd`,
        borderColor: "rgba(255,255,255,0.6)",
        boxShadow: `0 0 6px ${color}44`,
      }}
    />
  );
};

const MapLegend = ({
  threatCount,
  clusterCount,
  imergEnabled,
  copernicusEnabled,
  weatherLayer,
}: MapLegendProps) => {
  const [expanded, setExpanded] = useState(false);

  const overlays: LegendEntry[] = [];
  if (imergEnabled) overlays.push({ color: "#06b6d4", label: "IMERG Rainfall", shape: "circle", active: true });
  if (copernicusEnabled) overlays.push({ color: "#3b82f6", label: "EMS Flood Zones", shape: "fill", active: true });
  if (weatherLayer) overlays.push({ color: "#8b5cf6", label: `Weather: ${weatherLayer}`, shape: "fill", active: true });

  const activeThreats = THREAT_TYPES.filter(() => threatCount > 0);

  return (
    <div className="absolute bottom-14 left-5 z-20 w-[200px]">
      <div className="neu-panel overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Eye size={12} className="text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Legend
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-muted-foreground">
              {threatCount} threats
            </span>
            {expanded ? (
              <ChevronDown size={10} className="text-muted-foreground" />
            ) : (
              <ChevronUp size={10} className="text-muted-foreground" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/30 px-3 py-2 space-y-2.5">
            {/* Threat types */}
            <div>
              <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                Hazard Types
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {activeThreats.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-1.5">
                    <ShapeIcon shape={entry.shape} color={entry.color} />
                    <span className="text-[9px] text-muted-foreground">{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Clusters */}
            {clusterCount > 0 && (
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
                  Clusters
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-sm border border-dashed" style={{ borderColor: "rgba(251,146,60,0.5)", background: "rgba(251,146,60,0.1)" }} />
                  <span className="text-[9px] text-muted-foreground">{clusterCount} threat clusters</span>
                </div>
              </div>
            )}

            {/* Active overlays */}
            {overlays.length > 0 && (
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
                  Active Overlays
                </div>
                <div className="space-y-1">
                  {overlays.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-1.5">
                      <ShapeIcon shape={entry.shape} color={entry.color} />
                      <span className="text-[9px] text-muted-foreground">{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Severity scale */}
            <div>
              <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
                Severity
              </div>
              <div className="flex items-center gap-0.5 h-2 rounded-full overflow-hidden">
                <div className="flex-1 h-full bg-emerald-500/70" title="Low" />
                <div className="flex-1 h-full bg-amber-500/70" title="Moderate" />
                <div className="flex-1 h-full bg-orange-500/70" title="High" />
                <div className="flex-1 h-full bg-red-500/70" title="Extreme" />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[7px] text-muted-foreground/50">Low</span>
                <span className="text-[7px] text-muted-foreground/50">Extreme</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapLegend;

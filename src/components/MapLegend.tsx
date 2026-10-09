import { useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

interface LegendEntry {
  color: string;
  label: string;
  shape: "circle" | "line" | "fill" | "droplet" | "spiral" | "diamond" | "biohazard" | "flame" | "sun" | "quake" | "elnino" | "ring";
  active?: boolean;
}

interface MapLegendProps {
  threatTypes: string[];
  threatCount: number;
  clusterCount: number;
  imergEnabled: boolean;
  copernicusEnabled: boolean;
  weatherLayer: string | null;
  warningLevels: string[];
  enso?: { phase: string; oni: number | null };
}

const THREAT_TYPES: LegendEntry[] = [
  { color: "#ef4444", label: "Cyclone", shape: "spiral" },
  { color: "#3b82f6", label: "Flood", shape: "droplet" },
  { color: "#f97316", label: "Landslide", shape: "diamond" },
  { color: "#ec4899", label: "Outbreak", shape: "biohazard" },
  { color: "#8b5cf6", label: "Convergence", shape: "circle" },
  { color: "#ef4444", label: "Storm", shape: "spiral" },
  { color: "#a16207", label: "Earthquake", shape: "quake" },
  { color: "#eab308", label: "Drought", shape: "sun" },
  { color: "#f97316", label: "Wildfire", shape: "flame" },
];

const WARNING_LEVELS: LegendEntry[] = [
  { color: "#38bdf8", label: "Advisory", shape: "ring" },
  { color: "#facc15", label: "Watch", shape: "ring" },
  { color: "#fb923c", label: "Warning", shape: "ring" },
  { color: "#ef4444", label: "Emergency", shape: "ring" },
];

const ShapeIcon = ({ shape, color }: { shape: string; color: string }) => {
  if (shape === "droplet") {
    return (
      <svg width="14" height="18" viewBox="0 0 14 18">
        <path
          d="M7 1 C8.5 4.5 13 8 13 11.5 C13 14.8 10.3 17 7 17 C3.7 17 1 14.8 1 11.5 C1 8 5.5 4.5 7 1Z"
          fill={color}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1"
        />
      </svg>
    );
  }
  if (shape === "spiral") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill={color} stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        <path
          d="M8 8 C8 6.5 9.5 5.5 11 6.5 C12.5 7.5 12 10 10 11 C7.5 12.5 4.5 11 4 8 C3.5 4.5 6 2.5 8 3"
          fill="none"
          stroke="rgba(255,255,255,0.8)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg width="14" height="18" viewBox="0 0 14 18">
        <path
          d="M7 1 L13 9 L7 17 L1 9 Z"
          fill={color}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1"
        />
      </svg>
    );
  }
  if (shape === "biohazard") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill={color} stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        <circle cx="8" cy="8" r="3" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <circle cx="8" cy="4.5" r="1.5" fill="rgba(255,255,255,0.25)" />
        <circle cx="5" cy="10.5" r="1.5" fill="rgba(255,255,255,0.25)" />
        <circle cx="11" cy="10.5" r="1.5" fill="rgba(255,255,255,0.25)" />
      </svg>
    );
  }
  if (shape === "flame") {
    return (
      <svg width="14" height="18" viewBox="0 0 14 18">
        <path d="M7 1 C8 4 13 6.5 12 11.5 C11.3 15.5 2.7 15.5 2 11.5 C1.3 8 4 6.5 5 4 C5.8 6 6.3 4.5 7 1Z" fill={color} stroke="rgba(255,255,255,0.75)" strokeWidth="1" />
        <path d="M7 8 C9 10 8.6 13.5 7 13.5 C5.4 13.5 5 10 7 8Z" fill="rgba(255,255,255,0.55)" />
      </svg>
    );
  }
  if (shape === "sun") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={9 + Math.cos(a) * 5.6} y1={9 + Math.sin(a) * 5.6} x2={9 + Math.cos(a) * 8} y2={9 + Math.sin(a) * 8} stroke={color} strokeWidth="1.5" strokeLinecap="round" />;
        })}
        <circle cx="9" cy="9" r="4.4" fill={color} stroke="rgba(255,255,255,0.75)" strokeWidth="1" />
      </svg>
    );
  }
  if (shape === "quake") {
    return (
      <svg width="14" height="18" viewBox="0 0 14 18">
        <path d="M7 1 L13 9 L7 17 L1 9 Z" fill={color} stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <path d="M3 9 H5 L6 6 L7.6 12 L8.6 7.5 L9.4 9 H11" fill="none" stroke="white" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "elnino") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="8" fill={color} stroke="white" strokeWidth="1.2" />
        <circle cx="11.5" cy="6" r="2" fill="#fef08a" />
        <path d="M3 10.5 Q4.75 8.5 6.5 10.5 T10 10.5 T13.5 10.5 T15 10" fill="none" stroke="white" strokeWidth="1.3" />
        <path d="M3.5 13.2 Q5 11.6 6.5 13.2 T9.5 13.2 T12.5 13.2 T14.5 13" fill="none" stroke="white" strokeWidth="1.2" />
      </svg>
    );
  }
  if (shape === "ring") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" fill={`${color}40`} stroke={color} strokeWidth="1.6" />
        <circle cx="8" cy="8" r="2" fill={color} stroke="#000" strokeWidth="0.6" />
      </svg>
    );
  }
  if (shape === "line") {
    return <div className="w-4 h-0.5 rounded-full" style={{ background: color }} />;
  }
  if (shape === "fill") {
    return (
      <div className="w-3.5 h-3.5 rounded-sm border" style={{ background: `${color}33`, borderColor: `${color}88` }} />
    );
  }
  return (
    <div
      className="w-3 h-3 rounded-full border-2"
      style={{ background: `${color}dd`, borderColor: "rgba(255,255,255,0.6)", boxShadow: `0 0 6px ${color}44` }}
    />
  );
};

const MapLegend = ({
  threatTypes,
  threatCount,
  clusterCount,
  imergEnabled,
  copernicusEnabled,
  weatherLayer,
  warningLevels,
  enso,
}: MapLegendProps) => {
  const [expanded, setExpanded] = useState(false);

  const overlays: LegendEntry[] = [];
  if (enso?.phase === "El Niño" && enso.oni != null) {
    overlays.push({ color: "#f97316", label: `El Niño · ONI ${enso.oni >= 0 ? "+" : ""}${enso.oni.toFixed(1)} (seasonal)`, shape: "elnino", active: true });
    overlays.push({ color: "#f97316", label: "Niño 3.4 region (Pacific)", shape: "fill", active: true });
  }
  if (imergEnabled) overlays.push({ color: "#06b6d4", label: "Rainfall · Open-Meteo model", shape: "circle", active: true });
  if (copernicusEnabled) overlays.push({ color: "#3b82f6", label: "EMS Flood Zones", shape: "fill", active: true });
  if (weatherLayer) overlays.push({ color: "#8b5cf6", label: `Weather: ${weatherLayer}`, shape: "fill", active: true });

  const activeThreats = THREAT_TYPES.filter(entry => threatTypes.includes(entry.label.toLowerCase()) || (entry.label === "Outbreak" && threatTypes.includes("cholera")));

  return (
    <div className="absolute bottom-14 right-5 z-20 w-[240px]">
      <div className="neu-panel overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Eye size={12} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Legend
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-muted-foreground">
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
          <div className="border-t border-border/30 px-3 py-2 space-y-3 leading-relaxed">
            {/* Threat types */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                Hazard Types
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {activeThreats.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-1.5">
                    <ShapeIcon shape={entry.shape} color={entry.color} />
                    <span className="text-xs text-foreground">{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Early-warning rings */}
            {warningLevels.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  Early Warnings
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {WARNING_LEVELS.filter(entry => warningLevels.includes(entry.label.toLowerCase())).map((entry) => (
                    <div key={entry.label} className="flex items-center gap-1.5">
                      <ShapeIcon shape={entry.shape} color={entry.color} />
                      <span className="text-xs text-foreground">{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active overlays */}
            {overlays.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Active Overlays
                </div>
                <div className="space-y-1">
                  {overlays.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-1.5">
                      <ShapeIcon shape={entry.shape} color={entry.color} />
                      <span className="text-xs text-foreground">{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">Icon size reflects severity. Click any icon for its source, dates and report.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapLegend;

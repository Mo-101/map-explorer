import { useState, useEffect, useMemo, useCallback } from "react";
import { Layers, Eye, EyeOff, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

interface FloodAlert {
  id: string;
  title: string;
  type: string;
  severity: string;
  source: string;
  lat: number;
  lng: number;
  description?: string;
  gdacs_level?: string;
  gdacs_score?: number;
}

interface CopernicusAOI {
  name: string;
  area_km2: number;
  center: [number, number];
}

interface FloodComparisonPanelProps {
  allThreats: any[];
  copernicusGeoJson: any | null;
  copernicusVisible: boolean;
  onToggleCopernicus: () => void;
  onFlyTo: (lng: number, lat: number, zoom?: number) => void;
}

/* ─── Geometry helpers ─── */

function polygonArea(coords: number[][]): number {
  // Shoelace formula on lon/lat → approximate km² using cos(lat) correction
  let area = 0;
  const n = coords.length;
  if (n < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / n;
  const latRad = (avgLat * Math.PI) / 180;
  const kmPerDegLon = 111.32 * Math.cos(latRad);
  const kmPerDegLat = 110.574;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i][0] * kmPerDegLon;
    const yi = coords[i][1] * kmPerDegLat;
    const xj = coords[j][0] * kmPerDegLon;
    const yj = coords[j][1] * kmPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

function polygonCenter(coords: number[][]): [number, number] {
  const n = coords.length;
  const lng = coords.reduce((s, c) => s + c[0], 0) / n;
  const lat = coords.reduce((s, c) => s + c[1], 0) / n;
  return [lng, lat];
}

function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Component ─── */

const SEVERITY_COLORS: Record<string, string> = {
  extreme: "bg-red-500",
  high: "bg-orange-500",
  moderate: "bg-amber-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const FloodComparisonPanel = ({
  allThreats,
  copernicusGeoJson,
  copernicusVisible,
  onToggleCopernicus,
  onFlyTo,
}: FloodComparisonPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "alerts" | "aois">("overview");

  // Parse Copernicus AOIs
  const aois = useMemo<CopernicusAOI[]>(() => {
    if (!copernicusGeoJson?.features) return [];
    return copernicusGeoJson.features
      .filter((f: any) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon")
      .map((f: any) => {
        const coords =
          f.geometry.type === "Polygon"
            ? f.geometry.coordinates[0]
            : f.geometry.coordinates[0][0];
        return {
          name: f.properties?.name || "Unknown AOI",
          area_km2: polygonArea(coords),
          center: polygonCenter(coords),
        };
      });
  }, [copernicusGeoJson]);

  // Filter flood-related automated alerts
  const floodAlerts = useMemo<FloodAlert[]>(() => {
    const floodTypes = ["flood", "cyclone", "storm", "heavy rain", "precipitation"];
    return allThreats
      .filter((t) => {
        const type = (t.threat_type || t.type || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        return floodTypes.some((ft) => type.includes(ft) || title.includes(ft));
      })
      .map((t) => ({
        id: t.id,
        title: t.title || `${t.threat_type} alert`,
        type: t.threat_type || t.type,
        severity: t.severity || "medium",
        source: t.source || "unknown",
        lat: t.center_lat ?? t.lat,
        lng: t.center_lng ?? t.lng,
        description: t.description,
        gdacs_level: t.detection_details?.gdacs?.level || t.metadata?.gdacs?.level,
        gdacs_score: t.detection_details?.gdacs?.score || t.metadata?.gdacs?.score,
      }));
  }, [allThreats]);

  // Compute spatial overlap statistics
  const stats = useMemo(() => {
    if (aois.length === 0) return null;

    const totalAoiArea = aois.reduce((s, a) => s + a.area_km2, 0);
    let matchedAlerts = 0;
    let nearbyAlerts = 0;
    const NEARBY_KM = 50;

    for (const alert of floodAlerts) {
      let isInside = false;
      let isNear = false;

      for (const aoi of aois) {
        if (!copernicusGeoJson?.features) continue;
        const feature = copernicusGeoJson.features.find(
          (f: any) => f.properties?.name === aoi.name
        );
        if (!feature) continue;

        const coords =
          feature.geometry.type === "Polygon"
            ? feature.geometry.coordinates[0]
            : feature.geometry.coordinates[0][0];

        if (pointInPolygon([alert.lng, alert.lat], coords)) {
          isInside = true;
          break;
        }

        const dist = distanceKm(alert.lat, alert.lng, aoi.center[1], aoi.center[0]);
        if (dist < NEARBY_KM) isNear = true;
      }

      if (isInside) matchedAlerts++;
      else if (isNear) nearbyAlerts++;
    }

    const detectionRate =
      floodAlerts.length > 0
        ? Math.round(((matchedAlerts + nearbyAlerts) / floodAlerts.length) * 100)
        : 0;

    return {
      totalAoiArea: totalAoiArea.toFixed(1),
      aoiCount: aois.length,
      floodAlertCount: floodAlerts.length,
      matchedAlerts,
      nearbyAlerts,
      unmatchedAlerts: floodAlerts.length - matchedAlerts - nearbyAlerts,
      detectionRate,
    };
  }, [aois, floodAlerts, copernicusGeoJson]);

  if (!copernicusGeoJson && floodAlerts.length === 0) return null;

  return (
    <div className="absolute top-16 right-4 z-20 w-[300px]">
      <div className="neu-panel">
        <div className="neu-glow-line" />

        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Flood Comparison
            </span>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <span className="text-[10px] font-mono text-primary">
                {stats.detectionRate}% match
              </span>
            )}
            {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/40">
            {/* Layer toggle */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-border/20">
              <span className="text-[11px] text-muted-foreground">Copernicus EMS overlay</span>
              <button
                onClick={onToggleCopernicus}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  copernicusVisible
                    ? "neu-btn-active text-primary"
                    : "neu-inset text-muted-foreground"
                }`}
              >
                {copernicusVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                {copernicusVisible ? "ON" : "OFF"}
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/20">
              {(["overview", "alerts", "aois"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-all ${
                    activeTab === tab
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="max-h-[300px] overflow-y-auto">
              {activeTab === "overview" && stats && (
                <div className="px-3 py-2 space-y-2">
                  {/* Detection accuracy bar */}
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground">Detection Accuracy</span>
                      <span className="font-bold text-foreground">{stats.detectionRate}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${stats.detectionRate}%`,
                          background:
                            stats.detectionRate > 70
                              ? "hsl(142, 71%, 45%)"
                              : stats.detectionRate > 40
                              ? "hsl(38, 92%, 50%)"
                              : "hsl(0, 84%, 60%)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <StatCard label="Copernicus AOIs" value={stats.aoiCount} />
                    <StatCard label="Total Area" value={`${stats.totalAoiArea} km²`} />
                    <StatCard label="Flood Alerts" value={stats.floodAlertCount} />
                    <StatCard
                      label="Inside AOIs"
                      value={stats.matchedAlerts}
                      color="text-emerald-400"
                    />
                    <StatCard
                      label="Nearby (<50km)"
                      value={stats.nearbyAlerts}
                      color="text-amber-400"
                    />
                    <StatCard
                      label="Unmatched"
                      value={stats.unmatchedAlerts}
                      color="text-red-400"
                    />
                  </div>

                  {/* Legend */}
                  <div className="pt-1 border-t border-border/20 space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Legend
                    </div>
                    <LegendItem color="hsl(217, 91%, 60%)" opacity={0.3} label="Copernicus validated flood extent" />
                    <LegendItem color="hsl(0, 84%, 60%)" opacity={0.8} label="GDACS/GFS automated flood alert" />
                    <LegendItem color="hsl(38, 92%, 50%)" opacity={0.8} label="Nearby automated alert (<50km)" />
                  </div>
                </div>
              )}

              {activeTab === "overview" && !stats && (
                <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                  Enable the Copernicus EMS overlay to see comparison statistics.
                </div>
              )}

              {activeTab === "alerts" && (
                <div className="divide-y divide-border/20">
                  {floodAlerts.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                      No flood-related alerts currently active.
                    </div>
                  ) : (
                    floodAlerts.slice(0, 20).map((alert) => (
                      <button
                        key={alert.id}
                        onClick={() => onFlyTo(alert.lng, alert.lat, 8)}
                        className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition-colors text-left"
                      >
                        <div
                          className={`w-2 h-2 mt-1 rounded-full shrink-0 ${
                            SEVERITY_COLORS[alert.severity] || "bg-muted"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground truncate">
                            {alert.title}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] text-muted-foreground uppercase">
                              {alert.source}
                            </span>
                            {alert.gdacs_level && (
                              <span
                                className={`px-1 py-0 text-[8px] font-bold rounded text-white ${
                                  alert.gdacs_level === "red"
                                    ? "bg-red-500/80"
                                    : alert.gdacs_level === "orange"
                                    ? "bg-orange-500/80"
                                    : "bg-emerald-500/80"
                                }`}
                              >
                                {alert.gdacs_level.toUpperCase()}
                              </span>
                            )}
                            {alert.gdacs_score != null && (
                              <span className="text-[9px] font-mono text-muted-foreground">
                                {alert.gdacs_score.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <MapPin size={10} className="text-muted-foreground mt-1 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {activeTab === "aois" && (
                <div className="divide-y divide-border/20">
                  {aois.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                      No Copernicus flood AOIs loaded.
                    </div>
                  ) : (
                    aois.map((aoi, i) => (
                      <button
                        key={i}
                        onClick={() => onFlyTo(aoi.center[0], aoi.center[1], 10)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground truncate">
                            {aoi.name}
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {aoi.area_km2.toFixed(1)} km²
                          </span>
                        </div>
                        <MapPin size={10} className="text-muted-foreground shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="neu-inset px-2 py-1.5 rounded">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${color || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function LegendItem({
  color,
  opacity,
  label,
}: {
  color: string;
  opacity: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
        style={{ backgroundColor: color, opacity }}
      />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default FloodComparisonPanel;

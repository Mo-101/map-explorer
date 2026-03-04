import { useState, useMemo } from "react";
import { Layers, Eye, EyeOff, MapPin, ChevronDown, ChevronUp, Home, Users, Droplets, ExternalLink } from "lucide-react";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";
import { EMSR867_META, EMSR867_AOI_STATS, getEMSR867Totals } from "@/data/emsr867-stats";
import type { EMSRAoiMeta } from "@/data/emsr867-stats";

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
  let area = 0;
  const n = coords.length;
  if (n < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / n;
  const latRad = (avgLat * Math.PI) / 180;
  const kmPerDegLon = 111.32 * Math.cos(latRad);
  const kmPerDegLat = 110.574;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * kmPerDegLon * coords[j][1] * kmPerDegLat -
            coords[j][0] * kmPerDegLon * coords[i][1] * kmPerDegLat;
  }
  return Math.abs(area) / 2;
}

function polygonCenter(coords: number[][]): [number, number] {
  const n = coords.length;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}

function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

/* ─── Severity colors ─── */
const SEVERITY_COLORS: Record<string, string> = {
  extreme: "bg-red-500", high: "bg-orange-500", moderate: "bg-amber-500", medium: "bg-amber-500", low: "bg-emerald-500",
};

type TabId = "overview" | "damage" | "alerts" | "aois";

const FloodComparisonPanel = ({
  allThreats,
  copernicusGeoJson,
  copernicusVisible,
  onToggleCopernicus,
  onFlyTo,
}: FloodComparisonPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedAoi, setSelectedAoi] = useState<EMSRAoiMeta | null>(null);

  const totals = useMemo(() => getEMSR867Totals(), []);

  // Parse Copernicus AOIs from GeoJSON
  const aois = useMemo<CopernicusAOI[]>(() => {
    if (!copernicusGeoJson?.features) return [];
    return copernicusGeoJson.features
      .filter((f: any) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon")
      .map((f: any) => {
        const coords = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
        return { name: f.properties?.name || "Unknown AOI", area_km2: polygonArea(coords), center: polygonCenter(coords) };
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

  // Spatial overlap statistics
  const stats = useMemo(() => {
    if (aois.length === 0) return null;
    const totalAoiArea = aois.reduce((s, a) => s + a.area_km2, 0);
    let matchedAlerts = 0, nearbyAlerts = 0;
    const NEARBY_KM = 50;

    for (const alert of floodAlerts) {
      let isInside = false, isNear = false;
      for (const aoi of aois) {
        if (!copernicusGeoJson?.features) continue;
        const feature = copernicusGeoJson.features.find((f: any) => f.properties?.name === aoi.name);
        if (!feature) continue;
        const coords = feature.geometry.type === "Polygon" ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
        if (pointInPolygon([alert.lng, alert.lat], coords)) { isInside = true; break; }
        if (distanceKm(alert.lat, alert.lng, aoi.center[1], aoi.center[0]) < NEARBY_KM) isNear = true;
      }
      if (isInside) matchedAlerts++;
      else if (isNear) nearbyAlerts++;
    }

    return {
      totalAoiArea: totalAoiArea.toFixed(1),
      aoiCount: aois.length,
      floodAlertCount: floodAlerts.length,
      matchedAlerts,
      nearbyAlerts,
      unmatchedAlerts: floodAlerts.length - matchedAlerts - nearbyAlerts,
      detectionRate: floodAlerts.length > 0 ? Math.round(((matchedAlerts + nearbyAlerts) / floodAlerts.length) * 100) : 0,
    };
  }, [aois, floodAlerts, copernicusGeoJson]);

  if (!copernicusGeoJson && floodAlerts.length === 0) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "damage", label: "Damage" },
    { id: "alerts", label: "Alerts" },
    { id: "aois", label: "AOIs" },
  ];

  return (
    <div className="absolute top-16 right-4 z-20 w-[320px]">
      <div className="neu-panel">
        <div className="neu-glow-line" />

        {/* Header */}
        <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-primary" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Flood Comparison</span>
              <span className="text-[9px] text-muted-foreground/70">EMSR867 · TC Gezani</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stats && <span className="text-[10px] font-mono text-primary">{stats.detectionRate}%</span>}
            {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/40">
            {/* Layer toggle + report link */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-border/20">
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleCopernicus}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${copernicusVisible ? "neu-btn-active text-primary" : "neu-inset text-muted-foreground"}`}
                >
                  {copernicusVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                  {copernicusVisible ? "ON" : "OFF"}
                </button>
              </div>
              <a
                href={EMSR867_META.reportLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[9px] text-primary hover:underline"
              >
                <ExternalLink size={9} /> Story Map
              </a>
            </div>

            {/* Event banner */}
            <div className="px-3 py-2 border-b border-border/20 bg-primary/5">
              <div className="text-[10px] font-semibold text-foreground">{EMSR867_META.name}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                {EMSR867_META.reason}
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-[9px] text-muted-foreground">🗓 {new Date(EMSR867_META.eventTime).toLocaleDateString()}</span>
                <span className="text-[9px] text-muted-foreground">🏷 {EMSR867_META.subCategory}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/20">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSelectedAoi(null); }}
                  className={`flex-1 px-1 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-all ${activeTab === tab.id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="max-h-[320px] overflow-y-auto">
              {/* OVERVIEW */}
              {activeTab === "overview" && (
                <div className="px-3 py-2 space-y-2">
                  {/* Detection accuracy */}
                  {stats && (
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">Detection Accuracy</span>
                        <span className="font-bold text-foreground">{stats.detectionRate}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{
                          width: `${stats.detectionRate}%`,
                          background: stats.detectionRate > 70 ? "hsl(142, 71%, 45%)" : stats.detectionRate > 40 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)",
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Aggregate impact summary */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <StatCard icon={<Home size={10} />} label="Buildings Hit" value={fmt(totals.totalResidentialAffected)} color="text-red-400" />
                    <StatCard icon={<Users size={10} />} label="People Affected" value={fmt(totals.totalPopulationAffected)} color="text-amber-400" />
                    <StatCard icon={<Droplets size={10} />} label="Flooded Area" value={`${totals.totalFloodedHa.toFixed(0)} ha`} color="text-blue-400" />
                  </div>

                  {stats && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <StatCard label="Copernicus AOIs" value={stats.aoiCount} />
                      <StatCard label="Spatial Area" value={`${stats.totalAoiArea} km²`} />
                      <StatCard label="Alerts Inside" value={stats.matchedAlerts} color="text-emerald-400" />
                      <StatCard label="Nearby (<50km)" value={stats.nearbyAlerts} color="text-amber-400" />
                    </div>
                  )}

                  {/* Legend */}
                  <div className="pt-1 border-t border-border/20 space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Legend</div>
                    <LegendItem color="hsl(217, 91%, 60%)" opacity={0.3} label="Copernicus validated flood extent" />
                    <LegendItem color="hsl(0, 84%, 60%)" opacity={0.8} label="Automated flood alert (matched)" />
                    <LegendItem color="hsl(38, 92%, 50%)" opacity={0.8} label="Automated alert (nearby <50km)" />
                  </div>
                </div>
              )}

              {/* DAMAGE */}
              {activeTab === "damage" && !selectedAoi && (
                <div className="divide-y divide-border/20">
                  {EMSR867_AOI_STATS.map((aoi) => {
                    const hasDamage = aoi.damage.residentialAffected > 0 || aoi.damage.floodedAreaHa > 0;
                    return (
                      <button
                        key={aoi.number}
                        onClick={() => setSelectedAoi(aoi)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground">{aoi.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {hasDamage ? (
                              <>
                                <span className="text-[9px] text-red-400">{fmt(aoi.damage.residentialAffected)} bldgs</span>
                                <span className="text-[9px] text-blue-400">{aoi.damage.floodedAreaHa.toFixed(0)} ha</span>
                                <span className="text-[9px] text-amber-400">{fmt(aoi.damage.populationAffected)} pop</span>
                              </>
                            ) : (
                              <span className="text-[9px] text-muted-foreground italic">No damage data (infeasible/cloud)</span>
                            )}
                          </div>
                        </div>
                        <ChevronDown size={10} className="text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}

                  {/* Totals row */}
                  <div className="px-3 py-2 bg-primary/5">
                    <div className="text-[10px] font-bold text-foreground uppercase tracking-wide">Total Impact</div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <span className="text-[9px] text-muted-foreground">🏠 {fmt(totals.totalResidentialAffected)} buildings affected</span>
                      <span className="text-[9px] text-muted-foreground">👥 {fmt(totals.totalPopulationAffected)} people affected</span>
                      <span className="text-[9px] text-muted-foreground">🌊 {totals.totalFloodedHa.toFixed(0)} ha flooded</span>
                      <span className="text-[9px] text-muted-foreground">📐 {totals.totalMaxExtentHa.toFixed(0)} ha max extent</span>
                    </div>
                  </div>
                </div>
              )}

              {/* DAMAGE detail */}
              {activeTab === "damage" && selectedAoi && (
                <div className="px-3 py-2 space-y-2">
                  <button onClick={() => setSelectedAoi(null)} className="text-[10px] text-primary hover:underline">← Back to all AOIs</button>
                  <div className="text-xs font-bold text-foreground">{selectedAoi.name} (AOI {selectedAoi.number})</div>
                  <div className="text-[9px] text-muted-foreground">📡 {selectedAoi.damage.sensorName} · {new Date(selectedAoi.damage.acquisitionTime).toLocaleDateString()}</div>

                  <div className="space-y-1.5">
                    <DamageBar label="Residential Buildings" affected={selectedAoi.damage.residentialAffected} total={selectedAoi.damage.residentialTotal} />
                    {selectedAoi.damage.populationAffected > 0 && (
                      <DamageBar label="Population" affected={selectedAoi.damage.populationAffected} total={selectedAoi.damage.estimatedPopulation} />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <StatCard label="Flooded" value={`${selectedAoi.damage.floodedAreaHa.toFixed(0)} ha`} color="text-blue-400" />
                    <StatCard label="Max Extent" value={`${selectedAoi.damage.maxExtentHa.toFixed(0)} ha`} color="text-blue-300" />
                    {selectedAoi.damage.floodTraceHa > 0 && (
                      <StatCard label="Flood Trace" value={`${selectedAoi.damage.floodTraceHa.toFixed(0)} ha`} color="text-cyan-400" />
                    )}
                    {selectedAoi.damage.roadsAffectedKm > 0 && (
                      <StatCard label="Roads Affected" value={`${selectedAoi.damage.roadsAffectedKm.toFixed(1)} km`} color="text-amber-400" />
                    )}
                    {selectedAoi.damage.agricultureAffectedHa > 0 && (
                      <StatCard label="Agriculture" value={`${selectedAoi.damage.agricultureAffectedHa.toFixed(0)} ha`} color="text-emerald-400" />
                    )}
                    {selectedAoi.damage.otherBuildingsAffected > 0 && (
                      <StatCard label="Other Bldgs" value={fmt(selectedAoi.damage.otherBuildingsAffected)} color="text-orange-400" />
                    )}
                  </div>
                </div>
              )}

              {/* ALERTS */}
              {activeTab === "alerts" && (
                <div className="divide-y divide-border/20">
                  {floodAlerts.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No flood-related alerts currently active.</div>
                  ) : (
                    floodAlerts.slice(0, 20).map((alert) => (
                      <button
                        key={alert.id}
                        onClick={() => onFlyTo(alert.lng, alert.lat, 8)}
                        className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition-colors text-left"
                      >
                        <div className={`w-2 h-2 mt-1 rounded-full shrink-0 ${SEVERITY_COLORS[alert.severity] || "bg-muted"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground truncate">{alert.title}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] text-muted-foreground uppercase">{alert.source}</span>
                            {alert.gdacs_level && (
                              <span className={`px-1 py-0 text-[8px] font-bold rounded text-white ${alert.gdacs_level === "red" ? "bg-red-500/80" : alert.gdacs_level === "orange" ? "bg-orange-500/80" : "bg-emerald-500/80"}`}>
                                {alert.gdacs_level.toUpperCase()}
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

              {/* AOIS */}
              {activeTab === "aois" && (
                <div className="divide-y divide-border/20">
                  {aois.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No Copernicus flood AOIs loaded.</div>
                  ) : (
                    aois.map((aoi, i) => (
                      <button key={i} onClick={() => onFlyTo(aoi.center[0], aoi.center[1], 10)} className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors text-left">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground truncate">{aoi.name}</div>
                          <span className="text-[9px] text-muted-foreground">{aoi.area_km2.toFixed(1)} km²</span>
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

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="neu-inset px-2 py-1.5 rounded">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-bold ${color || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm border border-white/20 shrink-0" style={{ backgroundColor: color, opacity }} />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function DamageBar({ label, affected, total }: { label: string; affected: number; total: number }) {
  const pct = total > 0 ? Math.min((affected / total) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{fmt(affected)}<span className="text-muted-foreground font-normal"> / {fmt(total)}</span></span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-red-500/80 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[9px] text-muted-foreground">{pct.toFixed(1)}%</div>
    </div>
  );
}

export default FloodComparisonPanel;

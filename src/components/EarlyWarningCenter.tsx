import { useEffect, useMemo, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import { AlertTriangle, Bell, BellOff, ChevronDown, RefreshCw, X } from "lucide-react";
import type { EarlyAlert, EnsoState, AlertLevel } from "@/lib/warnings/engine";
import { LEVEL_RANK } from "@/lib/warnings/engine";

interface Props {
  map: maptilersdk.Map | null;
  alerts: EarlyAlert[];
  enso: EnsoState;
  updatedAt: number | null;
  error: string | null;
  notify: boolean;
  onToggleNotify: () => void;
  onRefresh: () => void;
  onFlyTo: (lng: number, lat: number, z?: number) => void;
}

const LEVEL_CLASS: Record<AlertLevel, string> = {
  advisory: "bg-sky-500/20 text-sky-200 border-sky-400/40",
  watch: "bg-yellow-500/20 text-yellow-200 border-yellow-400/40",
  warning: "bg-orange-500/25 text-orange-200 border-orange-400/50",
  emergency: "bg-red-600/30 text-red-100 border-red-500/60",
};
const LEVEL_COLOR: Record<AlertLevel, string> = { advisory: "#38bdf8", watch: "#facc15", warning: "#fb923c", emergency: "#ef4444" };

function ago(ts: number | null) {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "just now" : `${m} min ago`;
}

export default function EarlyWarningCenter({ map, alerts, enso, updatedAt, error, notify, onToggleNotify, onRefresh, onFlyTo }: Props) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string>("");
  const [country, setCountry] = useState("all");
  const [minLevel, setMinLevel] = useState<AlertLevel>("advisory");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const serious = alerts.filter(a => LEVEL_RANK[a.level] >= 3);
  const signature = serious.map(a => a.id + a.level).join("|");
  const showBanner = serious.length > 0 && dismissed !== signature;
  const top = serious[0]?.level ?? alerts[0]?.level;
  const countries = useMemo(() => [...new Set(alerts.map(a => a.country).filter(Boolean))].sort(), [alerts]);
  const filtered = alerts.filter(a => (country === "all" || a.country === country) && LEVEL_RANK[a.level] >= LEVEL_RANK[minLevel]);
  const stale = !updatedAt || Date.now() - updatedAt > 25 * 60000;

  // Pulsing alert rings on the map
  useEffect(() => {
    if (!map) return;
    const data = {
      type: "FeatureCollection" as const,
      features: alerts.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon)).map(a => ({
        type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [a.lon, a.lat] },
        properties: { color: LEVEL_COLOR[a.level], rank: LEVEL_RANK[a.level], name: a.name },
      })),
    };
    const apply = () => {
      try {
        const src = map.getSource("ews-alerts") as any;
        if (src) src.setData(data);
        else {
          map.addSource("ews-alerts", { type: "geojson", data: data as any });
          map.addLayer({ id: "ews-pulse", type: "circle", source: "ews-alerts", paint: {
            "circle-radius": ["*", ["get", "rank"], 6], "circle-color": ["get", "color"], "circle-opacity": 0.25,
            "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2, "circle-stroke-opacity": 0.8 } });
          map.addLayer({ id: "ews-core", type: "circle", source: "ews-alerts", paint: {
            "circle-radius": 4, "circle-color": ["get", "color"], "circle-stroke-color": "#000", "circle-stroke-width": 1 } });
        }
      } catch { /* style not ready */ }
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
  }, [map, alerts]);

  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const loop = (t: number) => {
      const phase = (t % 1800) / 1800;
      try {
        if (map.getLayer("ews-pulse")) {
          map.setPaintProperty("ews-pulse", "circle-radius", ["*", ["get", "rank"], 6 + phase * 8]);
          map.setPaintProperty("ews-pulse", "circle-opacity", 0.35 * (1 - phase));
        }
      } catch { /* ignore */ }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [map]);

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[min(640px,92vw)] flex flex-col gap-2 pointer-events-none">
      {enso.phase === "El Niño" && (
        <div className="pointer-events-auto neu-panel px-3 py-1.5 text-xs text-center">
          🌊 <strong>El Niño active</strong> — ONI {enso.oni?.toFixed(1)} ({enso.season}). East Africa rainfall thresholds lowered.
        </div>
      )}
      {showBanner && (
        <div className={`pointer-events-auto rounded-xl border px-3 py-2 flex items-center gap-2 text-sm backdrop-blur ${LEVEL_CLASS[top!]}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="flex-1 truncate"><strong>{serious.length} active {serious.length === 1 ? "warning" : "warnings"}</strong> — {serious[0].name}: {serious[0].why}</span>
          <button onClick={() => setOpen(true)} className="underline text-xs">View</button>
          <button aria-label="Dismiss" onClick={() => setDismissed(signature)}><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="pointer-events-auto self-center">
        <button onClick={() => setOpen(o => !o)} className="neu-btn px-3 py-1.5 text-xs flex items-center gap-2" aria-expanded={open}>
          <span className={`w-2 h-2 rounded-full ${stale ? "bg-muted-foreground" : "bg-green-400 animate-pulse"}`} />
          Early Warnings · {alerts.length}
          <span className="opacity-60">· {ago(updatedAt)}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="pointer-events-auto neu-panel p-3 max-h-[55vh] flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={country} onChange={e => setCountry(e.target.value)} className="bg-background/60 border border-border rounded px-2 py-1">
              <option value="all">All countries</option>
              {countries.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={minLevel} onChange={e => setMinLevel(e.target.value as AlertLevel)} className="bg-background/60 border border-border rounded px-2 py-1">
              <option value="advisory">Advisory+</option><option value="watch">Watch+</option>
              <option value="warning">Warning+</option><option value="emergency">Emergency</option>
            </select>
            <span className="opacity-70">ENSO: {enso.phase}{enso.oni != null ? ` (${enso.oni.toFixed(1)})` : ""}</span>
            <div className="ml-auto flex gap-1">
              <button onClick={onToggleNotify} className="neu-btn p-1.5" title={notify ? "Notifications on" : "Notify me of warnings"}>
                {notify ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={onRefresh} className="neu-btn p-1.5" title="Refresh now"><RefreshCw className="w-3.5 h-3.5" /></button>
              <button onClick={() => setOpen(false)} className="neu-btn p-1.5" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {error && <p className="text-xs text-orange-300">Rainfall check failed: {error}. Showing last known alerts.</p>}
          <ul className="overflow-y-auto no-scrollbar flex flex-col gap-1.5">
            {filtered.length === 0 && <li className="text-xs opacity-70 py-4 text-center">No alerts at this level. Conditions are being checked every 10 minutes.</li>}
            {filtered.map(a => (
              <li key={a.id}>
                <button onClick={() => onFlyTo(a.lon, a.lat, 7)} className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${LEVEL_CLASS[a.level]}`}>
                  <div className="flex justify-between gap-2 font-semibold">
                    <span>{a.name}{a.country ? ` · ${a.country}` : ""}</span>
                    <span className="uppercase tracking-wide">{a.level}</span>
                  </div>
                  <p className="opacity-90 mt-0.5">{a.why}</p>
                  <p className="opacity-60 mt-0.5">{a.source} · confidence {Math.round(a.confidence * 100)}% · until {new Date(a.validUntil).toLocaleDateString()}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

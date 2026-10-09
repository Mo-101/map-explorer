import { useState, useEffect, useRef, useCallback } from 'react';
import type * as maptilersdk from '@maptiler/sdk';
import { fetchRealtimeThreats } from '@/services/hazardsApi';
import { apiFetch } from '@/services/apiBase';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff } from 'lucide-react';
import { LEVEL_RANK, type AlertLevel, type EarlyAlert, type EnsoState } from '@/lib/warnings/engine';
import type { EnsoContext } from '@/hooks/useEnsoContext';

interface TickerItem {
  module: string;
  text: string;
  severity: 'info' | 'warning' | 'critical';
  lat?: number;
  lng?: number;
  threatData?: any;
}

// Expanded African city lookup matching the 35 monitoring points
const AFRICAN_CITIES = [
  { name: 'Lagos', lat: 6.5, lng: 3.4 },
  { name: 'Nairobi', lat: -1.3, lng: 36.8 },
  { name: 'Cairo', lat: 30.0, lng: 31.2 },
  { name: 'Kinshasa', lat: -4.3, lng: 15.3 },
  { name: 'Johannesburg', lat: -26.2, lng: 28.0 },
  { name: 'Addis Ababa', lat: 9.0, lng: 38.7 },
  { name: 'Dar es Salaam', lat: -6.8, lng: 39.3 },
  { name: 'Dakar', lat: 14.7, lng: -17.5 },
  { name: 'Kampala', lat: 0.3, lng: 32.6 },
  { name: 'Mogadishu', lat: 2.0, lng: 45.3 },
  { name: 'Kigali', lat: -1.9, lng: 29.9 },
  { name: 'Lusaka', lat: -15.4, lng: 28.3 },
  { name: 'Harare', lat: -17.8, lng: 31.0 },
  { name: 'Maputo', lat: -25.9, lng: 32.6 },
  { name: 'Luanda', lat: -8.8, lng: 13.2 },
  { name: 'Abuja', lat: 9.1, lng: 7.5 },
  { name: 'Accra', lat: 5.6, lng: -0.2 },
  { name: 'Ouagadougou', lat: 12.4, lng: -1.5 },
  { name: 'Bamako', lat: 12.6, lng: -8.0 },
  { name: 'Conakry', lat: 9.5, lng: -13.7 },
  { name: 'Algiers', lat: 36.8, lng: 3.1 },
  { name: 'Tunis', lat: 36.8, lng: 10.2 },
  { name: 'Tripoli', lat: 32.9, lng: 13.2 },
  { name: 'Khartoum', lat: 15.6, lng: 32.5 },
  { name: 'Antananarivo', lat: -18.9, lng: 47.5 },
  { name: 'Lilongwe', lat: -15.4, lng: 35.0 },
  { name: 'Yaoundé', lat: 3.9, lng: 11.5 },
  { name: "N'Djamena", lat: 12.1, lng: 15.0 },
  { name: 'Port Louis', lat: -20.2, lng: 57.5 },
  { name: 'Niamey', lat: 13.5, lng: 2.1 },
];

function nearestCity(lat: number, lng: number): string {
  let best = 'Africa';
  let bestDist = Infinity;
  for (const c of AFRICAN_CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestDist) { bestDist = d; best = c.name; }
  }
  return best;
}

function extractRegion(threat: any): string {
  const title = threat.title || '';
  const parts = title.split('—');
  if (parts.length > 1) {
    const region = parts[parts.length - 1].trim();
    if (region && region !== 'Unspecified') return region;
  }
  const parts2 = title.split(' — ');
  if (parts2.length > 1) {
    const region = parts2[parts2.length - 1].trim();
    if (region && region !== 'Unspecified') return region;
  }
  const lat = Number(threat.center_lat ?? threat.lat);
  const lng = Number(threat.center_lng ?? threat.lng ?? threat.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return nearestCity(lat, lng);
  }
  return 'Unspecified';
}

function buildTickerItems(threats: any[]): TickerItem[] {
  if (!threats || threats.length === 0) {
    return [{ module: 'Status', text: 'All monitoring points nominal — no active hazard signals above threshold.', severity: 'info' }];
  }

  const items: TickerItem[] = [];
  const severityCounts: Record<string, number> = {};
  const regionThreats: Record<string, any[]> = {};

  for (const t of threats) {
    const sev = t.severity || 'unknown';
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    const region = extractRegion(t);
    if (!regionThreats[region]) regionThreats[region] = [];
    regionThreats[region].push(t);
  }

  const extremeCount = severityCounts['extreme'] || 0;
  const highCount = severityCounts['high'] || 0;

  items.push({
    module: 'OVERVIEW',
    text: `${threats.length} active hazard signals — ${extremeCount} extreme, ${highCount} high severity`,
    severity: extremeCount > 0 ? 'critical' : highCount > 0 ? 'warning' : 'info',
  });

  const topRegions = Object.entries(regionThreats)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  for (const [region, rThreats] of topRegions) {
    const extremes = rThreats.filter(t => t.severity === 'extreme').length;
    const rep = rThreats[0];
    const lat = Number(rep?.center_lat ?? rep?.lat);
    const lng = Number(rep?.center_lng ?? rep?.lng ?? rep?.lon);
    items.push({
      module: 'REGION',
      text: `${region}: ${rThreats.length} signals${extremes > 0 ? ` (${extremes} extreme)` : ''}`,
      severity: extremes > 0 ? 'critical' : 'warning',
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      threatData: rep,
    });
  }

  const mslpThreats = threats.filter(t => t.detection_details?.variable === 'mslp');
  if (mslpThreats.length > 0) {
    const minPressure = Math.min(...mslpThreats.map(t => t.detection_details?.value_hpa ?? 1013));
    const rep = mslpThreats[0];
    items.push({
      module: 'PRESSURE',
      text: `${mslpThreats.length} low-pressure signals — min ${Math.round(minPressure)} hPa`,
      severity: minPressure < 990 ? 'critical' : 'warning',
      lat: Number(rep?.center_lat ?? rep?.lat) || undefined,
      lng: Number(rep?.center_lng ?? rep?.lng ?? rep?.lon) || undefined,
      threatData: rep,
    });
  }

  const windThreats = threats.filter(t => t.detection_details?.variable === 'wind');
  if (windThreats.length > 0) {
    const maxWind = Math.max(...windThreats.map(t => t.detection_details?.value_ms ?? 0));
    const rep = windThreats[0];
    items.push({
      module: 'WIND',
      text: `${windThreats.length} high-wind signals — max ${maxWind.toFixed(1)} m/s`,
      severity: maxWind > 25 ? 'critical' : 'warning',
      lat: Number(rep?.center_lat ?? rep?.lat) || undefined,
      lng: Number(rep?.center_lng ?? rep?.lng ?? rep?.lon) || undefined,
      threatData: rep,
    });
  }

  return items;
}

const severityDot: Record<string, string> = {
  critical: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-emerald-500',
};

// AI summary cache
let cachedSummary: { text: string; ts: number } | null = null;
const AI_CACHE_MS = 5 * 60 * 1000;



async function fetchAISummary(threats: any[]): Promise<string | null> {
  if (cachedSummary && Date.now() - cachedSummary.ts < AI_CACHE_MS) return cachedSummary.text;
  try {
    const resp = await apiFetch("ai-situational-summary", {
      method: 'POST',
      body: JSON.stringify({ threats }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.summary) {
      cachedSummary = { text: data.summary, ts: Date.now() };
      return data.summary;
    }
    return null;
  } catch {
    return null;
  }
}

interface SituationalTickerProps {
  mapInstance?: maptilersdk.Map | null;
  onThreatSelect?: (threat: any) => void;
  warnings?: WarningsFeed;
  ensoContext?: EnsoContext | null;
}

interface WarningsFeed {
  alerts: EarlyAlert[];
  enso: EnsoState;
  updatedAt: number | null;
  error: string | null;
  notify: boolean;
  toggleNotify: () => void;
  skippedSites: string[];
  staleHazardCount: number;
}

const LEVEL_SEVERITY: Record<AlertLevel, TickerItem['severity']> = { advisory: 'info', watch: 'warning', warning: 'critical', emergency: 'critical' };

function minutesAgo(ts: number | null): string {
  if (!ts) return 'not yet checked';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'updated just now' : `updated ${m} min ago`;
}

// Early-warning status, ENSO context and each alert, as ticker items.
function buildWarningItems(w: WarningsFeed, ctx: EnsoContext | null): TickerItem[] {
  const items: TickerItem[] = [];
  const serious = w.alerts.filter(a => LEVEL_RANK[a.level] >= 3).length;
  items.push({
    module: 'EARLY WARNINGS',
    text: `${w.alerts.length} active${serious ? ` · ${serious} warning or higher` : ''} · ${minutesAgo(w.updatedAt)}${w.error ? ` · rainfall check failed: ${w.error}` : ''}`,
    severity: serious ? 'critical' : w.alerts.length ? 'warning' : 'info',
  });
  if (ctx) {
    const o = ctx.oni;
    const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    items.push({
      module: 'ENSO',
      text: `${o.phase} · ${o.strength_class} · ONI ${sign(o.value)} °C (${o.season} ${o.year})${o.rank_for_season.record ? ` · highest ${o.season} on record since 1950` : ''} · ${sign(o.change_3_months)} in 3 months${o.analogs.length ? ` · closest analogues ${o.analogs.slice(0, 2).map(a => `${a.year} (peaked ${sign(a.peak)})`).join(', ')}` : ''}`,
      severity: o.phase === 'El Niño' ? 'warning' : 'info',
    });
    for (const r of ctx.regions) {
      if (!r.in_season || !r.agreement) continue;
      const detail = r.signals.filter(s => s.counted && s.pct_of_normal != null).map(s => `${s.name.toLowerCase()} ${s.pct_of_normal}% of normal`).join('; ');
      items.push({
        module: 'EL NIÑO · LOCAL',
        text: `${r.name}, ${r.season}: ${r.agreement.consistent} of ${r.agreement.of} local signals point ${r.expected}${detail ? ` (${detail})` : ''}`,
        severity: r.agreement.of && r.agreement.consistent === r.agreement.of ? 'warning' : 'info',
        lat: r.id === 'east-africa' ? 1 : -19, lng: r.id === 'east-africa' ? 38.5 : 28,
      });
    }
  } else if (w.enso.phase !== 'Unknown') {
    const text = w.enso.phase === 'El Niño'
      ? `El Niño active · ONI ${w.enso.oni?.toFixed(1)} (${w.enso.season}) · enhanced East Africa short rains more likely; alert levels still come from local rainfall`
      : `${w.enso.phase} · ONI ${w.enso.oni?.toFixed(1)} (${w.enso.season})`;
    items.push({ module: 'ENSO', text: w.enso.stale ? `${text} · last known reading` : text, severity: w.enso.phase === 'El Niño' ? 'warning' : 'info' });
  }
  for (const a of w.alerts) {
    items.push({
      module: a.level.toUpperCase(),
      text: `${a.name}${a.country ? `, ${a.country}` : ''}: ${a.why} (${a.source}, confidence ${Math.round(a.confidence * 100)}%)`,
      severity: LEVEL_SEVERITY[a.level], lat: a.lat, lng: a.lon,
    });
  }
  if (w.staleHazardCount > 0) {
    items.push({ module: 'DATA', text: `${w.staleHazardCount} hazard records older than 72h are not shown as alerts`, severity: 'info' });
  }
  if (w.skippedSites.length > 0) {
    items.push({ module: 'DATA', text: `No complete rainfall data for ${w.skippedSites.join(', ')}; not evaluated`, severity: 'info' });
  }
  return items;
}

// Stable identity for a signal across polls. Falls back to the detection's
// position and type when the feed supplies no id, so unidentified signals are
// not reported as new on every refresh.
function signalKey(t: any, i: number): string {
  const id = t?.id ?? t?.external_id;
  if (id != null && id !== '') return `id:${id}`;
  const type = t?.threat_type ?? t?.type ?? 'unknown';
  const lat = t?.center_lat ?? t?.latitude ?? t?.lat;
  const lng = t?.center_lng ?? t?.longitude ?? t?.lng ?? t?.lon;
  if (lat == null || lng == null) return `idx:${i}:${type}`;
  return `geo:${type}:${Number(lat).toFixed(3)}:${Number(lng).toFixed(3)}`;
}

const SituationalTicker = ({ mapInstance, onThreatSelect, warnings, ensoContext }: SituationalTickerProps) => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const toastedWarnings = useRef<Set<string> | null>(null);
  const toastedEnso = useRef(false);
  const seenSignalsRef = useRef<Set<string> | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchAndBuild = useCallback(async () => {
    try {
      const data = await fetchRealtimeThreats();
      const threats = Array.isArray(data?.threats) ? data.threats : [];
      const newItems = buildTickerItems(threats);

      if (threats.length > 0) {
        fetchAISummary(threats).then(summary => {
          if (summary) {
            setItems(prev => {
              const filtered = prev.filter(i => i.module !== 'AI BRIEF');
              return [{ module: 'AI BRIEF', text: summary, severity: 'info' as const }, ...filtered];
            });
          }
        });
      }

      setItems(newItems);

      // Track signals by identity, not by count: an equal number of signals
      // resolving and arriving between polls is still new information, and a
      // count comparison silently misses it.
      const ids: string[] = threats.map((t: any, i: number) => signalKey(t, i));
      const current = new Set<string>(ids);
      const seen = seenSignalsRef.current;

      if (seen === null) {
        // First load - report what is already standing rather than replaying it
        // as if it had just arrived.
        const extremeCount = threats.filter(t => t.severity === 'extreme').length;
        if (extremeCount > 0) {
          toast({
            title: '🔴 Extreme hazard signals active',
            description: `${extremeCount} extreme severity signal${extremeCount > 1 ? 's' : ''} detected across monitored regions`,
            variant: 'destructive',
          });
        }
      } else {
        const fresh = threats.filter((_, i) => !seen.has(ids[i]));
        let resolved = 0;
        for (const id of seen) if (!current.has(id)) resolved += 1;

        if (fresh.length > 0) {
          const extreme = fresh.filter(t => t.severity === 'extreme').length;
          const lead = fresh[0];
          const where = lead?.title || [lead?.threat_type, lead?.type].find(Boolean) || 'monitored regions';
          toast({
            title: `⚠️ ${fresh.length} new hazard signal${fresh.length > 1 ? 's' : ''}`,
            description: fresh.length === 1
              ? `${where} (${threats.length} active)`
              : `${where} +${fresh.length - 1} more${extreme > 0 ? ` · ${extreme} extreme` : ''} (${threats.length} active)`,
            variant: 'destructive',
          });
        }
        if (resolved > 0) {
          toast({
            title: '✅ Hazard signals cleared',
            description: `${resolved} signal${resolved > 1 ? 's' : ''} resolved (${threats.length} remaining)`,
          });
        }
      }

      seenSignalsRef.current = current;
    } catch {
      setItems([{ module: 'STATUS', text: 'Analysis feed temporarily unavailable', severity: 'info' }]);
    }
  }, [toast]);

  useEffect(() => {
    fetchAndBuild();
    const interval = setInterval(fetchAndBuild, 60_000);
    return () => clearInterval(interval);
  }, [fetchAndBuild]);

  const handleItemClick = useCallback((item: TickerItem) => {
    if (item.lat != null && item.lng != null && mapInstance) {
      mapInstance.flyTo({ center: [item.lng, item.lat], zoom: 6, duration: 1500 });
    }
    if (item.threatData && onThreatSelect) {
      const t = item.threatData;
      onThreatSelect({
        id: t.id || t.external_id || 'unknown',
        title: t.title || item.text,
        type: t.threat_type || t.type || 'unknown',
        severity: t.severity || 'high',
        description: t.description || item.text,
        lat: Number(t.center_lat ?? t.lat ?? item.lat ?? 0),
        lng: Number(t.center_lng ?? t.lng ?? t.lon ?? item.lng ?? 0),
        intensity: t.intensity ?? 0,
        forecast_hour: t.forecast_hour,
        source_artifact: t.source_artifact || t.detection_details,
        data_source_run_id: t.data_source_run_id,
        updated_at: t.updated_at,
      });
    }
  }, [mapInstance, onThreatSelect]);

  // Toasts for Warning/Emergency alerts: one summary for what is already active,
  // then one per alert that appears later.
  useEffect(() => {
    if (!warnings?.updatedAt) return;
    const serious = warnings.alerts.filter(a => LEVEL_RANK[a.level] >= 3);
    const keys = new Set(serious.map(a => a.id + a.level));
    if (toastedWarnings.current === null) {
      if (serious.length > 0) {
        toast({
          title: `⚠️ ${serious.length} active early warning${serious.length > 1 ? 's' : ''}`,
          description: `${serious[0].name}: ${serious[0].why}`,
          variant: 'destructive',
        });
      }
    } else {
      for (const a of serious) {
        if (toastedWarnings.current.has(a.id + a.level)) continue;
        toast({ title: `${a.level === 'emergency' ? '🔴' : '🟠'} ${a.level.toUpperCase()}: ${a.name}`, description: a.why, variant: 'destructive' });
      }
    }
    toastedWarnings.current = keys;
  }, [warnings?.alerts, warnings?.updatedAt, toast]);

  useEffect(() => {
    if (toastedEnso.current || warnings?.enso.phase !== 'El Niño') return;
    toastedEnso.current = true;
    try { if (sessionStorage.getItem('enso-toast') === warnings.enso.season) return; sessionStorage.setItem('enso-toast', warnings.enso.season ?? ''); } catch { /* storage unavailable */ }
    toast({
      title: `🌊 El Niño active · ONI ${warnings.enso.oni?.toFixed(1)}`,
      description: `${warnings.enso.season}: enhanced East Africa short rains more likely. Seasonal context only; alert levels come from local rainfall.`,
    });
  }, [warnings?.enso, toast]);

  const allItems = [...(warnings ? buildWarningItems(warnings, ensoContext ?? null) : []), ...items];
  if (allItems.length === 0) return null;

  const displayItems = [...allItems, ...allItems];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden">
      {/* Neumorphic ticker bar */}
      <div
        className="h-10 flex items-center"
        style={{
          background: 'linear-gradient(145deg, hsla(220, 18%, 10%, 0.88) 0%, hsla(220, 20%, 6%, 0.92) 100%)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          borderTop: '1px solid hsla(220, 14%, 18%, 0.4)',
          boxShadow: '0 -4px 20px hsla(220, 20%, 3%, 0.5), inset 0 1px 0 hsla(210, 20%, 95%, 0.04)',
        }}
      >
        {/* LIVE badge */}
        <div
          className="shrink-0 px-4 h-full flex items-center gap-2"
          style={{
            borderRight: '1px solid hsla(220, 14%, 18%, 0.3)',
            background: 'hsla(220, 18%, 8%, 0.6)',
          }}
        >
          <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground uppercase">Live</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          {warnings && (
            <button
              onClick={warnings.toggleNotify}
              className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
              title={warnings.notify ? 'Browser notifications on for new warnings' : 'Notify me of new warnings'}
              aria-label={warnings.notify ? 'Turn off warning notifications' : 'Turn on warning notifications'}
              aria-pressed={warnings.notify}
            >
              {warnings.notify ? <Bell size={12} /> : <BellOff size={12} />}
            </button>
          )}
        </div>

        {/* Scrolling content */}
        <div className="flex-1 overflow-hidden">
          <div
            ref={tickerRef}
            className="flex items-center gap-8 whitespace-nowrap animate-ticker"
          >
            {displayItems.map((item, i) => {
              const clickable = (item.lat != null && item.lng != null) || item.threatData;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-2 text-xs ${clickable ? 'cursor-pointer hover:text-foreground rounded px-1.5 py-0.5 transition-colors' : ''}`}
                  onClick={clickable ? () => handleItemClick(item) : undefined}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${severityDot[item.severity]}`} />
                  <span className="font-semibold text-muted-foreground">{item.module}</span>
                  <span className="text-foreground/70">{item.text}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Time badge */}
        <div
          className="shrink-0 px-4 h-full flex items-center"
          style={{
            borderLeft: '1px solid hsla(220, 14%, 18%, 0.3)',
            background: 'hsla(220, 18%, 8%, 0.6)',
          }}
        >
          <span className="text-[10px] font-mono text-muted-foreground/70">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default SituationalTicker;

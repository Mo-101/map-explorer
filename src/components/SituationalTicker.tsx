import { useState, useEffect, useRef, useCallback } from 'react';
import type * as maptilersdk from '@maptiler/sdk';
import { fetchRealtimeThreats } from '@/services/hazardsApi';
import { useToast } from '@/hooks/use-toast';

interface TickerItem {
  module: string;
  text: string;
  severity: 'info' | 'warning' | 'critical';
  lat?: number;
  lng?: number;
}

// Static African city lookup for coordinate-based region fallback
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
  { name: 'Madagascar', lat: -18.6, lng: 45.1 },
  { name: 'Malawi', lat: -15.4, lng: 35.0 },
  { name: 'Niger', lat: 13.5, lng: 2.1 },
  { name: 'Mozambique Channel', lat: -15.0, lng: 42.0 },
  { name: 'Horn of Africa', lat: 5.0, lng: 45.0 },
  { name: 'Gulf of Guinea', lat: 3.0, lng: 0.0 },
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
  // Try title split on em-dash or regular dash
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
  // Coordinate fallback
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

  // Top regions with coordinates
  const topRegions = Object.entries(regionThreats)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

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
    });
  }

  // MSLP
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
    });
  }

  // Wind
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
    });
  }

  return items;
}

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-emerald-500',
};

// AI summary cache
let cachedSummary: { text: string; ts: number } | null = null;
const AI_CACHE_MS = 5 * 60 * 1000; // 5 minutes

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

async function fetchAISummary(threats: any[]): Promise<string | null> {
  if (cachedSummary && Date.now() - cachedSummary.ts < AI_CACHE_MS) return cachedSummary.text;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-situational-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
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
}

const SituationalTicker = ({ mapInstance }: SituationalTickerProps) => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchAndBuild = useCallback(async () => {
    try {
      const data = await fetchRealtimeThreats();
      const threats = Array.isArray(data?.threats) ? data.threats : [];
      const newItems = buildTickerItems(threats);

      // Fetch AI summary in parallel (non-blocking)
      if (threats.length > 0) {
        fetchAISummary(threats).then(summary => {
          if (summary) {
            setItems(prev => {
              // Remove existing AI BRIEF if present, prepend new one
              const filtered = prev.filter(i => i.module !== 'AI BRIEF');
              return [{ module: 'AI BRIEF', text: summary, severity: 'info' as const }, ...filtered];
            });
          }
        });
      }

      setItems(newItems);

      // Toast for critical changes
      const newCount = threats.length;
      if (prevCount !== null && newCount !== prevCount) {
        const diff = newCount - prevCount;
        if (diff > 0) {
          toast({
            title: '⚠️ New hazard signals detected',
            description: `${diff} new signal${diff > 1 ? 's' : ''} added (${newCount} total)`,
            variant: 'destructive',
          });
        } else if (diff < 0) {
          toast({
            title: '✅ Hazard signals cleared',
            description: `${Math.abs(diff)} signal${Math.abs(diff) > 1 ? 's' : ''} resolved (${newCount} remaining)`,
          });
        }
      }

      if (prevCount === null && threats.length > 0) {
        const extremeCount = threats.filter(t => t.severity === 'extreme').length;
        if (extremeCount > 0) {
          toast({
            title: '🔴 Extreme hazard signals active',
            description: `${extremeCount} extreme severity signal${extremeCount > 1 ? 's' : ''} detected across monitored regions`,
            variant: 'destructive',
          });
        }
      }

      setPrevCount(newCount);
    } catch {
      setItems([{ module: 'STATUS', text: 'Analysis feed temporarily unavailable', severity: 'info' }]);
    }
  }, [prevCount, toast]);

  useEffect(() => {
    fetchAndBuild();
    const interval = setInterval(fetchAndBuild, 60_000);
    return () => clearInterval(interval);
  }, [fetchAndBuild]);

  const handleItemClick = useCallback((item: TickerItem) => {
    if (!mapInstance || item.lat == null || item.lng == null) return;
    mapInstance.flyTo({ center: [item.lng, item.lat], zoom: 6, duration: 1500 });
  }, [mapInstance]);

  if (items.length === 0) return null;

  const displayItems = [...items, ...items];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-9 bg-card/90 backdrop-blur-md border-t border-border/50 flex items-center overflow-hidden">
      <div className="shrink-0 px-3 h-full flex items-center gap-1.5 border-r border-border/50 bg-card">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Live</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          ref={tickerRef}
          className="flex items-center gap-8 whitespace-nowrap animate-ticker"
        >
          {displayItems.map((item, i) => {
            const clickable = item.lat != null && item.lng != null;
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-2 text-xs ${clickable ? 'cursor-pointer hover:bg-accent/10 rounded px-1 transition-colors' : ''}`}
                onClick={clickable ? () => handleItemClick(item) : undefined}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${severityDot[item.severity]}`} />
                <span className="font-semibold text-muted-foreground">{item.module}</span>
                <span className="text-foreground/80">{item.text}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="shrink-0 px-3 h-full flex items-center border-l border-border/50 bg-card">
        <span className="text-[10px] text-muted-foreground">{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

export default SituationalTicker;

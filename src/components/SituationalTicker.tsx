import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRealtimeThreats } from '@/services/hazardsApi';
import { useToast } from '@/hooks/use-toast';

interface TickerItem {
  module: string;
  text: string;
  severity: 'info' | 'warning' | 'critical';
}

function buildTickerItems(threats: any[]): TickerItem[] {
  if (!threats || threats.length === 0) {
    return [{ module: 'Status', text: 'All monitoring points nominal — no active hazard signals above threshold.', severity: 'info' }];
  }

  const items: TickerItem[] = [];
  const severityCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const regionThreats: Record<string, any[]> = {};

  for (const t of threats) {
    const sev = t.severity || 'unknown';
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    const type = t.threat_type || t.type || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    const title = t.title || '';
    const region = title.split('—')[1]?.trim() || title.split(' — ')[1]?.trim() || 'Unspecified';
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

  // Top regions
  const topRegions = Object.entries(regionThreats)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  for (const [region, rThreats] of topRegions) {
    const extremes = rThreats.filter(t => t.severity === 'extreme').length;
    items.push({
      module: 'REGION',
      text: `${region}: ${rThreats.length} signals${extremes > 0 ? ` (${extremes} extreme)` : ''}`,
      severity: extremes > 0 ? 'critical' : 'warning',
    });
  }

  // MSLP
  const mslpThreats = threats.filter(t => t.detection_details?.variable === 'mslp');
  if (mslpThreats.length > 0) {
    const minPressure = Math.min(...mslpThreats.map(t => t.detection_details?.value_hpa ?? 1013));
    items.push({
      module: 'PRESSURE',
      text: `${mslpThreats.length} low-pressure signals — min ${Math.round(minPressure)} hPa`,
      severity: minPressure < 990 ? 'critical' : 'warning',
    });
  }

  // Wind
  const windThreats = threats.filter(t => t.detection_details?.variable === 'wind');
  if (windThreats.length > 0) {
    const maxWind = Math.max(...windThreats.map(t => t.detection_details?.value_ms ?? 0));
    items.push({
      module: 'WIND',
      text: `${windThreats.length} high-wind signals — max ${maxWind.toFixed(1)} m/s`,
      severity: maxWind > 25 ? 'critical' : 'warning',
    });
  }

  return items;
}

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-emerald-500',
};

const SituationalTicker = () => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchAndBuild = useCallback(async () => {
    try {
      const data = await fetchRealtimeThreats();
      const threats = Array.isArray(data?.threats) ? data.threats : [];
      const newItems = buildTickerItems(threats);
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

      // Toast on first load with extreme threats
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

  if (items.length === 0) return null;

  // Duplicate items for seamless scroll
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
          {displayItems.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 text-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${severityDot[item.severity]}`} />
              <span className="font-semibold text-muted-foreground">{item.module}</span>
              <span className="text-foreground/80">{item.text}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-3 h-full flex items-center border-l border-border/50 bg-card">
        <span className="text-[10px] text-muted-foreground">{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

export default SituationalTicker;

import { useEffect, useState } from "react";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

interface CountryRisk {
  country: string;
  total: number;
  red: number;
  orange: number;
  green: number;
  avg_score: number;
  types: string[];
}

function aggregateGdacsRisk(threats: any[]): CountryRisk[] {
  const map = new Map<string, CountryRisk>();

  for (const t of threats) {
    const gdacs = t.detection_details?.gdacs || t.metadata?.gdacs;
    if (!gdacs) continue;
    const country = gdacs.country || "Unknown";
    if (!map.has(country)) {
      map.set(country, { country, total: 0, red: 0, orange: 0, green: 0, avg_score: 0, types: [] });
    }
    const entry = map.get(country)!;
    entry.total++;
    if (gdacs.level === "red") entry.red++;
    else if (gdacs.level === "orange") entry.orange++;
    else entry.green++;
    entry.avg_score += gdacs.score || 0;
    const type = t.type || t.threat_type;
    if (type && !entry.types.includes(type)) entry.types.push(type);
  }

  return [...map.values()]
    .map(e => ({ ...e, avg_score: e.total > 0 ? e.avg_score / e.total : 0 }))
    .sort((a, b) => b.red - a.red || b.total - a.total)
    .slice(0, 8);
}

const LEVEL_COLORS: Record<string, string> = {
  red: "bg-red-500/90",
  orange: "bg-orange-500/90",
  green: "bg-emerald-500/90",
};

const GdacsRiskSummary = () => {
  const [data, setData] = useState<CountryRisk[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchRealtimeThreats();
        if (cancelled) return;
        const threats = res?.threats || [];
        setData(aggregateGdacsRisk(threats));
      } catch { /* ignore */ }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (data.length === 0) return null;

  const totalRed = data.reduce((s, d) => s + d.red, 0);
  const totalOrange = data.reduce((s, d) => s + d.orange, 0);
  const totalAlerts = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="absolute bottom-28 left-4 z-20">
      <div className="neu-panel max-w-[280px]">
        <div className="neu-glow-line" />

        {/* Header - always visible */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              GDACS Risk
            </span>
            <div className="flex gap-1">
              {totalRed > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/90 text-white">
                  {totalRed} RED
                </span>
              )}
              {totalOrange > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-500/90 text-white">
                  {totalOrange} ORG
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {expanded ? "▲" : "▼"} {totalAlerts}
          </span>
        </button>

        {/* Expandable country list */}
        {expanded && (
          <div className="border-t border-border/40 max-h-[240px] overflow-y-auto">
            {data.map((c) => (
              <div
                key={c.country}
                className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    {c.country}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    {c.types.map(t => (
                      <span
                        key={t}
                        className="px-1 py-0 text-[9px] rounded bg-muted text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  {c.red > 0 && (
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${LEVEL_COLORS.red}`}>
                      {c.red}
                    </span>
                  )}
                  {c.orange > 0 && (
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${LEVEL_COLORS.orange}`}>
                      {c.orange}
                    </span>
                  )}
                  {c.green > 0 && (
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${LEVEL_COLORS.green}`}>
                      {c.green}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono ml-1">
                    {c.avg_score.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GdacsRiskSummary;

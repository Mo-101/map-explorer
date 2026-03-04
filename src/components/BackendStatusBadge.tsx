import { useEffect, useState } from "react";
import { fetchSmokeTest } from "@/services/hazardsApi";
import MoScriptsTooltip from "@/components/MoScriptsTooltip";

type SmokeData = {
  database: string;
  server_time?: string;
  active_threats?: number;
  total_rows?: number;
  by_source?: Record<string, { last_updated: string; active_count: number }>;
  by_severity?: Record<string, number>;
  error?: string;
  checked_at?: string;
};

export default function BackendStatusBadge() {
  const [data, setData] = useState<SmokeData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const result = await fetchSmokeTest();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData({ database: "error", error: "unreachable" });
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const ok = data?.database === "connected";
  const label = ok ? "NEON DB OK" : "NEON DB DOWN";
  const sourceCount = data?.by_source ? Object.keys(data.by_source).length : 0;

  return (
    <div className="absolute top-5 right-5 z-20">
      <MoScriptsTooltip
        title="Backend Health Monitor"
        description={ok
          ? `Database connected. ${data?.active_threats ?? 0} active threats across ${sourceCount} data sources. Auto-refreshes every 60s.`
          : "Backend connection lost. Threat data may be stale. System will retry automatically."
        }
        position="left"
      >
        <div
          className="neu-panel-elevated overflow-hidden cursor-pointer transition-all"
          onClick={() => setExpanded(v => !v)}
        >
          {/* Status glow line */}
          <div
            className="h-[1px] w-full"
            style={{
              background: ok
                ? "linear-gradient(90deg, transparent 5%, hsla(142, 71%, 45%, 0.5) 50%, transparent 95%)"
                : "linear-gradient(90deg, transparent 5%, hsla(0, 70%, 55%, 0.5) 50%, transparent 95%)"
            }}
          />

          <div className="px-3 py-2 text-xs font-mono">
            <div className="flex items-center justify-between gap-3">
              <span className={`font-semibold ${ok ? "text-emerald-300" : "text-red-300"}`}>{label}</span>
              {ok && data?.active_threats !== undefined && (
                <span className="text-foreground/70">{data.active_threats} active</span>
              )}
              <span className="text-muted-foreground/60">{data?.checked_at ? new Date(data.checked_at).toLocaleTimeString() : "..."}</span>
            </div>

            {!ok && data?.error && (
              <div className="text-red-300/80 mt-1">{data.error}</div>
            )}

            {expanded && ok && data?.by_source && (
              <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                {Object.entries(data.by_source).map(([src, info]) => (
                  <div key={src} className="flex justify-between gap-4">
                    <span className="text-emerald-300/80">{src}</span>
                    <span className="text-muted-foreground/60">
                      {info.active_count} active · {new Date(info.last_updated).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {data.by_severity && (
                  <div className="mt-1 pt-1 border-t border-border/20 text-muted-foreground/50">
                    {Object.entries(data.by_severity).map(([sev, count]) => (
                      <span key={sev} className="mr-2">{sev}: {count}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MoScriptsTooltip>
    </div>
  );
}

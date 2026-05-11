import { useEffect, useState } from "react";
import { fetchSmokeTest } from "@/services/hazardsApi";
import { pingApi, type ApiHealth } from "@/services/apiBase";
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

type Status = "ok" | "db_down" | "api_unreachable";

export default function BackendStatusBadge() {
  const [data, setData] = useState<SmokeData | null>(null);
  const [api, setApi] = useState<ApiHealth | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const health = await pingApi();
      if (cancelled) return;
      setApi(health);

      if (!health.reachable) {
        setData({ database: "unreachable", error: health.error ?? "API unreachable" });
        return;
      }
      try {
        const result = await fetchSmokeTest();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "unknown error";
          setData({ database: "error", error: msg });
        }
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const status: Status = !api?.reachable
    ? "api_unreachable"
    : data?.database === "connected"
      ? "ok"
      : "db_down";

  const label =
    status === "ok" ? "NEON DB OK" :
    status === "db_down" ? "NEON DB DOWN" :
    "API UNREACHABLE";

  const accent =
    status === "ok"
      ? "linear-gradient(90deg, transparent 5%, hsla(142, 71%, 45%, 0.5) 50%, transparent 95%)"
      : status === "db_down"
        ? "linear-gradient(90deg, transparent 5%, hsla(38, 92%, 55%, 0.5) 50%, transparent 95%)"
        : "linear-gradient(90deg, transparent 5%, hsla(0, 70%, 55%, 0.5) 50%, transparent 95%)";

  const textColor =
    status === "ok" ? "text-emerald-300" :
    status === "db_down" ? "text-amber-300" :
    "text-red-300";

  const tooltipDesc =
    status === "ok"
      ? `Database connected. ${data?.active_threats ?? 0} active threats across ${data?.by_source ? Object.keys(data.by_source).length : 0} data sources. Auto-refreshes every 60s.`
      : status === "db_down"
        ? "API is reachable but the database is not responding. Live threat data may be stale."
        : `Backend API is unreachable (${api?.error ?? "no response"}). The Fastify service may be offline or DNS is misconfigured.`;

  return (
    <div className="absolute top-5 right-5 z-20">
      <MoScriptsTooltip
        title="Backend Health Monitor"
        description={tooltipDesc}
        position="left"
      >
        <div
          className="neu-panel-elevated overflow-hidden cursor-pointer transition-all"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="h-[1px] w-full" style={{ background: accent }} />

          <div className="px-3 py-2 text-xs font-mono">
            <div className="flex items-center justify-between gap-3">
              <span className={`font-semibold ${textColor}`}>{label}</span>
              {status === "ok" && data?.active_threats !== undefined && (
                <span className="text-foreground/70">{data.active_threats} active</span>
              )}
              {status === "api_unreachable" && api?.latencyMs && (
                <span className="text-foreground/50">{api.latencyMs}ms</span>
              )}
              <span className="text-muted-foreground/60">
                {data?.checked_at ? new Date(data.checked_at).toLocaleTimeString() : "..."}
              </span>
            </div>

            {status !== "ok" && (data?.error || api?.error) && (
              <div className="text-red-300/80 mt-1 truncate max-w-[280px]">
                {data?.error || api?.error}
              </div>
            )}

            {expanded && status === "ok" && data?.by_source && (
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

            {expanded && status === "api_unreachable" && (
              <div className="mt-2 pt-2 border-t border-border/30 text-muted-foreground/70 space-y-0.5">
                <div>Service expected at the Fastify host.</div>
                <div>Check: docker compose up -d on the VPS.</div>
                <div>DNS: api.mostarindustries.com → VPS IP.</div>
              </div>
            )}
          </div>
        </div>
      </MoScriptsTooltip>
    </div>
  );
}

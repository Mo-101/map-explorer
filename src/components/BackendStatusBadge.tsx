import { useEffect, useState } from "react";
import { fetchSmokeTest } from "@/services/hazardsApi";

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

  return (
    <div className="absolute top-5 right-5 z-20">
      <div
        className={`px-3 py-2 rounded-xl backdrop-blur-md border shadow-lg text-xs font-mono cursor-pointer transition-all ${
          ok
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
            : "bg-red-500/15 border-red-500/30 text-red-200"
        }`}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{label}</span>
          {ok && data?.active_threats !== undefined && (
            <span className="opacity-90">{data.active_threats} active</span>
          )}
          <span className="opacity-60">{data?.checked_at ? new Date(data.checked_at).toLocaleTimeString() : "..."}</span>
        </div>

        {!ok && data?.error && (
          <div className="opacity-80 mt-1">{data.error}</div>
        )}

        {expanded && ok && data?.by_source && (
          <div className="mt-2 pt-2 border-t border-emerald-500/20 space-y-1">
            {Object.entries(data.by_source).map(([src, info]) => (
              <div key={src} className="flex justify-between gap-4">
                <span className="text-emerald-300">{src}</span>
                <span className="opacity-70">
                  {info.active_count} active · {new Date(info.last_updated).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {data.by_severity && (
              <div className="mt-1 pt-1 border-t border-emerald-500/20 opacity-70">
                {Object.entries(data.by_severity).map(([sev, count]) => (
                  <span key={sev} className="mr-2">{sev}: {count}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

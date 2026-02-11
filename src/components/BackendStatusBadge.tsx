import { useEffect, useState } from "react";
import { fetchBackendHealth } from "@/services/hazardsApi";

type Status = {
  ok: boolean;
  health?: any;
  error?: string;
  checkedAt: string;
};

export default function BackendStatusBadge() {
  const [status, setStatus] = useState<Status>({ ok: false, checkedAt: new Date().toISOString() });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const healthJson = await fetchBackendHealth();
        if (cancelled) return;

        setStatus({
          ok: healthJson?.status === "healthy",
          health: healthJson,
          checkedAt: new Date().toISOString(),
        });
      } catch (e: any) {
        if (cancelled) return;
        setStatus({
          ok: false,
          error: e?.message || "Backend unreachable",
          checkedAt: new Date().toISOString(),
        });
      }
    };

    check();
    const pollMs = 60_000;
    const id = window.setInterval(check, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label = status.ok ? "NEON DB OK" : "NEON DB DOWN";
  const details = status.ok
    ? `mode: ${status.health?.system_mode || "dev"} | ${status.health?.threats_count ?? 0} threats`
    : status.error
      ? status.error
      : "unreachable";

  return (
    <div className="absolute top-5 right-5 z-20">
      <div
        className={`px-3 py-2 rounded-xl backdrop-blur-md border shadow-lg text-xs font-mono ${
          status.ok
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
            : "bg-red-500/15 border-red-500/30 text-red-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{label}</span>
          <span className="opacity-80">{new Date(status.checkedAt).toLocaleTimeString()}</span>
        </div>
        <div className="opacity-80 mt-1">{details}</div>
      </div>
    </div>
  );
}

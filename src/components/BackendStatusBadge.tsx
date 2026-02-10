import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  health?: any;
  error?: string;
  checkedAt: string;
};

function getAnalysisApiBaseUrl() {
  const raw = ((import.meta as any).env?.VITE_ANALYSIS_API_BASE_URL as string | undefined) || "";
  const cleaned = raw.replace(/['"]/g, "").replace(/\/$/, "");
  if (cleaned) return cleaned;
  return import.meta.env.DEV ? "http://localhost:5001" : "";
}

export default function BackendStatusBadge() {
  const [status, setStatus] = useState<Status>({ ok: false, checkedAt: new Date().toISOString() });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const base = getAnalysisApiBaseUrl();
        const healthRes = await fetch(`${base}/api/health`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const healthJson = await healthRes.json().catch(() => null);

        if (cancelled) return;

        if (!healthRes.ok) {
          setStatus({
            ok: false,
            health: healthJson,
            error: `Health check failed: ${healthRes.status}`,
            checkedAt: new Date().toISOString(),
          });
        } else {
          setStatus({
            ok: true,
            health: healthJson,
            checkedAt: new Date().toISOString(),
          });
        }
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
    const pollMsRaw = (import.meta as any).env?.VITE_STATUS_POLL_MS;
    const pollMs = Math.max(15_000, Number(pollMsRaw || 60_000));
    const id = window.setInterval(check, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label = status.ok ? "ANALYSIS OK" : "ANALYSIS DOWN";
  const details = status.ok
    ? `mode: ${status.health?.system_mode || "analysis"}`
    : status.error
      ? status.error
      : status.health?.status
        ? `status: ${status.health.status}`
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

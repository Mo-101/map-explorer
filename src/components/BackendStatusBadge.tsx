import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  health?: any;
  threatsCount?: number;
  error?: string;
  checkedAt: string;
};

export default function BackendStatusBadge() {
  const [status, setStatus] = useState<Status>({ ok: false, checkedAt: new Date().toISOString() });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const base = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "")
        .replace(/['"]/g, "")
        .replace(/\/$/, "");
      try {
        const [healthRes, threatsRes] = await Promise.all([
          fetch(`${base}/api/v1/health`, { headers: { Accept: "application/json" }, cache: "no-store" }),
          fetch(`${base}/api/v1/threats?limit=1`, { headers: { Accept: "application/json" }, cache: "no-store" }),
        ]);

        const healthJson = healthRes.ok ? await healthRes.json() : null;
        const threatsJson = threatsRes.ok ? await threatsRes.json() : null;

        if (cancelled) return;

        setStatus({
          ok: Boolean(healthRes.ok && threatsRes.ok),
          health: healthJson,
          threatsCount: typeof threatsJson?.count === "number" ? threatsJson.count : undefined,
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
    const pollMsRaw = (import.meta as any).env?.VITE_STATUS_POLL_MS;
    const pollMs = Math.max(15_000, Number(pollMsRaw || 60_000));
    const id = window.setInterval(check, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label = status.ok ? "BACKEND OK" : "BACKEND DOWN";
  const details = status.ok
    ? `threats: ${status.threatsCount ?? "?"}`
    : status.error
      ? status.error
      : status.health?.db
        ? `db: ${status.health.db}`
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

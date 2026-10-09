import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluateRainfall, fetchEnso, threatsToAlerts, LEVEL_RANK, type EarlyAlert, type EnsoState } from "@/lib/warnings/engine";

const POLL_MS = 10 * 60 * 1000;

export function useEarlyWarnings(threats: any[]) {
  const [rainAlerts, setRainAlerts] = useState<EarlyAlert[]>([]);
  const [skippedSites, setSkippedSites] = useState<string[]>([]);
  const [enso, setEnso] = useState<EnsoState>({ oni: null, phase: "Unknown", season: null });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(() => { try { return localStorage.getItem("ews-notify") === "1"; } catch { return false; } });
  const seen = useRef<Set<string>>(new Set());
  const mountedAt = useRef(Date.now());

  const run = useCallback(async () => {
    try {
      const e = await fetchEnso();
      setEnso(e);
      const { alerts, skipped } = await evaluateRainfall(e);
      setRainAlerts(alerts); setSkippedSites(skipped);
      setUpdatedAt(Date.now()); setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Warnings unavailable");
    }
  }, []);

  useEffect(() => { run(); const t = setInterval(run, POLL_MS); return () => clearInterval(t); }, [run]);

  const hazards = useMemo(() => threatsToAlerts(threats), [threats]);
  const alerts = useMemo(
    () => [...rainAlerts, ...hazards.alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]),
    [rainAlerts, hazards],
  );

  useEffect(() => {
    // Alerts already active when the page opens are not "new": rainfall and hazard
    // feeds arrive separately, so treat the first minute as the initial state.
    const initial = Date.now() - mountedAt.current < 60000;
    for (const a of alerts) {
      const key = a.id + a.level;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      if (!initial && notify && LEVEL_RANK[a.level] >= 3 && "Notification" in window && Notification.permission === "granted") {
        new Notification(`${a.level.toUpperCase()}: ${a.name}`, { body: a.why });
      }
    }
  }, [alerts, notify]);

  const toggleNotify = useCallback(async () => {
    if (!notify && "Notification" in window && Notification.permission !== "granted") {
      if ((await Notification.requestPermission()) !== "granted") return;
    }
    setNotify(v => { try { localStorage.setItem("ews-notify", v ? "0" : "1"); } catch { /* storage unavailable */ } return !v; });
  }, [notify]);

  return {
    alerts, enso, updatedAt, error, refresh: run, notify, toggleNotify,
    skippedSites, staleHazardCount: hazards.staleCount,
  };
}

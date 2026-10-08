import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateRainfall, fetchEnso, threatsToAlerts, LEVEL_RANK, type EarlyAlert, type EnsoState } from "@/lib/warnings/engine";

const POLL_MS = 10 * 60 * 1000;

export function useEarlyWarnings(threats: any[]) {
  const [rainAlerts, setRainAlerts] = useState<EarlyAlert[]>([]);
  const [enso, setEnso] = useState<EnsoState>({ oni: null, phase: "Unknown", season: null });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(() => localStorage.getItem("ews-notify") === "1");
  const seen = useRef<Set<string>>(new Set());

  const run = useCallback(async () => {
    try {
      const e = await fetchEnso();
      setEnso(e);
      setRainAlerts(await evaluateRainfall(e));
      setUpdatedAt(Date.now()); setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Warnings unavailable");
    }
  }, []);

  useEffect(() => { run(); const t = setInterval(run, POLL_MS); return () => clearInterval(t); }, [run]);

  const alerts = [...rainAlerts, ...threatsToAlerts(threats)].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);

  useEffect(() => {
    for (const a of alerts) {
      const key = a.id + a.level;
      if (seen.current.has(key)) continue;
      const first = seen.current.size === 0;
      seen.current.add(key);
      if (!first && notify && LEVEL_RANK[a.level] >= 3 && "Notification" in window && Notification.permission === "granted") {
        new Notification(`${a.level.toUpperCase()}: ${a.name}`, { body: a.why });
      }
    }
  }, [alerts, notify]);

  const toggleNotify = useCallback(async () => {
    if (!notify && "Notification" in window && Notification.permission !== "granted") {
      if ((await Notification.requestPermission()) !== "granted") return;
    }
    setNotify(v => { localStorage.setItem("ews-notify", v ? "0" : "1"); return !v; });
  }, [notify]);

  return { alerts, enso, updatedAt, error, refresh: run, notify, toggleNotify };
}

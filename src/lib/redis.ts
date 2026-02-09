/**
 * Redis client stub
 * Redis is not available in the browser environment.
 * This module provides a no-op interface for compatibility.
 * In production, Redis operations should be handled by the backend API.
 */

const noopAsync = async () => null;

export const redis = {
  get: async (_key: string): Promise<string | null> => null,
  set: async (_key: string, _value: string, _mode?: any, _duration?: number) => null,
  del: async (_key: string) => null,
  incr: async (_key: string) => null,
  expire: async (_key: string, _seconds: number) => null,
  ping: async () => "PONG (stub)",
  client: null,
};

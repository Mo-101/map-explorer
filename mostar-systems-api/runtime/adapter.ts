/**
 * MoScripts HTTP adapter boundary.
 *
 * This is an execution adapter, not the canonical source language.
 * Canonical service definitions live in services/**/*.ms.
 *
 * Production rules:
 * - Do not evaluate arbitrary source with eval/new Function.
 * - Compile .ms -> validated IR ahead of deployment.
 * - Reject unsealed or unregistered scrolls.
 * - Require immutable ID + soulprint validation.
 * - Enforce ThroneLock RBAC and resonance >= 0.92.
 */

export type Role = "Executor" | "Architect" | "Guardian";

export interface CompiledRoute {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  public: boolean;
  timeoutMs: number;
  rateLimit?: string;
}

export interface CompiledService {
  id: string;
  sealed: true;
  resonance: number;
  soulprint: string;
  routes: CompiledRoute[];
}

export function validateCompiledService(service: CompiledService): void {
  if (service.sealed !== true) throw new Error("UNSEALED_SCROLL");
  if (!service.id) throw new Error("MISSING_IMMUTABLE_ID");
  if (!service.soulprint) throw new Error("MISSING_SOULPRINT");
  if (service.resonance < 0.92) throw new Error("RESONANCE_BELOW_THRESHOLD");
}

export async function healthResponse() {
  return {
    service: "mostar-systems-api",
    status: "ok",
    version: "v1",
    timestamp: new Date().toISOString(),
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRealtimeThreats, fetchBackendHealth } from "./hazardsApi";

afterEach(() => vi.unstubAllGlobals());

describe("Neon read API", () => {
  it("loads threats and clusters from the same-origin route", async () => {
    const payload = { threats: [{ id: "1" }], clusters: [{ cluster_id: "c1" }] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchRealtimeThreats()).toEqual({ ...payload, count: 1, has_more: false });
    expect(fetch).toHaveBeenCalledWith("/api/v1/threats", expect.any(Object));
  });

  it("reports a reachable API with a failed database instead of hiding the error", async () => {
    const payload = { database: "error", error: "Connection failed" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 500 })));
    expect(await fetchBackendHealth()).toEqual(payload);
  });

  it("does not turn a failed threat request into an empty successful result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Database unavailable", threats: [] }), { status: 503 })));
    await expect(fetchRealtimeThreats()).rejects.toThrow("Database unavailable");
  });

  it("rejects a response from the wrong endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
    await expect(fetchRealtimeThreats()).rejects.toThrow("Invalid threats response");
  });

  it("loads later pages so alerts beyond the first 500 are not hidden", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ threats: [{ id: "1" }], has_more: true, next_offset: 500 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ threats: [{ id: "501" }], has_more: false })));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchRealtimeThreats()).threats).toHaveLength(2);
    expect(fetch).toHaveBeenLastCalledWith("/api/v1/threats?offset=500", expect.any(Object));
  });
});

import { expect, it, vi } from "vitest";
import { mo_THREAT_RENDERER } from "../moscripts/visualization/mo-threat-renderer-001";

vi.mock("maplibre-gl", () => ({ default: {} }));

it("removes all layers before their shared source when threats expire", async () => {
  const layers = new Set(["threat-layer-1", "threat-glow-1", "threat-pulse-1"]);
  const removeSource = vi.fn(() => expect(layers.size).toBe(0));
  const map = {
    getStyle: () => ({ layers: [...layers].map(id => ({ id })) }),
    getLayer: (id: string) => layers.has(id),
    removeLayer: (id: string) => layers.delete(id),
    getSource: (id: string) => id === "threat-1",
    removeSource,
  };
  const result = await mo_THREAT_RENDERER.logic({ threats: [], mapInstance: map as never });
  expect(result.totalRendered).toBe(0);
  expect(removeSource).toHaveBeenCalledExactlyOnceWith("threat-1");
});

import { describe, expect, it } from "vitest";
import { groupThreatLocations } from "./threatLocations";

describe("location globes", () => {
  it("retains both signals at exactly the same anchor", () => {
    const threats = [{ id: "rain", threat_type: "flood", center_lat: -1, center_lng: 36 }, { id: "wind", threat_type: "cyclone", center_lat: -1, center_lng: 36 }];
    const groups = groupThreatLocations(threats);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ lat: -1, lng: 36, threats });
  });
  it("does not shift nearby locations or drop distinct alerts of the same type", () => {
    const groups = groupThreatLocations([{ id: "a", center_lat: 0, center_lng: 0 }, { id: "b", center_lat: 0, center_lng: 0 }, { id: "c", center_lat: 0.01, center_lng: 0 }]);
    expect(groups).toHaveLength(2);
    expect(groups[0].threats).toHaveLength(2);
    expect(groups[1].lat).toBe(0.01);
  });
  it("deduplicates repeated IDs and rejects invalid coordinates", () => {
    expect(groupThreatLocations([{ id: "a", center_lat: 0, center_lng: 0 }, { id: "a", center_lat: 0, center_lng: 0 }, { id: "bad", center_lat: 99, center_lng: 0 }, { id: "missing", center_lat: null, center_lng: null }])[0].threats).toHaveLength(1);
  });
});

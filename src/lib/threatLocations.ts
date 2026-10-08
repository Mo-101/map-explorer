export interface ThreatLocation {
  id: string;
  lat: number;
  lng: number;
  threats: any[];
}

/** Co-located alerts share an anchor, never an artificial displaced coordinate. */
export function groupThreatLocations(threats: any[]): ThreatLocation[] {
  const locations = new Map<string, ThreatLocation>();
  const seen = new Set<string>();
  for (const threat of threats) {
    const lat = threat.center_lat ?? threat.latitude;
    const lng = threat.center_lng ?? threat.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const id = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    const identity = `${id}:${threat.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (!locations.has(id)) locations.set(id, { id, lat, lng, threats: [] });
    locations.get(id)!.threats.push(threat);
  }
  return [...locations.values()];
}

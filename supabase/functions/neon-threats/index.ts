import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Spatial clustering parameters ──
const CLUSTER_RADIUS_DEG = 3.0; // ~330km at equator — group threats within this radius
const MIN_CLUSTER_SIZE = 1;     // Single threats are also returned (as cluster of 1)

interface RawThreat {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  event_at: string;
  intensity: number;
  metadata: any;
  created_at: string;
  updated_at: string;
  source?: string;
  data_source_run_id?: string;
  forecast_hour?: number;
  source_artifact?: any;
}

interface ThreatCluster {
  cluster_id: string;
  type: string;
  severity: string; // highest in cluster
  title: string;
  description: string;
  center_lat: number;
  center_lng: number;
  threat_count: number;
  threats: any[];
  hull: [number, number][]; // convex hull polygon coords [lng, lat]
  max_intensity: number;
  min_intensity: number;
  avg_intensity: number;
  sources: string[];
  timestamp: string;
}

// ── Simple grid-based spatial clustering ──
// Groups threats by (type, grid_cell) where grid_cell = floor(lat/radius), floor(lng/radius)
function clusterThreats(threats: RawThreat[]): ThreatCluster[] {
  // Group by type + grid cell
  const groups = new Map<string, RawThreat[]>();

  for (const t of threats) {
    const gridLat = Math.floor(t.lat / CLUSTER_RADIUS_DEG);
    const gridLng = Math.floor(t.lng / CLUSTER_RADIUS_DEG);
    const key = `${t.type}_${gridLat}_${gridLng}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const clusters: ThreatCluster[] = [];
  let clusterIdx = 0;

  for (const [key, members] of groups) {
    if (members.length < MIN_CLUSTER_SIZE) continue;

    // Calculate cluster properties
    const intensities = members.map(m => m.intensity || 0);
    const maxIntensity = Math.max(...intensities);
    const minIntensity = Math.min(...intensities);
    const avgIntensity = intensities.reduce((s, v) => s + v, 0) / intensities.length;

    // Centroid
    const centerLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const centerLng = members.reduce((s, m) => s + m.lng, 0) / members.length;

    // Highest severity
    const severityOrder: Record<string, number> = { extreme: 4, high: 3, moderate: 2, low: 1 };
    const highestSev = members.reduce((best, m) => {
      return (severityOrder[m.severity] || 0) > (severityOrder[best] || 0) ? m.severity : best;
    }, members[0].severity);

    // Convex hull of member coordinates
    const points: [number, number][] = members.map(m => [m.lng, m.lat]);
    const hull = members.length >= 3 ? convexHull(points) : expandToPolygon(points, CLUSTER_RADIUS_DEG * 0.3);

    // Sources
    const sources = [...new Set(members.map(m => m.source || 'unknown'))];

    // Representative title
    const type = members[0].type;
    const regionNames = extractRegionNames(members);
    const title = members.length === 1
      ? members[0].title
      : `${members.length} ${type} signals near ${regionNames[0] || 'monitored area'}`;

    const description = members.length === 1
      ? members[0].description
      : `Cluster of ${members.length} ${type} detections across ${regionNames.join(', ') || 'the region'}. Peak intensity: ${maxIntensity.toFixed(1)}. Sources: ${sources.join(', ')}.`;

    clusters.push({
      cluster_id: `cluster-${clusterIdx++}`,
      type,
      severity: highestSev,
      title,
      description,
      center_lat: centerLat,
      center_lng: centerLng,
      threat_count: members.length,
      threats: members.map(m => ({
        id: String(m.id),
        type: m.type,
        threat_type: m.type,
        severity: m.severity,
        title: m.title,
        description: m.description,
        timestamp: m.event_at || m.created_at,
        center_lat: m.lat,
        center_lng: m.lng,
        latitude: m.lat,
        longitude: m.lng,
        intensity: m.intensity,
        detection_details: m.metadata ?? {},
        source_artifact: m.source_artifact,
        data_source_run_id: m.data_source_run_id,
        forecast_hour: m.forecast_hour,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
      hull,
      max_intensity: maxIntensity,
      min_intensity: minIntensity,
      avg_intensity: Math.round(avgIntensity * 10) / 10,
      sources,
      timestamp: members[0].event_at || members[0].created_at,
    });
  }

  // Sort clusters: highest severity first, then by threat count
  clusters.sort((a, b) => {
    const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return b.threat_count - a.threat_count;
  });

  return clusters;
}

// Extract region names from threat titles (after "—")
function extractRegionNames(threats: RawThreat[]): string[] {
  const names = new Set<string>();
  for (const t of threats) {
    const parts = (t.title || '').split('—');
    if (parts.length > 1) {
      const name = parts[parts.length - 1].trim();
      if (name && name !== 'Unspecified') names.add(name);
    }
  }
  return Array.from(names).slice(0, 3);
}

// ── Convex hull (Graham scan) ──
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return expandToPolygon(points, CLUSTER_RADIUS_DEG * 0.3);

  // Remove duplicates
  const unique = [...new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()];
  if (unique.length < 3) return expandToPolygon(unique, CLUSTER_RADIUS_DEG * 0.3);

  // Find lowest point (min lat, then min lng)
  let start = 0;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i][1] < unique[start][1] || (unique[i][1] === unique[start][1] && unique[i][0] < unique[start][0])) {
      start = i;
    }
  }
  [unique[0], unique[start]] = [unique[start], unique[0]];

  const pivot = unique[0];
  unique.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
    const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
    return angleA - angleB;
  });

  const stack: [number, number][] = [unique[0], unique[1]];
  for (let i = 2; i < unique.length; i++) {
    while (stack.length > 1 && cross(stack[stack.length - 2], stack[stack.length - 1], unique[i]) <= 0) {
      stack.pop();
    }
    stack.push(unique[i]);
  }

  // Close the polygon
  stack.push(stack[0]);

  // Add buffer to hull
  return bufferHull(stack, CLUSTER_RADIUS_DEG * 0.15);
}

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Expand a single point or line to a small polygon
function expandToPolygon(points: [number, number][], radius: number): [number, number][] {
  if (points.length === 0) return [];
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const sides = 6;
  const result: [number, number][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    result.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return result;
}

// Buffer hull outward by a fixed amount
function bufferHull(hull: [number, number][], buffer: number): [number, number][] {
  if (hull.length < 3) return hull;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return [x + (dx / dist) * buffer, y + (dy / dist) * buffer] as [number, number];
  });
}

const severityOrder: Record<string, number> = { extreme: 4, high: 3, moderate: 2, low: 1 };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = Deno.env.get("NEON_DATABASE_URL");
  if (!url) {
    return new Response(
      JSON.stringify({ error: "missing NEON_DATABASE_URL", threats: [], clusters: [], count: 0 }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sql = neon(url);
    const reqUrl = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Number(reqUrl.searchParams.get("limit") ?? 200)));
    const clustered = reqUrl.searchParams.get("clustered") !== "false"; // default: true

    const rows = await sql`
      SELECT id, type, severity, title, description, lat, lng, event_at, intensity,
             metadata, created_at, updated_at, source, data_source_run_id, forecast_hour, source_artifact
      FROM hazard_alerts
      WHERE is_active = TRUE
      ORDER BY COALESCE(event_at, created_at) DESC
      LIMIT ${limit};
    `;

    const rawThreats: RawThreat[] = rows
      .filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r: any) => ({
        id: String(r.id),
        type: r.type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        lat: r.lat,
        lng: r.lng,
        event_at: r.event_at,
        intensity: r.intensity || 0,
        metadata: r.metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
        source: r.source,
        data_source_run_id: r.data_source_run_id,
        forecast_hour: r.forecast_hour,
        source_artifact: r.source_artifact,
      }));

    if (!clustered) {
      // Return raw threats (backward compatible)
      const threats = rawThreats.map(r => ({
        id: r.id,
        type: r.type,
        threat_type: r.type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        timestamp: r.event_at || r.created_at,
        center_lat: r.lat,
        center_lng: r.lng,
        latitude: r.lat,
        longitude: r.lng,
        lead_time_days: r.metadata?.lead_time_days ?? null,
        confidence: r.metadata?.confidence ?? null,
        detection_details: r.metadata ?? {},
        source_artifact: r.source_artifact,
        data_source_run_id: r.data_source_run_id,
        created_at: r.created_at,
      }));

      return new Response(
        JSON.stringify({ threats, count: threats.length, generated_at: new Date().toISOString() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cluster threats
    const clusters = clusterThreats(rawThreats);

    // Also return flat threats list for backward compatibility
    const flatThreats = rawThreats.map(r => ({
      id: r.id,
      type: r.type,
      threat_type: r.type,
      severity: r.severity,
      title: r.title,
      description: r.description,
      timestamp: r.event_at || r.created_at,
      center_lat: r.lat,
      center_lng: r.lng,
      latitude: r.lat,
      longitude: r.lng,
      lead_time_days: r.metadata?.lead_time_days ?? null,
      confidence: r.metadata?.confidence ?? null,
      detection_details: r.metadata ?? {},
      source_artifact: r.source_artifact,
      data_source_run_id: r.data_source_run_id,
      created_at: r.created_at,
    }));

    return new Response(
      JSON.stringify({
        threats: flatThreats,
        clusters,
        cluster_count: clusters.length,
        raw_count: rawThreats.length,
        count: flatThreats.length,
        generated_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e), threats: [], clusters: [], count: 0 }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

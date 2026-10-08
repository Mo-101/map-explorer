import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import { groupThreatLocations, type ThreatLocation } from "./threatLocations";

const SOURCE = "hazard-indicators";
const GLOBES = "hazard-location-globes";
const PREFIX = "hazard-globe:";
const TYPES = ["cyclone", "storm", "flood", "landslide", "earthquake", "outbreak", "cholera", "convergence", "drought", "wildfire", "other"];
const COLORS: Record<string, string> = { cyclone: "#ef4444", storm: "#ef4444", flood: "#3b82f6", landslide: "#f97316", earthquake: "#f97316", outbreak: "#ec4899", cholera: "#ec4899", convergence: "#8b5cf6", drought: "#eab308", wildfire: "#f97316", other: "#94a3b8" };
type State = { locations: globalThis.Map<string, ThreatLocation>; drawIcon: (type: string, color: string, size: number) => HTMLCanvasElement };
const states = new WeakMap<Map, State>();
const normalizedType = (type: string) => TYPES.includes(type) ? type : "other";

function globeImage(types: string[], count: number, drawIcon: State["drawIcon"]) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 112;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath(); ctx.arc(56, 56, 53, 0, Math.PI * 2); ctx.clip();
  const gradient = ctx.createRadialGradient(34, 27, 2, 56, 56, 62);
  gradient.addColorStop(0, "#426a80"); gradient.addColorStop(0.5, "#163c52"); gradient.addColorStop(1, "#081d2b");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 112, 112);
  ctx.strokeStyle = "rgba(180,220,240,0.22)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(56, 56, 24, 52, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(56, 56, 52, 17, 0, 0, Math.PI * 2); ctx.stroke();
  const shown = types.length ? types : ["other"];
  shown.forEach((type, i) => {
    const start = -Math.PI / 2 + i * Math.PI * 2 / shown.length;
    ctx.beginPath(); ctx.arc(56, 56, 49, start + 0.03, start + Math.PI * 2 / shown.length - 0.03);
    ctx.strokeStyle = COLORS[type]; ctx.lineWidth = 5; ctx.stroke();
    const angle = start + Math.PI / shown.length;
    const radius = shown.length === 1 ? 0 : 26;
    const size = shown.length <= 2 ? 39 : shown.length <= 4 ? 30 : 22;
    const icon = drawIcon(type, COLORS[type], size);
    ctx.drawImage(icon, 56 + Math.cos(angle) * radius - size / 2, 49 + Math.sin(angle) * radius - size / 2, size, size);
  });
  if (count > 1) {
    ctx.fillStyle = "#edf6ff"; ctx.font = "bold 23px system-ui"; ctx.textAlign = "center";
    ctx.fillText(String(count), 56, 96);
  }
  return ctx.getImageData(0, 0, 112, 112);
}

/** Compact globes retain each co-located signal; nearby locations cluster only at distant zooms. */
export function renderThreatIndicators(map: Map, threats: any[], drawIcon: State["drawIcon"]) {
  const locations = groupThreatLocations(threats);
  const count = locations.reduce((sum, location) => sum + location.threats.length, 0);
  let state = states.get(map);
  if (!state && !locations.length) return 0;
  if (!state) {
    state = { locations: new globalThis.Map(), drawIcon };
    states.set(map, state);
    let popup: maplibregl.Popup | undefined;
    const missing = (event: { id: string }) => {
      if (!event.id.startsWith(PREFIX) || map.hasImage(event.id)) return;
      const [signature, total] = event.id.slice(PREFIX.length).split(":");
      const types = signature.split(".").filter(type => TYPES.includes(type));
      map.addImage(event.id, globeImage(types, Number(total), states.get(map)!.drawIcon), { pixelRatio: 2 });
    };
    const click = async (event: any) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const source = map.getSource(SOURCE) as GeoJSONSource;
      const leaves = feature.properties.cluster ? await source.getClusterLeaves(feature.properties.cluster_id, 1000, 0) : [feature];
      const groups = leaves.map(leaf => states.get(map)?.locations.get(String(leaf.properties?.id))).filter(Boolean) as ThreatLocation[];
      const alerts = groups.flatMap(group => group.threats);
      if (!alerts.length) return;
      const content = document.createElement("div");
      content.style.cssText = "padding:12px;color:#152a36;max-width:320px;max-height:320px;overflow:auto";
      const heading = document.createElement("strong");
      heading.textContent = `${alerts.length} alert${alerts.length === 1 ? "" : "s"} · ${groups.length === 1 ? "one location" : `${groups.length} locations`}`;
      content.append(heading);
      if (feature.properties.cluster) {
        const zoom = document.createElement("button"); zoom.textContent = "Zoom to locations";
        zoom.style.cssText = "display:block;margin:8px 0;color:#17618a;text-decoration:underline";
        zoom.onclick = async () => {
          const level = await source.getClusterExpansionZoom(feature.properties.cluster_id);
          map.easeTo({ center: feature.geometry.coordinates, zoom: level, duration: 600 }); popup?.remove();
        };
        content.append(zoom);
      }
      for (const threat of alerts) {
        const detail = document.createElement("details"); detail.style.marginTop = "8px"; detail.open = alerts.length <= 2;
        const summary = document.createElement("summary");
        summary.style.color = COLORS[normalizedType(threat.threat_type)];
        summary.textContent = `${threat.threat_type} · ${threat.severity || "unknown"} · ${threat.title || "Alert"}`;
        detail.append(summary);
        for (const text of [threat.description, `Coordinates: ${threat.center_lat ?? threat.latitude}, ${threat.center_lng ?? threat.longitude}`, threat.data_source_run_id ? `Run: ${threat.data_source_run_id}` : null, threat.timestamp ? new Date(threat.timestamp).toLocaleString() : null]) {
          if (!text) continue;
          const line = document.createElement("div"); line.textContent = text; detail.append(line);
        }
        content.append(detail);
      }
      popup?.remove();
      popup = new maplibregl.Popup({ maxWidth: "350px" }).setLngLat(feature.geometry.coordinates).setDOMContent(content).addTo(map);
    };
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = ""; };
    map.on("styleimagemissing", missing);
    map.on("click", GLOBES, click); map.on("mouseenter", GLOBES, enter); map.on("mouseleave", GLOBES, leave);
    map.once("remove", () => { popup?.remove(); states.delete(map); });
  }
  state.locations = new globalThis.Map(locations.map(location => [location.id, location]));
  state.drawIcon = drawIcon;
  const features: GeoJSON.Feature[] = locations.map(location => {
    const types = location.threats.map(threat => normalizedType(threat.threat_type));
    const signature = (types.length <= 4 ? types : [...new Set(types)]).sort().join(".");
    return { type: "Feature", geometry: { type: "Point", coordinates: [location.lng, location.lat] }, properties: {
      id: location.id, alert_count: location.threats.length, signature,
      ...Object.fromEntries(TYPES.map(type => [type, types.filter(value => value === type).length])),
    } };
  });
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(SOURCE, { type: "geojson", data, cluster: true, clusterRadius: 60, clusterMaxZoom: 18,
    clusterProperties: Object.fromEntries(["alert_count", ...TYPES].map(type => [type, ["+", ["get", type]]])),
  });
  if (!map.getLayer(GLOBES)) map.addLayer({ id: GLOBES, type: "symbol", source: SOURCE, layout: {
    "icon-image": ["concat", PREFIX, ["case", ["has", "point_count"], ["concat", ...TYPES.map(type => ["case", [">", ["get", type], 0], `${type}.`, ""])], ["get", "signature"]], ":", ["to-string", ["get", "alert_count"]]] as any,
    "icon-size": ["case", [">", ["get", "alert_count"], 1], 0.9, 0.65],
    "icon-allow-overlap": true, "icon-ignore-placement": true,
  } });
  return count;
}

import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";

const SOURCE = "hazard-indicators";
const ICONS = "hazard-icons";
const PREFIX = "hazard-icon:";
const TYPES = ["cyclone", "storm", "flood", "landslide", "earthquake", "outbreak", "cholera", "convergence", "drought", "wildfire", "other"];
export const HAZARD_COLORS: Record<string, string> = { cyclone: "#ef4444", storm: "#ef4444", flood: "#3b82f6", landslide: "#f97316", earthquake: "#a16207", outbreak: "#ec4899", cholera: "#ec4899", convergence: "#8b5cf6", drought: "#eab308", wildfire: "#f97316", other: "#94a3b8" };
const SEVERITY_SCALE: Record<string, number> = { extreme: 1, high: 0.85, moderate: 0.72, medium: 0.72, low: 0.62 };
const ICON_PX = 44;
// Events reported at exactly the same point are fanned out by this many pixels.
const FAN_PX = 22;

type DrawIcon = (type: string, color: string, size: number) => HTMLCanvasElement;
type State = { threats: globalThis.Map<string, any>; drawIcon: DrawIcon };
const states = new WeakMap<Map, State>();
const normalizedType = (type: string) => TYPES.includes(type) ? type : "other";

function iconImage(type: string, drawIcon: DrawIcon) {
  const canvas = drawIcon(type, HAZARD_COLORS[type], ICON_PX);
  const ctx = canvas.getContext("2d")!;
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: canvas.width / ICON_PX };
}

const fmtDate = (value: unknown) => {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
};

/** One detection, every field the feed supplied, nothing inferred. */
function detailContent(threat: any): HTMLElement {
  const d = threat.detection_details ?? {};
  const g = d.gdacs ?? {};
  const color = HAZARD_COLORS[normalizedType(threat.threat_type)];
  const root = document.createElement("div");
  root.style.cssText = "padding:12px 14px;color:#152a36;max-width:340px;font:12px/1.45 system-ui,sans-serif";

  const title = document.createElement("div");
  title.style.cssText = `font-weight:700;font-size:14px;color:${color};margin-bottom:2px`;
  title.textContent = threat.title || `${threat.threat_type} event`;
  root.append(title);

  const badge = document.createElement("div");
  badge.style.cssText = "text-transform:uppercase;letter-spacing:.04em;font-size:10px;font-weight:600;color:#4b5f6b;margin-bottom:8px";
  badge.textContent = `${threat.threat_type} · ${threat.severity || "unknown severity"}${g.alertlevel ? ` · GDACS ${g.alertlevel} alert` : ""}`;
  root.append(badge);

  const rows: [string, string | null][] = [
    ["Issued by", d.source_name || threat.source || null],
    ["Period", [fmtDate(d.from_date ?? threat.timestamp), fmtDate(d.to_date)].filter(Boolean).join(" → ") || null],
    ["Countries", Array.isArray(d.countries) && d.countries.length ? d.countries.join(", ") : null],
    ["Severity", g.severity_text || (d.max_sustained_wind_kt_1min ? `${d.max_sustained_wind_kt_1min} kt sustained${d.gust_kt ? `, gusts ${d.gust_kt} kt` : ""}` : null)],
    ["Category", d.category || null],
    ["Alert score", g.alertscore != null ? String(g.alertscore) : null],
    ["Episode", g.episodeid != null ? `${g.episodeid}${g.episodealertlevel ? ` (${g.episodealertlevel})` : ""}` : null],
    ["GLIDE", g.glide || null],
    ["Magnitude", d.magnitude != null ? `M${d.magnitude}${d.depth_km != null ? `, depth ${d.depth_km} km` : ""}` : null],
    ["Location", `${Number(threat.center_lat).toFixed(2)}, ${Number(threat.center_lng).toFixed(2)}`],
    ["Last confirmed", fmtDate(threat.last_seen_at)],
  ];
  const table = document.createElement("div");
  table.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:3px 10px";
  for (const [label, value] of rows) {
    if (!value) continue;
    const k = document.createElement("span"); k.style.color = "#6b7c86"; k.textContent = label;
    const v = document.createElement("span"); v.textContent = value;
    table.append(k, v);
  }
  root.append(table);

  if (threat.description && threat.description !== threat.title) {
    const desc = document.createElement("p");
    desc.style.cssText = "margin:8px 0 0;color:#2c4350";
    desc.textContent = threat.description;
    root.append(desc);
  }
  const link = d.report_url;
  if (typeof link === "string" && /^https?:\/\//.test(link)) {
    const a = document.createElement("a");
    a.href = link; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.style.cssText = "display:inline-block;margin-top:8px;color:#17618a;text-decoration:underline";
    a.textContent = "Official report ↗";
    root.append(a);
  }
  return root;
}

/** One icon per detection: no grouping, no clustering, no container. */
export function renderThreatIndicators(map: Map, threats: any[], drawIcon: DrawIcon) {
  let state = states.get(map);
  if (!state && !threats.length) return 0;
  if (!state) {
    state = { threats: new globalThis.Map(), drawIcon };
    states.set(map, state);
    let popup: maplibregl.Popup | undefined;
    const missing = (event: { id: string }) => {
      if (!event.id.startsWith(PREFIX) || map.hasImage(event.id)) return;
      const { image, pixelRatio } = iconImage(event.id.slice(PREFIX.length), states.get(map)!.drawIcon);
      map.addImage(event.id, image, { pixelRatio });
    };
    const click = (event: any) => {
      const feature = event.features?.[0];
      const threat = feature && states.get(map)?.threats.get(String(feature.properties.id));
      if (!threat) return;
      popup?.remove();
      popup = new maplibregl.Popup({ maxWidth: "360px" }).setLngLat(feature.geometry.coordinates).setDOMContent(detailContent(threat)).addTo(map);
    };
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = ""; };
    map.on("styleimagemissing", missing);
    map.on("click", ICONS, click); map.on("mouseenter", ICONS, enter); map.on("mouseleave", ICONS, leave);
    map.once("remove", () => { popup?.remove(); states.delete(map); });
  }
  state.drawIcon = drawIcon;
  state.threats = new globalThis.Map(threats.map(t => [String(t.id), t]));

  const atPoint = new globalThis.Map<string, number>();
  const features: GeoJSON.Feature[] = threats
    .filter(t => Number.isFinite(Number(t.center_lat)) && Number.isFinite(Number(t.center_lng)))
    .map(t => {
      const lat = Number(t.center_lat), lng = Number(t.center_lng);
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      const k = atPoint.get(key) ?? 0;
      atPoint.set(key, k + 1);
      const angle = k * 2.39996; // golden angle keeps fanned icons apart
      const offset = k === 0 ? [0, 0] : [Math.cos(angle) * FAN_PX * Math.sqrt(k), Math.sin(angle) * FAN_PX * Math.sqrt(k)];
      const type = normalizedType(String(t.threat_type ?? "").toLowerCase());
      return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {
        id: String(t.id), icon: PREFIX + type, scale: SEVERITY_SCALE[String(t.severity).toLowerCase()] ?? 0.7, offset,
      } };
    });

  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(SOURCE, { type: "geojson", data });
  if (!map.getLayer(ICONS)) map.addLayer({ id: ICONS, type: "symbol", source: SOURCE, layout: {
    "icon-image": ["get", "icon"],
    "icon-size": ["get", "scale"],
    "icon-offset": ["get", "offset"],
    "icon-allow-overlap": true, "icon-ignore-placement": true,
  } as any });
  return features.length;
}

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type * as maptilersdk from "@maptiler/sdk";
import type { EnsoState } from "@/lib/warnings/engine";
import { whenStyleReady } from "@/lib/mapReady";
import type { EnsoContext } from "@/hooks/useEnsoContext";

const SOURCE = "enso-elnino";
const AREA_SOURCE = "enso-nino34";
const ICON_LAYER = "enso-elnino-icons";
const AREA_FILL = "enso-nino34-fill";
const AREA_LINE = "enso-nino34-line";
const ICON = "enso-elnino-icon";
const ICON_PX = 52;
const ONI_DATA_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
const ENSO_INFO_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/";

// Commonly used ONI strength classes (a convention, not an official NOAA category).
function strength(oni: number): string {
  const a = Math.abs(oni);
  if (a >= 2.0) return "Very strong";
  if (a >= 1.5) return "Strong";
  if (a >= 1.0) return "Moderate";
  return "Weak";
}

// Where and when El Niño's African teleconnections are expected (WMO / ICPAC / SADC
// climate outlooks). Months are 1-12; each region shows only during its season.
const IMPACT_REGIONS = [
  {
    id: "east-africa", lat: 1.0, lon: 38.5, months: [10, 11, 12],
    season: "October–December short rains",
    effect: "Enhanced rainfall is more likely, raising the risk of flooding and flash floods.",
    countries: "Kenya, Somalia, southern Ethiopia, Uganda, Rwanda, Burundi, northern Tanzania",
  },
  {
    id: "southern-africa", lat: -19.0, lon: 28.0, months: [11, 12, 1, 2, 3],
    season: "November–March rainy season",
    effect: "Below-normal rainfall and higher temperatures are more likely, raising drought risk.",
    countries: "Zimbabwe, Zambia, Malawi, Mozambique, Botswana, South Africa, southern Madagascar",
  },
];

// Niño 3.4: the NOAA region (5°N–5°S, 170°W–120°W) whose sea-surface anomaly is the ONI.
const NINO34: GeoJSON.Feature = {
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[-170, -5], [-120, -5], [-120, 5], [-170, 5], [-170, -5]]] },
  properties: { kind: "nino34" },
};

/** Warm-ocean badge: orange-red disc, sun, and a white wave. */
function drawElNinoIcon(): { image: ImageData; pixelRatio: number } {
  const dpr = window.devicePixelRatio || 1;
  const s = ICON_PX * dpr;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const c = ICON_PX / 2, r = ICON_PX * 0.44;
  const disc = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
  disc.addColorStop(0, "#fdba74");
  disc.addColorStop(0.55, "#f97316");
  disc.addColorStop(1, "#b91c1c");
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = disc; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  // Sun
  ctx.beginPath(); ctx.arc(c + r * 0.28, c - r * 0.3, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "#fef08a"; ctx.fill();
  ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(c + r * 0.28 + Math.cos(a) * r * 0.3, c - r * 0.3 + Math.sin(a) * r * 0.3);
    ctx.lineTo(c + r * 0.28 + Math.cos(a) * r * 0.42, c - r * 0.3 + Math.sin(a) * r * 0.42);
    ctx.stroke();
  }
  // Waves
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.6; ctx.lineJoin = "round";
  for (const [dy, amp] of [[0.18, 0.12], [0.45, 0.1]] as const) {
    ctx.beginPath();
    for (let x = -0.72; x <= 0.72; x += 0.04) {
      const y = c + r * dy + Math.sin((x + 0.72) * Math.PI * 2.2) * r * amp;
      x === -0.72 ? ctx.moveTo(c + x * r, y) : ctx.lineTo(c + x * r, y);
    }
    ctx.stroke();
  }
  return { image: ctx.getImageData(0, 0, s, s), pixelRatio: dpr };
}

const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
const MARK: Record<string, string> = { true: "✓", false: "✗", null: "–" };

function popupContent(enso: EnsoState, region: (typeof IMPACT_REGIONS)[number] | null, context: EnsoContext | null): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "padding:12px 14px;color:#152a36;max-width:380px;max-height:70vh;overflow:auto;font:12px/1.45 system-ui,sans-serif";
  const add = (tag: string, text: string, css: string, parent: HTMLElement = root) => {
    const el = document.createElement(tag); el.textContent = text; el.style.cssText = css; parent.append(el); return el;
  };
  const section = (title: string) => add("div", title, "margin:10px 0 4px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7c2d12");
  const oni = context?.oni.value ?? enso.oni ?? 0;
  add("div", `El Niño · ${strength(oni)}*`, "font-weight:700;font-size:14px;color:#c2410c");
  add("div", `ONI ${signed(oni)} °C · ${context ? `${context.oni.season} ${context.oni.year}` : enso.season ?? ""}${enso.stale ? " · last known reading" : ""}`,
    "font-size:11px;font-weight:600;color:#4b5f6b");

  if (context) {
    const o = context.oni;
    section("Global driver · Pacific");
    const r = o.rank_for_season;
    add("div", `${r.record ? "Highest" : `#${r.rank} highest`} ${o.season} value in the record (${r.of} years since 1950).`, "");
    add("div", `Change over the last 3 months: ${signed(o.change_3_months)} °C · Niño 3.4 sea surface ${o.niño34_sst_c.toFixed(2)} °C.`, "");
  }

  if (region) {
    section(`What it means · ${region.season}`);
    add("div", region.effect, "");
    add("div", `Typically affected: ${region.countries}.`, "color:#2c4350;margin-top:2px");

    const local = context?.regions.find(x => x.id === region.id);
    if (local?.signals.length) {
      section("Local evidence · triangulation");
      if (local.agreement) {
        add("div", `${local.agreement.consistent} of ${local.agreement.of} counted local signals point ${local.expected}, as El Niño implies.`,
          `font-weight:600;color:${local.agreement.of && local.agreement.consistent === local.agreement.of ? "#b45309" : "#2c4350"}`);
      }
      const table = document.createElement("div");
      table.style.cssText = "display:grid;grid-template-columns:1fr auto auto;gap:4px 8px;margin-top:4px;align-items:baseline";
      for (const s of local.signals) {
        add("span", `${s.name}${s.counted ? "" : " (not counted)"}`, "color:#2c4350", table);
        const value = s.value_mm != null
          ? `${s.value_mm} mm vs ${s.normal_mm} (${s.pct_of_normal}%)`
          : s.value != null ? `${signed(s.value)} °C${s.month ? ` (${s.month})` : ""}` : s.error ?? "";
        add("span", value, "text-align:right;white-space:nowrap", table);
        add("span", `${MARK[String(s.consistent)]} ${s.category}`, `white-space:nowrap;font-weight:600;color:${s.consistent ? "#b45309" : "#6b7c86"}`, table);
        if (s.members_above_upper_tercile_pct != null) {
          add("span", `${s.members_above_upper_tercile_pct}% of ensemble members in the wettest third, ${s.members_below_lower_tercile_pct}% in the driest`,
            "grid-column:1/-1;color:#6b7c86;font-size:11px", table);
        }
        if (s.note) add("span", s.note, "grid-column:1/-1;color:#6b7c86;font-size:11px", table);
      }
      root.append(table);
      if (local.climate_baseline) add("div", `Normal = median of ${local.climate_baseline}; "above/below normal" = wettest/driest third.`, "margin-top:4px;color:#6b7c86;font-size:11px");
    } else if (local && !local.in_season) {
      add("div", "Local evidence is evaluated when this region's season starts.", "margin-top:4px;color:#6b7c86;font-size:11px");
    }
  }

  if (context?.oni.analogs.length) {
    section("Historical analogues · same season");
    for (const a of context.oni.analogs) {
      add("div", `${a.year}: ${signed(a.value_same_season)} → peaked ${signed(a.peak)} (${a.peak_season})`, "");
    }
  }

  if (region) {
    add("p", "El Niño is seasonal climate context, not a local observation. Local alert levels come from rainfall data.",
      "margin:10px 0 0;color:#6b7c86;font-size:11px");
  } else {
    add("p", "Niño 3.4 region (5°N–5°S, 170°W–120°W). The Oceanic Niño Index is the 3-month mean sea-surface temperature anomaly here.",
      "margin:0");
  }
  add("div", "*Strength class is a common ONI convention (≥0.5 weak, ≥1.0 moderate, ≥1.5 strong, ≥2.0 very strong), not an official NOAA category.",
    "margin-top:6px;color:#6b7c86;font-size:10px");
  for (const [label, href] of [["NOAA ONI data ↗", ONI_DATA_URL], ["NOAA ENSO advisory ↗", ENSO_INFO_URL]]) {
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = label;
    a.style.cssText = "display:inline-block;margin:8px 12px 0 0;color:#17618a;text-decoration:underline";
    root.append(a);
  }
  return root;
}

/** El Niño on the map: impact-region badges in season, plus the Niño 3.4 source region. */
export default function ElNinoLayer({ map, enso, context }: { map: maptilersdk.Map | null; enso: EnsoState; context: EnsoContext | null }) {
  const ensoRef = useRef(enso);
  ensoRef.current = enso;
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!map) return;
    const active = enso.phase === "El Niño" && Number.isFinite(enso.oni);
    const month = new Date().getUTCMonth() + 1;
    const oniLabel = `El Niño · ONI ${(enso.oni ?? 0) >= 0 ? "+" : ""}${(enso.oni ?? 0).toFixed(1)}`;
    const points: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: active
        ? IMPACT_REGIONS.filter(r => r.months.includes(month)).map(r => {
            const agreement = context?.regions.find(x => x.id === r.id)?.agreement;
            const label = agreement?.of ? `${oniLabel}\n${agreement.consistent}/${agreement.of} local signals agree` : oniLabel;
            return {
              type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] },
              properties: { region: r.id, label },
            };
          })
        : [],
    };
    const area: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: active ? [NINO34] : [] };

    return whenStyleReady(map, () => {
      if (!map.hasImage(ICON)) { const { image, pixelRatio } = drawElNinoIcon(); map.addImage(ICON, image, { pixelRatio }); }
      const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(points);
        (map.getSource(AREA_SOURCE) as maplibregl.GeoJSONSource).setData(area);
        return;
      }
      map.addSource(AREA_SOURCE, { type: "geojson", data: area });
      map.addLayer({ id: AREA_FILL, type: "fill", source: AREA_SOURCE, paint: { "fill-color": "#f97316", "fill-opacity": 0.18 } });
      map.addLayer({ id: AREA_LINE, type: "line", source: AREA_SOURCE, paint: { "line-color": "#f97316", "line-width": 2, "line-dasharray": [3, 2] } });
      map.addSource(SOURCE, { type: "geojson", data: points });
      map.addLayer({
        id: ICON_LAYER, type: "symbol", source: SOURCE,
        layout: {
          "icon-image": ICON, "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true,
          "text-field": ["get", "label"], "text-font": ["Rubik Bold", "Noto Sans Bold"], "text-size": 12,
          "text-offset": [0, 2.4], "text-anchor": "top", "text-allow-overlap": true,
        },
        paint: { "text-color": "#fff7ed", "text-halo-color": "#7c2d12", "text-halo-width": 1.6 },
      });

      let popup: maplibregl.Popup | undefined;
      const show = (lngLat: maplibregl.LngLatLike, region: (typeof IMPACT_REGIONS)[number] | null) => {
        popup?.remove();
        popup = new maplibregl.Popup({ maxWidth: "400px" }).setLngLat(lngLat).setDOMContent(popupContent(ensoRef.current, region, contextRef.current)).addTo(map as any);
      };
      map.on("click", ICON_LAYER, (e: any) => {
        const f = e.features?.[0];
        show(f.geometry.coordinates, IMPACT_REGIONS.find(r => r.id === f.properties.region) ?? null);
      });
      map.on("click", AREA_FILL, (e: any) => show(e.lngLat, null));
      for (const id of [ICON_LAYER, AREA_FILL]) {
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }
    });
  }, [map, enso, context]);

  return null;
}

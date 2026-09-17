import type * as maptilersdk from "@maptiler/sdk";

/**
 * Country borders on the stock basemap are hairlines tuned for a light style;
 * against this dark backdrop, under a translucent weather raster, they mostly
 * disappear at the zoom levels the map actually opens on.
 *
 * Rather than mutate the basemap's own boundary layers (whose ids and widths
 * differ per style and change when MapTiler revises one), this adds dedicated
 * layers on top of the same vector source. Fully reversible, and the widths
 * below are ours rather than a patch over someone else's.
 */

export const BOUNDARY_LAYER_PREFIX = "boundary-";

const COUNTRY_CASING = "boundary-country-casing";
const COUNTRY_LINE = "boundary-country-line";
const REGION_LINE = "boundary-region-line";

export const BOUNDARY_LAYER_IDS = [COUNTRY_CASING, COUNTRY_LINE, REGION_LINE] as const;

/** OpenMapTiles vector schema: the layer carrying admin boundaries. */
const BOUNDARY_SOURCE_LAYER = "boundary";

/**
 * A dark casing under a bright line keeps borders readable over both the pale
 * ocean and a saturated precipitation overlay, which a single stroke cannot do.
 */
const CASING_COLOR = "rgba(6, 14, 26, 0.6)";
const COUNTRY_COLOR = "rgba(232, 247, 255, 0.92)";
const REGION_COLOR = "rgba(196, 224, 240, 0.34)";

/** Zoom-interpolated so the global view (z2) is legible without going heavy when zoomed in. */
const countryWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  1, 1.4,
  4, 2.6,
  8, 4.0,
  12, 5.6,
];

const casingWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  1, 3.2,
  4, 5.0,
  8, 7.2,
  12, 9.4,
];

const regionWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  3, 0.6,
  8, 1.4,
  12, 2.2,
];

type AnyLayer = { id: string; type: string; source?: string; "source-layer"?: string };

/** Find the vector source actually backing boundaries in whichever style loaded. */
function findBoundarySource(map: maptilersdk.Map): string | null {
  const layers = (map.getStyle()?.layers ?? []) as AnyLayer[];
  const hit = layers.find((l) => l["source-layer"] === BOUNDARY_SOURCE_LAYER && !!l.source);
  return hit?.source ?? null;
}

/** Keep borders beneath place labels and threat markers. */
function firstLabelLayerId(map: maptilersdk.Map): string | undefined {
  const layers = (map.getStyle()?.layers ?? []) as AnyLayer[];
  return layers.find(
    (l) => l.type === "symbol" || /^(threat-|hazard-|cluster-|copernicus-|imerg-)/.test(l.id),
  )?.id;
}

export function addBoundaryLayers(map: maptilersdk.Map): boolean {
  if (map.getLayer(COUNTRY_LINE)) return true;

  const source = findBoundarySource(map);
  if (!source) {
    // A style without an OpenMapTiles boundary layer: leave the basemap alone
    // rather than guessing at a source name.
    console.warn("[boundaries] no vector boundary layer in this style; skipping");
    return false;
  }

  const before = firstLabelLayerId(map);

  // admin_level <= 2 is the country tier in the OpenMapTiles schema; maritime
  // borders are excluded so coastlines are not double-stroked.
  const countryFilter: maptilersdk.FilterSpecification = [
    "all",
    ["<=", ["get", "admin_level"], 2],
    ["!=", ["get", "maritime"], 1],
  ];

  map.addLayer(
    {
      id: COUNTRY_CASING,
      type: "line",
      source,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: countryFilter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": CASING_COLOR,
        "line-width": casingWidth,
        "line-blur": 0.8,
      },
    } as maptilersdk.LayerSpecification,
    before,
  );

  map.addLayer(
    {
      id: COUNTRY_LINE,
      type: "line",
      source,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: countryFilter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": COUNTRY_COLOR,
        "line-width": countryWidth,
      },
    } as maptilersdk.LayerSpecification,
    before,
  );

  // States/provinces stay deliberately faint: they are context, not the point.
  map.addLayer(
    {
      id: REGION_LINE,
      type: "line",
      source,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: [
        "all",
        [">", ["get", "admin_level"], 2],
        ["<=", ["get", "admin_level"], 4],
        ["!=", ["get", "maritime"], 1],
      ] as maptilersdk.FilterSpecification,
      layout: { "line-join": "round" },
      paint: {
        "line-color": REGION_COLOR,
        "line-width": regionWidth,
        "line-dasharray": [2, 2],
      },
    } as maptilersdk.LayerSpecification,
    before,
  );

  return true;
}

export function removeBoundaryLayers(map: maptilersdk.Map): void {
  for (const id of BOUNDARY_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
}

export function setBoundariesVisible(map: maptilersdk.Map, visible: boolean): void {
  for (const id of BOUNDARY_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }
}

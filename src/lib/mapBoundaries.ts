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

/**
 * Two tile schemas are in use: OpenMapTiles puts every admin line in "boundary"
 * (filtered by admin_level); MapTiler Planet v4 (the -v4 styles) splits them into
 * "country_border" and "sub_border".
 */
type BorderSchema = {
  source: string;
  country: { sourceLayer: string; filter: maptilersdk.FilterSpecification };
  region: { sourceLayer: string; filter: maptilersdk.FilterSpecification };
};

/**
 * A dark casing under a bright line keeps borders readable over both the pale
 * ocean and a saturated precipitation overlay, which a single stroke cannot do.
 */

const CASING_COLOR = "rgba(6, 14, 26, 0.6)";
const COUNTRY_COLOR = "rgba(3, 6, 8, 0.2)";
const REGION_COLOR = "rgba(196, 224, 240, 0.34)";

/** Zoom-interpolated so the global view (z2) is legible without going heavy when zoomed in. */
const countryWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  1, 2.4,
  4, 3.6,
  8, 5.2,
  12, 7.0,
];

const casingWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  1, 5.0,
  4, 7.0,
  8, 9.6,
  12, 12.4,
];

const regionWidth: maptilersdk.ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  3, 1.0,
  8, 1.8,
  12, 2.6,
];

type AnyLayer = { id: string; type: string; source?: string; "source-layer"?: string };

/** Find the vector source and schema actually backing borders in whichever style loaded. */
function findBorderSchema(map: maptilersdk.Map): BorderSchema | null {
  const layers = (map.getStyle()?.layers ?? []) as AnyLayer[];
  const v4 = layers.find((l) => l["source-layer"] === "country_border" && !!l.source);
  if (v4?.source) {
    return {
      source: v4.source,
      country: { sourceLayer: "country_border", filter: ["==", ["get", "maritime"], false] },
      // Planet v4 sub_border: admin_level 30 = states/provinces, 40 = next tier.
      region: {
        sourceLayer: "sub_border",
        filter: ["all", ["<=", ["get", "admin_level"], 40], ["==", ["get", "maritime"], false]],
      },
    };
  }
  const omt = layers.find((l) => l["source-layer"] === "boundary" && !!l.source);
  if (omt?.source) {
    // admin_level <= 2 is the country tier in the OpenMapTiles schema; maritime
    // borders are excluded so coastlines are not double-stroked.
    return {
      source: omt.source,
      country: {
        sourceLayer: "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 1], ["!=", ["get", "maritime"], 1]],
      },
      region: {
        sourceLayer: "boundary",
        filter: ["all", [">", ["get", "admin_level"], 1], ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      },
    };
  }
  return null;
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

  const schema = findBorderSchema(map);
  if (!schema) {
    // A style with no known border layer: leave the basemap alone rather than
    // guessing at a source name.
    console.warn("[boundaries] no vector border layer in this style; skipping");
    return false;
  }

  const before = firstLabelLayerId(map);
  const { source, country, region } = schema;

  map.addLayer(
    {
      id: COUNTRY_CASING,
      type: "line",
      source,
      "source-layer": country.sourceLayer,
      filter: country.filter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": CASING_COLOR,
        "line-width": 0.5, // minimum width to avoid disappearing at z0
        "line-blur": 0.2,
      },
    } as maptilersdk.LayerSpecification,
    before,
  );

  map.addLayer(
    {
      id: COUNTRY_LINE,
      type: "line",
      source,
      "source-layer": country.sourceLayer,
      filter: country.filter,
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
      "source-layer": region.sourceLayer,
      filter: region.filter,
      layout: { "line-join": "round" },
      paint: {
        "line-color": REGION_COLOR,
        "line-width": regionWidth,
        "line-dasharray": [1, 1],
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

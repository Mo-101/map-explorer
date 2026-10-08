import type { Map, GeoJSONSource } from "@maptiler/sdk";
const SOURCE = "weather-wind-vectors";
const LAYER = "weather-wind-vector-symbols";
const IMAGE = "weather-wind-vector-icon";

/** Sample decoded weather tiles; never invent wind vectors. */
export function updateWindArrows(map: Map, wind: { pickAt: (lng: number, lat: number) => any }) {
  const canvas = map.getCanvas();
  const features: GeoJSON.Feature[] = [];
  for (let y = 40; y < canvas.clientHeight; y += 80) {
    for (let x = 40; x < canvas.clientWidth; x += 80) {
      const point = map.unproject([x, y]);
      const value = wind.pickAt(point.lng, point.lat);
      if (!Number.isFinite(value?.directionAngle) || !Number.isFinite(value?.speedMetersPerSecond)) continue;
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [point.lng, point.lat] }, properties: { bearing: value.directionAngle, speed: value.speedMetersPerSecond } });
    }
  }
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  if (!map.hasImage(IMAGE)) {
    const icon = document.createElement("canvas"); icon.width = icon.height = 28;
    const ctx = icon.getContext("2d")!;
    ctx.strokeStyle = "#152a36"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(14, 24); ctx.lineTo(14, 4); ctx.moveTo(6, 12); ctx.lineTo(14, 4); ctx.lineTo(22, 12); ctx.stroke();
    ctx.strokeStyle = "#edf6ff"; ctx.lineWidth = 2.5; ctx.stroke();
    map.addImage(IMAGE, ctx.getImageData(0, 0, 28, 28));
  }
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (source) source.setData(data); else map.addSource(SOURCE, { type: "geojson", data });
  if (!map.getLayer(LAYER)) {
    const before = map.getStyle().layers?.find(layer => /^(threat-|hazard-|cluster-|copernicus-|imerg-)/.test(layer.id))?.id;
    map.addLayer({ id: LAYER, type: "symbol", source: SOURCE, layout: {
      "icon-image": IMAGE, "icon-size": 0.8, "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
    } }, before);
  }
  setWindArrowsVisible(map, true);
}
export function setWindArrowsVisible(map: Map, visible: boolean) {
  if (map.getLayer(LAYER)) map.setLayoutProperty(LAYER, "visibility", visible ? "visible" : "none");
}
export function removeWindArrows(map: Map) {
  if (map.getLayer(LAYER)) map.removeLayer(LAYER);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  if (map.hasImage(IMAGE)) map.removeImage(IMAGE);
}

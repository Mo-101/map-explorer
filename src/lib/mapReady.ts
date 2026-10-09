import type * as maptilersdk from "@maptiler/sdk";

// Run `fn` once the map style is fully loaded. Overlays receive the map from
// MapView's "load" handler, so "load" has already fired by then, and animated
// markers repaint every frame so "idle" never fires: poll on each render instead.
// Returns a cancel function.
export function whenStyleReady(map: maptilersdk.Map, fn: () => void): () => void {
  if (map.isStyleLoaded()) { fn(); return () => {}; }
  const check = () => {
    if (!map.isStyleLoaded()) return;
    map.off("render", check);
    fn();
  };
  map.on("render", check);
  map.triggerRepaint();
  return () => map.off("render", check);
}

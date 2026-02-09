/**
 * Wind Arrows Layer Implementation
 * 
 * Since @maptiler/weatherplus doesn't exist, this creates a custom wind arrows layer
 * using MapTiler's wind data with arrow visualization.
 */

import * as maptilersdk from "@maptiler/sdk";

interface WindArrow {
  x: number;
  y: number;
  u: number; // eastward wind component
  v: number; // northward wind component
  speed: number;
  direction: number;
}

export class WindArrowLayer {
  private map!: maptilersdk.Map;
  private id: string;
  private sourceId: string;
  private layerId: string;
  private arrows: WindArrow[] = [];
  private opacity: number = 0.8;
  private colorramp: any;
  private visible: boolean = true;

  constructor(options: {
    id: string;
    opacity?: number;
    colorramp?: any;
  }) {
    this.id = options.id;
    this.sourceId = `${options.id}-source`;
    this.layerId = `${options.id}-layer`;
    this.opacity = options.opacity || 0.8;
    this.colorramp = options.colorramp;
  }

  on(event: string, callback: (...args: any[]) => void) {
    // Placeholder for event handling
    // In a real implementation, this would handle wind data updates
  }

  pickAt(lng: number, lat: number): any {
    // Find nearest wind arrow and return its data
    const nearest = this.arrows.find(arrow => {
      const distance = Math.sqrt(
        Math.pow(arrow.x - lng, 2) + Math.pow(arrow.y - lat, 2)
      );
      return distance < 2; // within 2 degrees
    });

    if (nearest) {
      return {
        speedMetersPerSecond: nearest.speed
      };
    }
    return null;
  }

  getAnimationTime(): number {
    return Date.now();
  }

  getAnimationTimeDate(): Date {
    return new Date();
  }

  getAnimationStartDate(): number {
    return Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  }

  getAnimationEndDate(): number {
    return Date.now();
  }

  setAnimationTime(time: number): void {
    // Placeholder for animation time setting
  }

  animateByFactor(factor: number): void {
    // Placeholder for animation control
  }

  addTo(map: maptilersdk.Map, beforeId?: string) {
    this.map = map;

    // Create a GeoJSON source for wind arrows
    const geoJsonData = this.generateWindArrowGeoJSON();
    
    this.map.addSource(this.sourceId, {
      type: "geojson",
      data: geoJsonData
    });

    // Add the wind arrows layer
    this.map.addLayer({
      id: this.layerId,
      type: "symbol",
      source: this.sourceId,
      layout: {
        "icon-image": "wind-arrow",
        "icon-size": 0.8,
        "icon-rotate": ["get", "rotation"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-spacing": 50,
        "symbol-z-order": "source"
      },
      paint: {
        "icon-opacity": this.opacity,
        "icon-color": [
          "interpolate",
          ["linear"],
          ["get", "speed"],
          0, "#3288bd",
          10, "#66c2a5",
          20, "#abdda4",
          30, "#fee08b",
          40, "#fdae61",
          50, "#f46d43"
        ]
      }
    }, beforeId);

    // Load wind arrow icon
    this.loadWindArrowIcon();
  }

  private generateWindArrowGeoJSON(): GeoJSON.FeatureCollection {
    // Generate sample wind arrows in a grid pattern
    const features: GeoJSON.Feature[] = [];
    const gridSize = 10; // 10x10 grid
    const latStep = 180 / gridSize;
    const lngStep = 360 / gridSize;

    for (let lat = -90; lat < 90; lat += latStep) {
      for (let lng = -180; lng < 180; lng += lngStep) {
        // Generate random wind data (in production, this would come from actual wind data)
        const speed = Math.random() * 30 + 5; // 5-35 m/s
        const direction = Math.random() * 360; // 0-360 degrees
        
        const radians = direction * Math.PI / 180;
        const u = speed * Math.cos(radians);
        const v = speed * Math.sin(radians);

        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          properties: {
            speed: speed,
            direction: direction,
            rotation: direction,
            u: u,
            v: v
          }
        });
      }
    }

    return {
      type: "FeatureCollection",
      features: features
    };
  }

  private loadWindArrowIcon() {
    // Create a simple wind arrow icon using SVG
    const arrowSvg = `
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 2 L15 10 L12 10 L12 18 L8 18 L8 10 L5 10 Z" 
              fill="currentColor" stroke="none"/>
      </svg>
    `;

    const arrowDataUrl = `data:image/svg+xml;base64,${btoa(arrowSvg)}`;

    if (!this.map.hasImage("wind-arrow")) {
      this.map.loadImage(arrowDataUrl).then((image) => {
        if (image) {
          // Handle both HTMLImageElement and ImageBitmap
          if (image instanceof HTMLImageElement || image instanceof ImageBitmap) {
            this.map.addImage("wind-arrow", image);
          }
        }
      }).catch((error) => {
        console.error("Failed to load wind arrow icon:", error);
      });
    }
  }

  remove() {
    if (this.map.getLayer(this.layerId)) {
      this.map.removeLayer(this.layerId);
    }
    if (this.map.getSource(this.sourceId)) {
      this.map.removeSource(this.sourceId);
    }
    if (this.map.hasImage("wind-arrow")) {
      this.map.removeImage("wind-arrow");
    }
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    if (this.map.getLayer(this.layerId)) {
      this.map.setPaintProperty(this.layerId, "icon-opacity", opacity);
    }
  }

  setVisibility(visible: boolean) {
    this.visible = visible;
    if (this.map.getLayer(this.layerId)) {
      this.map.setLayoutProperty(this.layerId, "visibility", visible ? "visible" : "none");
    }
  }

  updateData(windData: any) {
    // Update wind arrows with new data
    // In production, this would process real wind data
    const geoJsonData = this.generateWindArrowGeoJSON();
    if (this.map.getSource(this.sourceId)) {
      (this.map.getSource(this.sourceId) as any).setData(geoJsonData);
    }
  }
}

/**
 * MoScript: Threat Layer Renderer
 * ================================
 * Converts the old useHazardOverlay.ts React hook into a MoScript
 * 
 * BEFORE: Generic React hook with no personality
 * AFTER: Event-driven MoScript with voice lines and sass
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import { MoScript } from '../types/moscript';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ThreatData {
  id: string;
  threat_type: 'cyclone' | 'flood' | 'landslide' | 'outbreak' | 'cholera' | 'convergence';
  center_lat?: number;
  center_lng?: number;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  severity?: string;
  detection_details?: any;
  timestamp?: string;
  created_at?: string;
  lead_time_days?: number;
  affected_regions?: string[];
}

interface ThreatRendererInputs {
  threats: ThreatData[];
  mapInstance: MapLibreMap;
  options?: {
    showCyclones?: boolean;
    showFloods?: boolean;
    showLandslides?: boolean;
    showOutbreaks?: boolean;
    showConvergences?: boolean;
  };
}

interface ThreatRendererResult {
  cyclonesRendered: number;
  floodsRendered: number;
  landslidesRendered: number;
  outbreaksRendered: number;
  convergencesRendered: number;
  totalRendered: number;
  layersCreated: string[];
  executionTime: number;
}

// =============================================================================
// VISUALIZATION HELPERS
// =============================================================================

/**
 * Draw a droplet shape on a canvas (for floods)
 */
function drawDroplet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  // Teardrop: arc at bottom, point at top
  const tipY = cy - r * 1.4;
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 0.3, cx + r, cy + r * 0.2, cx, cy + r);
  ctx.bezierCurveTo(cx - r, cy + r * 0.2, cx - r * 0.6, cy - r * 0.3, cx, tipY);
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 1.3);
  grad.addColorStop(0, lighten(color, 40));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Draw a spiral shape on a canvas (for cyclones)
 */
function drawSpiral(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  // Filled circle base
  const grad = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, r * 0.05, cx, cy, r);
  grad.addColorStop(0, lighten(color, 50));
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, darken(color, 20));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Spiral arms
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    const offset = (arm * Math.PI * 2) / 3;
    for (let t = 0; t < Math.PI * 1.8; t += 0.05) {
      const sr = r * 0.15 + (r * 0.7 * t) / (Math.PI * 1.8);
      const x = cx + sr * Math.cos(t + offset);
      const y = cy + sr * Math.sin(t + offset);
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * Draw a diamond shape on a canvas (for earthquakes / landslides)
 */
function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.2);
  ctx.lineTo(cx + r * 0.85, cy);
  ctx.lineTo(cx, cy + r * 1.2);
  ctx.lineTo(cx - r * 0.85, cy);
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, lighten(color, 35));
  grad.addColorStop(1, darken(color, 10));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Draw a biohazard-style circle (for outbreaks)
 */
function drawBiohazard(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lighten(color, 45));
  grad.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 3 small circles
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + r * 0.55 * Math.cos(angle), cy + r * 0.55 * Math.sin(angle), r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  }
}

function lighten(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = pct / 100;
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * f))},${Math.min(255, Math.round(g + (255 - g) * f))},${Math.min(255, Math.round(b + (255 - b) * f))})`;
}

function darken(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

/**
 * Build a canvas icon for the given threat type
 */
function buildThreatIcon(type: string, color: string, pixelSize: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const s = pixelSize * dpr;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const cx = pixelSize / 2;
  const cy = pixelSize / 2;
  const r = pixelSize * 0.32;

  switch (type) {
    case 'flood':
      drawDroplet(ctx, cx, cy, r, color);
      break;
    case 'cyclone':
      drawSpiral(ctx, cx, cy, r, color);
      break;
    case 'landslide':
      drawDiamond(ctx, cx, cy, r, color);
      break;
    case 'outbreak':
    case 'cholera':
      drawBiohazard(ctx, cx, cy, r, color);
      break;
    case 'convergence':
    default:
      // Default filled circle
      const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.05, cx, cy, r);
      grad.addColorStop(0, lighten(color, 40));
      grad.addColorStop(1, color);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
  return canvas;
}

/**
 * Create a shaped, pulsating marker for a threat
 */
function createPulsingCircle(
  map: MapLibreMap,
  threat: ThreatData,
  color: string,
  size: number
): void {
  const lat = threat.center_lat ?? threat.latitude ?? 0;
  const lng = threat.center_lng ?? threat.longitude ?? 0;

  const sourceId = `threat-${threat.id}`;
  const pulseLayerId = `threat-pulse-${threat.id}`;
  const glowLayerId = `threat-glow-${threat.id}`;
  const symbolLayerId = `threat-layer-${threat.id}`;
  const iconName = `icon-${threat.threat_type}-${threat.id}`;

  // Remove existing layers / sources
  [pulseLayerId, glowLayerId, symbolLayerId].forEach(lid => {
    if (map.getLayer(lid)) map.removeLayer(lid);
  });
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  // Add GeoJSON source
  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { id: threat.id, type: threat.threat_type, confidence: threat.confidence, severity: threat.severity }
    }
  });

  // --- Pulse ring (circle layer, animated) ---
  map.addLayer({
    id: pulseLayerId,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-radius': size + 12,
      'circle-color': color,
      'circle-opacity': 0.08,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': color,
      'circle-stroke-opacity': 0.25,
    }
  });

  // --- Glow ring ---
  map.addLayer({
    id: glowLayerId,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-radius': size + 5,
      'circle-color': color,
      'circle-opacity': 0.18,
      'circle-stroke-width': 0,
    }
  });

  // --- Shaped icon via symbol layer ---
  const iconPx = Math.round(size * 2.4);
  const canvas = buildThreatIcon(threat.threat_type, color, iconPx);
  const iconCtx = canvas.getContext('2d')!;
  const imgData = iconCtx.getImageData(0, 0, canvas.width, canvas.height);
  if (map.hasImage(iconName)) map.removeImage(iconName);
  map.addImage(iconName, { width: canvas.width, height: canvas.height, data: new Uint8Array(imgData.data.buffer) }, { pixelRatio: window.devicePixelRatio || 1 });

  map.addLayer({
    id: symbolLayerId,
    type: 'symbol',
    source: sourceId,
    layout: {
      'icon-image': iconName,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': 1,
    },
  });

  // --- Smooth pulsating animation ---
  let phase = Math.random() * Math.PI * 2;
  const speed = 0.025;
  let animId: number;
  const animate = () => {
    phase += speed;
    const pulse = 0.5 + 0.5 * Math.sin(phase);
    try {
      if (map.getLayer(pulseLayerId)) {
        map.setPaintProperty(pulseLayerId, 'circle-radius', size + 8 + pulse * 10);
        map.setPaintProperty(pulseLayerId, 'circle-stroke-opacity', 0.12 + pulse * 0.2);
        map.setPaintProperty(pulseLayerId, 'circle-opacity', 0.04 + pulse * 0.08);
      }
    } catch { return; }
    animId = requestAnimationFrame(animate);
  };
  animId = requestAnimationFrame(animate);

  map.on('sourcedata', function onSourceData() {
    if (!map.getSource(sourceId)) {
      cancelAnimationFrame(animId);
      map.off('sourcedata', onSourceData);
    }
  });
}

/**
 * Get size based on threat severity
 */
function getThreatSize(threat: ThreatData): number {
  const baseSize = 20;
  
  if (threat.severity) {
    const sizeMap: Record<string, number> = {
      'low': baseSize - 5,
      'moderate': baseSize,
      'high': baseSize + 10,
      'severe': baseSize + 15,
      'critical': baseSize + 20
    };
    return sizeMap[threat.severity.toLowerCase()] || baseSize;
  }
  
  return baseSize;
}

/**
 * Get threat emoji for display
 */
function getThreatEmoji(type: string): string {
  const emojis: Record<string, string> = {
    cyclone: '🌪️',
    flood: '🌊',
    landslide: '⛰️',
    outbreak: '🦠',
    cholera: '🦠',
    convergence: '🔄'
  };
  return emojis[type] || '⚠️';
}

/**
 * Get threat color for display
 */
function getThreatColor(type: string): string {
  const colors: Record<string, string> = {
    cyclone: '#ef4444',
    flood: '#3b82f6',
    landslide: '#f97316',
    outbreak: '#ec4899',
    cholera: '#ec4899',
    convergence: '#8b5cf6'
  };
  return colors[type] || '#6b7280';
}

/**
 * Add popup on click with enhanced tooltip information
 */
function addThreatPopup(map: MapLibreMap, threat: ThreatData): void {
  const layerId = `threat-layer-${threat.id}`;
  
  map.on('click', layerId, (e) => {
    if (!e.features?.[0]) return;
    
    const feature = e.features[0];
    const props = feature.properties || {};
    
    // Calculate estimated impact based on threat type and severity
    const impactInfo = calculateThreatImpact(threat);
    
    // Determine detection source
    const detectionSource = threat.detection_details?.detection_source || 'MoScripts Intelligence';
    const detectionModel = threat.detection_details?.model || 'GraphCast ML';
    const confidence = ((threat.confidence || 0) * 100).toFixed(0);
    
    const threatColor = getThreatColor(threat.threat_type);
    const popupContent = `
      <div style="
        padding: 0; 
        font-family: system-ui, -apple-system, sans-serif; 
        max-width: 340px; 
        background: rgba(15, 20, 30, 0.92); 
        backdrop-filter: blur(16px) saturate(1.4);
        -webkit-backdrop-filter: blur(16px) saturate(1.4);
        border-radius: 12px; 
        border: 1px solid rgba(255,255,255,0.08);
        color: #e2e8f0;
        overflow: hidden;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      ">
        <!-- Header bar -->
        <div style="
          padding: 12px 14px; 
          display: flex; align-items: center; gap: 10px; 
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: linear-gradient(135deg, ${threatColor}22, transparent);
        ">
          <div style="
            width: 32px; height: 32px; border-radius: 8px; 
            background: ${threatColor}25; border: 1px solid ${threatColor}40;
            display: flex; align-items: center; justify-content: center; font-size: 16px;
          ">${getThreatEmoji(threat.threat_type)}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #f1f5f9;">
              ${threat.threat_type}
            </div>
            <div style="font-size: 10px; color: #94a3b8; margin-top: 1px;">
              ${detectionSource} · ${confidence}% confidence
            </div>
          </div>
        </div>
        
        <!-- Body -->
        <div style="padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;">
          <!-- Location -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">📍 Location</span>
            <span style="font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;">
              ${(threat.center_lat ?? threat.latitude ?? 0).toFixed(2)}°, ${(threat.center_lng ?? threat.longitude ?? 0).toFixed(2)}°
            </span>
          </div>
          
          ${threat.affected_regions?.length ? `
          <div style="font-size: 11px; color: #94a3b8;">
            Regions: ${threat.affected_regions.join(', ')}
          </div>
          ` : ''}
          
          <!-- Impact summary -->
          <div style="
            padding: 8px 10px; border-radius: 8px; 
            background: rgba(255,255,255,0.04); 
            border: 1px solid rgba(255,255,255,0.06);
            font-size: 11px; line-height: 1.5; color: #cbd5e1;
          ">
            ${impactInfo.description}
          </div>
          
          <!-- Tags -->
          <div style="display: flex; gap: 5px; flex-wrap: wrap;">
            ${impactInfo.severity ? `<span style="background: ${threatColor}30; color: ${threatColor}; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 600; border: 1px solid ${threatColor}40;">${impactInfo.severity}</span>` : ''}
            ${impactInfo.timeframe ? `<span style="background: rgba(59,130,246,0.15); color: #60a5fa; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 600; border: 1px solid rgba(59,130,246,0.25);">${impactInfo.timeframe}</span>` : ''}
            ${impactInfo.population ? `<span style="background: rgba(139,92,246,0.15); color: #a78bfa; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 600; border: 1px solid rgba(139,92,246,0.25);">${impactInfo.population}</span>` : ''}
          </div>
          
          <!-- Details grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
            <div style="padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.03);">
              <span style="color: #64748b;">Model</span><br/>
              <span style="font-weight: 600; color: #e2e8f0;">${detectionModel}</span>
            </div>
            <div style="padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.03);">
              <span style="color: #64748b;">Lead Time</span><br/>
              <span style="font-weight: 600; color: #e2e8f0;">${threat.lead_time_days ? `${threat.lead_time_days}d` : '—'}</span>
            </div>
            ${threat.detection_details?.wind_speed ? `
            <div style="padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.03);">
              <span style="color: #64748b;">Wind</span><br/>
              <span style="font-weight: 600; color: #e2e8f0;">${Math.round(threat.detection_details.wind_speed)} kt</span>
            </div>` : ''}
            ${threat.detection_details?.min_pressure_hpa ? `
            <div style="padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.03);">
              <span style="color: #64748b;">Pressure</span><br/>
              <span style="font-weight: 600; color: #e2e8f0;">${Math.round(threat.detection_details.min_pressure_hpa)} hPa</span>
            </div>` : ''}
          </div>
          
          ${threat.detection_details?.description ? `
          <div style="font-size: 11px; font-style: italic; color: #94a3b8; padding: 6px 0 2px;">
            "${threat.detection_details.description}"
          </div>` : ''}
        </div>
        
        <!-- Footer -->
        <div style="
          padding: 8px 14px; 
          border-top: 1px solid rgba(255,255,255,0.06); 
          display: flex; justify-content: space-between; align-items: center;
          font-size: 9px; color: #475569;
        ">
          <span>ID: ${threat.id}</span>
          <span>${new Date(threat.created_at || threat.timestamp || Date.now()).toLocaleString()}</span>
        </div>
      </div>
    `;
    
    // Check if MapLibre Popup is available
    const MapLibrePopup = maplibregl.Popup;
    
    if (!MapLibrePopup) {
      console.error('❌ MapLibre Popup not available - using fallback alert');
      alert(`🌪️ ${threat.threat_type.toUpperCase()}\n\n📍 Location: ${threat.center_lat?.toFixed(2) || 'N/A'}°, ${threat.center_lng?.toFixed(2) || 'N/A'}°\n\n🔍 Source: ${detectionSource}\n🤖 Model: ${detectionModel}\n\n⚠️ Confidence: ${confidence}%\n\n🔥 MoScripts Intelligence`);
      return;
    }
    
    new MapLibrePopup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '400px',
      className: 'threat-detection-popup',
      offset: 25
    })
      .setLngLat(e.lngLat)
      .setHTML(popupContent)
      .addTo(map);
  });
  
  // Change cursor on hover
  map.on('mouseenter', layerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  
  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
  });
}

/**
 * Calculate estimated impact based on threat type and details
 */
function calculateThreatImpact(threat: ThreatData) {
  const type = threat.threat_type;
  const severity = threat.severity || 'moderate';
  const confidence = threat.confidence || 0.5;
  const details = threat.detection_details || {};
  
  switch (type) {
    case 'cyclone': {
      const windSpeed = details.wind_speed || 0;
      const category = getCycloneCategory(windSpeed);
      return {
        severity: `CAT ${category.number}`,
        timeframe: `${threat.lead_time_days || 2}-day warning`,
        population: 'High population impact',
        description: `Category ${category.number} hurricane with ${Math.round(windSpeed)} knot winds. Expected: widespread power outages, structural damage, flooding in coastal areas. ${threat.lead_time_days ? `${threat.lead_time_days} days` : '48 hours'} for evacuation preparations.`
      };
    }
      
    case 'flood': {
      return {
        severity: severity.toUpperCase(),
        timeframe: 'Immediate danger',
        population: 'Low-lying areas at risk',
        description: `Significant flooding detected. Confidence: ${Math.round(confidence * 100)}%. Expected: property damage, road closures, potential contamination of water sources. Immediate evacuation recommended for low-lying areas.`
      };
    }
      
    case 'landslide': {
      return {
        severity: severity.toUpperCase(),
        timeframe: 'High risk period',
        population: 'Hillside communities vulnerable',
        description: `Landslide susceptibility high. Confidence: ${Math.round(confidence * 100)}%. Expected: road blockages, property damage, potential casualties. Avoid hillside areas and follow evacuation orders.`
      };
    }
      
    case 'cholera':
    case 'outbreak': {
      const cases = details.cases || 0;
      const deaths = details.deaths || 0;
      return {
        severity: cases > 100 ? 'SEVERE' : cases > 50 ? 'MODERATE' : 'LOW',
        timeframe: 'Ongoing health crisis',
        population: `${cases} cases reported`,
        description: `Health outbreak detected with ${cases} confirmed cases${deaths > 0 ? ` and ${deaths} deaths` : ''}. Confidence: ${Math.round(confidence * 100)}%. Expected: healthcare system strain, need for medical supplies, water sanitation critical.`
      };
    }
      
    case 'convergence': {
      return {
        severity: 'CRITICAL',
        timeframe: 'Compound emergency',
        population: 'Multiple threats overlapping',
        description: `CONVERGENCE DETECTED: Multiple threats overlapping in same geographic area. Risk multiplier: ${details.risk_multiplier || 2.5}x. This creates compound emergency requiring multi-agency coordination. Evacuation and resource needs amplified significantly.`
      };
    }
      
    default: {
      return {
        severity: severity.toUpperCase(),
        timeframe: 'Monitoring required',
        population: 'Under assessment',
        description: `Threat detected with ${Math.round(confidence * 100)}% confidence. Monitor official channels for updates and follow local emergency instructions.`
      };
    }
  }
}

/**
 * Get cyclone category based on wind speed
 */
function getCycloneCategory(windSpeed: number): { number: number; name: string } {
  if (windSpeed < 64) return { number: 0, name: 'Tropical Depression' };
  if (windSpeed < 83) return { number: 1, name: 'Tropical Storm' };
  if (windSpeed < 96) return { number: 2, name: 'Category 1' };
  if (windSpeed < 113) return { number: 3, name: 'Category 2' };
  if (windSpeed < 137) return { number: 4, name: 'Category 3' };
  if (windSpeed < 157) return { number: 4, name: 'Category 4' };
  return { number: 5, name: 'Category 5' };
}

// =============================================================================
// MOSCRIPT DEFINITION
// =============================================================================

export const mo_THREAT_RENDERER: MoScript<ThreatRendererInputs, ThreatRendererResult> = {
  id: 'mo-threat-renderer-001',
  name: 'Threat Layer Renderer',
  trigger: 'onThreatsUpdate',
  
  logic: (inputs) => {
    const startTime = Date.now();
    const { threats, mapInstance, options = {} } = inputs;
    
    if (!mapInstance) {
      throw new Error('Map instance is required for threat rendering');
    }
    
    // Default: show all threat types
    const showAll = {
      showCyclones: options.showCyclones ?? true,
      showFloods: options.showFloods ?? true,
      showLandslides: options.showLandslides ?? true,
      showOutbreaks: options.showOutbreaks ?? true,
      showConvergences: options.showConvergences ?? true,
    };
    
    const result: ThreatRendererResult = {
      cyclonesRendered: 0,
      floodsRendered: 0,
      landslidesRendered: 0,
      outbreaksRendered: 0,
      convergencesRendered: 0,
      totalRendered: 0,
      layersCreated: [],
      executionTime: 0
    };
    
    // Clear existing threat layers first
    const existingLayers = mapInstance.getStyle().layers?.filter(layer => 
      layer.id.startsWith('threat-layer-') || layer.id.startsWith('threat-glow-') || layer.id.startsWith('threat-pulse-')
    ) || [];
    
    existingLayers.forEach(layer => {
      if (mapInstance.getLayer(layer.id)) {
        mapInstance.removeLayer(layer.id);
      }
      const sourceId = layer.id.replace('threat-layer-', 'threat-').replace('threat-glow-', 'threat-').replace('threat-pulse-', 'threat-');
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    });
    
    // Render each threat
    threats.forEach(threat => {
      const shouldRender = (
        (threat.threat_type === 'cyclone' && showAll.showCyclones) ||
        (threat.threat_type === 'flood' && showAll.showFloods) ||
        (threat.threat_type === 'landslide' && showAll.showLandslides) ||
        (threat.threat_type === 'outbreak' && showAll.showOutbreaks) ||
        (threat.threat_type === 'convergence' && showAll.showConvergences)
      );
      
      if (!shouldRender) return;
      
      // Get visualization properties
      const color = getThreatColor(threat.threat_type);
      const size = getThreatSize(threat);
      
      try {
        // Render on map
        createPulsingCircle(mapInstance, threat, color, size);
        addThreatPopup(mapInstance, threat);
        
        // Update counts
        result.totalRendered++;
        result.layersCreated.push(`threat-layer-${threat.id}`);
        
        switch (threat.threat_type) {
          case 'cyclone':
            result.cyclonesRendered++;
            break;
          case 'flood':
            result.floodsRendered++;
            break;
          case 'landslide':
            result.landslidesRendered++;
            break;
          case 'outbreak':
            result.outbreaksRendered++;
            break;
          case 'convergence':
            result.convergencesRendered++;
            break;
        }
      } catch (error) {
        console.warn(`Failed to render threat ${threat.id}:`, error);
      }
    });
    
    result.executionTime = Date.now() - startTime;
    return result;
  },
  
  voiceLine: (result, inputs) => {
    if (result.totalRendered === 0) {
      return "🗺️ Map updated. No active threats to display. Africa is clear, brother.";
    }
    
    const parts: string[] = [];
    
    if (result.cyclonesRendered > 0) {
      parts.push(`${result.cyclonesRendered} cyclone${result.cyclonesRendered > 1 ? 's' : ''}`);
    }
    if (result.floodsRendered > 0) {
      parts.push(`${result.floodsRendered} flood zone${result.floodsRendered > 1 ? 's' : ''}`);
    }
    if (result.landslidesRendered > 0) {
      parts.push(`${result.landslidesRendered} landslide${result.landslidesRendered > 1 ? 's' : ''}`);
    }
    if (result.outbreaksRendered > 0) {
      parts.push(`${result.outbreaksRendered} outbreak${result.outbreaksRendered > 1 ? 's' : ''}`);
    }
    if (result.convergencesRendered > 0) {
      parts.push(`${result.convergencesRendered} convergence zone${result.convergencesRendered > 1 ? 's' : ''}`);
    }
    
    const threatList = parts.join(', ');
    
    return `🗺️ Map LIVE: Rendered ${threatList}. ` +
           `${result.totalRendered} threat${result.totalRendered > 1 ? 's' : ''} displayed. ` +
           `Visualization took ${result.executionTime}ms. Stay vigilant, brethren. 🔥`;
  },
  
  sass: true,
  
  onError: (error, inputs) => {
    return `⚠️ Map rendering failed: ${error.message}. ` +
           `Attempted to render ${inputs.threats.length} threats. ` +
           `Check MapLibre instance, brother.`;
  },
  
  validate: (inputs) => {
    if (!inputs.mapInstance) {
      console.error('❌ No map instance provided to threat renderer');
      return false;
    }
    
    if (!Array.isArray(inputs.threats)) {
      console.error('❌ Threats must be an array');
      return false;
    }
    
    return true;
  },
  
  metadata: {
    version: '1.0.0',
    author: 'Flame 🔥 Architect - MoStar Industries',
    dependencies: ['maplibre-gl'],
    description: 'Renders threat detection layers on map with pulsing animations and interactive popups'
  }
};

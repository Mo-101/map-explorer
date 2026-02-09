/**
 * MoScript: Threat Layer Renderer
 * ================================
 * Converts the old useHazardOverlay.ts React hook into a MoScript
 * 
 * BEFORE: Generic React hook with no personality
 * AFTER: Event-driven MoScript with voice lines and sass
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
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
 * Create pulsing circle layer for a threat
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
  const layerId = `threat-layer-${threat.id}`;
  
  // Remove existing source/layer if present
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
  
  // Add source
  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat]
      },
      properties: {
        id: threat.id,
        type: threat.threat_type,
        confidence: threat.confidence,
        severity: threat.severity
      }
    }
  });
  
  // Add pulsing circle layer
  map.addLayer({
    id: layerId,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-radius': size,
      'circle-color': color,
      'circle-opacity': 0.8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.9
    }
  });
  
  // Add pulsing animation
  animatePulse(map, layerId, size);
}

/**
 * Animate pulsing effect
 */
function animatePulse(map: MapLibreMap, layerId: string, baseSize: number): void {
  let size = baseSize;
  let growing = true;
  let animationId: number;
  
  const animate = () => {
    if (growing) {
      size += 0.5;
      if (size >= baseSize + 5) growing = false;
    } else {
      size -= 0.5;
      if (size <= baseSize) growing = true;
    }
    
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'circle-radius', size);
      animationId = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animationId);
    }
  };
  
  requestAnimationFrame(animate);
}

/**
 * Get color based on threat type
 */
function getThreatColor(threatType: string): string {
  const colors: Record<string, string> = {
    cyclone: '#ff0000',      // Red
    flood: '#0066ff',        // Blue
    landslide: '#ff8800',    // Orange
    outbreak: '#ff00ff',     // Magenta
    convergence: '#ff0088'   // Pink
  };
  
  return colors[threatType] || '#666666';
}

/**
 * Get size based on confidence/severity
 */
function getThreatSize(threat: ThreatData): number {
  const baseSize = 15;
  
  if (threat.confidence) {
    return baseSize + (threat.confidence * 10);
  }
  
  if (threat.severity) {
    const sizeMap: Record<string, number> = {
      'low': baseSize,
      'moderate': baseSize + 5,
      'high': baseSize + 10,
      'severe': baseSize + 15,
      'critical': baseSize + 20
    };
    return sizeMap[threat.severity.toLowerCase()] || baseSize;
  }
  
  return baseSize;
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
    
    const popupContent = `
      <div style="padding: 12px; font-family: system-ui, -apple-system, sans-serif; max-width: 320px;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <div style="
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            background: ${getThreatColor(threat.threat_type)}; 
            margin-right: 8px;
          "></div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">
            ${threat.threat_type.toUpperCase()}
          </h3>
        </div>
        
        <div style="background: #f8fafc; padding: 8px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid ${getThreatColor(threat.threat_type)};">
          <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">📍 Detection Location</div>
          <div style="color: #6b7280; font-size: 14px;">
            ${threat.center_lat?.toFixed(4) || threat.latitude?.toFixed(4) || 'N/A'}°, 
            ${threat.center_lng?.toFixed(4) || threat.longitude?.toFixed(4) || 'N/A'}°
          </div>
          ${threat.affected_regions?.length ? `
            <div style="margin-top: 4px; color: #6b7280;">
              <strong>Regions:</strong> ${threat.affected_regions.join(', ')}
            </div>
          ` : ''}
        </div>
        
        <div style="background: #fef3c7; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #92400e; margin-bottom: 4px;">⚠️ Estimated Impact</div>
          <div style="color: #78350f; font-size: 13px; line-height: 1.4;">
            ${impactInfo.description}
          </div>
          <div style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;">
            ${impactInfo.severity ? `
              <span style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                ${impactInfo.severity}
              </span>
            ` : ''}
            ${impactInfo.timeframe ? `
              <span style="background: #2563eb; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                ${impactInfo.timeframe}
              </span>
            ` : ''}
            ${impactInfo.population ? `
              <span style="background: #7c3aed; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                ${impactInfo.population}
              </span>
            ` : ''}
          </div>
        </div>
        
        <div style="background: #ecfdf5; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #065f46; margin-bottom: 4px;">📊 Detection Details</div>
          <div style="color: #047857; font-size: 13px; line-height: 1.4;">
            <div><strong>Confidence:</strong> ${((threat.confidence || 0) * 100).toFixed(0)}%</div>
            <div><strong>Lead Time:</strong> ${threat.lead_time_days ? `${threat.lead_time_days} days` : 'N/A'}</div>
            ${threat.detection_details?.wind_speed ? `
              <div><strong>Wind Speed:</strong> ${Math.round(threat.detection_details.wind_speed)} knots</div>
            ` : ''}
            ${threat.detection_details?.min_pressure_hpa ? `
              <div><strong>Min Pressure:</strong> ${Math.round(threat.detection_details.min_pressure_hpa)} hPa</div>
            ` : ''}
            ${threat.detection_details?.cases ? `
              <div><strong>Cases:</strong> ${threat.detection_details.cases}</div>
            ` : ''}
            ${threat.detection_details?.deaths ? `
              <div><strong>Deaths:</strong> ${threat.detection_details.deaths}</div>
            ` : ''}
          </div>
        </div>
        
        ${threat.detection_details?.description ? `
          <div style="background: #f3f4f6; padding: 8px; border-radius: 6px; margin-bottom: 8px;">
            <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">📝 Analysis</div>
            <div style="color: #6b7280; font-size: 13px; font-style: italic;">
              "${threat.detection_details.description}"
            </div>
          </div>
        ` : ''}
        
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
          <div><strong>Detected:</strong> ${new Date(threat.created_at || threat.timestamp || Date.now()).toLocaleString()}</div>
          <div><strong>ID:</strong> ${threat.id}</div>
          <div style="margin-top: 4px; color: #059669; font-weight: 600;">
            🔥 MoScripts Intelligence System
          </div>
        </div>
      </div>
    `;
    
    new (window as any).maplibregl.Popup()
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
      layer.id.startsWith('threat-layer-')
    ) || [];
    
    existingLayers.forEach(layer => {
      if (mapInstance.getLayer(layer.id)) {
        mapInstance.removeLayer(layer.id);
      }
      const sourceId = layer.id.replace('threat-layer-', 'threat-');
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

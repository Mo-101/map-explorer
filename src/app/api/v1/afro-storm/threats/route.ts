/**
 * AFRO STORM Threats API
 * Returns active health threats detected from weather forecasts
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// In-memory cache for demo (in production, use Redis)
let threatsCache: any = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate mock AFRO STORM threats for demonstration
 * In production, this would fetch from PostgreSQL/Redis
 */
function generateMockThreats() {
  const now = new Date();
  
  return {
    timestamp: now.toISOString(),
    threats: [
      {
        id: 'cyclone-001',
        threat_type: 'cyclone',
        risk_level: 'severe',
        affected_regions: ['Mozambique', 'Madagascar', 'Malawi'],
        lead_time_days: 3,
        confidence: 0.92,
        center_lat: -19.5,
        center_lng: 36.5,
        detection_details: {
          name: 'Tropical Cyclone Freddy',
          min_pressure_hpa: 945,
          max_wind_speed_ms: 55,
          category: 'Category 4',
          landfall_prediction: '2023-10-25T14:00:00Z',
          population_at_risk: 2500000
        },
        created_at: now.toISOString()
      },
      {
        id: 'cholera-001',
        threat_type: 'cholera',
        risk_level: 'high',
        affected_regions: ['Beira', 'Sofala Province', 'Cabo Delgado'],
        lead_time_days: 7,
        confidence: 0.78,
        center_lat: -19.8,
        center_lng: 34.9,
        detection_details: {
          trigger: 'Cyclone + Flooding',
          predicted_cases: 5000,
          sanitation_risk: 'Critical',
          water_contamination_probability: 0.85,
          recommended_action: 'Pre-position cholera kits, activate oral rehydration points'
        },
        created_at: now.toISOString()
      },
      {
        id: 'lassa-001',
        threat_type: 'lassa',
        risk_level: 'moderate',
        affected_regions: ['Edo State', 'Ondo State', 'Ebonyi State'],
        lead_time_days: 14,
        confidence: 0.65,
        center_lat: 6.5,
        center_lng: 5.6,
        detection_details: {
          trigger: 'Dry season rodent migration pattern',
          predicted_cases: 200,
          season_factor: 'Peak dry season (Dec-April)',
          recommended_action: 'Enhanced surveillance, rodent control measures'
        },
        created_at: now.toISOString()
      },
      {
        id: 'meningitis-001',
        threat_type: 'meningitis',
        risk_level: 'moderate',
        affected_regions: ['Niger', 'Chad', 'Northern Nigeria', 'Cameroon'],
        lead_time_days: 30,
        confidence: 0.71,
        center_lat: 13.5,
        center_lng: 13.0,
        detection_details: {
          trigger: 'Harmattan winds + Low humidity forecast',
          predicted_cases: 1500,
          vaccination_gap: '32% coverage in high-risk districts',
          recommended_action: 'Mass vaccination campaign preparation'
        },
        created_at: now.toISOString()
      },
      {
        id: 'flood-001',
        threat_type: 'flood',
        risk_level: 'high',
        affected_regions: ['Nile Delta', 'Khartoum', 'South Sudan'],
        lead_time_days: 5,
        confidence: 0.83,
        center_lat: 15.5,
        center_lng: 32.5,
        detection_details: {
          trigger: 'Heavy rainfall + Ethiopian highlands runoff',
          river_level_rise: '3.2 meters predicted',
          affected_population: 850000,
          recommended_action: 'Evacuation planning, medical supply pre-positioning'
        },
        created_at: now.toISOString()
      }
    ],
    count: 5,
    sources: ['graphcast', 'ecmwf', 'gdacs'],
    model_version: 'GraphCast_operational_v1'
  };
}

export async function GET() {
  try {
    // Check cache
    const now = Date.now();
    if (threatsCache && (now - cacheTime) < CACHE_TTL) {
      return NextResponse.json(threatsCache, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': `${Math.round((now - cacheTime) / 1000)}s`
        }
      });
    }

    // Generate new threats data
    // In production: fetch from Redis cache populated by ingestion-worker
    const threats = generateMockThreats();
    
    // Update cache
    threatsCache = threats;
    cacheTime = now;

    return NextResponse.json(threats, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300'
      }
    });

  } catch (error) {
    console.error('[AFRO STORM API] Error fetching threats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch AFRO STORM threats',
        threats: [],
        count: 0
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to receive threats from AFRO STORM engine
 * Called by the Python ingestion worker
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate API key (in production, use proper auth)
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== process.env.AFRO_STORM_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Update cache with new data
    threatsCache = body;
    cacheTime = Date.now();

    console.log('[AFRO STORM API] Received new threats:', body.count);

    return NextResponse.json({ 
      success: true, 
      received_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AFRO STORM API] Error receiving threats:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

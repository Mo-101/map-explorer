/**
 * AFRO STORM Threats API (proxy)
 * Fetches live threats from the Python backend instead of generating mock data.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MODEL_SERVICE_URL =
  process.env.MODEL_SERVICE_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:8000';

// Lightweight cache to avoid hammering the backend; still serves real data.
let threatsCache: any = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

export async function GET() {
  try {
    const now = Date.now();
    if (threatsCache && now - cacheTime < CACHE_TTL) {
      return NextResponse.json(threatsCache, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': `${Math.round((now - cacheTime) / 1000)}s`,
        },
      });
    }

    const res = await fetch(`${MODEL_SERVICE_URL}/api/v1/threats`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[AFRO STORM API] Backend error', res.status, text);
      return NextResponse.json(
        { error: `Backend error ${res.status}`, threats: [], count: 0 },
        { status: 502 }
      );
    }

    const data = await res.json();
    threatsCache = data;
    cacheTime = now;

    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (error) {
    console.error('[AFRO STORM API] Fetch failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch threats', threats: [], count: 0 },
      { status: 502 }
    );
  }
}

/**
 * POST endpoint to receive threats from AFRO STORM engine (optional).
 * Kept for compatibility; writes only to in-memory cache.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== process.env.AFRO_STORM_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    threatsCache = body;
    cacheTime = Date.now();

    console.log('[AFRO STORM API] Received new threats:', body.count);

    return NextResponse.json({
      success: true,
      received_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AFRO STORM API] Error receiving threats:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

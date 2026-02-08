import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const METADATA_CACHE_KEY = 'tiles:rainviewer:metadata';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string; layer: string; z: string; x: string; y: string } }
) {
  const { provider, layer, z, x, y } = params;

  if (provider === 'rainviewer') {
    let metadata = await redis.get(METADATA_CACHE_KEY);
    
    if (!metadata) {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (res.ok) {
        const data = await res.json();
        metadata = JSON.stringify({
          host: data.host,
          radar_path: data.radar.past[data.radar.past.length - 1].path
        });
        await redis.set(METADATA_CACHE_KEY, metadata, 'EX', 300); // 5 min cache
      }
    }

    const { host, radar_path } = JSON.parse(metadata || '{"host":"https://tilecache.rainviewer.com","radar_path":"/v2/radar/current"}');
    const tileUrl = `${host}${radar_path}/256/${z}/${x}/${y}/2/1_1.png`;

    const tileResponse = await fetch(tileUrl);
    const blob = await tileResponse.blob();

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
        'X-Proxy-Source': 'AfriGuard-v1'
      }
    });
  }

  return new NextResponse('Provider not supported', { status: 400 });
}
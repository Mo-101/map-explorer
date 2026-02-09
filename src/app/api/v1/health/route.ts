import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { azureBreaker } from '@/lib/circuit-breaker';

export async function GET() {
  const health = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    services: {
      db: 'UNKNOWN',
      redis: 'UNKNOWN',
      model_service: 'UNKNOWN'
    },
    circuit_breakers: {
      azure: 'CLOSED'
    }
  };

  try {
    await db.execute('SELECT 1');
    health.services.db = 'HEALTHY';
  } catch (e) {
    health.services.db = 'UNHEALTHY';
    health.status = 'DEGRADED';
  }

  try {
    await redis.ping();
    health.services.redis = 'HEALTHY';
  } catch (e) {
    health.services.redis = 'UNHEALTHY';
    health.status = 'DEGRADED';
  }

  try {
    const res = await fetch(`${process.env.MODEL_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    health.services.model_service = res.ok ? 'HEALTHY' : 'UNHEALTHY';
  } catch (e) {
    health.services.model_service = 'UNREACHABLE';
  }

  // Reflect breaker states from Redis
  health.circuit_breakers.azure = (await azureBreaker.isOpen()) ? 'OPEN' : 'CLOSED';

  return NextResponse.json(health, { status: health.status === 'UP' ? 200 : 503 });
}

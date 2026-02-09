import { redis } from './redis';

const BREAKER_THRESHOLD = 5;
const COOLDOWN_PERIOD = 600; // 10 minutes

export class CircuitBreaker {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  async isOpen(): Promise<boolean> {
    const state = await redis.get(`breaker:${this.serviceName}:state`);
    if (state === 'OPEN') {
      const openAt = await redis.get(`breaker:${this.serviceName}:opened_at`);
      if (openAt && Date.now() - parseInt(openAt) > COOLDOWN_PERIOD * 1000) {
        await this.halfOpen();
        return false;
      }
      return true;
    }
    return false;
  }

  async recordFailure() {
    const count = await redis.incr(`breaker:${this.serviceName}:failures`);
    await redis.expire(`breaker:${this.serviceName}:failures`, 3600);

    if (count >= BREAKER_THRESHOLD) {
      await redis.set(`breaker:${this.serviceName}:state`, 'OPEN');
      await redis.set(`breaker:${this.serviceName}:opened_at`, Date.now().toString());
    }
  }

  async recordSuccess() {
    await redis.del(`breaker:${this.serviceName}:failures`);
    await redis.set(`breaker:${this.serviceName}:state`, 'CLOSED');
  }

  private async halfOpen() {
    await redis.set(`breaker:${this.serviceName}:state`, 'HALF_OPEN');
  }
}

export const azureBreaker = new CircuitBreaker('azure');

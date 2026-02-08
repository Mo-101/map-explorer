import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => console.error('Redis Client Error', err));

if (!client.isOpen) {
  client.connect();
}

export const redis = {
  get: (key: string) => client.get(key),
  set: (key: string, value: string, mode?: any, duration?: number) => {
    if (mode === 'EX' && duration) {
      return client.set(key, value, { EX: duration });
    }
    return client.set(key, value);
  },
  del: (key: string) => client.del(key),
  incr: (key: string) => client.incr(key),
  expire: (key: string, seconds: number) => client.expire(key, seconds),
  ping: () => client.ping(),
  client: client,
};

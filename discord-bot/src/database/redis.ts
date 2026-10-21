import Redis from 'ioredis';
import { appConfig } from '../config/config';
import { childLogger } from '../utils/logger';

const log = childLogger('redis');

export const redis = new Redis(appConfig.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => log.error({ err }, 'Redis connection error'));
redis.on('connect', () => log.info('Connected to Redis.'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}

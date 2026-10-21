import { PrismaClient } from '@prisma/client';
import { childLogger } from '../utils/logger';

const log = childLogger('database');

/**
 * Single shared Prisma instance. Never instantiate PrismaClient anywhere
 * else — repositories and services import `prisma` from here.
 */
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e: any) => {
  const message = typeof e?.message === 'string' ? e.message : JSON.stringify(e);
  // Neon serverless connection pooler closes idle sockets after 5 minutes.
  // Quaint emits { kind: Closed, cause: None }. Prisma automatically reconnects on the next query.
  if (message.includes('kind: Closed') || message.includes('Closed')) {
    log.debug({ err: e }, 'Prisma pooler idle connection closed (auto-reconnects on query)');
    return;
  }
  log.error({ err: e }, 'Prisma error event');
});

prisma.$on('warn', (e: unknown) => log.warn({ err: e }, 'Prisma warn event'));

let keepAliveInterval: NodeJS.Timeout | null = null;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  log.info('Connected to PostgreSQL.');

  // Keep connection warm with Neon pooler to prevent idle drops and eliminate cold start latency
  if (!keepAliveInterval) {
    keepAliveInterval = setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err) {
        log.debug({ err }, 'PostgreSQL keepalive heartbeat ping failed (will reconnect on next query)');
      }
    }, 45 * 1000); // 45 seconds to keep connection warm and prevent Neon compute scale-to-zero
    keepAliveInterval.unref();
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  await prisma.$disconnect();
  log.info('Disconnected from PostgreSQL.');
}

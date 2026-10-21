import { redis } from '../database/redis';
import { childLogger } from '../utils/logger';

const log = childLogger('cooldownService');

// In-memory fallback if Redis is unavailable or during test environments
const memoryCooldowns = new Map<string, number>();

/**
 * Checks whether a user is currently on cooldown for a given command.
 */
export async function checkCooldown(
  userId: string,
  commandName: string,
  cooldownMs: number,
): Promise<{ onCooldown: boolean; remainingMs: number }> {
  if (!cooldownMs || cooldownMs <= 0) {
    return { onCooldown: false, remainingMs: 0 };
  }

  const key = `cooldown:${userId}:${commandName}`;
  const now = Date.now();

  // 1. Check in-memory map (sub-millisecond instant lookup)
  const memExpire = memoryCooldowns.get(key);
  if (memExpire) {
    if (memExpire > now) {
      return { onCooldown: true, remainingMs: memExpire - now };
    }
    memoryCooldowns.delete(key);
  }

  return { onCooldown: false, remainingMs: 0 };
}

/**
 * Applies a cooldown to a user for a given command.
 * Updates in-memory immediately and syncs to Redis in background without blocking.
 */
export async function setCooldown(
  userId: string,
  commandName: string,
  cooldownMs: number,
): Promise<void> {
  if (!cooldownMs || cooldownMs <= 0) return;

  const key = `cooldown:${userId}:${commandName}`;
  const expiresAt = Date.now() + cooldownMs;
  memoryCooldowns.set(key, expiresAt);

  // Background non-blocking sync to Redis
  const ttlSeconds = Math.ceil(cooldownMs / 1000);
  redis.set(key, expiresAt.toString(), 'EX', ttlSeconds).catch((err) => {
    log.debug({ err, key }, 'Non-blocking Redis cooldown sync failed');
  });
}

/**
 * Clears cooldowns (primarily used for unit testing).
 */
export function clearMemoryCooldowns(): void {
  memoryCooldowns.clear();
}

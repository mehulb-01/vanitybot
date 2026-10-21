import { redis } from '../../database/redis';

export interface AfkData {
  reason: string;
  timestamp: number;
}

// In-memory fallback in case Redis connection is ever unavailable
const memoryAfk = new Map<string, AfkData>();

function makeKey(guildId: string, userId: string): string {
  return `afk:${guildId}:${userId}`;
}

export async function setAfk(
  guildId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const data: AfkData = {
    reason: reason.trim() || 'AFK',
    timestamp: Math.floor(Date.now() / 1000),
  };

  const key = makeKey(guildId, userId);
  memoryAfk.set(key, data);

  try {
    // Retain for up to 7 days
    await redis.set(key, JSON.stringify(data), 'EX', 7 * 86400);
  } catch {
    // In-memory fallback stored
  }
}

export async function getAfk(
  guildId: string,
  userId: string,
): Promise<AfkData | null> {
  const key = makeKey(guildId, userId);

  try {
    const raw = await redis.get(key);
    if (raw) {
      return JSON.parse(raw) as AfkData;
    }
  } catch {
    // Fall back to memory
  }

  const memory = memoryAfk.get(key);
  if (memory) return memory;

  // Fallback to global AFK if not set specifically in this guild
  if (guildId !== 'global') {
    const globalKey = makeKey('global', userId);
    try {
      const rawGlobal = await redis.get(globalKey);
      if (rawGlobal) return JSON.parse(rawGlobal) as AfkData;
    } catch {
      // Ignore
    }
    return memoryAfk.get(globalKey) ?? null;
  }

  return null;
}

export async function clearAfk(
  guildId: string,
  userId: string,
): Promise<AfkData | null> {
  const key = makeKey(guildId, userId);
  const globalKey = makeKey('global', userId);
  const existing = (await getAfk(guildId, userId)) || (await getAfk('global', userId));

  memoryAfk.delete(key);
  memoryAfk.delete(globalKey);

  try {
    await redis.del(key, globalKey);
  } catch {
    // Ignore
  }

  return existing;
}

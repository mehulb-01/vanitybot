import { redis } from '../../database/redis';
import { childLogger } from '../../utils/logger';
import type { Player, SearchPlatform, SearchResult, UnresolvedSearchResult } from 'lavalink-client';

const log = childLogger('trackCache');
const CACHE_TTL_SECONDS = 60 * 30; // 30 min: long enough to help a busy server, short enough to stay fresh

function cacheKey(query: string, source?: SearchPlatform): string {
  return `musicsearch:${source ?? 'direct'}:${query.trim().toLowerCase()}`;
}

/**
 * Wraps player.search() with a Redis cache keyed on the raw query. Popular
 * requests (a song someone just played, a meme link making the rounds)
 * resolve instantly on repeat instead of round-tripping to the source
 * again — this is one of the more noticeable "why did that load instantly"
 * wins for a busy server.
 */
export async function cachedSearch(
  player: Player,
  query: string,
  requesterId: string,
  source?: SearchPlatform,
): Promise<SearchResult | UnresolvedSearchResult> {
  const key = cacheKey(query, source);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as SearchResult;
      log.debug({ query }, 'Track search cache hit.');
      // encoded track data is reusable directly; requester is re-attached fresh
      return parsed;
    }
  } catch (err) {
    log.warn({ err }, 'Redis cache read failed, falling back to live search.');
  }

  const searchQuery = source ? { query, source } : { query };
  const result = await player.search(searchQuery, requesterId);

  // only cache successful, non-empty resolutions
  if (result.loadType !== 'error' && result.loadType !== 'empty') {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      log.warn({ err }, 'Redis cache write failed (non-fatal).');
    }
  }

  return result;
}

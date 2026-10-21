import type { Player, SearchResult, UnresolvedSearchResult } from 'lavalink-client';
import type { BotClient } from '../../bot/client';
import { getOrCreateGuildSettings } from '../../database/repositories/guildSettingsRepository';
import { appConfig } from '../../config/config';
import { childLogger } from '../../utils/logger';
import { cachedSearch } from './trackCache';
import { LoopMode } from '../../types/music';

const log = childLogger('playerService');

export class MusicServiceError extends Error {}

interface JoinContext {
  guildId: string;
  guildName: string;
  voiceChannelId: string;
  textChannelId: string;
}

/**
 * Returns the existing player for a guild, or creates + connects a new one
 * using that guild's saved defaults (volume, idle timeout). One player per
 * guild, always — lavalink-client enforces this, but we centralize the
 * creation path so every command gets identical defaults.
 */
export async function getOrCreatePlayer(client: BotClient, ctx: JoinContext): Promise<Player> {
  const existing = client.lavalink.getPlayer(ctx.guildId);
  if (existing) {
    if (ctx.textChannelId) existing.textChannelId = ctx.textChannelId;
    if (!existing.connected) {
      existing.voiceChannelId = ctx.voiceChannelId;
      await existing.connect();
      log.info({ guildId: ctx.guildId, voiceChannelId: ctx.voiceChannelId }, 'Existing player reconnected.');
    }
    return existing;
  }

  const settings = await getOrCreateGuildSettings(ctx.guildId, ctx.guildName);

  const player = client.lavalink.createPlayer({
    guildId: ctx.guildId,
    voiceChannelId: ctx.voiceChannelId,
    textChannelId: ctx.textChannelId,
    selfDeaf: true,
    selfMute: false,
    volume: settings.defaultVolume ?? appConfig.music.defaultVolume,
    instaUpdateFiltersFix: true,
  });

  await player.connect();
  log.info({ guildId: ctx.guildId, voiceChannelId: ctx.voiceChannelId }, 'Player connected.');
  return player;
}

export function getPlayer(client: BotClient, guildId: string): Player | undefined {
  return client.lavalink.getPlayer(guildId);
}

export function requirePlayer(client: BotClient, guildId: string): Player {
  const player = getPlayer(client, guildId);
  if (!player) {
    throw new MusicServiceError("Nothing's playing. There's nothing to work with here.");
  }
  return player;
}

/**
 * Validates that the invoking member can control the player right now:
 * they must be in the same voice channel the bot is in. (DJ-role gating
 * for privileged actions like force-skip/stop is a natural extension
 * point here once the moderation/permission service exists.)
 */
export function assertSameVoiceChannel(player: Player, memberVoiceChannelId: string | null): void {
  if (!memberVoiceChannelId) {
    throw new MusicServiceError('Join a voice channel first. I only take requests in person.');
  }
  if (memberVoiceChannelId !== player.voiceChannelId) {
    throw new MusicServiceError("We're not in the same voice channel. Come find me.");
  }
}

export type SearchSourceOption = 'auto' | 'youtube' | 'spotify' | 'soundcloud';

export async function searchAndQueue(
  player: Player,
  query: string,
  requesterId: string,
  preferredSource: SearchSourceOption = 'auto',
): Promise<{ result: SearchResult | UnresolvedSearchResult; queuedCount: number }> {
  const maxQueueSize = appConfig.music.maxQueueSize;

  const trimmed = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  const isPrefixed = /^(ytsearch|ytmsearch|scsearch|spsearch|amsearch|dzsearch):/i.test(trimmed);
  let result: SearchResult | UnresolvedSearchResult;

  if (isUrl || isPrefixed) {
    result = await cachedSearch(player, trimmed, requesterId, undefined);
  } else if (preferredSource === 'spotify') {
    result = await cachedSearch(player, trimmed, requesterId, 'spsearch');
    if (result.loadType === 'empty' || result.loadType === 'error' || result.tracks.length === 0) {
      log.info({ query: trimmed }, 'Spotify search returned no tracks; falling back to YouTube Music.');
      result = await cachedSearch(player, trimmed, requesterId, 'ytmsearch');
    }
  } else if (preferredSource === 'soundcloud') {
    result = await cachedSearch(player, trimmed, requesterId, 'scsearch');
  } else if (preferredSource === 'youtube') {
    result = await cachedSearch(player, trimmed, requesterId, 'ytmsearch');
    if (result.loadType === 'empty' || result.loadType === 'error' || result.tracks.length === 0) {
      result = await cachedSearch(player, trimmed, requesterId, 'ytsearch');
    }
  } else {
    // Smart auto-fallback cascade: YouTube Music (official releases) -> YouTube -> SoundCloud
    result = await cachedSearch(player, trimmed, requesterId, 'ytmsearch');
    if (result.loadType === 'empty' || result.loadType === 'error' || result.tracks.length === 0) {
      log.info({ query: trimmed }, 'YouTube Music returned no tracks; falling back to standard YouTube.');
      result = await cachedSearch(player, trimmed, requesterId, 'ytsearch');
    }
    if (result.loadType === 'empty' || result.loadType === 'error' || result.tracks.length === 0) {
      log.info({ query: trimmed }, 'YouTube search returned no tracks; falling back to SoundCloud search.');
      result = await cachedSearch(player, trimmed, requesterId, 'scsearch');
    }
  }

  if (result.loadType === 'error') {
    throw new MusicServiceError("That failed to load. Even the internet has standards, apparently.");
  }
  if (result.loadType === 'empty' || result.tracks.length === 0) {
    throw new MusicServiceError('Found nothing. Try using actual words.');
  }

  const tracksToAdd = result.loadType === 'playlist' ? result.tracks : [result.tracks[0]];
  const availableSlots = maxQueueSize - player.queue.tracks.length;

  if (availableSlots <= 0) {
    throw new MusicServiceError(`Queue's full at ${maxQueueSize} tracks. Let some of these finish first.`);
  }

  const capped = tracksToAdd.slice(0, availableSlots);
  await player.queue.add(capped);

  if ((!player.playing || !player.queue.current) && !player.paused && capped.length > 0) {
    await player.play();
  }

  return { result, queuedCount: capped.length };
}

export async function pause(player: Player): Promise<void> {
  if (player.paused) throw new MusicServiceError('Already paused. I checked.');
  await player.pause();
}

export async function resume(player: Player): Promise<void> {
  if (!player.paused) throw new MusicServiceError("It's already playing. Were you not listening?");
  await player.resume();
}

export async function skip(player: Player): Promise<void> {
  if (!player.queue.current) throw new MusicServiceError('Nothing to skip.');
  await player.skip();
}

export async function stopAndClear(player: Player): Promise<void> {
  await player.stopPlaying(true, false);
}

export async function setVolume(player: Player, volume: number): Promise<void> {
  if (volume < 0 || volume > 200) {
    throw new MusicServiceError('Pick a volume between 0 and 200. This is not a rocket launch.');
  }
  await player.setVolume(volume);
}

export async function seek(player: Player, positionMs: number): Promise<void> {
  const current = player.queue.current;
  if (!current) throw new MusicServiceError('Nothing is playing to seek through.');
  if (current.info.isStream) {
    throw new MusicServiceError("Can't seek a live stream. This isn't time travel.");
  }
  if (positionMs < 0 || positionMs > current.info.duration) {
    throw new MusicServiceError('That position is outside the track. Nice try.');
  }
  await player.seek(positionMs);
}

export async function setLoop(player: Player, mode: LoopMode): Promise<void> {
  await player.setRepeatMode(mode === LoopMode.OFF ? 'off' : mode === LoopMode.TRACK ? 'track' : 'queue');
}

export function shuffleQueue(player: Player): void {
  if (player.queue.tracks.length < 2) {
    throw new MusicServiceError('Not enough tracks queued to bother shuffling.');
  }
  player.queue.shuffle();
}

export async function removeTrack(player: Player, position: number): Promise<void> {
  const index = position - 1;
  if (index < 0 || index >= player.queue.tracks.length) {
    throw new MusicServiceError(`There's no track #${position} in the queue.`);
  }
  await player.queue.remove(index);
}

export async function moveTrack(player: Player, from: number, to: number): Promise<void> {
  const fromIdx = from - 1;
  const toIdx = to - 1;
  const len = player.queue.tracks.length;
  if (fromIdx < 0 || fromIdx >= len || toIdx < 0 || toIdx >= len) {
    throw new MusicServiceError('One of those positions is outside the queue.');
  }
  const [track] = player.queue.tracks.splice(fromIdx, 1);
  player.queue.tracks.splice(toIdx, 0, track);
  await player.queue.utils.save();
}

export async function leaveVoice(player: Player): Promise<void> {
  await player.destroy();
}

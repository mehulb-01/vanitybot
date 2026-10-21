import type { BotClient } from '../../bot/client';
import { childLogger } from '../../utils/logger';
import { createMusicPanelButtons, createNowPlayingEmbed } from './musicEmbeds';
import { createErrorEmbed, createInfoEmbed } from '../../utils/embeds';

const log = childLogger('musicEvents');

const activeUpdateTimers = new Map<string, NodeJS.Timeout>();

export function stopNowPlayingUpdater(guildId: string): void {
  const timer = activeUpdateTimers.get(guildId);
  if (timer) {
    clearInterval(timer);
    activeUpdateTimers.delete(guildId);
  }
}

/**
 * Wires up LavalinkManager's playback lifecycle events to actual Discord
 * messages. Called once from index.ts after the manager is created.
 */
export function registerMusicEventHandlers(client: BotClient): void {
  const manager = client.lavalink;

  manager.on('trackStart', async (player, track) => {
    if (!track) return;
    if (!player.textChannelId) return;
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased() || !('send' in channel)) return;

    stopNowPlayingUpdater(player.guildId);

    try {
      const message = await channel.send({
        embeds: [createNowPlayingEmbed(player, track)],
        components: [createMusicPanelButtons(player)],
      });

      // Periodically update the dynamic progress bar and timestamp as playback advances
      if (!track.info.isStream && track.info.duration && track.info.duration > 0) {
        const timer = setInterval(async () => {
          if (!player.connected || !player.playing || player.paused) return;
          const current = player.queue.current;
          if (!current || current.info.identifier !== track.info.identifier) {
            stopNowPlayingUpdater(player.guildId);
            return;
          }

          await message
            .edit({
              embeds: [createNowPlayingEmbed(player, current)],
              components: [createMusicPanelButtons(player)],
            })
            .catch(() => {
              stopNowPlayingUpdater(player.guildId);
            });
        }, 5_000);

        activeUpdateTimers.set(player.guildId, timer);
      }
    } catch (err) {
      log.warn({ err, guildId: player.guildId }, 'Failed to post now-playing message.');
    }
  });

  manager.on('trackEnd', (player) => {
    stopNowPlayingUpdater(player.guildId);
  });

  manager.on('trackStuck', async (player, track, payload) => {
    stopNowPlayingUpdater(player.guildId);
    log.warn(
      { guildId: player.guildId, track: track?.info.title, thresholdMs: payload.thresholdMs },
      'Track stuck — auto-skipping.',
    );
    const channel = player.textChannelId ? client.channels.cache.get(player.textChannelId) : undefined;
    if (channel?.isTextBased() && 'send' in channel) {
      await channel
        .send({ embeds: [createErrorEmbed('That track choked. Moving on.')] })
        .catch(() => undefined);
    }
  });

  manager.on('trackError', async (player, track, payload) => {
    stopNowPlayingUpdater(player.guildId);
    log.error(
      { guildId: player.guildId, track: track?.info.title, err: payload.exception },
      'Track errored during playback.',
    );
    const channel = player.textChannelId ? client.channels.cache.get(player.textChannelId) : undefined;
    if (channel?.isTextBased() && 'send' in channel) {
      await channel
        .send({ embeds: [createErrorEmbed("That track just gave up. Skipping to something less dramatic.")] })
        .catch(() => undefined);
    }
  });

  manager.on('queueEnd', async (player) => {
    stopNowPlayingUpdater(player.guildId);
    const channel = player.textChannelId ? client.channels.cache.get(player.textChannelId) : undefined;
    if (channel?.isTextBased() && 'send' in channel) {
      await channel
        .send({ embeds: [createInfoEmbed("Queue's empty. I'll hang around and sulk for a bit.")] })
        .catch(() => undefined);
    }
  });

  manager.on('playerDisconnect', (player) => {
    stopNowPlayingUpdater(player.guildId);
    log.info({ guildId: player.guildId }, 'Player disconnected from voice.');
  });

  manager.on('playerDestroy', (player) => {
    stopNowPlayingUpdater(player.guildId);
    log.info({ guildId: player.guildId }, 'Player destroyed.');
  });
}

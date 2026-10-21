import { LavalinkManager } from 'lavalink-client';
import type { BotClient } from '../../bot/client';
import { appConfig } from '../../config/config';
import { childLogger } from '../../utils/logger';

const log = childLogger('lavalink');

interface LavalinkNodeOption {
  id: string;
  host: string;
  port: number;
  authorization: string;
  secure?: boolean;
}

function resolveNodes(): LavalinkNodeOption[] {
  if (appConfig.lavalink.nodes) {
    try {
      const parsed = JSON.parse(appConfig.lavalink.nodes) as LavalinkNodeOption[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      log.warn('LAVALINK_NODES is not valid JSON, falling back to single-node config.');
    }
  }

  return [
    {
      id: 'main',
      host: appConfig.lavalink.host,
      port: appConfig.lavalink.port,
      authorization: appConfig.lavalink.password,
      secure: appConfig.lavalink.secure,
    },
  ];
}

/**
 * Builds the LavalinkManager. Not connected yet — call `.init()` from the
 * `ready` event once `client.user` exists, and forward raw gateway packets
 * so it can manage voice connections itself (bypassing @discordjs/voice).
 */
export function createLavalinkManager(client: BotClient): LavalinkManager {
  const nodes = resolveNodes();

  const manager = new LavalinkManager({
    nodes,
    // lavalink-client drives voice connections via raw gateway payloads,
    // sent through the shard directly — one less abstraction layer (and
    // one less source of latency) than routing through @discordjs/voice.
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      id: appConfig.discord.clientId,
      username: 'MusicBot',
    },
    autoSkip: true, // auto-advance the queue on trackEnd/trackError/trackStuck
    playerOptions: {
      defaultSearchPlatform: 'ytmsearch',
      volumeDecrementer: 0.75,
      onDisconnect: {
        // If Discord drops our voice connection (e.g. brief network blip),
        // try to silently reconnect instead of destroying the player and
        // losing the queue.
        autoReconnect: true,
        destroyPlayer: false,
      },
      onEmptyQueue: {
        // Don't sit connected forever with nothing queued; the guild
        // settings idleLeaveMs is applied per-player when it's created.
        destroyAfterMs: appConfig.music.idleLeaveMs,
      },
      useUnresolvedData: true,
    },
    queueOptions: {
      maxPreviousTracks: 25,
    },
  });

  wireNodeLogging(manager);
  return manager;
}

function wireNodeLogging(manager: LavalinkManager): void {
  manager.nodeManager.on('connect', (node) => {
    log.info({ node: node.id }, 'Lavalink node connected.');
  });

  manager.nodeManager.on('disconnect', (node, reason) => {
    log.warn({ node: node.id, reason }, 'Lavalink node disconnected. Will retry / failover.');
  });

  manager.nodeManager.on('reconnecting', (node) => {
    log.info({ node: node.id }, 'Lavalink node reconnecting.');
  });

  manager.nodeManager.on('error', (node, error) => {
    log.error({ node: node.id, err: error }, 'Lavalink node error.');
  });

  manager.nodeManager.on('resumed', (node) => {
    log.info({ node: node.id }, 'Lavalink session resumed — no audio interruption.');
  });
}

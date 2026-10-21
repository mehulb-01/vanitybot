import type { BotEvent } from '../loaders/eventLoader';
import { prisma } from '../../database/database';
import { childLogger } from '../../utils/logger';

const log = childLogger('event:voiceStateUpdate');

const event: BotEvent<'voiceStateUpdate'> = {
  name: 'voiceStateUpdate',
  execute: async (client, oldState, newState) => {
    // Only track when the user is in a guild
    if (!newState.guild) return;

    const userId = newState.member?.user.id;
    const guildId = newState.guild.id;
    
    if (!userId) return;

    // Handle bot voice state changes (disconnect, move)
    if (userId === client.user?.id) {
      if (oldState.channelId && !newState.channelId) {
        const player = client.lavalink.getPlayer(guildId);
        if (player) {
          log.info({ guildId }, 'Bot disconnected from voice, destroying player.');
          await player.destroy();
        }
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const player = client.lavalink.getPlayer(guildId);
        if (player) {
          player.voiceChannelId = newState.channelId;
          log.info({ guildId, newChannelId: newState.channelId }, 'Bot moved voice channels.');
        }
      }
      return;
    }

    // Check if the bot is left alone in the voice channel
    const player = client.lavalink.getPlayer(guildId);
    if (player && player.voiceChannelId) {
      const channel = newState.guild.channels.cache.get(player.voiceChannelId);
      if (channel && channel.isVoiceBased()) {
        const nonBotMembers = channel.members.filter((m) => !m.user.bot);
        if (nonBotMembers.size === 0) {
          log.info({ guildId, channelId: player.voiceChannelId }, 'Bot is alone in voice channel, destroying player.');
          await player.destroy();
        }
      }
    }

    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      const channel = newState.channel;
      
      log.info({ userId, guildId, channel: channel?.name }, 'User joined voice channel');

      await prisma.voiceTime.upsert({
        where: {
          userId_guildId: {
            userId,
            guildId,
          },
        },
        create: {
          userId,
          guildId,
          currentSessionStart: new Date(),
          lastVoiceChannel: channel?.name,
          lastJoinTime: new Date(),
        },
        update: {
          currentSessionStart: new Date(),
          lastVoiceChannel: channel?.name,
          lastJoinTime: new Date(),
        },
      });
    }
    // User left a voice channel
    else if (oldState.channelId && !newState.channelId) {
      const channel = oldState.channel;
      
      log.info({ userId, guildId, channel: channel?.name }, 'User left voice channel');

      const voiceRecord = await prisma.voiceTime.findUnique({
        where: {
          userId_guildId: {
            userId,
            guildId,
          },
        },
      });

      if (voiceRecord?.currentSessionStart) {
        const sessionDuration = Math.floor(
          (Date.now() - voiceRecord.currentSessionStart.getTime()) / 1000,
        );

        await prisma.voiceTime.update({
          where: {
            userId_guildId: {
              userId,
              guildId,
            },
          },
          data: {
            totalSeconds: { increment: sessionDuration },
            currentSessionStart: null,
          },
        });

        log.info(
          { userId, guildId, sessionDuration, totalSeconds: voiceRecord.totalSeconds + sessionDuration },
          'Voice session recorded',
        );
      }
    }
    // User switched voice channels
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;
      
      log.info({ userId, guildId, oldChannel: oldChannel?.name, newChannel: newChannel?.name }, 'User switched voice channels');

      const voiceRecord = await prisma.voiceTime.findUnique({
        where: {
          userId_guildId: {
            userId,
            guildId,
          },
        },
      });

      if (voiceRecord?.currentSessionStart) {
        const sessionDuration = Math.floor(
          (Date.now() - voiceRecord.currentSessionStart.getTime()) / 1000,
        );

        await prisma.voiceTime.update({
          where: {
            userId_guildId: {
              userId,
              guildId,
            },
          },
          data: {
            totalSeconds: { increment: sessionDuration },
            currentSessionStart: new Date(),
            lastVoiceChannel: newChannel?.name,
          },
        });

        log.info(
          { userId, guildId, sessionDuration, oldChannel: oldChannel?.name, newChannel: newChannel?.name },
          'Voice channel switch recorded',
        );
      }
    }
  },
};

export default event;
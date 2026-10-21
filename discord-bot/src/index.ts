import { appConfig } from './config/config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './database/database';
import { connectRedis, disconnectRedis } from './database/redis';
import { prisma } from './database/database';
import { BotClient } from './bot/client';
import { loadCommands } from './bot/loaders/commandLoader';
import { loadEvents } from './bot/loaders/eventLoader';
import { registerMusicEventHandlers } from './services/music/musicEventHandlers';
import { initializeBaseGangs } from './services/gangs/gangService';

async function bootstrap(): Promise<void> {
  logger.info({ env: appConfig.environment }, 'Booting up. Try to contain your excitement.');

  await connectDatabase();
  await connectRedis();

  // Initialize base gangs
  await initializeBaseGangs();

  const client = new BotClient();

  await loadCommands(client);
  await loadEvents(client);

  // Initialize Lavalink when bot is ready
  client.on('ready', async () => {
    try {
      if (client.user) {
        await client.lavalink.init({
          id: client.user.id,
          username: client.user.username,
        });
      }
      registerMusicEventHandlers(client);
      logger.info('Lavalink initialized and music event handlers registered.');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize Lavalink.');
    }
  });

  await client.login(appConfig.discord.token);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down.');
    
    // Save all active voice sessions before shutdown
    try {
      const activeSessions = await prisma.voiceTime.findMany({
        where: {
          currentSessionStart: { not: null },
        },
      });

      for (const session of activeSessions) {
        if (session.currentSessionStart) {
          const sessionDuration = Math.floor(
            (Date.now() - session.currentSessionStart.getTime()) / 1000,
          );
          await prisma.voiceTime.update({
            where: { id: session.id },
            data: {
              totalSeconds: { increment: sessionDuration },
              currentSessionStart: null,
            },
          });
        }
      }
      logger.info({ savedSessions: activeSessions.length }, 'Voice sessions saved on shutdown');
    } catch (err) {
      logger.error({ err }, 'Failed to save voice sessions on shutdown');
    }

    client.destroy();
    await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection.');
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error during bootstrap. Exiting.');
  process.exit(1);
});

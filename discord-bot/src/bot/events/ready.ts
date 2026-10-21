import type { BotEvent } from '../loaders/eventLoader';
import { childLogger } from '../../utils/logger';
import { resolveMonthlyBossElections } from '../../services/gangs/gangService';
import { prisma } from '../../database/database';

const log = childLogger('event:ready');

const event: BotEvent<'ready'> = {
  name: 'ready',
  once: true,
  execute: (client) => {
    log.info(
      { tag: client.user?.tag, guilds: client.guilds.cache.size, commands: client.commands.size },
      'Bot is online. Reluctantly, but online.',
    );

    // Ensure all currently joined guilds are recorded in the database
    for (const guild of client.guilds.cache.values()) {
      prisma.guild
        .upsert({
          where: { id: guild.id },
          update: { name: guild.name },
          create: { id: guild.id, name: guild.name },
        })
        .catch((err) => {
          log.warn({ err, guildId: guild.id }, 'Could not upsert guild record on startup');
        });
    }

    client.user?.setPresence({
      status: 'idle',
      activities: [{ name: 'people make bad decisions', type: 3 }], // Watching
    });

    // Confirm and verify global command deployment
    client.application?.commands
      .fetch()
      .then((cmds) => {
        log.info({ count: cmds.size }, 'Global application commands verified active.');
      })
      .catch((err) => {
        log.warn({ err }, 'Could not fetch global commands on startup.');
      });

    // Resolve monthly boss elections if not yet resolved for the current cycle
    resolveMonthlyBossElections(client).catch((err) => {
      log.error({ err }, 'Failed to resolve monthly boss elections on startup');
    });

    // Periodically verify election status (e.g., across monthly rollover)
    setInterval(() => {
      resolveMonthlyBossElections(client).catch((err) => {
        log.error({ err }, 'Periodic monthly boss election check failed');
      });
    }, 6 * 60 * 60 * 1000);
  },
};

export default event;


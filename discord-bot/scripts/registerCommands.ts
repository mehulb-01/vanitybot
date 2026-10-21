/**
 * Usage:
 *   npm run register:dev      -> registers to DEV_GUILD_ID, updates instantly
 *   npm run register:global   -> registers globally, takes up to ~1hr to propagate
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} from 'discord.js';
import { appConfig } from '../src/config/config';
import { logger } from '../src/utils/logger';
import type { Command } from '../src/types/command';

const COMMANDS_ROOT = path.join(__dirname, '..', 'src', 'bot', 'commands');

function walkTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const target = process.argv[2];

  if (target !== 'dev' && target !== 'global') {
    logger.error('Usage: registerCommands.ts <dev|global>');
    process.exit(1);
  }

  const files = walkTsFiles(COMMANDS_ROOT);
  const payload = [];

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    const command: Command | undefined = mod?.default ?? mod?.command;
    if (!command?.data) {
      logger.warn({ file }, 'Skipped invalid command file during registration.');
      continue;
    }

    // 1. Enable Personal App (UserInstall) and Server (GuildInstall)
    if (typeof (command.data as any).setIntegrationTypes === 'function') {
      (command.data as any).setIntegrationTypes([
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
      ]);
    }

    // 2. Enable Guild, BotDM, and PrivateChannel contexts (DMs + GDMs + any Server)
    if (typeof (command.data as any).setContexts === 'function') {
      (command.data as any).setContexts([
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ]);
    }

    if (
      command.requiredPermissions &&
      command.requiredPermissions.length > 0 &&
      typeof (command.data as any).setDefaultMemberPermissions === 'function'
    ) {
      let bitfield = 0n;
      for (const perm of command.requiredPermissions) {
        bitfield |= BigInt(perm as any);
      }
      (command.data as any).setDefaultMemberPermissions(bitfield);
    }
    payload.push(command.data.toJSON());
  }

  const rest = new REST().setToken(appConfig.discord.token);

  if (target === 'dev') {
    if (!appConfig.discord.devGuildId) {
      logger.error('DEV_GUILD_ID is not set in .env, cannot register dev commands.');
      process.exit(1);
    }
    await rest.put(
      Routes.applicationGuildCommands(appConfig.discord.clientId, appConfig.discord.devGuildId),
      { body: payload },
    );
    logger.info(
      { count: payload.length, guildId: appConfig.discord.devGuildId },
      'Registered guild (dev) commands.',
    );
  } else {
    await rest.put(Routes.applicationCommands(appConfig.discord.clientId), { body: payload });
    logger.info({ count: payload.length }, 'Registered global commands.');
  }
}

main().catch((err) => {
  logger.error({ err }, 'Command registration failed.');
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';
import type { BotClient } from '../client';
import type { Command } from '../../types/command';
import { childLogger } from '../../utils/logger';

const log = childLogger('commandLoader');

const COMMANDS_ROOT = path.join(__dirname, '..', 'commands');

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

/**
 * Walks src/bot/commands/** and registers every valid Command into
 * client.commands. A malformed command file logs a warning and is skipped
 * rather than crashing the whole bot on startup.
 */
export async function loadCommands(client: BotClient): Promise<void> {
  if (!fs.existsSync(COMMANDS_ROOT)) {
    log.warn({ path: COMMANDS_ROOT }, 'Commands directory does not exist, skipping load.');
    return;
  }

  const files = walkTsFiles(COMMANDS_ROOT);
  let loaded = 0;

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    const command: Command | undefined = mod?.default ?? mod?.command;

    if (!command?.data || typeof command.execute !== 'function') {
      log.warn({ file }, 'Skipped invalid command file (missing data/execute).');
      continue;
    }

    const name = command.data.name;
    if (client.commands.has(name)) {
      log.warn({ name, file }, 'Duplicate command name, overwriting previous registration.');
    }

    client.commands.set(name, command);
    loaded += 1;
  }

  log.info({ loaded, total: files.length }, 'Commands loaded.');
}

import fs from 'node:fs';
import path from 'node:path';
import type { ClientEvents } from 'discord.js';
import type { BotClient } from '../client';
import { childLogger } from '../../utils/logger';

const log = childLogger('eventLoader');
const EVENTS_ROOT = path.join(__dirname, '..', 'events');

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (client: BotClient, ...args: ClientEvents[K]) => Promise<void> | void;
}

export async function loadEvents(client: BotClient): Promise<void> {
  if (!fs.existsSync(EVENTS_ROOT)) {
    log.warn({ path: EVENTS_ROOT }, 'Events directory does not exist, skipping load.');
    return;
  }

  const files = fs
    .readdirSync(EVENTS_ROOT)
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts') && !f.endsWith('Handler.ts') && !f.endsWith('Handler.js'));

  let loaded = 0;

  for (const file of files) {
    const fullPath = path.join(EVENTS_ROOT, file);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(fullPath);
    const event: BotEvent | undefined = mod?.default ?? mod?.event;

    if (!event?.name || typeof event.execute !== 'function') {
      log.warn({ file }, 'Skipped invalid event file (missing name/execute).');
      continue;
    }

    const handler = (...args: unknown[]) =>
      event.execute(client, ...(args as ClientEvents[typeof event.name]));

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }

    loaded += 1;
  }

  log.info({ loaded, total: files.length }, 'Events loaded.');
}

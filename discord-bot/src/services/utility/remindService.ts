import type { Client } from 'discord.js';
import { Colors } from '../../constants';
import { EmbedBuilder } from 'discord.js';
import { childLogger } from '../../utils/logger';

const log = childLogger('remindService');

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  message: string;
  createdAt: number;
  remindAt: number;
}

const activeReminders = new Map<string, { reminder: Reminder; timer: NodeJS.Timeout }>();

/**
 * Parses user input like "10s", "15m", "2h", "1d", "1h30m" into milliseconds.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const regex = /^(\d+d)?\s*(\d+h)?\s*(\d+m)?\s*(\d+s)?$/;
  const match = trimmed.match(regex);
  if (!match || trimmed === '') return null;

  const days = match[1] ? parseInt(match[1]) : 0;
  const hours = match[2] ? parseInt(match[2]) : 0;
  const minutes = match[3] ? parseInt(match[3]) : 0;
  const seconds = match[4] ? parseInt(match[4]) : 0;

  const totalMs = (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
  return totalMs > 0 ? totalMs : null;
}

export function scheduleReminder(client: Client, reminder: Reminder): void {
  const delay = Math.max(0, reminder.remindAt - Date.now());

  // Cap maximum setTimeout safely (24.8 days)
  if (delay > 2_147_483_647) {
    throw new Error('Reminder cannot be set farther than 24 days in the future.');
  }

  const timer = setTimeout(async () => {
    activeReminders.delete(reminder.id);

    try {
      const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('🔔 Reminder Alarm')
        .setDescription(
          `<@${reminder.userId}>, you asked me to remind you:\n\n> ${reminder.message}\n\n*Set <t:${Math.floor(reminder.createdAt / 1000)}:R>.*`,
        )
        .setFooter({ text: 'Vanity • Memory as sharp as a tack.' })
        .setTimestamp();

      if (channel && channel.isTextBased() && 'send' in channel) {
        await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] }).catch(async () => {
          // Fallback to DM
          const user = await client.users.fetch(reminder.userId).catch(() => null);
          await user?.send({ embeds: [embed] }).catch(() => undefined);
        });
      } else {
        const user = await client.users.fetch(reminder.userId).catch(() => null);
        await user?.send({ embeds: [embed] }).catch(() => undefined);
      }
    } catch (err) {
      log.error({ err, reminderId: reminder.id }, 'Failed to deliver reminder.');
    }
  }, delay);

  activeReminders.set(reminder.id, { reminder, timer });
}

export function getUserReminders(userId: string): Reminder[] {
  const list: Reminder[] = [];
  for (const item of activeReminders.values()) {
    if (item.reminder.userId === userId) {
      list.push(item.reminder);
    }
  }
  return list.sort((a, b) => a.remindAt - b.remindAt);
}

export function cancelReminder(reminderId: string, userId: string): boolean {
  const item = activeReminders.get(reminderId);
  if (!item || item.reminder.userId !== userId) return false;

  clearTimeout(item.timer);
  activeReminders.delete(reminderId);
  return true;
}

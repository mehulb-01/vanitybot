import { prisma } from '../database';
import type { GuildSettings } from '@prisma/client';

/**
 * Every guild gets a settings row lazily, on first need, with sane
 * defaults. Callers never have to worry about GuildSettings being null.
 */
export async function getOrCreateGuildSettings(
  guildId: string,
  guildName?: string,
): Promise<GuildSettings> {
  const existing = await prisma.guildSettings.findUnique({ where: { guildId } });
  if (existing) return existing;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: guildName ?? 'Unknown Guild' },
  });

  return prisma.guildSettings.create({ data: { guildId } });
}

export async function updateGuildMusicSettings(
  guildId: string,
  data: Partial<Pick<GuildSettings, 'musicChannelId' | 'defaultVolume'>>,
): Promise<GuildSettings> {
  await getOrCreateGuildSettings(guildId);
  return prisma.guildSettings.update({ where: { guildId }, data });
}

import type { Client, Guild, TextChannel } from 'discord.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../database/database';
import { childLogger } from '../../utils/logger';
import { getUserEconomy } from '../economy/economyService';
import { Colors } from '../../constants';
import { formatNumber } from '../../utils/format';

const log = childLogger('gangService');

// 6 Base Gangs with custom names and mottos
export const GANG_MOTTOS: Record<string, string> = {
  kurogane: 'Forged in iron, bound by honor.',
  omerta: 'Silence is loyalty, betrayal is death.',
  calavera: 'Fear no death, remember the fallen.',
  longwei: 'Patience of the serpent, fury of the dragon.',
  moroz: 'Winter shows no mercy, nor do we.',
  reapers: 'Swift as shadows, silent as death.',
};

export const BASE_GANGS = [
  {
    name: 'kurogane',
    displayName: 'Kurogane',
    description: 'Forged in iron, bound by honor.',
    color: '#DC143C', // Crimson red
    emoji: '<:58_samuraimask:1551660117966196797>',
  },
  {
    name: 'omerta',
    displayName: 'Omertà',
    description: 'Silence is loyalty, betrayal is death.',
    color: '#1a1a1a', // Black
    emoji: '<:59_mafiaboss:1551660120591827084>',
  },
  {
    name: 'calavera',
    displayName: 'Calavera',
    description: 'Fear no death, remember the fallen.',
    color: '#228B22', // Forest green
    emoji: '<:60_sugarskull:1551660123213135932>',
  },
  {
    name: 'longwei',
    displayName: 'Longwei',
    description: 'Patience of the serpent, fury of the dragon.',
    color: '#DAA520', // Golden dragon
    emoji: '<:61_dragon:1551660125926723715>',
  },
  {
    name: 'moroz',
    displayName: 'Moroz',
    description: 'Winter shows no mercy, nor do we.',
    color: '#00BFFF', // Ice blue
    emoji: '<:62_snowflake:1551660128627855421>',
  },
  {
    name: 'reapers',
    displayName: 'Reapers',
    description: 'Swift as shadows, silent as death.',
    color: '#8A2BE2', // Shadow purple
    emoji: '<:63_grimreaper:1551660130817417296>',
  },
];

/**
 * Initialize the 6 core gangs if they don't already exist in the database.
 */
export async function initializeBaseGangs(): Promise<void> {
  try {
    for (const gangData of BASE_GANGS) {
      await prisma.gang.upsert({
        where: { name: gangData.name },
        update: {
          displayName: gangData.displayName,
          description: gangData.description,
          color: gangData.color,
          emoji: gangData.emoji,
        },
        create: {
          name: gangData.name,
          displayName: gangData.displayName,
          description: gangData.description,
          color: gangData.color,
          emoji: gangData.emoji,
          treasury: 0,
        },
      });
    }
    log.info('Base gangs verified/initialized.');
  } catch (err) {
    log.error({ err }, 'Failed to initialize base gangs.');
  }
}

// In-memory caches to reduce DB query pressure
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const userGangCache = new Map<string, CacheEntry<any>>();
const guildGangsEnabledCache = new Map<string, CacheEntry<boolean>>();
const bossCache = new Map<string, CacheEntry<any>>();

const USER_GANG_CACHE_TTL_MS = 60 * 1000; // 60s
const GUILD_ENABLED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const BOSS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export function invalidateUserGangCache(userId: string): void {
  userGangCache.delete(userId);
}

export function invalidateGuildGangsCache(guildId: string): void {
  guildGangsEnabledCache.delete(guildId);
}

export function invalidateBossCache(gangId?: string): void {
  if (gangId) {
    for (const key of bossCache.keys()) {
      if (key.startsWith(gangId)) bossCache.delete(key);
    }
  } else {
    bossCache.clear();
  }
}

/**
 * Get a user's current gang membership
 */
export async function getUserGang(userId: string) {
  const cached = userGangCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const membership = await prisma.userGangMembership.findUnique({
    where: { userId },
    include: { gang: true },
  });
  userGangCache.set(userId, {
    data: membership,
    expiresAt: Date.now() + USER_GANG_CACHE_TTL_MS,
  });
  return membership;
}

/**
 * Get all gangs
 */
export async function getAllGangs() {
  return prisma.gang.findMany();
}

/**
 * Get server gang settings
 */
export async function getServerGangSettings(guildId: string) {
  return prisma.serverGangSettings.findMany({
    where: { guildId },
    include: { gang: true },
  });
}

/**
 * Check if gangs are enabled on a server
 */
export async function areGangsEnabled(guildId: string): Promise<boolean> {
  const cached = guildGangsEnabledCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });
  const enabled = settings?.gangSettingsEnabled ?? false;
  guildGangsEnabledCache.set(guildId, {
    data: enabled,
    expiresAt: Date.now() + GUILD_ENABLED_CACHE_TTL_MS,
  });
  return enabled;
}

/**
 * Ensures a guild row exists in the Guild table before inserting child relations
 * like GuildSettings or ServerGangSettings (prevents foreign key constraint P2003).
 */
export async function ensureGuildRecord(guildId: string, guildName?: string): Promise<void> {
  try {
    await prisma.guild.upsert({
      where: { id: guildId },
      update: guildName ? { name: guildName } : {},
      create: { id: guildId, name: guildName ?? 'Unknown Guild' },
    });
  } catch (err) {
    log.error({ err, guildId }, 'Failed to ensure guild record in database');
  }
}

/**
 * Enable gangs on a server
 */
export async function enableGangs(guildId: string, guildName?: string): Promise<void> {
  await ensureGuildRecord(guildId, guildName);
  invalidateGuildGangsCache(guildId);
  await prisma.guildSettings.upsert({
    where: { guildId },
    update: { gangSettingsEnabled: true },
    create: {
      guildId,
      gangSettingsEnabled: true,
    },
  });
  guildGangsEnabledCache.set(guildId, {
    data: true,
    expiresAt: Date.now() + GUILD_ENABLED_CACHE_TTL_MS,
  });
}

/**
 * Disable gangs on a server
 */
export async function disableGangs(guildId: string, guildName?: string): Promise<void> {
  await ensureGuildRecord(guildId, guildName);
  invalidateGuildGangsCache(guildId);
  await prisma.guildSettings.upsert({
    where: { guildId },
    update: { gangSettingsEnabled: false },
    create: {
      guildId,
      gangSettingsEnabled: false,
    },
  });
  guildGangsEnabledCache.set(guildId, {
    data: false,
    expiresAt: Date.now() + GUILD_ENABLED_CACHE_TTL_MS,
  });
}

/**
 * Finds or retrieves the designated 'gangs' text channel for a guild.
 */
export async function getOrFindGangChannel(guild: Guild): Promise<TextChannel | null> {
  try {
    const settings = await prisma.guildSettings.findUnique({
      where: { guildId: guild.id },
    });

    if (settings?.gangChannelId) {
      const existing =
        (guild.channels.cache.get(settings.gangChannelId) as TextChannel | undefined) ??
        ((await guild.channels.fetch(settings.gangChannelId).catch(() => null)) as TextChannel | null);
      if (existing && existing.isTextBased() && 'send' in existing) {
        return existing;
      }
    }

    // Check if channel named 'gangs' exists in the guild cache first
    let gangChannel = guild.channels.cache.find(
      (c) => c && c.name.toLowerCase() === 'gangs' && c.isTextBased() && 'send' in c,
    ) as TextChannel | undefined;

    // Fall back to fetching if not found in cache
    if (!gangChannel) {
      const fetched = await guild.channels.fetch().catch(() => null);
      if (fetched) {
        gangChannel = fetched.find(
          (c) => c && c.name.toLowerCase() === 'gangs' && c.isTextBased() && 'send' in c,
        ) as TextChannel | undefined;
      }
    }

    if (gangChannel) {
      await ensureGuildRecord(guild.id, guild.name);
      await prisma.guildSettings.upsert({
        where: { guildId: guild.id },
        update: { gangChannelId: gangChannel.id },
        create: {
          guildId: guild.id,
          gangChannelId: gangChannel.id,
        },
      });
      return gangChannel;
    }
  } catch (err) {
    log.error({ err, guildId: guild.id }, 'Failed to find gang channel');
  }
  return null;
}

/**
 * Ensures a designated 'gangs' text channel exists on the server, creating it if needed.
 */
export async function ensureGangChannel(guild: Guild): Promise<TextChannel | null> {
  try {
    const existing = await getOrFindGangChannel(guild);
    if (existing) return existing;

    // Check bot's ManageChannels permission before attempting creation
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      log.warn({ guildId: guild.id }, 'Bot lacks ManageChannels permission to create gang channel');
      return null;
    }

    const created = (await guild.channels.create({
      name: 'gangs',
      topic: 'Official gang dispatches and Syndicate election verdicts.',
      reason: 'Designated gang headquarters channel created via /gangsetup',
    })) as TextChannel;

    if (created) {
      await ensureGuildRecord(guild.id, guild.name);
      await prisma.guildSettings.upsert({
        where: { guildId: guild.id },
        update: { gangChannelId: created.id },
        create: {
          guildId: guild.id,
          gangChannelId: created.id,
        },
      });
      return created;
    }
  } catch (err) {
    log.error({ err, guildId: guild.id }, 'Failed to create designated gang channel');
  }
  return null;
}

export const GANG_ROLE_CONFIG: Record<string, { color: number; hoist: boolean }> = {
  kurogane: { color: 0xc0392b, hoist: true }, // Crimson Samurai
  omerta: { color: 0x2c3e50, hoist: true },   // Midnight Mafia
  calavera: { color: 0x9b59b6, hoist: true }, // Mystic Violet
  longwei: { color: 0xe67e22, hoist: true },  // Dragon Flame
  moroz: { color: 0x3498db, hoist: true },    // Frost Cyan
  reapers: { color: 0x7f8c8d, hoist: true },  // Phantom Slate
};

/**
 * Creates or maps a server role for an individual gang.
 */
export async function createGangRole(
  guild: Guild,
  gangId: string,
): Promise<{ success: boolean; roleId?: string; roleName?: string; message?: string }> {
  try {
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return {
        success: false,
        message: 'The bot lacks the **Manage Roles** permission to create gang roles. Please grant this permission in Server Settings > Roles.',
      };
    }

    const gang = await prisma.gang.findFirst({
      where: {
        OR: [{ id: gangId }, { name: gangId.toLowerCase() }],
      },
    });
    if (!gang) {
      return { success: false, message: 'Gang not found in the database.' };
    }

    // Check if role with this name already exists in guild
    let role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === gang.displayName.toLowerCase(),
    );

    if (!role) {
      const cfg = GANG_ROLE_CONFIG[gang.name.toLowerCase()] ?? { color: 0x800000, hoist: true };
      role = await guild.roles.create({
        name: gang.displayName,
        color: cfg.color,
        hoist: cfg.hoist,
        reason: `Gang role for ${gang.displayName} created via /gangsetup`,
      });
    }

    // Ensure guild record exists
    await ensureGuildRecord(guild.id, guild.name);

    await prisma.serverGangSettings.upsert({
      where: {
        guildId_gangId: {
          guildId: guild.id,
          gangId: gang.id,
        },
      },
      update: { roleId: role.id },
      create: {
        guildId: guild.id,
        gangId: gang.id,
        roleId: role.id,
      },
    });

    return {
      success: true,
      roleId: role.id,
      roleName: role.name,
    };
  } catch (err: any) {
    log.error({ err, guildId: guild.id, gangId }, 'Failed to create gang role');
    return {
      success: false,
      message: err?.message || 'Failed to create role.',
    };
  }
}

/**
 * Creates or maps server roles for all 6 gangs.
 */
export async function createAllGangRoles(
  guild: Guild,
): Promise<{ success: boolean; createdCount: number; message?: string }> {
  try {
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return {
        success: false,
        createdCount: 0,
        message: 'The bot lacks the **Manage Roles** permission to create gang roles. Please grant this permission in Server Settings > Roles.',
      };
    }

    const allGangs = await getAllGangs();
    const existingSettings = await prisma.serverGangSettings.findMany({
      where: { guildId: guild.id },
    });
    const settingMap = new Map(existingSettings.map((s) => [s.gangId, s.roleId]));

    await ensureGuildRecord(guild.id, guild.name);

    let createdCount = 0;
    for (const gang of allGangs) {
      const existingRoleId = settingMap.get(gang.id);
      const roleExists = existingRoleId && guild.roles.cache.has(existingRoleId);

      if (!roleExists) {
        let role = guild.roles.cache.find(
          (r) => r.name.toLowerCase() === gang.displayName.toLowerCase(),
        );

        if (!role) {
          const cfg = GANG_ROLE_CONFIG[gang.name.toLowerCase()] ?? { color: 0x800000, hoist: true };
          role = await guild.roles.create({
            name: gang.displayName,
            color: cfg.color,
            hoist: cfg.hoist,
            reason: `Gang role for ${gang.displayName} auto-created via /gangsetup`,
          });
        }

        await prisma.serverGangSettings.upsert({
          where: {
            guildId_gangId: {
              guildId: guild.id,
              gangId: gang.id,
            },
          },
          update: { roleId: role.id },
          create: {
            guildId: guild.id,
            gangId: gang.id,
            roleId: role.id,
          },
        });
        createdCount++;
      }
    }

    return {
      success: true,
      createdCount,
    };
  } catch (err: any) {
    log.error({ err, guildId: guild.id }, 'Failed to create all gang roles');
    return {
      success: false,
      createdCount: 0,
      message: err?.message || 'Failed to create roles.',
    };
  }
}

export interface LoyaltyInfo {
  score: number;
  daysInGang: number;
}

export interface GangRankInfo {
  level: number;
  title: string;
  emoji: string;
  bankCapacity: number;
  romanRank: string;
}

export const GANG_RANKS: Record<number, { title: string; emoji: string; bankCapacity: number; romanRank: string }> = {
  1: {
    title: 'Street Runner',
    emoji: '<:69_rankchevron1:1551660145111601183>',
    bankCapacity: 1_000_000,
    romanRank: 'Rank 1',
  },
  2: {
    title: 'Street Soldier',
    emoji: '<:70_rankchevron2:1551660147611537439>',
    bankCapacity: 3_000_000,
    romanRank: 'Rank 2',
  },
  3: {
    title: 'Enforcer',
    emoji: '<:71_rankchevron3:1551660149897437266>',
    bankCapacity: 5_000_000,
    romanRank: 'Rank 3',
  },
  4: {
    title: 'Lieutenant',
    emoji: '<:72_star:1551660152468541541>',
    bankCapacity: 10_000_000_000,
    romanRank: 'Rank 4',
  },
  5: {
    title: 'Underboss',
    emoji: '<:73_wingedstar:1551660154875936867>',
    bankCapacity: 10_000_000_000,
    romanRank: 'Rank 5',
  },
};

export const BOSS_RANK: GangRankInfo = {
  level: 6,
  title: 'Gang Boss',
  emoji: '<:68_crown:1551660143152865441>',
  bankCapacity: 10_000_000_000,
  romanRank: 'Boss',
};

/**
 * Returns rank information (title, emoji, bank capacity) determined by Loyalty Score.
 * - Rank 1: Street Runner (< 1,000 pts) -> 1,000,000 cap
 * - Rank 2: Street Soldier (1,000 - 2,499 pts) -> 3,000,000 cap
 * - Rank 3: Enforcer (2,500 - 4,999 pts) -> 5,000,000 cap
 * - Rank 4: Lieutenant (5,000 - 9,999 pts) -> 10,000,000,000 cap
 * - Rank 5: Underboss (10,000+ pts) -> 10,000,000,000 cap
 * - Boss: Gang Boss -> 10,000,000,000 cap
 */
export function getRankFromLoyalty(loyaltyScore: number, isBoss: boolean = false): GangRankInfo {
  if (isBoss) return BOSS_RANK;
  if (loyaltyScore >= 10000) return { level: 5, ...GANG_RANKS[5] };
  if (loyaltyScore >= 5000) return { level: 4, ...GANG_RANKS[4] };
  if (loyaltyScore >= 2500) return { level: 3, ...GANG_RANKS[3] };
  if (loyaltyScore >= 1000) return { level: 2, ...GANG_RANKS[2] };
  return { level: 1, ...GANG_RANKS[1] };
}

export interface PrestigeInfo {
  level: number;
  stars: string;
  title: string;
  romanRank: string;
  score: number;
}

/**
 * Calculates a member's loyalty score (pure numerical tracking, no ranks).
 * Ranks are strictly confined to Prestige.
 * Factored by:
 * - Days in gang (10 pts/day)
 * - Successful heists (25 pts/heist)
 * - Comradeship/bail paid (1 pt per 10 credits)
 * - Voice frequency participation (15 pts/hour)
 */
export function calculateLoyalty(
  joinedAt: Date,
  crimesWon: number,
  bountiesPaid: number,
  voiceSeconds: number = 0,
  quotaContributed: number = 0,
): LoyaltyInfo {
  const daysInGang = Math.max(1, Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const daysScore = daysInGang * 10;
  const crimeScore = crimesWon * 25;
  const bailScore = Math.floor(bountiesPaid / 10);
  const voiceHours = Math.floor(voiceSeconds / 3600);
  const voiceScore = voiceHours * 15;
  const quotaScore = Math.floor(quotaContributed / 50); // 20,000 max quota = 400 loyalty score/day
  const score = daysScore + crimeScore + bailScore + voiceScore + quotaScore;

  return { score, daysInGang };
}

/**
 * Calculates prestige level, star rating, roman rank, and title.
 * Ranks reside EXCLUSIVELY in Prestige.
 * Non-Syndicate rank titles:
 * - Rank I: Street Runner (< 2,500 pts)
 * - Rank II: Street Soldier (2,500 - 9,999 pts)
 * - Rank III: Enforcer (10,000 - 29,999 pts)
 * - Rank IV: Lieutenant (30,000 - 74,999 pts)
 * - Rank V: Underboss (75,000+ pts)
 *
 * (Boss status is an exclusive monthly elected/appointed office, never attained through prestige alone)
 */
export function calculatePrestige(
  wallet: number,
  bank: number,
  netEarnings: number,
  crimesWon: number,
  quotaContributed: number = 0,
): PrestigeInfo {
  const totalWealth = wallet + bank;
  const score = Math.max(0, netEarnings) + totalWealth + crimesWon * 1000 + quotaContributed;

  let level = 1;
  let stars = '⭐';
  let title = 'Street Runner';
  let romanRank = 'Rank I';

  if (score >= 75000) {
    level = 5;
    stars = '⭐⭐⭐⭐⭐';
    title = 'Underboss';
    romanRank = 'Rank V';
  } else if (score >= 30000) {
    level = 4;
    stars = '⭐⭐⭐⭐';
    title = 'Lieutenant';
    romanRank = 'Rank IV';
  } else if (score >= 10000) {
    level = 3;
    stars = '⭐⭐⭐';
    title = 'Enforcer';
    romanRank = 'Rank III';
  } else if (score >= 2500) {
    level = 2;
    stars = '⭐⭐';
    title = 'Street Soldier';
    romanRank = 'Rank II';
  }

  return { level, stars, title, romanRank, score };
}

/**
 * Helper to compute current month term string e.g. "2026-09"
 */
export function getCurrentTermMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns number of days in a given month (year, monthIndex 0-11).
 */
export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export const OMERTA_PERMANENT_BOSS_ID = '798851339119624203';

/**
 * Retrieves the currently active Gang Boss for a given gang in the current month.
 */
export async function getCurrentBoss(gangId: string, monthStr?: string) {
  const currentMonth = monthStr ?? getCurrentTermMonth();
  const isOmerta = gangId === 'omerta' || gangId.toLowerCase().includes('omerta');
  const cacheKey = `${gangId}:${currentMonth}`;
  const cached = bossCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let targetGangId = gangId;
  try {
    if (prisma.gang && typeof prisma.gang.findFirst === 'function') {
      const g = await prisma.gang.findFirst({
        where: { OR: [{ id: gangId }, { name: gangId.toLowerCase() }] },
      });
      if (g) targetGangId = g.id;
    }
  } catch {}

  const boss = await prisma.gangBoss.findFirst({
    where: {
      OR: [{ gangId: targetGangId }, { gangId }],
      termMonth: currentMonth,
      expiresAt: { gt: new Date() },
    },
    orderBy: { electedAt: 'desc' },
  });

  if (boss) {
    bossCache.set(cacheKey, { data: boss, expiresAt: Date.now() + BOSS_CACHE_TTL_MS });
    return boss;
  }

  if (isOmerta) {
    const defaultOmertaBoss = {
      id: 'omerta_permanent_boss',
      gangId: targetGangId,
      userId: OMERTA_PERMANENT_BOSS_ID,
      termMonth: currentMonth,
      electedBy: 'PERMANENT',
      votesCount: 0,
      electedAt: new Date(0),
      expiresAt: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
    };
    bossCache.set(cacheKey, {
      data: defaultOmertaBoss,
      expiresAt: Date.now() + BOSS_CACHE_TTL_MS,
    });
    return defaultOmertaBoss;
  }

  bossCache.set(cacheKey, {
    data: boss,
    expiresAt: Date.now() + BOSS_CACHE_TTL_MS,
  });
  return boss;
}

export interface GangNominee {
  userId: string;
  loyaltyScore: number;
  rankLevel: number;
  rankTitle: string;
  rankEmoji: string;
  rankRoman: string;
  votesReceived: number;
  // Backwards compatibility
  prestigeScore: number;
  prestigeLevel: number;
  prestigeTitle: string;
  prestigeRank: string;
  stars: string;
}

/**
 * Calculates top 5 global rank holders by Loyalty score for a gang this month.
 */
export async function getGangNominees(gangId: string, monthStr?: string): Promise<GangNominee[]> {
  const currentMonth = monthStr ?? getCurrentTermMonth();

  const members = await prisma.userGangMembership.findMany({
    where: { gangId },
  });

  if (members.length === 0) return [];

  const userIds = members.map((m) => m.userId);
  const economies = await prisma.userEconomy.findMany({
    where: { userId: { in: userIds } },
  });
  const ecoMap = new Map(economies.map((e) => [e.userId, e]));

  const scored = members.map((m) => {
    const eco = ecoMap.get(m.userId) ?? {
      wallet: 0,
      bank: 0,
      netEarnings: 0,
      crimesWon: 0,
      bountiesPaid: 0,
    };
    const loyalty = calculateLoyalty(
      m.joinedAt,
      eco.crimesWon,
      eco.bountiesPaid ?? 0,
      0,
      m.quotaContributed,
    );
    const rank = getRankFromLoyalty(loyalty.score);
    return {
      userId: m.userId,
      loyalty,
      rank,
    };
  });

  scored.sort((a, b) => b.loyalty.score - a.loyalty.score);
  const top5 = scored.slice(0, 5);

  const votes = await prisma.gangVote.findMany({
    where: {
      gangId,
      month: currentMonth,
      candidateId: { in: top5.map((t) => t.userId) },
    },
  });

  const voteCountMap = new Map<string, number>();
  for (const v of votes) {
    voteCountMap.set(v.candidateId, (voteCountMap.get(v.candidateId) ?? 0) + 1);
  }

  return top5.map((t) => ({
    userId: t.userId,
    loyaltyScore: t.loyalty.score,
    rankLevel: t.rank.level,
    rankTitle: t.rank.title,
    rankEmoji: t.rank.emoji,
    rankRoman: t.rank.romanRank,
    votesReceived: voteCountMap.get(t.userId) ?? 0,
    // Backwards compatibility
    prestigeScore: t.loyalty.score,
    prestigeLevel: t.rank.level,
    prestigeTitle: t.rank.title,
    prestigeRank: t.rank.romanRank,
    stars: '⭐'.repeat(t.rank.level),
  }));
}

export interface VoteResult {
  success: boolean;
  reason?: 'NO_GANG' | 'NOMINATED' | 'ALREADY_VOTED' | 'INVALID_CANDIDATE' | 'ERROR';
  message: string;
}

/**
 * Cast a vote for a nominated member in the gang boss election.
 * Nominees are strictly barred from voting with:
 * "You have been nominated for voting this month, don't act smart."
 */
export async function castBossVote(voterId: string, candidateId: string): Promise<VoteResult> {
  const membership = await getUserGang(voterId);
  if (!membership) {
    return {
      success: false,
      reason: 'NO_GANG',
      message: 'You must be an active member of a gang to vote. Use `/gangjoin` to pledge allegiance.',
    };
  }

  const currentMonth = getCurrentTermMonth();
  const nominees = await getGangNominees(membership.gangId, currentMonth);

  // Nominees are prohibited from voting
  if (nominees.some((n) => n.userId === voterId)) {
    return {
      success: false,
      reason: 'NOMINATED',
      message: "You have been nominated for voting this month, don't act smart.",
    };
  }

  // Validate chosen candidate is among the top 5 nominees
  const candidate = nominees.find((n) => n.userId === candidateId);
  if (!candidate) {
    return {
      success: false,
      reason: 'INVALID_CANDIDATE',
      message: 'The selected candidate is not among the top 5 qualified nominees this month.',
    };
  }

  // Check if voter has already cast a ballot for their gang this month
  const existingVote = await prisma.gangVote.findUnique({
    where: {
      voterId_month: {
        voterId,
        month: currentMonth,
      },
    },
  });

  if (existingVote) {
    return {
      success: false,
      reason: 'ALREADY_VOTED',
      message: 'You have already cast your ballot in this month’s election! Only one vote per operative is permitted.',
    };
  }

  // Record ballot
  await prisma.gangVote.create({
    data: {
      voterId,
      candidateId,
      gangId: membership.gangId,
      month: currentMonth,
    },
  });

  return {
    success: true,
    message: `Your ballot has been cast for <@${candidateId}> as Boss of **${membership.gang.displayName}**!`,
  };
}

export interface ElectionResolutionReport {
  gangId: string;
  bossUserId: string;
  electedBy: 'VOTE' | 'RNG' | 'PERMANENT';
  votesCount: number;
  termMonth: string;
  daysDuration: number;
  announcementText: string;
}

/**
 * Resolves the monthly Boss election across all 6 gangs.
 * If votes are cast, highest voted nominee wins.
 * If no votes are cast, random nominee is elected by The Syndicate via RNG.
 * Announces results with "The Syndicate has given its verdict! ..." to designated 'gangs' channel.
 */
export async function resolveMonthlyBossElections(client?: Client): Promise<ElectionResolutionReport[]> {
  const currentMonth = getCurrentTermMonth();
  const now = new Date();
  const daysInCurrentMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  const expiresAt = new Date(now.getTime() + daysInCurrentMonth * 24 * 60 * 60 * 1000);
  const reports: ElectionResolutionReport[] = [];

  for (const baseGang of BASE_GANGS) {
    let dbGang: { id: string; name: string } | null = null;
    try {
      if (prisma.gang && typeof prisma.gang.findFirst === 'function') {
        dbGang = await prisma.gang.findFirst({
          where: { OR: [{ id: baseGang.name }, { name: baseGang.name.toLowerCase() }] },
        });
      }
    } catch {}
    const gangDbId = dbGang ? dbGang.id : baseGang.name;

    if (baseGang.name.toLowerCase() === 'omerta') {
      const existing = await prisma.gangBoss.findFirst({
        where: {
          OR: [{ gangId: gangDbId }, { gangId: baseGang.name }],
          termMonth: currentMonth,
        },
      });
      if (!existing) {
        await prisma.gangBoss.upsert({
          where: { gangId: gangDbId },
          update: {
            userId: OMERTA_PERMANENT_BOSS_ID,
            termMonth: currentMonth,
            electedBy: 'PERMANENT',
            votesCount: 0,
            electedAt: now,
            expiresAt,
          },
          create: {
            gangId: gangDbId,
            userId: OMERTA_PERMANENT_BOSS_ID,
            termMonth: currentMonth,
            electedBy: 'PERMANENT',
            votesCount: 0,
            electedAt: now,
            expiresAt,
          },
        });
        bossCache.delete(`${baseGang.name}:${currentMonth}`);
        bossCache.delete(`${gangDbId}:${currentMonth}`);
      }
      continue;
    }

    // Check if an election has already concluded for this month
    const existing = await prisma.gangBoss.findFirst({
      where: {
        OR: [{ gangId: gangDbId }, { gangId: baseGang.name }],
        termMonth: currentMonth,
      },
    });

    if (existing) continue;

    const nominees = await getGangNominees(gangDbId, currentMonth);
    if (nominees.length === 0) continue;

    const votes = await prisma.gangVote.findMany({
      where: {
        gangId: gangDbId,
        month: currentMonth,
      },
    });

    let winnerUserId = '';
    let electedBy: 'VOTE' | 'RNG' = 'RNG';
    let votesCount = 0;

    if (votes.length > 0) {
      // Tally votes
      const tallies = new Map<string, number>();
      for (const v of votes) {
        tallies.set(v.candidateId, (tallies.get(v.candidateId) ?? 0) + 1);
      }

      // Sort nominees by votes received desc, tie-breaker by prestige score desc
      const sortedCandidates = [...nominees].sort((a, b) => {
        const countA = tallies.get(a.userId) ?? 0;
        const countB = tallies.get(b.userId) ?? 0;
        if (countB !== countA) return countB - countA;
        return (b.loyaltyScore ?? b.prestigeScore) - (a.loyaltyScore ?? a.prestigeScore);
      });

      const topCandidate = sortedCandidates[0];
      const topVotes = tallies.get(topCandidate.userId) ?? 0;

      if (topVotes > 0) {
        winnerUserId = topCandidate.userId;
        electedBy = 'VOTE';
        votesCount = topVotes;
      } else {
        const randomIndex = Math.floor(Math.random() * nominees.length);
        winnerUserId = nominees[randomIndex].userId;
        electedBy = 'RNG';
        votesCount = 0;
      }
    } else {
      // No votes placed: random nominated user chosen by RNG
      const randomIndex = Math.floor(Math.random() * nominees.length);
      winnerUserId = nominees[randomIndex].userId;
      electedBy = 'RNG';
      votesCount = 0;
    }

    await prisma.gangBoss.upsert({
      where: { gangId: gangDbId },
      update: {
        userId: winnerUserId,
        termMonth: currentMonth,
        electedBy,
        votesCount,
        electedAt: now,
        expiresAt,
      },
      create: {
        gangId: gangDbId,
        userId: winnerUserId,
        termMonth: currentMonth,
        electedBy,
        votesCount,
        electedAt: now,
        expiresAt,
      },
    });
    bossCache.delete(`${baseGang.name}:${currentMonth}`);
    bossCache.delete(`${gangDbId}:${currentMonth}`);

    let announcementText = '';
    if (electedBy === 'VOTE') {
      announcementText = `The Syndicate has given its verdict! <@${winnerUserId}> has been elected as the new Boss of **${baseGang.displayName}** by popular mandate of the gang members for the next ${daysInCurrentMonth} days!`;
    } else {
      announcementText = `The Syndicate has given its verdict! Due to an absence of member ballots, the gang boss has been elected by **The Syndicate**! <@${winnerUserId}> has been directly appointed as the new Boss of **${baseGang.displayName}** for the next ${daysInCurrentMonth} days!`;
    }

    reports.push({
      gangId: baseGang.name,
      bossUserId: winnerUserId,
      electedBy,
      votesCount,
      termMonth: currentMonth,
      daysDuration: daysInCurrentMonth,
      announcementText,
    });

    // Send announcement to designated 'gangs' channel in every server
    if (client) {
      const embed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle('⚖️ The Syndicate has given its verdict!')
        .setDescription(
          `### ${baseGang.emoji} **${baseGang.displayName}** Leadership Decreed\n\n${announcementText}`,
        )
        .addFields([
          { name: '👑 Newly Installed Boss', value: `<@${winnerUserId}>`, inline: true },
          { name: '⏳ Term Duration', value: `${daysInCurrentMonth} Days (${currentMonth})`, inline: true },
          {
            name: '📜 Mandate Type',
            value: electedBy === 'VOTE' ? `🗳️ Popular Ballot (${votesCount} votes)` : '🎲 Syndicate Direct Appointment',
            inline: true,
          },
        ])
        .setFooter({ text: 'The Syndicate • Supreme Authority Over All Gangs' })
        .setTimestamp();

      for (const guild of client.guilds.cache.values()) {
        try {
          const gangChannel = await getOrFindGangChannel(guild);
          if (gangChannel && gangChannel.isTextBased() && 'send' in gangChannel) {
            await (gangChannel as TextChannel).send({ embeds: [embed] });
          }
        } catch (err) {
          log.warn({ err, guildId: guild.id, gang: baseGang.name }, 'Could not broadcast Syndicate verdict to guild channel');
        }
      }
    }
  }

  invalidateBossCache();
  return reports;
}

/**
 * Retrieves comprehensive gang dossier stats for a user.
 */
export async function getGangProfile(userId: string, guildId?: string) {
  // Query user gang, economy, inventory count, and voice record in parallel (1 single roundtrip)
  const [membership, economy, inventoryCount, voiceRecord] = await Promise.all([
    getUserGang(userId),
    getUserEconomy(userId),
    prisma.userInventoryItem.count({ where: { userId } }),
    guildId
      ? prisma.voiceTime.findUnique({
          where: { userId_guildId: { userId, guildId } },
        }).catch(() => null)
      : null,
  ]);

  if (!membership) return null;

  // Boss is retrieved from memory cache in ~0ms
  const currentBoss = await getCurrentBoss(membership.gangId);

  const isJailed = economy.jailUntil ? economy.jailUntil.getTime() > Date.now() : false;
  const remainingSeconds = isJailed ? Math.ceil((economy.jailUntil!.getTime() - Date.now()) / 1000) : 0;
  const jailStatus = { isJailed, remainingSeconds };

  let voiceSeconds = 0;
  if (voiceRecord) {
    voiceSeconds = voiceRecord.totalSeconds;
    if (voiceRecord.currentSessionStart) {
      voiceSeconds += Math.floor((Date.now() - voiceRecord.currentSessionStart.getTime()) / 1000);
    }
  }

  const isBoss = currentBoss ? currentBoss.userId === userId : false;

  const loyalty = calculateLoyalty(
    membership.joinedAt,
    economy.crimesWon,
    economy.bountiesPaid ?? 0,
    voiceSeconds,
    membership.quotaContributed,
  );

  const prestige = calculatePrestige(
    economy.wallet,
    economy.bank,
    economy.netEarnings,
    economy.crimesWon,
    membership.quotaContributed,
  );

  const rank = getRankFromLoyalty(loyalty.score, isBoss);
  const bankCapacity = rank.bankCapacity;

  return {
    membership,
    economy,
    jailStatus,
    loyalty,
    rank,
    bankCapacity,
    prestige,
    voiceSeconds,
    currentBoss,
    isBoss,
    inventoryCount,
    gangTreasury: membership.gang.treasury,
  };
}

export interface PayQuotaResult {
  success: boolean;
  reason?: 'NO_GANG' | 'INVALID_AMOUNT' | 'LIMIT_REACHED' | 'EXCEEDS_LIMIT' | 'INSUFFICIENT_FUNDS' | 'ERROR';
  message: string;
  amountPaid?: number;
  depositedToday?: number;
  remainingQuota?: number;
  newTreasury?: number;
  loyaltyPointsEarned?: number;
  gangDisplayName?: string;
}

/**
 * Deposits daily quota for a gang member (max 20,000 credits/day).
 * Funds are deducted from user's wallet and transferred into the Gang Treasury.
 * Earns loyalty points which contribute to prestige rank standing.
 */
export async function payGangQuota(userId: string, amount: number): Promise<PayQuotaResult> {
  if (amount <= 0 || !Number.isInteger(amount)) {
    return {
      success: false,
      reason: 'INVALID_AMOUNT',
      message: 'Quota deposit amount must be a positive whole number.',
    };
  }

  const membership = await getUserGang(userId);
  if (!membership) {
    return {
      success: false,
      reason: 'NO_GANG',
      message: 'You are not a member of any gang. Use `/gangjoin` to join a gang before paying quota.',
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const existingDeposit = await prisma.gangQuotaDeposit.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  const depositedToday = existingDeposit?.amount ?? 0;
  const remainingQuota = 20000 - depositedToday;

  if (remainingQuota <= 0) {
    return {
      success: false,
      reason: 'LIMIT_REACHED',
      message: 'You have already deposited your maximum daily quota of **$20,000** today. Come back tomorrow!',
      depositedToday,
      remainingQuota: 0,
    };
  }

  if (amount > remainingQuota) {
    return {
      success: false,
      reason: 'EXCEEDS_LIMIT',
      message: `Deposit exceeds your daily quota ceiling. You can only deposit up to **$${formatNumber(remainingQuota)}** more today (Daily max: $20,000).`,
      depositedToday,
      remainingQuota,
    };
  }

  const userEco = await getUserEconomy(userId);
  if (userEco.wallet < amount) {
    return {
      success: false,
      reason: 'INSUFFICIENT_FUNDS',
      message: `You do not have enough cash in your wallet! You need **$${formatNumber(amount)}**, but currently hold **$${formatNumber(userEco.wallet)}**.`,
      depositedToday,
      remainingQuota,
    };
  }

  // Deduct from user's wallet
  await prisma.userEconomy.update({
    where: { userId },
    data: { wallet: { decrement: amount } },
  });

  // Increment gang treasury
  const updatedGang = await prisma.gang.update({
    where: { id: membership.gangId },
    data: { treasury: { increment: amount } },
  });

  // Track daily quota
  const updatedDeposit = await prisma.gangQuotaDeposit.upsert({
    where: { userId_date: { userId, date: today } },
    update: { amount: { increment: amount } },
    create: {
      userId,
      gangId: membership.gangId,
      date: today,
      amount,
    },
  });

  // Track user's cumulative quota in current gang
  await prisma.userGangMembership.update({
    where: { userId },
    data: { quotaContributed: { increment: amount } },
  });
  invalidateUserGangCache(userId);

  const loyaltyPointsEarned = Math.floor(amount / 50);

  return {
    success: true,
    message: `Successfully contributed **$${formatNumber(amount)}** to **${membership.gang.displayName}** Treasury!`,
    amountPaid: amount,
    depositedToday: updatedDeposit.amount,
    remainingQuota: 20000 - updatedDeposit.amount,
    newTreasury: updatedGang.treasury,
    loyaltyPointsEarned,
    gangDisplayName: membership.gang.displayName,
  };
}

export interface ChangeGangResult {
  success: boolean;
  reason?: 'NO_GANG' | 'SAME_GANG' | 'GANG_NOT_FOUND' | 'ERROR';
  message: string;
  oldGang?: { id: string; name: string; displayName: string; color: string; emoji: string };
  newGang?: { id: string; name: string; displayName: string; color: string; emoji: string };
  totalSeized?: number;
  itemsWiped?: number;
}

/**
 * Defects from current gang to a new gang.
 * All inventory items are wiped.
 * All money (wallet + bank) is seized and deposited into the leaving gang's Treasury.
 * Tenure and quota are reset.
 */
export async function changeGang(userId: string, targetGangIdentifier: string, guild?: Guild): Promise<ChangeGangResult> {
  const membership = await getUserGang(userId);
  if (!membership) {
    return {
      success: false,
      reason: 'NO_GANG',
      message: 'You must belong to a gang first before you can defect. Use `/gangjoin` to pledge allegiance.',
    };
  }

  const targetGang = await prisma.gang.findFirst({
    where: {
      OR: [
        { id: targetGangIdentifier },
        { name: targetGangIdentifier.toLowerCase() },
      ],
    },
  });

  if (!targetGang) {
    return {
      success: false,
      reason: 'GANG_NOT_FOUND',
      message: `Gang "${targetGangIdentifier}" does not exist.`,
    };
  }

  if (membership.gangId === targetGang.id || membership.gang.name === targetGang.name) {
    return {
      success: false,
      reason: 'SAME_GANG',
      message: `You are already a sworn member of **${membership.gang.displayName}**!`,
    };
  }

  const userEco = await getUserEconomy(userId);
  const totalSeized = userEco.wallet + userEco.bank;

  // 1. Wipe inventory items
  const itemsWiped = await prisma.userInventoryItem.count({ where: { userId } });
  if (itemsWiped > 0) {
    await prisma.userInventoryItem.deleteMany({ where: { userId } });
  }

  // 2. Transfer entire personal fortune into old gang's treasury
  if (totalSeized > 0) {
    await prisma.gang.update({
      where: { id: membership.gangId },
      data: { treasury: { increment: totalSeized } },
    });

    await prisma.userEconomy.update({
      where: { userId },
      data: { wallet: 0, bank: 0 },
    });
  }

  // 3. Update gang membership (resets tenure and quota to 0)
  await prisma.userGangMembership.update({
    where: { userId },
    data: {
      gangId: targetGang.id,
      joinedAt: new Date(),
      quotaContributed: 0,
    },
  });
  invalidateUserGangCache(userId);

  // 4. Update server roles if in a guild
  if (guild) {
    try {
      const [oldSetting, newSetting] = await Promise.all([
        prisma.serverGangSettings.findUnique({
          where: { guildId_gangId: { guildId: guild.id, gangId: membership.gangId } },
        }),
        prisma.serverGangSettings.findUnique({
          where: { guildId_gangId: { guildId: guild.id, gangId: targetGang.id } },
        }),
      ]);

      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        if (oldSetting && member.roles.cache.has(oldSetting.roleId)) {
          await member.roles.remove(oldSetting.roleId).catch(() => undefined);
        }
        if (newSetting) {
          await member.roles.add(newSetting.roleId).catch(() => undefined);
        }
      }
    } catch (err) {
      log.warn({ err, userId, guildId: guild.id }, 'Failed to swap Discord gang roles on gang change');
    }
  }

  return {
    success: true,
    message: `You have renounced **${membership.gang.displayName}** and defected to **${targetGang.displayName}**!`,
    oldGang: membership.gang,
    newGang: targetGang,
    totalSeized,
    itemsWiped,
  };
}

/**
 * Get all inventory items owned by a user
 */
export async function getUserInventory(userId: string) {
  return prisma.userInventoryItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

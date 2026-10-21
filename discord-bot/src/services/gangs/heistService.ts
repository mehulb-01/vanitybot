import { prisma } from '../../database/database';
import { addWallet, jailUser, getUserEconomy } from '../economy/economyService';
import { getUserGang } from './gangService';

export interface HeistCategory {
  id: string;
  name: string;
  tierLabel: string;
  emoji: string;
  description: string;
  baseSuccessRate: number;
  minTotalLoot: number;
  maxTotalLoot: number;
  finePerMember: number;
  jailMinutes: number;
}

export const HEIST_CATEGORIES: Record<string, HeistCategory> = {
  transit_depot: {
    id: 'transit_depot',
    name: 'Sub-Level Transit Depot Heist',
    tierLabel: 'Tier 1 • Least Difficult (35% Risk / 65% Success)',
    emoji: '<:41_militarytruck:1551660074408349777>',
    description: 'Ambush an underground mag-train bullion depot at the abandoned subway rail interchange.',
    baseSuccessRate: 0.65,
    minTotalLoot: 60000,
    maxTotalLoot: 120000,
    finePerMember: 500,
    jailMinutes: 2,
  },
  diamond_exchange: {
    id: 'diamond_exchange',
    name: 'Crown Diamond Exchange Bourse',
    tierLabel: 'Tier 2 • Moderate-High Difficulty (48% Risk / 52% Success)',
    emoji: '<:06_diamond:1551659985031659562>',
    description: 'Bypass biometric laser grids and blast into the central international diamond vault room.',
    baseSuccessRate: 0.52,
    minTotalLoot: 180000,
    maxTotalLoot: 330000,
    finePerMember: 1200,
    jailMinutes: 4,
  },
  federal_reserve: {
    id: 'federal_reserve',
    name: 'Apex Syndicate Central Reserve',
    tierLabel: 'Tier 3 • Most Difficult (58% Risk / 42% Success)',
    emoji: '<:53_safe:1551660104271667230>',
    description: 'Execute a dual-pronged thermal lance breach and quantum core cyber-drain of the Central Vault.',
    baseSuccessRate: 0.42,
    minTotalLoot: 420000,
    maxTotalLoot: 750000,
    finePerMember: 3000,
    jailMinutes: 6,
  },
};

export const REQUIRED_HEIST_CREW = 6;

export interface HeistLobby {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  hostId: string;
  categoryId: string;
  members: string[]; // List of user IDs (starts with host, max 6)
  createdAt: number;
  status: 'recruiting' | 'in_progress' | 'completed' | 'cancelled';
}

const activeLobbies = new Map<string, HeistLobby>();

export function getHeistLobby(lobbyId: string): HeistLobby | undefined {
  const lobby = activeLobbies.get(lobbyId);
  if (!lobby) return undefined;
  // Expire inactive lobbies after 15 minutes
  if (Date.now() - lobby.createdAt > 15 * 60 * 1000 && lobby.status === 'recruiting') {
    activeLobbies.delete(lobbyId);
    return undefined;
  }
  return lobby;
}

export function createHeistLobby(
  guildId: string,
  channelId: string,
  hostId: string,
  categoryId: string,
): HeistLobby {
  const lobbyId = `heist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const lobby: HeistLobby = {
    id: lobbyId,
    guildId,
    channelId,
    hostId,
    categoryId,
    members: [hostId],
    createdAt: Date.now(),
    status: 'recruiting',
  };
  activeLobbies.set(lobbyId, lobby);
  return lobby;
}

export interface JoinLobbyResult {
  success: boolean;
  message: string;
  lobby?: HeistLobby;
}

export async function joinHeistLobby(lobbyId: string, userId: string): Promise<JoinLobbyResult> {
  const lobby = getHeistLobby(lobbyId);
  if (!lobby || lobby.status !== 'recruiting') {
    return { success: false, message: 'This heist lobby is no longer recruiting.' };
  }

  if (lobby.members.includes(userId)) {
    return { success: false, message: 'You are already signed up in this heist crew!' };
  }

  if (lobby.members.length >= REQUIRED_HEIST_CREW) {
    return { success: false, message: 'This heist crew is already full (6/6 operatives).' };
  }

  const [membership, economy] = await Promise.all([
    getUserGang(userId),
    getUserEconomy(userId),
  ]);

  if (!membership) {
    return {
      success: false,
      message: 'You must belong to a gang to participate in syndication heists. Join with `/gangjoin`.',
    };
  }

  const isJailed = economy.jailUntil ? economy.jailUntil.getTime() > Date.now() : false;
  if (isJailed) {
    return {
      success: false,
      message: 'You are currently locked up in Policia custody and cannot participate in a heist!',
    };
  }

  lobby.members.push(userId);
  return { success: true, message: 'Successfully joined the heist crew!', lobby };
}

export function leaveHeistLobby(lobbyId: string, userId: string): { success: boolean; message: string; lobby?: HeistLobby } {
  const lobby = getHeistLobby(lobbyId);
  if (!lobby || lobby.status !== 'recruiting') {
    return { success: false, message: 'This heist lobby is no longer active.' };
  }

  if (userId === lobby.hostId) {
    return { success: false, message: 'The heist leader cannot leave. Use "Cancel Heist" to disband the crew.' };
  }

  const index = lobby.members.indexOf(userId);
  if (index === -1) {
    return { success: false, message: 'You are not in this heist crew.' };
  }

  lobby.members.splice(index, 1);
  return { success: true, message: 'You have stepped down from the heist crew.', lobby };
}

export function cancelHeistLobby(lobbyId: string, userId: string): { success: boolean; message: string } {
  const lobby = getHeistLobby(lobbyId);
  if (!lobby) {
    return { success: false, message: 'Heist lobby not found.' };
  }

  if (lobby.hostId !== userId) {
    return { success: false, message: 'Only the heist leader who launched the lobby can cancel it.' };
  }

  lobby.status = 'cancelled';
  activeLobbies.delete(lobbyId);
  return { success: true, message: 'The heist operation has been called off and disbanded.' };
}

export interface HeistExecutionResult {
  success: boolean;
  category: HeistCategory;
  totalLoot: number;
  sharePerMember: number;
  treasuryBonusPerGang: number;
  crewUserIds: string[];
  finePerMember: number;
  jailMinutes: number;
  finalSuccessRate: number;
}

export async function executeHeist(lobbyId: string, userId: string): Promise<HeistExecutionResult> {
  const lobby = getHeistLobby(lobbyId);
  if (!lobby || lobby.status !== 'recruiting') {
    throw new Error('Heist lobby is not currently active.');
  }

  if (lobby.hostId !== userId) {
    throw new Error('Only the heist leader can commence the operation.');
  }

  if (lobby.members.length < REQUIRED_HEIST_CREW) {
    throw new Error(`A syndicate heist strictly requires exactly ${REQUIRED_HEIST_CREW} operatives to commence (currently ${lobby.members.length}/${REQUIRED_HEIST_CREW}).`);
  }

  lobby.status = 'in_progress';
  const category = HEIST_CATEGORIES[lobby.categoryId] ?? HEIST_CATEGORIES.transit_depot;

  // Collective experience roll:
  // Base success + small crew synergy bonus
  const finalSuccessRate = category.baseSuccessRate;
  const roll = Math.random();
  const passed = roll <= finalSuccessRate;

  lobby.status = 'completed';
  activeLobbies.delete(lobbyId);

  if (passed) {
    // Generate total loot
    const totalLoot = Math.floor(Math.random() * (category.maxTotalLoot - category.minTotalLoot + 1)) + category.minTotalLoot;
    const sharePerMember = Math.floor(totalLoot / REQUIRED_HEIST_CREW);
    const treasuryBonus = Math.floor(sharePerMember * 0.1); // 10% bonus goes to gang treasury

    // Payout and record victory for each crew member in parallel
    await Promise.all(
      lobby.members.map(async (memberId) => {
        await addWallet(memberId, sharePerMember, true);
        const membership = await getUserGang(memberId);
        if (membership) {
          await prisma.gang.update({
            where: { id: membership.gangId },
            data: { treasury: { increment: treasuryBonus } },
          }).catch(() => {});
        }
      }),
    );

    return {
      success: true,
      category,
      totalLoot,
      sharePerMember,
      treasuryBonusPerGang: treasuryBonus,
      crewUserIds: [...lobby.members],
      finePerMember: 0,
      jailMinutes: 0,
      finalSuccessRate: Math.round(finalSuccessRate * 100),
    };
  } else {
    // Bust! Policia tactical ambush
    await Promise.all(
      lobby.members.map(async (memberId) => {
        await jailUser(memberId, category.jailMinutes, category.finePerMember);
        await prisma.userEconomy.update({
          where: { userId: memberId },
          data: {
            crimesTotal: { increment: 1 },
            crimesLost: { increment: 1 },
            lastCrimeAt: new Date(),
          },
        }).catch(() => {});
      }),
    );

    return {
      success: false,
      category,
      totalLoot: 0,
      sharePerMember: 0,
      treasuryBonusPerGang: 0,
      crewUserIds: [...lobby.members],
      finePerMember: category.finePerMember,
      jailMinutes: category.jailMinutes,
      finalSuccessRate: Math.round(finalSuccessRate * 100),
    };
  }
}

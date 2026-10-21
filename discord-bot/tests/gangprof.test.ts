import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateLoyalty,
  calculatePrestige,
  getGangProfile,
  getRankFromLoyalty,
  invalidateUserGangCache,
  invalidateBossCache,
} from '../src/services/gangs/gangService';
import gangprofCommand from '../src/bot/commands/gangs/gangprof';

const mockMembership = {
  id: 'm1',
  userId: 'user-123',
  gangId: 'g1',
  quotaContributed: 5000,
  joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
  gang: {
    id: 'g1',
    name: 'kurogane',
    displayName: 'Kurogane',
    color: '#DC143C',
    emoji: '<:58_samuraimask:1551660117966196797>',
    description: 'Forged in iron, bound by honor.',
    treasury: 75000,
  },
};

const mockEconomy = {
  id: 'eco-1',
  userId: 'user-123',
  wallet: 2500,
  bank: 15000,
  bankCapacity: 25000,
  crimesTotal: 12,
  crimesWon: 10,
  crimesLost: 2,
  netEarnings: 18000,
  bountiesPaid: 500,
};

vi.mock('../src/database/database', () => ({
  prisma: {
    userGangMembership: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        if (where.userId === 'user-123') return Promise.resolve(mockMembership);
        return Promise.resolve(null);
      }),
    },
    userEconomy: {
      upsert: vi.fn().mockImplementation(() => Promise.resolve(mockEconomy)),
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(mockEconomy)),
    },
    voiceTime: {
      findUnique: vi.fn().mockResolvedValue({ totalSeconds: 7200, currentSessionStart: null }),
    },
    gangBoss: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userInventoryItem: {
      count: vi.fn().mockResolvedValue(3),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('Loyalty & Rank calculations', () => {
  it('calculates loyalty score and tenure correctly', () => {
    const joinedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days
    const loyalty = calculateLoyalty(joinedAt, 10, 500, 7200); // 5*10 + 10*25 + 50 + 2*15 = 50 + 250 + 50 + 30 = 380
    expect(loyalty.score).toBe(380);
    expect(loyalty.daysInGang).toBe(5);
  });

  it('maps loyalty score to correct gang ranks and dynamic bank capacities', () => {
    // Rank 1: Street Runner (< 1,000 pts) -> 1,000,000 cap
    const r1 = getRankFromLoyalty(500);
    expect(r1.level).toBe(1);
    expect(r1.title).toBe('Street Runner');
    expect(r1.bankCapacity).toBe(1_000_000);
    expect(r1.emoji).toContain('69_rankchevron1');

    // Rank 2: Street Soldier (1,000 - 2,499 pts) -> 3,000,000 cap
    const r2 = getRankFromLoyalty(1500);
    expect(r2.level).toBe(2);
    expect(r2.title).toBe('Street Soldier');
    expect(r2.bankCapacity).toBe(3_000_000);
    expect(r2.emoji).toContain('70_rankchevron2');

    // Rank 3: Enforcer (2,500 - 4,999 pts) -> 5,000,000 cap
    const r3 = getRankFromLoyalty(3000);
    expect(r3.level).toBe(3);
    expect(r3.title).toBe('Enforcer');
    expect(r3.bankCapacity).toBe(5_000_000);
    expect(r3.emoji).toContain('71_rankchevron3');

    // Rank 4: Lieutenant (5,000 - 9,999 pts) -> 10,000,000,000 cap
    const r4 = getRankFromLoyalty(7500);
    expect(r4.level).toBe(4);
    expect(r4.title).toBe('Lieutenant');
    expect(r4.bankCapacity).toBe(10_000_000_000);
    expect(r4.emoji).toContain('72_star');

    // Rank 5: Underboss (10,000+ pts) -> 10,000,000,000 cap
    const r5 = getRankFromLoyalty(12000);
    expect(r5.level).toBe(5);
    expect(r5.title).toBe('Underboss');
    expect(r5.bankCapacity).toBe(10_000_000_000);
    expect(r5.emoji).toContain('73_wingedstar');

    // Boss: Gang Boss -> 10,000,000,000 cap
    const boss = getRankFromLoyalty(500, true);
    expect(boss.level).toBe(6);
    expect(boss.title).toBe('Gang Boss');
    expect(boss.bankCapacity).toBe(10_000_000_000);
    expect(boss.emoji).toContain('68_crown');
  });
});

describe('getGangProfile service', () => {
  it('returns complete profile data when user is a gang member', async () => {
    const profile = await getGangProfile('user-123', 'guild-1');
    expect(profile).not.toBeNull();
    expect(profile?.membership.gang.name).toBe('kurogane');
    expect(profile?.loyalty.score).toBeGreaterThan(0);
    expect(profile?.rank.title).toBeDefined();
    expect(profile?.bankCapacity).toBeGreaterThanOrEqual(1_000_000);
    expect(profile?.voiceSeconds).toBe(7200);
    expect(profile?.isBoss).toBe(false);
  });

  it('returns null when user is not a gang member', async () => {
    const profile = await getGangProfile('civilian-999');
    expect(profile).toBeNull();
  });
});

describe('/gangprof command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateUserGangCache();
    invalidateBossCache();
  });

  it('replies with warning when user is not in a gang', async () => {
    const mockInteraction: any = {
      user: { id: 'civilian-999', username: 'Civilian' },
      options: {
        getUser: vi.fn().mockReturnValue(null),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await gangprofCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it('replies with full gang profile embed matching user format and custom emojis', async () => {
    const mockInteraction: any = {
      user: {
        id: 'user-123',
        username: 'StreetSamurai',
        displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
      },
      options: {
        getUser: vi.fn().mockReturnValue(null),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await gangprofCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    const embed = replyCall.embeds[0].data;

    expect(embed.title).toContain('Gang Profile — StreetSamurai');
    expect(embed.description).toContain('Gang Treasury:');
    expect(embed.description).toContain('Gang Boss:');
    expect(embed.description).toContain('Inducted:');
    // Exactly 4 fields (Rank & Standing, Financial Status, Criminal Operations, Policia Status & Comms)
    // Perk field removed!
    expect(embed.fields).toHaveLength(4);

    // Verify Rank & Standing field
    const standingField = embed.fields.find((f: any) => f.name.includes('Rank & Standing'));
    expect(standingField).toBeDefined();
    expect(standingField.name).toContain('74_medal');
    expect(standingField.value).toContain('contributed');
    expect(standingField.value).not.toContain('Prestige Score:');
    expect(standingField.value).not.toContain('Tenure:');

    // Verify Financial Status field
    const balanceField = embed.fields.find((f: any) => f.name.includes('Financial Status'));
    expect(balanceField).toBeDefined();
    expect(balanceField.name).toContain('53_safe');
    expect(balanceField.value).toContain('in hand');
    expect(balanceField.value).toContain('Inventory has');
    expect(balanceField.value).not.toContain('Total Net Worth:');

    // Verify Criminal Operations field
    const crimeField = embed.fields.find((f: any) => f.name.includes('Criminal Operations'));
    expect(crimeField).toBeDefined();
    expect(crimeField.name).toContain('19_contractdocument');
    expect(crimeField.value).toContain('heists pulled');
    expect(crimeField.value).toContain('profit made');
    expect(crimeField.value).toContain('spent for crew bails');

    // Verify Policia Status field
    const policiaField = embed.fields.find((f: any) => f.name.includes('Policia Status & Comms'));
    expect(policiaField).toBeDefined();
    expect(policiaField.name).toContain('policia');
    expect(policiaField.value).toContain('Clean Record (Active on Streets)');
    expect(policiaField.value).toContain('Voice Comms Logged:');
  });
});


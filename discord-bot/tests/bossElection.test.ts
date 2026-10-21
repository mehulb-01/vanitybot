import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDaysInMonth,
  getCurrentTermMonth,
  getGangNominees,
  castBossVote,
  resolveMonthlyBossElections,
} from '../src/services/gangs/gangService';
import bossvoteCommand from '../src/bot/commands/gangs/bossvote';

// Mock DB data
const mockMemberships = [
  { id: 'm1', userId: 'user-1', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
  { id: 'm2', userId: 'user-2', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
  { id: 'm3', userId: 'user-3', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
  { id: 'm4', userId: 'user-4', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
  { id: 'm5', userId: 'user-5', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
  { id: 'm6', userId: 'voter-6', gangId: 'kurogane', joinedAt: new Date('2026-01-01'), gang: { displayName: 'Kurogane', name: 'kurogane', color: '#DC143C', emoji: '⚔️' } },
];

const mockEconomies = [
  { userId: 'user-1', wallet: 100000, bank: 200000, netEarnings: 150000, crimesWon: 20 }, // highest
  { userId: 'user-2', wallet: 80000, bank: 100000, netEarnings: 90000, crimesWon: 15 },
  { userId: 'user-3', wallet: 50000, bank: 60000, netEarnings: 50000, crimesWon: 10 },
  { userId: 'user-4', wallet: 30000, bank: 40000, netEarnings: 30000, crimesWon: 5 },
  { userId: 'user-5', wallet: 10000, bank: 15000, netEarnings: 10000, crimesWon: 2 },
  { userId: 'voter-6', wallet: 100, bank: 500, netEarnings: 200, crimesWon: 0 }, // 6th: not nominated
];

let votesState: Array<{ id: string; gangId: string; voterId: string; candidateId: string; month: string }> = [];
let bossesState: Array<any> = [];

vi.mock('../src/database/database', () => ({
  prisma: {
    userGangMembership: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        const found = mockMemberships.find((m) => m.userId === where.userId);
        return Promise.resolve(found ?? null);
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { gangId: string } }) => {
        return Promise.resolve(mockMemberships.filter((m) => m.gangId === where.gangId));
      }),
    },
    userEconomy: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { userId: { in: string[] } } }) => {
        return Promise.resolve(mockEconomies.filter((e) => where.userId.in.includes(e.userId)));
      }),
    },
    gangVote: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { voterId_month: { voterId: string; month: string } } }) => {
        const v = votesState.find((x) => x.voterId === where.voterId_month.voterId && x.month === where.voterId_month.month);
        return Promise.resolve(v ?? null);
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { gangId: string; month: string } }) => {
        return Promise.resolve(votesState.filter((x) => x.gangId === where.gangId && x.month === where.month));
      }),
      create: vi.fn().mockImplementation(({ data }: { data: any }) => {
        const created = { id: `v-${Date.now()}`, ...data };
        votesState.push(created);
        return Promise.resolve(created);
      }),
    },
    gangBoss: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
        const gangIds = where.gangId ? [where.gangId] : (where.OR ? where.OR.map((o: any) => o.gangId).filter(Boolean) : []);
        const matchesGang = (b: any) => gangIds.length === 0 || gangIds.includes(b.gangId);
        if (where.termMonth) {
          const found = bossesState.find((b) => matchesGang(b) && b.termMonth === where.termMonth);
          return Promise.resolve(found ?? null);
        }
        return Promise.resolve(bossesState.find(matchesGang) ?? null);
      }),
      create: vi.fn().mockImplementation(({ data }: { data: any }) => {
        const created = { id: `b-${Date.now()}`, ...data };
        bossesState.push(created);
        return Promise.resolve(created);
      }),
      upsert: vi.fn().mockImplementation(({ where, update, create }: { where: { gangId: string }; update: any; create: any }) => {
        const existingIndex = bossesState.findIndex((b) => b.gangId === where.gangId);
        if (existingIndex >= 0) {
          bossesState[existingIndex] = { ...bossesState[existingIndex], ...update };
          return Promise.resolve(bossesState[existingIndex]);
        }
        const created = { id: `b-${Date.now()}`, ...create };
        bossesState.push(created);
        return Promise.resolve(created);
      }),
    },
    guildSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('Monthly Boss Election Logic', () => {
  beforeEach(() => {
    votesState = [];
    bossesState = [];
    vi.clearAllMocks();
  });

  it('correctly calculates days in month dynamically for 28, 29, 30, and 31', () => {
    // February 2025: 28 days (non-leap)
    expect(getDaysInMonth(2025, 1)).toBe(28);
    // February 2024: 29 days (leap year)
    expect(getDaysInMonth(2024, 1)).toBe(29);
    // April (month 3): 30 days
    expect(getDaysInMonth(2026, 3)).toBe(30);
    // January (month 0): 31 days
    expect(getDaysInMonth(2026, 0)).toBe(31);
  });

  it('identifies top 5 rank holders globally by loyalty score as nominees', async () => {
    const nominees = await getGangNominees('kurogane');
    expect(nominees).toHaveLength(5);
    // Top nominee should be user-1
    expect(nominees[0].userId).toBe('user-1');
    expect(nominees[0].loyaltyScore).toBeGreaterThan(nominees[1].loyaltyScore);
    // voter-6 is 6th and should not be nominated
    expect(nominees.some((n) => n.userId === 'voter-6')).toBe(false);
  });

  it('strictly rejects nominated users from voting with required response string', async () => {
    // user-1 is nominated
    const result = await castBossVote('user-1', 'user-2');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('NOMINATED');
    expect(result.message).toBe("You have been nominated for voting this month, don't act smart.");
  });

  it('allows non-nominated gang member to vote for a nominated candidate', async () => {
    // voter-6 is not nominated
    const result = await castBossVote('voter-6', 'user-1');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Your ballot has been cast');

    // Trying to vote again in the same month fails
    const duplicateVote = await castBossVote('voter-6', 'user-2');
    expect(duplicateVote.success).toBe(false);
    expect(duplicateVote.reason).toBe('ALREADY_VOTED');
  });

  it('rejects votes for candidates who are not among the top 5 nominees', async () => {
    // voter-6 votes for civilian-999 (not nominated)
    const result = await castBossVote('voter-6', 'civilian-999');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('INVALID_CANDIDATE');
  });

  it('resolves election by popular vote mandate when ballots exist', async () => {
    const currentMonth = getCurrentTermMonth();
    votesState.push({
      id: 'v1',
      gangId: 'kurogane',
      voterId: 'voter-6',
      candidateId: 'user-2',
      month: currentMonth,
    });

    const reports = await resolveMonthlyBossElections();
    const kuroganeReport = reports.find((r) => r.gangId === 'kurogane');

    expect(kuroganeReport).toBeDefined();
    expect(kuroganeReport?.bossUserId).toBe('user-2');
    expect(kuroganeReport?.electedBy).toBe('VOTE');
    expect(kuroganeReport?.votesCount).toBe(1);
    expect(kuroganeReport?.announcementText).toContain('The Syndicate has given its verdict!');
    expect(kuroganeReport?.announcementText).toContain('by popular mandate of the gang members');
  });

  it('resolves election by The Syndicate appointment (RNG) when 0 votes are cast', async () => {
    // No votes in votesState
    const reports = await resolveMonthlyBossElections();
    const kuroganeReport = reports.find((r) => r.gangId === 'kurogane');

    expect(kuroganeReport).toBeDefined();
    expect(kuroganeReport?.electedBy).toBe('RNG');
    expect(kuroganeReport?.votesCount).toBe(0);
    expect(kuroganeReport?.announcementText).toContain('The Syndicate has given its verdict!');
    expect(kuroganeReport?.announcementText).toContain('the gang boss has been elected by **The Syndicate**');
  });

  it('upserts boss cleanly when a boss already exists from a previous month without unique constraint collision', async () => {
    const currentMonth = getCurrentTermMonth();
    // Simulate previous month's bosses already existing in DB
    bossesState.push({
      id: 'b-old-omerta',
      gangId: 'omerta',
      userId: '798851339119624203',
      termMonth: '2026-08',
      electedBy: 'PERMANENT',
      votesCount: 0,
      electedAt: new Date('2026-08-01'),
      expiresAt: new Date('2026-08-31'),
    });
    bossesState.push({
      id: 'b-old-kurogane',
      gangId: 'kurogane',
      userId: 'user-old',
      termMonth: '2026-08',
      electedBy: 'RNG',
      votesCount: 0,
      electedAt: new Date('2026-08-01'),
      expiresAt: new Date('2026-08-31'),
    });

    const reports = await resolveMonthlyBossElections();
    expect(reports.length).toBeGreaterThan(0);

    const omertaBoss = bossesState.find((b) => b.gangId === 'omerta');
    expect(omertaBoss).toBeDefined();
    expect(omertaBoss?.termMonth).toBe(currentMonth);

    const kuroganeBoss = bossesState.find((b) => b.gangId === 'kurogane');
    expect(kuroganeBoss).toBeDefined();
    expect(kuroganeBoss?.termMonth).toBe(currentMonth);

    // Verify only 1 row exists per gangId in bossesState (no duplicate constraint violations)
    const omertaRows = bossesState.filter((b) => b.gangId === 'omerta');
    expect(omertaRows).toHaveLength(1);
    const kuroganeRows = bossesState.filter((b) => b.gangId === 'kurogane');
    expect(kuroganeRows).toHaveLength(1);
  });
});

describe('/bossvote Slash Command', () => {
  it('replies with exact message when nominated user tries to run /bossvote', async () => {
    const mockInteraction: any = {
      user: { id: 'user-1' }, // nominated
      options: {
        getUser: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn(),
    };

    await bossvoteCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "You have been nominated for voting this month, don't act smart.",
        flags: 64, // Ephemeral
      }),
    );
  });

  it('shows ballot embed and select menu to eligible non-nominated member', async () => {
    const mockInteraction: any = {
      user: { id: 'voter-6' }, // eligible voter
      options: {
        getUser: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn(),
    };

    await bossvoteCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: 64, // Ephemeral
      }),
    );
    const replyCall = mockInteraction.reply.mock.calls[0][0];
    expect(replyCall.embeds[0].data.title).toContain('Monthly Boss Election');
  });
});

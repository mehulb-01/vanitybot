import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory economy store
const mockEconomyStore: Record<string, any> = {};

vi.mock('../src/database/database', () => ({
  prisma: {
    userEconomy: {
      upsert: vi.fn().mockImplementation(({ where, create }: { where: { userId: string }; create: any }) => {
        if (!mockEconomyStore[where.userId]) {
          mockEconomyStore[where.userId] = {
            id: `eco-${where.userId}`,
            ...create,
            crimesTotal: 0,
            crimesWon: 0,
            crimesLost: 0,
            netEarnings: 0,
            bountiesPaid: 0,
          };
        }
        return Promise.resolve({ ...mockEconomyStore[where.userId] });
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(mockEconomyStore[where.userId] ? { ...mockEconomyStore[where.userId] } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { userId: string }; data: any }) => {
        mockEconomyStore[where.userId] = {
          ...mockEconomyStore[where.userId],
          ...data,
        };
        return Promise.resolve({ ...mockEconomyStore[where.userId] });
      }),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    ttl: vi.fn().mockResolvedValue(-2),
  },
}));

import {
  getUserEconomy,
  mugUser,
  clearTargetMugCooldown,
  getTargetMugCooldown,
  MUG_COOLDOWN_MS,
  MUG_MAX_AMOUNT,
} from '../src/services/economy/economyService';
import mugCommand from '../src/bot/commands/economy/mug';

describe('/mug & Mugging Service', () => {
  beforeEach(() => {
    clearTargetMugCooldown();
    for (const key of Object.keys(mockEconomyStore)) {
      delete mockEconomyStore[key];
    }
    vi.clearAllMocks();
  });

  it('rejects mugging oneself', async () => {
    const result = await mugUser('user-1', 'user-1');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('SELF');
    expect(result.stolenAmount).toBe(0);
  });

  it('rejects mugging a bot', async () => {
    const result = await mugUser('user-1', 'bot-123', true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('BOT');
    expect(result.stolenAmount).toBe(0);
  });

  it('rejects when robber is in jail', async () => {
    await getUserEconomy('robber-jailed');
    mockEconomyStore['robber-jailed'].jailUntil = new Date(Date.now() + 1000 * 60 * 5); // 5 min jail

    const result = await mugUser('robber-jailed', 'target-user');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('ROBBER_JAILED');
  });

  it('rejects when target is in jail', async () => {
    await getUserEconomy('robber');
    await getUserEconomy('target-jailed');
    mockEconomyStore['target-jailed'].jailUntil = new Date(Date.now() + 1000 * 60 * 5);

    const result = await mugUser('robber', 'target-jailed');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('TARGET_JAILED');
  });

  it('successfully mugs money up to $2,500 from target', async () => {
    await getUserEconomy('robber');
    await getUserEconomy('target');
    mockEconomyStore['robber'].wallet = 1000;
    mockEconomyStore['target'].wallet = 10000;

    const result = await mugUser('robber', 'target');
    expect(result.success).toBe(true);
    expect(result.stolenAmount).toBeGreaterThan(0);
    expect(result.stolenAmount).toBeLessThanOrEqual(MUG_MAX_AMOUNT);

    // Robber received stolen cash
    expect(mockEconomyStore['robber'].wallet).toBe(1000 + result.stolenAmount);
    expect(mockEconomyStore['robber'].crimesWon).toBe(1);
    expect(mockEconomyStore['robber'].netEarnings).toBe(result.stolenAmount);

    // Target had stolen cash deducted
    expect(mockEconomyStore['target'].wallet).toBe(10000 - result.stolenAmount);
  });

  it('handles target with less than $2,500 without going negative', async () => {
    await getUserEconomy('robber');
    await getUserEconomy('poor-target');
    mockEconomyStore['robber'].wallet = 500;
    mockEconomyStore['poor-target'].wallet = 300;

    const result = await mugUser('robber', 'poor-target');
    expect(result.success).toBe(true);
    expect(result.stolenAmount).toBeGreaterThan(0);
    expect(result.stolenAmount).toBeLessThanOrEqual(300);

    expect(mockEconomyStore['poor-target'].wallet).toBe(300 - result.stolenAmount);
    expect(mockEconomyStore['poor-target'].wallet).toBeGreaterThanOrEqual(0);
    expect(mockEconomyStore['robber'].wallet).toBe(500 + result.stolenAmount);
  });

  it('handles target with $0 wallet (EMPTY_POCKETS) and still triggers cooldown', async () => {
    await getUserEconomy('robber');
    await getUserEconomy('broke-target');
    mockEconomyStore['robber'].wallet = 500;
    mockEconomyStore['broke-target'].wallet = 0;

    const result = await mugUser('robber', 'broke-target');
    expect(result.success).toBe(true);
    expect(result.stolenAmount).toBe(0);
    expect(result.reason).toBe('EMPTY_POCKETS');

    // Target is now on cooldown
    const cd = await getTargetMugCooldown('broke-target');
    expect(cd.isOnCooldown).toBe(true);
  });

  it('enforces 25-minute cooldown on the victim', async () => {
    await getUserEconomy('robber-1');
    await getUserEconomy('robber-2');
    await getUserEconomy('target');
    mockEconomyStore['robber-1'].wallet = 1000;
    mockEconomyStore['robber-2'].wallet = 1000;
    mockEconomyStore['target'].wallet = 5000;

    // First mugging succeeds
    const firstMug = await mugUser('robber-1', 'target');
    expect(firstMug.success).toBe(true);

    // Target is on cooldown
    const cd = await getTargetMugCooldown('target');
    expect(cd.isOnCooldown).toBe(true);
    expect(cd.remainingMs).toBeGreaterThan(0);
    expect(cd.remainingMs).toBeLessThanOrEqual(MUG_COOLDOWN_MS);

    // Second mugging on same target within 25 minutes is rejected
    const secondMug = await mugUser('robber-2', 'target');
    expect(secondMug.success).toBe(false);
    expect(secondMug.reason).toBe('TARGET_COOLDOWN');
    expect(secondMug.remainingMs).toBeGreaterThan(0);
  });

  describe('/mug slash command interaction', () => {
    it('executes and replies with success embed on valid mugging', async () => {
      await getUserEconomy('robber-user');
      await getUserEconomy('target-user');
      mockEconomyStore['robber-user'].wallet = 500;
      mockEconomyStore['target-user'].wallet = 3000;

      const mockInteraction: any = {
        user: { id: 'robber-user', username: 'Bandit' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'target-user', username: 'Victim', bot: false }),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await mugCommand.execute(mockInteraction, {} as any);

      expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
      expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);

      const replyArgs = mockInteraction.editReply.mock.calls[0][0];
      const embed = replyArgs.embeds[0].data;

      expect(embed.title).toContain('Street Mugging Executed');
      expect(embed.description).toContain('Cash Stolen:');
      expect(embed.description).toContain('Victim Cooldown:');
      expect(embed.description).toContain('<@target-user>');
    });

    it('displays target on high alert warning when victim is on cooldown', async () => {
      await getUserEconomy('robber-user');
      await getUserEconomy('target-user');
      mockEconomyStore['target-user'].wallet = 3000;

      // First mugging
      await mugUser('other-robber', 'target-user');

      const mockInteraction: any = {
        user: { id: 'robber-user', username: 'Bandit' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'target-user', username: 'Victim', bot: false }),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await mugCommand.execute(mockInteraction, {} as any);

      const replyArgs = mockInteraction.editReply.mock.calls[0][0];
      const embed = replyArgs.embeds[0].data;

      expect(embed.title).toContain('Target On High Alert');
      expect(embed.description).toContain('Can be targeted again:');
    });
  });
});

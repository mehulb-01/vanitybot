import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
const mockUserEconomyStore: Record<string, any> = {};
const mockGangMembershipStore: Record<string, any> = {};

vi.mock('../src/database/database', () => ({
  prisma: {
    userEconomy: {
      upsert: vi.fn().mockImplementation(({ where, create }: { where: { userId: string }; create: any }) => {
        if (!mockUserEconomyStore[where.userId]) {
          mockUserEconomyStore[where.userId] = { id: 'eco-1', ...create, crimesTotal: 0, crimesWon: 0, crimesLost: 0, netEarnings: 0, bountiesPaid: 0 };
        }
        return Promise.resolve({ ...mockUserEconomyStore[where.userId] });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { userId: string }; data: any }) => {
        mockUserEconomyStore[where.userId] = {
          ...mockUserEconomyStore[where.userId],
          ...data,
        };
        return Promise.resolve({ ...mockUserEconomyStore[where.userId] });
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(mockUserEconomyStore[where.userId] ? { ...mockUserEconomyStore[where.userId] } : null);
      }),
    },
    userGangMembership: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(mockGangMembershipStore[where.userId] ?? null);
      }),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

import {
  getUserEconomy,
  addWallet,
  deductWallet,
  depositToBank,
  withdrawFromBank,
  jailUser,
  checkJailStatus,
  releaseFromJail,
  payBail,
  clockIn,
} from '../src/services/economy/economyService';

import {
  CRIME_OPERATIONS,
  resolveCrime,
  startCrimeSession,
  getActiveCrimeSession,
  clearCrimeSession,
} from '../src/services/gangs/crimeService';

describe('Economy Service', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockUserEconomyStore)) {
      delete mockUserEconomyStore[key];
    }
    for (const key of Object.keys(mockGangMembershipStore)) {
      delete mockGangMembershipStore[key];
    }
  });

  it('should initialize a user with 500 starting credits and 25000 bank capacity', async () => {
    const profile = await getUserEconomy('user-100');
    expect(profile.wallet).toBe(500);
    expect(profile.bank).toBe(0);
    expect(profile.bankCapacity).toBe(25000);
  });

  it('should add wallet balance and track crime stats when isCrime is true', async () => {
    await getUserEconomy('user-100');
    const updated = await addWallet('user-100', 300, true);

    expect(updated.wallet).toBe(800);
    expect(updated.crimesTotal).toBe(1);
    expect(updated.crimesWon).toBe(1);
    expect(updated.netEarnings).toBe(300);
  });

  it('should deduct wallet balance and clamp at zero', async () => {
    await getUserEconomy('user-100'); // 500
    const deducted = await deductWallet('user-100', 200);
    expect(deducted).toBe(200);

    const profile = await getUserEconomy('user-100');
    expect(profile.wallet).toBe(300);

    // Deduct more than available
    const overDeducted = await deductWallet('user-100', 1000);
    expect(overDeducted).toBe(300);

    const empty = await getUserEconomy('user-100');
    expect(empty.wallet).toBe(0);
  });

  it('should deposit credits into bank safely respecting capacity', async () => {
    await getUserEconomy('user-100'); // wallet: 500, bank: 0, capacity: 25000
    const res = await depositToBank('user-100', 300);
    expect(res.success).toBe(true);
    expect(res.deposited).toBe(300);

    const current = await getUserEconomy('user-100');
    expect(current.wallet).toBe(200);
    expect(current.bank).toBe(300);
  });

  it('should fail deposit if wallet has insufficient funds', async () => {
    await getUserEconomy('user-100'); // wallet: 500
    const res = await depositToBank('user-100', 1000);
    expect(res.success).toBe(false);
    expect(res.message).toContain('only have **$500**');
  });

  it('should withdraw credits from bank into wallet', async () => {
    await getUserEconomy('user-100');
    await depositToBank('user-100', 400); // wallet: 100, bank: 400

    const withdrawRes = await withdrawFromBank('user-100', 250);
    expect(withdrawRes.success).toBe(true);
    expect(withdrawRes.withdrawn).toBe(250);

    const current = await getUserEconomy('user-100');
    expect(current.wallet).toBe(350);
    expect(current.bank).toBe(150);
  });

  it('should correctly manage jail status, fines, and release', async () => {
    await getUserEconomy('user-100'); // wallet: 500
    const { finePaid } = await jailUser('user-100', 3, 200);

    expect(finePaid).toBe(200);

    const status = await checkJailStatus('user-100');
    expect(status.isJailed).toBe(true);
    expect(status.remainingSeconds).toBeGreaterThan(0);

    await releaseFromJail('user-100');
    const freedStatus = await checkJailStatus('user-100');
    expect(freedStatus.isJailed).toBe(false);
  });

  it('should allow another gang member to pay bail for a jailed member', async () => {
    // Member A is jailed
    await getUserEconomy('jailed-user');
    await jailUser('jailed-user', 5, 200);

    // Member B has 2000 credits
    await getUserEconomy('bailer-user');
    await addWallet('bailer-user', 1500); // 2000 total

    const bailRes = await payBail('bailer-user', 'jailed-user', 500);
    expect(bailRes.success).toBe(true);

    const targetStatus = await checkJailStatus('jailed-user');
    expect(targetStatus.isJailed).toBe(false);

    const bailerEco = await getUserEconomy('bailer-user');
    expect(bailerEco.wallet).toBe(1500); // 2000 - 500
    expect(bailerEco.bountiesPaid).toBe(500);
  });

  it('prohibits self-bail if user liquid wallet has less than 150k', async () => {
    await getUserEconomy('self-jailed-user');
    await jailUser('self-jailed-user', 5, 0);

    // Give user 100k (less than 150k)
    await addWallet('self-jailed-user', 99500); // 100k total
    const ecoBefore = await getUserEconomy('self-jailed-user');
    expect(ecoBefore.wallet).toBe(100000);

    const bailRes = await payBail('self-jailed-user', 'self-jailed-user', 500);
    expect(bailRes.success).toBe(false);
    expect(bailRes.message).toContain('150,000');

    // Confirm user is still jailed
    const jailStatus = await checkJailStatus('self-jailed-user');
    expect(jailStatus.isJailed).toBe(true);
  });

  it('allows self-bail if user liquid wallet has 150k+ at present', async () => {
    await getUserEconomy('rich-jailed-user');
    await jailUser('rich-jailed-user', 5, 0);

    // Give user 150k+
    await addWallet('rich-jailed-user', 149500); // 150,000 total
    const ecoBefore = await getUserEconomy('rich-jailed-user');
    expect(ecoBefore.wallet).toBe(150000);

    const bailRes = await payBail('rich-jailed-user', 'rich-jailed-user', 500);
    expect(bailRes.success).toBe(true);

    // Confirm user is freed and bail is deducted
    const jailStatus = await checkJailStatus('rich-jailed-user');
    expect(jailStatus.isJailed).toBe(false);

    const ecoAfter = await getUserEconomy('rich-jailed-user');
    expect(ecoAfter.wallet).toBe(149500); // 150,000 - 500
  });

  it('should grant daily login bonus of $5,000 on clockIn', async () => {
    await getUserEconomy('clockin-user'); // 500 wallet
    const res = await clockIn('clockin-user');
    expect(res.success).toBe(true);
    expect(res.reward).toBe(5000);
    expect(res.newWallet).toBe(5500);

    const user = await getUserEconomy('clockin-user');
    expect(user.wallet).toBe(5500);
  });

  it('should enforce 24-hour cooldown on clockIn', async () => {
    await getUserEconomy('clockin-cooldown-user');
    const first = await clockIn('clockin-cooldown-user');
    expect(first.success).toBe(true);

    const second = await clockIn('clockin-cooldown-user');
    expect(second.success).toBe(false);
    expect(second.remainingMs).toBeGreaterThan(0);
    expect(second.message).toContain('already clocked in');
  });
});

describe('Crime Operations & Resolution Engine', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockUserEconomyStore)) {
      delete mockUserEconomyStore[key];
    }
    for (const key of Object.keys(mockGangMembershipStore)) {
      delete mockGangMembershipStore[key];
    }
    clearCrimeSession('criminal-1');
  });

  it('should have 4 distinct crime operations defined with risk levels and stages', () => {
    const keys = Object.keys(CRIME_OPERATIONS);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('street_hustle');
    expect(keys).toContain('convenience_raid');
    expect(keys).toContain('cyber_vault');
    expect(keys).toContain('armored_convoy');

    for (const op of Object.values(CRIME_OPERATIONS)) {
      expect(op.stage1.choices).toHaveLength(4);
      expect(op.stage2.choices).toHaveLength(4);
      expect(op.minPayout).toBeLessThan(op.maxPayout);
      expect(op.fine).toBeGreaterThan(0);
      expect(op.jailMinutes).toBeGreaterThan(0);
    }
  });

  it('should manage crime sessions cleanly', () => {
    const session = startCrimeSession('criminal-1', 'guild-1', 'cyber_vault');
    expect(session.crimeId).toBe('cyber_vault');

    const active = getActiveCrimeSession('criminal-1');
    expect(active?.crimeId).toBe('cyber_vault');

    clearCrimeSession('criminal-1');
    expect(getActiveCrimeSession('criminal-1')).toBeUndefined();
  });

  it('should resolve crime with gang synergy bonus for favored gang', async () => {
    await getUserEconomy('criminal-1');
    // Assign to Moroz syndicate
    mockGangMembershipStore['criminal-1'] = {
      gang: {
        id: 'g-moroz',
        name: 'moroz',
        displayName: 'Moroz',
        color: '#4169E1',
      },
    };

    // Force Math.random to pass (0.01)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const result = await resolveCrime('criminal-1', 'cyber_vault', 'icebreaker', 'proxy');
    expect(result.success).toBe(true);
    expect(result.gangBonusActive).toBe(true);
    expect(result.userGangName).toBe('Moroz');
    expect(result.payout).toBeGreaterThanOrEqual(1800);

    randomSpy.mockRestore();
  });

  it('should apply Policia jail and fines when crime roll fails', async () => {
    await getUserEconomy('criminal-1'); // 500 wallet
    // Force Math.random to fail (0.99)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = await resolveCrime('criminal-1', 'convenience_raid', 'hostage', 'shootout');
    expect(result.success).toBe(false);
    expect(result.finePaid).toBe(250);
    expect(result.jailMinutes).toBe(2);

    const jailCheck = await checkJailStatus('criminal-1');
    expect(jailCheck.isJailed).toBe(true);

    randomSpy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  playRoulette,
  playGambit,
  playLaunder,
} from '../src/services/gangs/gangGamesService';

// In-memory mock database state
interface MockEconomy {
  userId: string;
  wallet: number;
  bank: number;
  bankCapacity: number;
  jailUntil: Date | null;
}

const mockEconomyStore: Record<string, MockEconomy> = {};
let mockGangTreasury = 0;

vi.mock('../src/database/database', () => ({
  prisma: {
    userEconomy: {
      upsert: vi.fn().mockImplementation(({ where, create }: { where: { userId: string }; create: any }) => {
        if (!mockEconomyStore[where.userId]) {
          mockEconomyStore[where.userId] = {
            userId: where.userId,
            wallet: create.wallet ?? 500,
            bank: create.bank ?? 0,
            bankCapacity: 25000,
            jailUntil: null,
          };
        }
        return Promise.resolve({ ...mockEconomyStore[where.userId] });
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(mockEconomyStore[where.userId] ? { ...mockEconomyStore[where.userId] } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { userId: string }; data: any }) => {
        const current = mockEconomyStore[where.userId] ?? {
          userId: where.userId,
          wallet: 0,
          bank: 0,
          bankCapacity: 25000,
          jailUntil: null,
        };
        const updated = {
          ...current,
          wallet: data.wallet !== undefined ? data.wallet : current.wallet,
        };
        mockEconomyStore[where.userId] = updated;
        return Promise.resolve({ ...updated });
      }),
    },
    gang: {
      update: vi.fn().mockImplementation(({ data }: { data: any }) => {
        if (data.treasury?.increment) {
          mockGangTreasury += data.treasury.increment;
        }
        return Promise.resolve({ id: 'gang-1', treasury: mockGangTreasury });
      }),
    },
  },
}));

vi.mock('../src/services/gangs/gangService', () => ({
  getUserGang: vi.fn().mockResolvedValue({
    id: 'm-1',
    gangId: 'gang-1',
    gang: { id: 'gang-1', displayName: 'Yakuza Syndicate', treasury: 10000 },
  }),
}));

describe('Gang Games: Roulette, Gambit, and Launder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGangTreasury = 10000;
    mockEconomyStore['user-1'] = {
      userId: 'user-1',
      wallet: 5000,
      bank: 0,
      bankCapacity: 25000,
      jailUntil: null,
    };
  });

  describe('Russian Roulette (/roulette)', () => {
    it('rejects wagers below minimum ($100)', async () => {
      const result = await playRoulette('user-1', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum wager is **$100**');
    });

    it('rejects wagers when user wallet is insufficient', async () => {
      const result = await playRoulette('user-1', 10000);
      expect(result.success).toBe(false);
      expect(result.error).toContain('You only have **$5,000**');
    });

    it('handles live round death (68% chance): loses 100% and feeds gang vault', async () => {
      // Deterministic RNG: 0.10 is < 0.68 -> Live Round
      const result = await playRoulette('user-1', 1000, () => 0.10);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(false);
      expect(result.payout).toBe(0);
      expect(result.netProfit).toBe(-1000);
      expect(result.newWallet).toBe(4000);
      expect(result.title).toContain('Firing Pin Struck Live Round');
      expect(result.gangTreasuryBonus).toBe(500); // 50% to gang treasury
      expect(mockGangTreasury).toBe(10500);
    });

    it('handles click survival (22% chance): wins 1.4x return', async () => {
      // Deterministic RNG: 0.75 is between 0.68 and 0.90 -> Click
      const result = await playRoulette('user-1', 1000, () => 0.75);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(true);
      expect(result.payout).toBe(1400); // 1000 * 1.4
      expect(result.netProfit).toBe(400);
      expect(result.newWallet).toBe(5400);
      expect(result.title).toContain('Empty Chamber');
    });

    it('handles golden chamber (10% chance): triggers lucky multiplier', async () => {
      // RNG calls: 1st call for outcome (0.95 >= 0.90 -> Golden Chamber), 2nd call for tier (0.98 >= 0.95 -> 30x)
      let call = 0;
      const rng = () => {
        call++;
        return call === 1 ? 0.95 : 0.98;
      };

      const result = await playRoulette('user-1', 1000, rng);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(true);
      expect(result.isJackpot).toBe(true);
      expect(result.multiplier).toBe(30);
      expect(result.payout).toBe(30000);
      expect(result.newWallet).toBe(34000);
      expect(result.title).toContain('30× Mythic Jackpot Multiplier');
    });
  });

  describe("Smuggler's Heist Gambit (/gambit)", () => {
    it('rejects wagers below minimum ($250)', async () => {
      const result = await playGambit('user-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum wager is **$250**');
    });

    it('handles DEA ambush (70% chance): 100% loss', async () => {
      const result = await playGambit('user-1', 1000, () => 0.20);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(false);
      expect(result.payout).toBe(0);
      expect(result.netProfit).toBe(-1000);
      expect(result.title).toContain('CONVOY AMBUSHED');
    });

    it('handles border extortion (18% chance): returns 0.5x capital', async () => {
      const result = await playGambit('user-1', 1000, () => 0.75); // 0.70 <= 0.75 < 0.88
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(false);
      expect(result.payout).toBe(500); // 1000 * 0.5
      expect(result.netProfit).toBe(-500);
      expect(result.newWallet).toBe(4500);
      expect(result.title).toContain('BORDER SHAKEDOWN');
    });

    it('handles clean delivery (8% chance): returns 2.5x payout', async () => {
      const result = await playGambit('user-1', 1000, () => 0.90); // 0.88 <= 0.90 < 0.96
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(true);
      expect(result.payout).toBe(2500); // 1000 * 2.5
      expect(result.netProfit).toBe(1500);
      expect(result.newWallet).toBe(6500);
      expect(result.title).toContain('CONTRABAND SECURED');
    });

    it('handles ghost shipment lucky multiplier (4% chance)', async () => {
      let call = 0;
      const rng = () => {
        call++;
        return call === 1 ? 0.98 : 0.96; // 50x tier
      };

      const result = await playGambit('user-1', 1000, rng);
      expect(result.success).toBe(true);
      expect(result.isJackpot).toBe(true);
      expect(result.multiplier).toBe(50);
      expect(result.payout).toBe(50000);
      expect(result.newWallet).toBe(54000);
    });
  });

  describe('Dirty Money Laundering (/launder)', () => {
    it('rejects wagers below minimum ($200)', async () => {
      const result = await playLaunder('user-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum wager is **$200**');
    });

    it('handles federal asset freeze (70% chance): 100% loss', async () => {
      const result = await playLaunder('user-1', 1000, () => 0.50);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(false);
      expect(result.payout).toBe(0);
      expect(result.title).toContain('ACCOUNTS FROZEN');
    });

    it('handles expensive wash fees (18% chance): returns 0.7x', async () => {
      const result = await playLaunder('user-1', 1000, () => 0.80); // 0.70 <= 0.80 < 0.88
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(false);
      expect(result.payout).toBe(700); // 1000 * 0.7
      expect(result.netProfit).toBe(-300);
      expect(result.title).toContain('EXPENSIVE WASH');
    });

    it('handles clean wash (8% chance): returns 1.5x payout', async () => {
      const result = await playLaunder('user-1', 1000, () => 0.90);
      expect(result.success).toBe(true);
      expect(result.isWin).toBe(true);
      expect(result.payout).toBe(1500);
      expect(result.newWallet).toBe(5500);
      expect(result.title).toContain('DIRTY MONEY CLEANED');
    });

    it('handles Cayman windfall lucky multiplier (4% chance)', async () => {
      let call = 0;
      const rng = () => {
        call++;
        return call === 1 ? 0.98 : 0.96; // 40x tier
      };

      const result = await playLaunder('user-1', 1000, rng);
      expect(result.success).toBe(true);
      expect(result.isJackpot).toBe(true);
      expect(result.multiplier).toBe(40);
      expect(result.payout).toBe(40000);
      expect(result.newWallet).toBe(44000);
      expect(result.title).toContain('CAYMAN WINDFALL HIT');
    });
  });
});

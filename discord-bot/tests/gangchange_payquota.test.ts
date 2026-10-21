import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payGangQuota, changeGang } from '../src/services/gangs/gangService';
import payquotaCommand from '../src/bot/commands/gangs/payquota';
import gangchangeCommand from '../src/bot/commands/gangs/gangchange';

// In-memory test stores
let userEcoStore: Record<string, any> = {};
let gangStore: Record<string, any> = {};
let membershipStore: Record<string, any> = {};
let quotaStore: Record<string, any> = {};
let inventoryStore: Array<{ userId: string; itemId: string; name: string; quantity: number; value: number }> = [];

vi.mock('../src/database/database', () => ({
  prisma: {
    gang: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { OR: Array<{ id?: string; name?: string }> } }) => {
        for (const cond of where.OR) {
          if (cond.id && gangStore[cond.id]) return Promise.resolve(gangStore[cond.id]);
          if (cond.name && Object.values(gangStore).find((g: any) => g.name === cond.name)) {
            return Promise.resolve(Object.values(gangStore).find((g: any) => g.name === cond.name));
          }
        }
        return Promise.resolve(null);
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(Object.values(gangStore))),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id?: string; name?: string }; data: any }) => {
        let gang = where.id ? gangStore[where.id] : Object.values(gangStore).find((g: any) => g.name === where.name);
        if (gang && data.treasury?.increment) {
          gang.treasury = (gang.treasury ?? 0) + data.treasury.increment;
        }
        return Promise.resolve(gang);
      }),
    },
    userGangMembership: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        const mem = membershipStore[where.userId];
        if (!mem) return Promise.resolve(null);
        return Promise.resolve({
          ...mem,
          gang: gangStore[mem.gangId],
        });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { userId: string }; data: any }) => {
        const mem = membershipStore[where.userId];
        if (mem) {
          if (data.gangId) mem.gangId = data.gangId;
          if (data.joinedAt) mem.joinedAt = data.joinedAt;
          if (data.quotaContributed?.increment) {
            mem.quotaContributed = (mem.quotaContributed ?? 0) + data.quotaContributed.increment;
          } else if (data.quotaContributed !== undefined) {
            mem.quotaContributed = data.quotaContributed;
          }
        }
        return Promise.resolve(mem);
      }),
    },
    userEconomy: {
      upsert: vi.fn().mockImplementation(({ where, create }: { where: { userId: string }; create: any }) => {
        if (!userEcoStore[where.userId]) {
          userEcoStore[where.userId] = { id: `eco-${where.userId}`, ...create };
        }
        return Promise.resolve({ ...userEcoStore[where.userId] });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { userId: string }; data: any }) => {
        const eco = userEcoStore[where.userId] ?? { wallet: 0, bank: 0 };
        if (data.wallet?.decrement) {
          eco.wallet -= data.wallet.decrement;
        } else if (data.wallet !== undefined) {
          eco.wallet = data.wallet;
        }
        if (data.bank !== undefined) eco.bank = data.bank;
        userEcoStore[where.userId] = eco;
        return Promise.resolve(eco);
      }),
    },
    gangQuotaDeposit: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId_date: { userId: string; date: string } } }) => {
        const key = `${where.userId_date.userId}:${where.userId_date.date}`;
        return Promise.resolve(quotaStore[key] ?? null);
      }),
      upsert: vi.fn().mockImplementation(({ where, update, create }: { where: { userId_date: { userId: string; date: string } }; update: any; create: any }) => {
        const key = `${where.userId_date.userId}:${where.userId_date.date}`;
        if (quotaStore[key]) {
          quotaStore[key].amount += update.amount?.increment ?? 0;
        } else {
          quotaStore[key] = { ...create };
        }
        return Promise.resolve(quotaStore[key]);
      }),
    },
    userInventoryItem: {
      count: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(inventoryStore.filter((i) => i.userId === where.userId).length);
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        const initialCount = inventoryStore.length;
        inventoryStore = inventoryStore.filter((i) => i.userId !== where.userId);
        return Promise.resolve({ count: initialCount - inventoryStore.length });
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        return Promise.resolve(inventoryStore.filter((i) => i.userId === where.userId));
      }),
    },
    serverGangSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('/payquota & Daily Gang Quota Service', () => {
  beforeEach(() => {
    userEcoStore = {
      'user-1': { wallet: 50000, bank: 20000, bankCapacity: 50000, crimesWon: 5, crimesTotal: 5, netEarnings: 10000, bountiesPaid: 0 },
    };
    gangStore = {
      'g-kurogane': { id: 'g-kurogane', name: 'kurogane', displayName: 'Kurogane', color: '#DC143C', emoji: '⚔️', treasury: 10000 },
      'g-omerta': { id: 'g-omerta', name: 'omerta', displayName: 'Omertà', color: '#1a1a1a', emoji: '🎩', treasury: 20000 },
    };
    membershipStore = {
      'user-1': { id: 'm1', userId: 'user-1', gangId: 'g-kurogane', joinedAt: new Date(), quotaContributed: 0 },
    };
    quotaStore = {};
    inventoryStore = [
      { userId: 'user-1', itemId: 'lockpick', name: 'Lockpick Set', quantity: 2, value: 500 },
      { userId: 'user-1', itemId: 'burner_phone', name: 'Burner Phone', quantity: 1, value: 1200 },
    ];
    vi.clearAllMocks();
  });

  it('successfully deposits quota, deducts wallet, increments gang treasury and awards loyalty', async () => {
    const result = await payGangQuota('user-1', 10000);
    expect(result.success).toBe(true);
    expect(result.amountPaid).toBe(10000);
    expect(result.depositedToday).toBe(10000);
    expect(result.remainingQuota).toBe(10000);
    expect(result.loyaltyPointsEarned).toBe(200); // 10000 / 50 = 200 pts

    // Check DB state
    expect(userEcoStore['user-1'].wallet).toBe(40000);
    expect(gangStore['g-kurogane'].treasury).toBe(20000);
    expect(membershipStore['user-1'].quotaContributed).toBe(10000);
  });

  it('rejects deposit that exceeds the 20,000 daily quota limit', async () => {
    // Deposit 15,000 first
    await payGangQuota('user-1', 15000);

    // Attempt to deposit 10,000 more (exceeds remaining 5,000)
    const result = await payGangQuota('user-1', 10000);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('EXCEEDS_LIMIT');
    expect(result.remainingQuota).toBe(5000);
  });

  it('rejects further deposits once the 20,000 daily ceiling has been reached', async () => {
    // Deposit full 20,000
    await payGangQuota('user-1', 20000);

    // Attempt further deposit
    const result = await payGangQuota('user-1', 500);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('LIMIT_REACHED');
  });

  it('rejects quota deposit when user has insufficient wallet cash', async () => {
    userEcoStore['user-1'].wallet = 200;
    const result = await payGangQuota('user-1', 5000);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('/gangchange & Asset Forfeiture Service', () => {
  beforeEach(() => {
    userEcoStore = {
      'user-1': { wallet: 12000, bank: 25000, bankCapacity: 50000, crimesWon: 5, crimesTotal: 5, netEarnings: 10000, bountiesPaid: 0 },
    };
    gangStore = {
      'g-kurogane': { id: 'g-kurogane', name: 'kurogane', displayName: 'Kurogane', color: '#DC143C', emoji: '⚔️', treasury: 5000 },
      'g-omerta': { id: 'g-omerta', name: 'omerta', displayName: 'Omertà', color: '#1a1a1a', emoji: '🎩', treasury: 10000 },
    };
    membershipStore = {
      'user-1': { id: 'm1', userId: 'user-1', gangId: 'g-kurogane', joinedAt: new Date('2026-01-01'), quotaContributed: 4000 },
    };
    quotaStore = {};
    inventoryStore = [
      { userId: 'user-1', itemId: 'lockpick', name: 'Lockpick Set', quantity: 2, value: 500 },
      { userId: 'user-1', itemId: 'burner_phone', name: 'Burner Phone', quantity: 1, value: 1200 },
    ];
    vi.clearAllMocks();
  });

  it('rejects changing to the same gang user is currently in', async () => {
    const result = await changeGang('user-1', 'kurogane');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('SAME_GANG');
  });

  it('wipes inventory and transfers wallet + bank to old gang treasury upon defecting', async () => {
    const result = await changeGang('user-1', 'omerta');
    expect(result.success).toBe(true);
    expect(result.totalSeized).toBe(37000); // 12,000 wallet + 25,000 bank
    expect(result.itemsWiped).toBe(2);

    // Old gang treasury received total fortune
    expect(gangStore['g-kurogane'].treasury).toBe(42000); // 5000 + 37000

    // User economy wiped
    expect(userEcoStore['user-1'].wallet).toBe(0);
    expect(userEcoStore['user-1'].bank).toBe(0);

    // Inventory wiped
    expect(inventoryStore.filter((i) => i.userId === 'user-1')).toHaveLength(0);

    // Membership updated to Omertà with reset quota
    expect(membershipStore['user-1'].gangId).toBe('g-omerta');
    expect(membershipStore['user-1'].quotaContributed).toBe(0);
  });
});

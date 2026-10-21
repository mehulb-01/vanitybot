import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GAME_ITEMS,
  getItemById,
  GameItemRarity,
} from '../src/services/economy/itemRegistry';
import {
  getDailyCatalog,
  getUserCatalog,
  buyMarketItem,
  sellMarketItem,
  clearUserPurchaseCache,
  CATALOG_SIZE,
} from '../src/services/economy/blackmarketService';

// In-memory mock database state
interface MockEconomy {
  userId: string;
  wallet: number;
  bank: number;
}

interface MockInventoryItem {
  id: string;
  userId: string;
  itemId: string;
  name: string;
  quantity: number;
  value: number;
  metadata?: string;
}

const mockEconomyStore: Record<string, MockEconomy> = {};
const mockInventoryStore: Record<string, MockInventoryItem> = {}; // key: `${userId}:${itemId}`

vi.mock('../src/database/database', () => ({
  prisma: {
    userEconomy: {
      upsert: vi.fn().mockImplementation(({ where, create }: { where: { userId: string }; create: any }) => {
        if (!mockEconomyStore[where.userId]) {
          mockEconomyStore[where.userId] = {
            userId: where.userId,
            wallet: create.wallet ?? 0,
            bank: create.bank ?? 0,
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
    userInventoryItem: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId_itemId?: { userId: string; itemId: string }; id?: string } }) => {
        if (where.userId_itemId) {
          const key = `${where.userId_itemId.userId}:${where.userId_itemId.itemId}`;
          return Promise.resolve(mockInventoryStore[key] ? { ...mockInventoryStore[key] } : null);
        }
        if (where.id) {
          const item = Object.values(mockInventoryStore).find((i) => i.id === where.id);
          return Promise.resolve(item ? { ...item } : null);
        }
        return Promise.resolve(null);
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
        const items = Object.values(mockInventoryStore).filter((i) => i.userId === where.userId);
        return Promise.resolve(items.map((i) => ({ ...i })));
      }),
      create: vi.fn().mockImplementation(({ data }: { data: any }) => {
        const id = `inv-${data.userId}-${data.itemId}-${Date.now()}`;
        const item: MockInventoryItem = {
          id,
          userId: data.userId,
          itemId: data.itemId,
          name: data.name,
          quantity: data.quantity,
          value: data.value,
          metadata: data.metadata,
        };
        mockInventoryStore[`${data.userId}:${data.itemId}`] = item;
        return Promise.resolve({ ...item });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: any }) => {
        const item = Object.values(mockInventoryStore).find((i) => i.id === where.id);
        if (item) {
          Object.assign(item, data);
          return Promise.resolve({ ...item });
        }
        return Promise.resolve(null);
      }),
      delete: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const key = Object.keys(mockInventoryStore).find((k) => mockInventoryStore[k].id === where.id);
        if (key) {
          delete mockInventoryStore[key];
        }
        return Promise.resolve(true);
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

describe('Blackmarket Item Registry & Specifications', () => {
  it('contains exactly 22 game items across all 5 rarity tiers', () => {
    expect(GAME_ITEMS.length).toBe(22);

    const counts: Record<GameItemRarity, number> = {
      basic: 0,
      uncommon: 0,
      rare: 0,
      mythic: 0,
      legendary: 0,
    };

    for (const item of GAME_ITEMS) {
      counts[item.rarity]++;
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.emoji).toBeTruthy();
      expect(item.description).toBeTruthy();
    }

    expect(counts.basic).toBe(5);
    expect(counts.uncommon).toBe(5);
    expect(counts.rare).toBe(5);
    expect(counts.mythic).toBe(4);
    expect(counts.legendary).toBe(3);
  });

  it('enforces legendary items cannot be purchased and sell for exactly $30,000,000', () => {
    const legendaries = GAME_ITEMS.filter((i) => i.rarity === 'legendary');
    expect(legendaries.length).toBe(3);

    for (const item of legendaries) {
      expect(item.buyPrice).toBeNull();
      expect(item.sellPrice).toBe(30_000_000);
      expect(item.dailyStock).toBe(0);
    }
  });

  it('enforces mythic items cost > $800,000 to buy and sell between $450,000 - $500,000', () => {
    const mythics = GAME_ITEMS.filter((i) => i.rarity === 'mythic');
    expect(mythics.length).toBe(4);

    for (const item of mythics) {
      expect(item.buyPrice).toBeGreaterThan(800_000);
      expect(item.sellPrice).toBeGreaterThanOrEqual(450_000);
      expect(item.sellPrice).toBeLessThanOrEqual(500_000);
    }
  });

  it('retrieves items correctly by ID or display name', () => {
    const pendant = getItemById('counterfeit_pendant');
    expect(pendant).toBeDefined();
    expect(pendant?.name).toBe('Counterfeit Pendant');

    // Test name-based lookup
    const byName = getItemById('Counterfeit Pendant');
    expect(byName).toBeDefined();
    expect(byName?.id).toBe('counterfeit_pendant');

    const lazarus = getItemById('lazarus');
    expect(lazarus).toBeDefined();
    expect(lazarus?.rarity).toBe('legendary');
    expect(lazarus?.sellPrice).toBe(30_000_000);

    const nonexistent = getItemById('non_existent_item');
    expect(nonexistent).toBeUndefined();
  });
});

describe('Blackmarket Daily Catalog Generation', () => {
  it('generates a 1-page catalog of exactly 7 unique items', () => {
    const catalog = getDailyCatalog('2026-09-23');
    expect(catalog.length).toBe(CATALOG_SIZE);

    const ids = catalog.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(CATALOG_SIZE);
  });

  it('never includes legendary items in the marketplace catalog', () => {
    // Test across 50 distinct calendar days
    for (let day = 1; day <= 50; day++) {
      const dateStr = `2026-10-${day.toString().padStart(2, '0')}`;
      const catalog = getDailyCatalog(dateStr);
      for (const item of catalog) {
        expect(item.rarity).not.toBe('legendary');
        expect(item.buyPrice).not.toBeNull();
      }
    }
  });

  it('is deterministic for the same date', () => {
    const dateStr = '2026-09-24';
    const catalogA = getDailyCatalog(dateStr);
    const catalogB = getDailyCatalog(dateStr);
    expect(catalogA.map((i) => i.id)).toEqual(catalogB.map((i) => i.id));
  });
});

describe('Blackmarket Buy & Sell Transactions', () => {
  const userA = 'user-111';
  const userB = 'user-222';
  const testDate = '2026-09-25';

  beforeEach(() => {
    clearUserPurchaseCache();
    for (const key of Object.keys(mockEconomyStore)) delete mockEconomyStore[key];
    for (const key of Object.keys(mockInventoryStore)) delete mockInventoryStore[key];

    // Seed User A with liquid cash
    mockEconomyStore[userA] = {
      userId: userA,
      wallet: 5_000_000,
      bank: 0,
    };

    // Seed User B with liquid cash
    mockEconomyStore[userB] = {
      userId: userB,
      wallet: 5_000_000,
      bank: 0,
    };
  });

  it('allows a user to buy an item, deducting wallet and adding to inventory', async () => {
    const catalog = await getUserCatalog(userA, testDate);
    const targetItem = catalog[0];

    const result = await buyMarketItem(userA, targetItem.id, 1, testDate);
    expect(result.success).toBe(true);
    expect(result.totalPrice).toBe(targetItem.buyPrice);
    expect(result.newWallet).toBe(5_000_000 - (targetItem.buyPrice ?? 0));
    expect(result.remainingStock).toBe(targetItem.dailyStock - 1);

    // Verify inventory in DB
    const invKey = `${userA}:${targetItem.id}`;
    expect(mockInventoryStore[invKey]).toBeDefined();
    expect(mockInventoryStore[invKey].quantity).toBe(1);
    expect(mockInventoryStore[invKey].value).toBe(targetItem.sellPrice);
  });

  it('ensures purchases by one user do NOT affect the catalog stock of another user', async () => {
    const catalogA = await getUserCatalog(userA, testDate);
    const targetItem = catalogA[0];
    const initialStock = targetItem.dailyStock;

    // User A buys 1
    await buyMarketItem(userA, targetItem.id, 1, testDate);

    // Verify User A stock decremented
    const updatedCatalogA = await getUserCatalog(userA, testDate);
    const userAItem = updatedCatalogA.find((i) => i.id === targetItem.id);
    expect(userAItem?.remainingStock).toBe(initialStock - 1);

    // Verify User B stock is COMPLETELY UNTOUCHED
    const catalogB = await getUserCatalog(userB, testDate);
    const userBItem = catalogB.find((i) => i.id === targetItem.id);
    expect(userBItem?.remainingStock).toBe(initialStock);
  });

  it('rejects purchase when user has insufficient wallet funds', async () => {
    mockEconomyStore[userA].wallet = 10; // Only $10
    const catalog = await getUserCatalog(userA, testDate);
    const targetItem = catalog[0]; // Costs >= $2,500

    const result = await buyMarketItem(userA, targetItem.id, 1, testDate);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Insufficient liquid cash');
  });

  it('rejects purchase when daily stock allowance is exceeded', async () => {
    const catalog = await getUserCatalog(userA, testDate);
    const targetItem = catalog[0];

    // Buy maximum allowed stock
    const buyAll = await buyMarketItem(userA, targetItem.id, targetItem.dailyStock, testDate);
    expect(buyAll.success).toBe(true);

    // Attempt to buy 1 more
    const buyExcess = await buyMarketItem(userA, targetItem.id, 1, testDate);
    expect(buyExcess.success).toBe(false);
    expect(buyExcess.message).toContain('bought out all available stock');
  });

  it('allows user to fence (sell) an item from inventory for clean cash', async () => {
    // Give user an uncommon item in inventory: lucky_bullet (sell price: $9,000)
    const bullet = getItemById('lucky_bullet')!;
    mockInventoryStore[`${userA}:${bullet.id}`] = {
      id: 'inv-bullet-1',
      userId: userA,
      itemId: bullet.id,
      name: bullet.name,
      quantity: 3,
      value: bullet.sellPrice,
    };

    const initialWallet = mockEconomyStore[userA].wallet;

    const sellResult = await sellMarketItem(userA, bullet.id, 2);
    expect(sellResult.success).toBe(true);
    expect(sellResult.totalPayout).toBe(bullet.sellPrice * 2);
    expect(sellResult.newWallet).toBe(initialWallet + bullet.sellPrice * 2);
    expect(sellResult.remainingInInventory).toBe(1);

    // Verify 1 remaining in inventory store
    expect(mockInventoryStore[`${userA}:${bullet.id}`].quantity).toBe(1);

    // Sell the last 1
    const sellLast = await sellMarketItem(userA, bullet.id, 1);
    expect(sellLast.success).toBe(true);
    expect(sellLast.remainingInInventory).toBe(0);
    expect(mockInventoryStore[`${userA}:${bullet.id}`]).toBeUndefined();
  });

  it('correctly awards $30,000,000 when selling legendary items', async () => {
    const lazarus = getItemById('lazarus')!;
    mockInventoryStore[`${userA}:${lazarus.id}`] = {
      id: 'inv-lazarus-1',
      userId: userA,
      itemId: lazarus.id,
      name: lazarus.name,
      quantity: 1,
      value: lazarus.sellPrice,
    };

    const initialWallet = mockEconomyStore[userA].wallet;

    const sellResult = await sellMarketItem(userA, lazarus.id, 1);
    expect(sellResult.success).toBe(true);
    expect(sellResult.totalPayout).toBe(30_000_000);
    expect(sellResult.newWallet).toBe(initialWallet + 30_000_000);
  });

  it('correctly awards between $450,000 and $500,000 when selling mythic items', async () => {
    const ledger = getItemById('black_ledger')!;
    mockInventoryStore[`${userA}:${ledger.id}`] = {
      id: 'inv-ledger-1',
      userId: userA,
      itemId: ledger.id,
      name: ledger.name,
      quantity: 1,
      value: ledger.sellPrice,
    };

    expect(ledger.sellPrice).toBeGreaterThanOrEqual(450_000);
    expect(ledger.sellPrice).toBeLessThanOrEqual(500_000);

    const sellResult = await sellMarketItem(userA, ledger.id, 1);
    expect(sellResult.success).toBe(true);
    expect(sellResult.totalPayout).toBe(ledger.sellPrice);
  });

  it('rejects selling items not owned or requesting excess quantity', async () => {
    const resultUnowned = await sellMarketItem(userA, 'smugglers_compass', 1);
    expect(resultUnowned.success).toBe(false);
    expect(resultUnowned.message).toContain("don't have any of this item");

    mockInventoryStore[`${userA}:counterfeit_pendant`] = {
      id: 'inv-pendant',
      userId: userA,
      itemId: 'counterfeit_pendant',
      name: 'Counterfeit Pendant',
      quantity: 2,
      value: 1250,
    };

    const resultExcess = await sellMarketItem(userA, 'counterfeit_pendant', 5);
    expect(resultExcess.success).toBe(false);
    expect(resultExcess.message).toContain('You only have **2x**');
  });
});

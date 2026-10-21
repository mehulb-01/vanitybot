import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isTraderAvailable,
  getNextWednesdayStart,
  getCurrentWednesdayEnd,
  getTraderSellPrice,
  getEligibleExchangeItems,
  sellItemToTrader,
  exchangeItemWithTrader,
  TRADER_PRICE_MULTIPLIER,
} from '../src/services/economy/traderService';
import { getItemById, GAME_ITEMS } from '../src/services/economy/itemRegistry';
import traderCommand from '../src/bot/commands/economy/trader';
import {
  renderTraderClosedView,
  renderTraderMainView,
  renderTraderItemDetailView,
  renderTraderBarterView,
  handleTraderButton,
  handleTraderSelect,
} from '../src/bot/events/traderHandler';

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
        return Promise.resolve({ id: where.id });
      }),
    },
  },
}));

describe('Wandering Trader System', () => {
  const WEDNESDAY_DATE = new Date('2026-10-14T12:00:00Z'); // Wednesday
  const SUNDAY_DATE = new Date('2026-10-11T12:00:00Z'); // Sunday
  const MONDAY_DATE = new Date('2026-10-12T12:00:00Z'); // Monday
  const THURSDAY_DATE = new Date('2026-10-15T12:00:00Z'); // Thursday
  const FRIDAY_DATE = new Date('2026-10-16T12:00:00Z'); // Friday

  beforeEach(() => {
    for (const key of Object.keys(mockEconomyStore)) delete mockEconomyStore[key];
    for (const key of Object.keys(mockInventoryStore)) delete mockInventoryStore[key];
    delete process.env.TRADER_FORCE_OPEN;
    vi.clearAllMocks();
  });

  describe('Availability & Schedule', () => {
    it('is available on Wednesdays and Thursdays globally', () => {
      expect(isTraderAvailable(WEDNESDAY_DATE)).toBe(true);
      expect(isTraderAvailable(THURSDAY_DATE)).toBe(true);
      expect(isTraderAvailable(SUNDAY_DATE)).toBe(false);
      expect(isTraderAvailable(MONDAY_DATE)).toBe(false);
      expect(isTraderAvailable(FRIDAY_DATE)).toBe(false);
    });

    it('honors TRADER_FORCE_OPEN override when set', () => {
      process.env.TRADER_FORCE_OPEN = 'true';
      expect(isTraderAvailable(SUNDAY_DATE)).toBe(true);
    });

    it('accurately computes next Wednesday start timestamp', () => {
      const nextWed = getNextWednesdayStart(SUNDAY_DATE);
      expect(nextWed.getUTCDay()).toBe(3); // Wednesday
      expect(nextWed.getUTCHours()).toBe(0);
      expect(nextWed.getUTCMinutes()).toBe(0);
      expect(nextWed.getTime()).toBeGreaterThan(SUNDAY_DATE.getTime());
    });

    it('accurately computes trading window departure end timestamp', () => {
      const endWed = getCurrentWednesdayEnd(WEDNESDAY_DATE);
      expect(endWed.getUTCDay()).toBe(5); // Friday 00:00:00 UTC (end of Thursday)
      expect(endWed.getUTCHours()).toBe(0);
      expect(endWed.getTime()).toBeGreaterThan(WEDNESDAY_DATE.getTime());

      const endThu = getCurrentWednesdayEnd(THURSDAY_DATE);
      expect(endThu.getUTCDay()).toBe(5); // Friday 00:00:00 UTC
      expect(endThu.getTime()).toBeGreaterThan(THURSDAY_DATE.getTime());
    });
  });

  describe('Pricing & Exchange Pool', () => {
    it('calculates 1.75x premium sell price exceeding blackmarket cost price', () => {
      const item = getItemById('lucky_bullet')!;
      expect(item.buyPrice).toBe(18000);
      expect(item.sellPrice).toBe(9000);
      const traderPrice = getTraderSellPrice(item);
      expect(traderPrice).toBe(Math.round(18000 * TRADER_PRICE_MULTIPLIER));
      expect(traderPrice).toBe(31500); // $31,500 vs cost price $18,000 (+75% profit)
      expect(traderPrice).toBeGreaterThan(item.buyPrice!);
    });

    it('calculates 1.75x sell price for legendary items with null buyPrice', () => {
      const item = getItemById('lazarus')!;
      expect(item.buyPrice).toBeNull();
      expect(item.sellPrice).toBe(30000000);
      const traderPrice = getTraderSellPrice(item);
      expect(traderPrice).toBe(Math.round(30000000 * TRADER_PRICE_MULTIPLIER));
      expect(traderPrice).toBe(52500000);
    });

    it('returns eligible barter exchange items in the same rarity tier without self', () => {
      const luckyBullet = getItemById('lucky_bullet')!;
      const eligible = getEligibleExchangeItems('lucky_bullet');

      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible.every((i) => i.rarity === luckyBullet.rarity)).toBe(true);
      expect(eligible.some((i) => i.id === 'lucky_bullet')).toBe(false);
      expect(eligible.map((i) => i.id)).toContain('ghostcard');
      expect(eligible.map((i) => i.id)).toContain('fake_passport');
    });
  });

  describe('Selling Contraband for Premium Cash', () => {
    it('rejects transactions outside of Wednesday through Thursday', async () => {
      const result = await sellItemToTrader('user-1', 'lucky_bullet', 1, SUNDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Wednesdays and Thursdays');
    });

    it('buys 1x item at 1.75x blackmarket cost price and updates inventory and user wallet', async () => {
      mockEconomyStore['user-1'] = { userId: 'user-1', wallet: 1000, bank: 0 };
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 2,
        value: 9000,
      };

      const result = await sellItemToTrader('user-1', 'lucky_bullet', 1, WEDNESDAY_DATE);
      expect(result.success).toBe(true);
      expect(result.totalPayout).toBe(31500); // 18000 * 1.75
      expect(result.newWallet).toBe(1000 + 31500);
      expect(result.remainingInInventory).toBe(1);

      // Verify DB state
      expect(mockEconomyStore['user-1'].wallet).toBe(32500);
      expect(mockInventoryStore['user-1:lucky_bullet'].quantity).toBe(1);
    });

    it('deletes item record when the entire quantity is sold', async () => {
      mockEconomyStore['user-1'] = { userId: 'user-1', wallet: 0, bank: 0 };
      mockInventoryStore['user-1:ghostcard'] = {
        id: 'inv-2',
        userId: 'user-1',
        itemId: 'ghostcard',
        name: 'Ghostcard',
        quantity: 1,
        value: 14000,
      };

      const result = await sellItemToTrader('user-1', 'ghostcard', 1, WEDNESDAY_DATE);
      expect(result.success).toBe(true);
      expect(result.totalPayout).toBe(49000); // ghostcard buyPrice 28000 * 1.75
      expect(result.remainingInInventory).toBe(0);
      expect(mockInventoryStore['user-1:ghostcard']).toBeUndefined();
    });

    it('fails when user does not own the item', async () => {
      const result = await sellItemToTrader('user-1', 'ghostcard', 1, WEDNESDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain("don't have any of this item");
    });

    it('fails when user requests to sell more than they own', async () => {
      mockInventoryStore['user-1:ghostcard'] = {
        id: 'inv-2',
        userId: 'user-1',
        itemId: 'ghostcard',
        name: 'Ghostcard',
        quantity: 1,
        value: 14000,
      };
      const result = await sellItemToTrader('user-1', 'ghostcard', 5, WEDNESDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain('only have **1x**');
    });
  });

  describe('Item-for-Item Barter Exchange', () => {
    it('rejects barter exchange outside of Wednesday through Thursday', async () => {
      const result = await exchangeItemWithTrader('user-1', 'lucky_bullet', 'ghostcard', SUNDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Wednesdays and Thursdays');
    });

    it('rejects swapping an item for itself', async () => {
      const result = await exchangeItemWithTrader('user-1', 'lucky_bullet', 'lucky_bullet', WEDNESDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain('different item');
    });

    it('rejects swapping items from different rarity tiers', async () => {
      // lucky_bullet is uncommon, black_ledger is mythic
      const result = await exchangeItemWithTrader('user-1', 'lucky_bullet', 'black_ledger', WEDNESDAY_DATE);
      expect(result.success).toBe(false);
      expect(result.message).toContain('same rarity tier');
    });

    it('successfully swaps 1x item for a chosen item of the same rarity tier', async () => {
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 1,
        value: 9000,
      };

      const result = await exchangeItemWithTrader('user-1', 'lucky_bullet', 'ghostcard', WEDNESDAY_DATE);
      expect(result.success).toBe(true);
      expect(result.offeredItem?.id).toBe('lucky_bullet');
      expect(result.desiredItem?.id).toBe('ghostcard');
      expect(result.remainingOfferedInInventory).toBe(0);

      // Offered item was removed
      expect(mockInventoryStore['user-1:lucky_bullet']).toBeUndefined();
      // Desired item was granted
      expect(mockInventoryStore['user-1:ghostcard']).toBeDefined();
      expect(mockInventoryStore['user-1:ghostcard'].name).toBe('Ghostcard');
      expect(mockInventoryStore['user-1:ghostcard'].quantity).toBe(1);
    });

    it('increments quantity if user already owns the desired item', async () => {
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 2,
        value: 9000,
      };
      mockInventoryStore['user-1:fake_passport'] = {
        id: 'inv-2',
        userId: 'user-1',
        itemId: 'fake_passport',
        name: 'Fake Passport',
        quantity: 1,
        value: 16000,
      };

      const result = await exchangeItemWithTrader('user-1', 'lucky_bullet', 'fake_passport', WEDNESDAY_DATE);
      expect(result.success).toBe(true);
      expect(mockInventoryStore['user-1:lucky_bullet'].quantity).toBe(1);
      expect(mockInventoryStore['user-1:fake_passport'].quantity).toBe(2);
    });
  });

  describe('UI Views & Discord Interaction Handlers', () => {
    it('renders the closed view with arrival countdown', () => {
      const view = renderTraderClosedView('user-1');
      expect(view.embed.data.title).toContain('Currently Away');
      expect(view.embed.data.description).toContain('Wednesday');
      expect(view.components.length).toBeGreaterThan(0);
    });

    it('renders main view with inventory items and premium rates on Wednesday', async () => {
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 1,
        value: 9000,
      };

      const view = await renderTraderMainView('user-1');
      expect(view.embed.data.title).toContain("Smuggler's Caravan");
      expect(view.embed.data.fields).toBeDefined();
      expect(view.embed.data.fields![0].name).toContain('Lucky Bullet');
      expect(view.embed.data.fields![0].value).toContain('+75% Profit');
    });

    it('renders item detail view with cash and barter action buttons', async () => {
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 2,
        value: 9000,
      };

      const view = await renderTraderItemDetailView('user-1', 'lucky_bullet');
      expect(view.embed.data.title).toContain('Trader Deal:');
      expect(view.embed.data.title).toContain('Lucky Bullet');
      expect(view.components[0].components).toHaveLength(4); // cash 1x, cash all, barter, back
    });

    it('renders barter selection view with eligible items of same tier', async () => {
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 1,
        value: 9000,
      };

      const view = await renderTraderBarterView('user-1', 'lucky_bullet');
      expect(view.embed.data.title).toContain('Barter Exchange:');
      expect(view.embed.data.title).toContain('Lucky Bullet');
      // Should have select menu with other uncommon items
      const selectMenu: any = view.components[0].components[0];
      expect(selectMenu.options.length).toBe(4); // 5 uncommon items - 1 offered = 4
    });

    it('executes /trader slash command and presents view', async () => {
      const mockInteraction: any = {
        user: { id: 'user-1' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      };

      await traderCommand.execute(mockInteraction, {} as any);
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('handles button interaction to sell 1x item for cash', async () => {
      process.env.TRADER_FORCE_OPEN = 'true';
      mockEconomyStore['user-1'] = { userId: 'user-1', wallet: 0, bank: 0 };
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 1,
        value: 9000,
      };

      const mockInteraction: any = {
        customId: 'trader_cash_1_lucky_bullet',
        user: { id: 'user-1' },
        deferUpdate: vi.fn(),
        followUp: vi.fn(),
        editReply: vi.fn(),
      };

      await handleTraderButton(mockInteraction);
      expect(mockInteraction.followUp).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          ephemeral: true,
        }),
      );
      expect(mockEconomyStore['user-1'].wallet).toBe(31500);
      expect(mockInventoryStore['user-1:lucky_bullet']).toBeUndefined();
    });

    it('handles select menu interaction to barter item for chosen item', async () => {
      process.env.TRADER_FORCE_OPEN = 'true';
      mockInventoryStore['user-1:lucky_bullet'] = {
        id: 'inv-1',
        userId: 'user-1',
        itemId: 'lucky_bullet',
        name: 'Lucky Bullet',
        quantity: 1,
        value: 9000,
      };

      const mockInteraction: any = {
        customId: 'trader_barter_select_lucky_bullet',
        values: ['ghostcard'],
        user: { id: 'user-1' },
        deferUpdate: vi.fn(),
        followUp: vi.fn(),
        editReply: vi.fn(),
      };

      await handleTraderSelect(mockInteraction);
      expect(mockInteraction.followUp).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          ephemeral: true,
        }),
      );
      expect(mockInventoryStore['user-1:lucky_bullet']).toBeUndefined();
      expect(mockInventoryStore['user-1:ghostcard']).toBeDefined();
    });
  });
});

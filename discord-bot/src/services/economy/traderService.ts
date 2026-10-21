import { prisma } from '../../database/database';
import { redis } from '../../database/redis';
import { childLogger } from '../../utils/logger';
import { getUserEconomy } from './economyService';
import {
  GAME_ITEMS,
  GameItem,
  getItemById,
  RARITY_LABELS,
} from './itemRegistry';

const log = childLogger('traderService');

/**
 * Premium multiplier offered by the Wandering Trader on Wednesdays and Thursdays.
 * 1.75x = +75% higher cash payout than the blackmarket cost price.
 */
export const TRADER_PRICE_MULTIPLIER = 1.75;

/**
 * Maximum total items (not unique items) that can be exchanged per day.
 * 5 items per day = 10 total across Wednesday and Thursday.
 */
export const DAILY_TRADER_EXCHANGE_LIMIT = 5;

// In-memory fallback for user daily exchanges: `${userId}:${dateStr}` -> count
const userExchangeCache = new Map<string, number>();

/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 */
export function getDailyDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Retrieves the total count of items exchanged by a user with the Trader today.
 */
export async function getUserExchangedToday(
  userId: string,
  dateStr: string = getDailyDateString(),
): Promise<number> {
  const cacheKey = `${userId}:${dateStr}`;

  // 1. Check in-memory map
  const memCount = userExchangeCache.get(cacheKey);
  if (memCount !== undefined) {
    return memCount;
  }

  // 2. Check Redis
  try {
    const redisKey = `trader:exchanged:${userId}:${dateStr}`;
    const raw = await redis.get(redisKey);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      const count = isNaN(parsed) ? 0 : parsed;
      userExchangeCache.set(cacheKey, count);
      return count;
    }
  } catch (err) {
    log.warn({ err, userId }, 'Redis query failed for trader user exchanges');
  }

  return 0;
}

/**
 * Records an exchange count for a user today.
 */
export async function recordUserExchange(
  userId: string,
  quantity: number,
  dateStr: string = getDailyDateString(),
): Promise<number> {
  const cacheKey = `${userId}:${dateStr}`;
  const current = await getUserExchangedToday(userId, dateStr);
  const updated = current + quantity;

  userExchangeCache.set(cacheKey, updated);

  try {
    const redisKey = `trader:exchanged:${userId}:${dateStr}`;
    // 48 hours expiration so it safely clears after the day passes
    await redis.set(redisKey, updated.toString(), 'EX', 48 * 3600);
  } catch (err) {
    log.warn({ err, userId }, 'Redis write failed for trader user exchange');
  }

  return updated;
}

/**
 * Clears user exchange tracking cache (useful for testing).
 */
export function clearUserExchangeCache(): void {
  userExchangeCache.clear();
}

/**
 * Checks if the Wandering Trader is currently available.
 * Available globally every Wednesday through Thursday (UTC days 3 and 4).
 * Supports TRADER_FORCE_OPEN env variable for testing/debugging.
 */
export function isTraderAvailable(date: Date = new Date()): boolean {
  if (process.env.TRADER_FORCE_OPEN === 'true') {
    return true;
  }
  const day = date.getUTCDay();
  return day === 3 || day === 4;
}

/**
 * Computes when the next Wednesday starts (00:00:00.000 UTC).
 */
export function getNextWednesdayStart(from: Date = new Date()): Date {
  const currentDay = from.getUTCDay();
  // Days until next Wednesday (3 in JS Date)
  let daysUntil = (3 - currentDay + 7) % 7;
  if (daysUntil === 0) {
    daysUntil = 7; // If today is Wednesday, next arrival is next week
  }
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + daysUntil, 0, 0, 0, 0),
  );
}

/**
 * Computes when the current trading window ends (Thursday ends at Friday 00:00:00.000 UTC).
 */
export function getCurrentWednesdayEnd(from: Date = new Date()): Date {
  const currentDay = from.getUTCDay();
  // Friday is day 5 (end of Thursday at 23:59:59 UTC)
  let daysUntilEnd = (5 - currentDay + 7) % 7;
  if (daysUntilEnd === 0) {
    daysUntilEnd = 7;
  }
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + daysUntilEnd, 0, 0, 0, 0),
  );
}

/**
 * Computes the premium price paid by the Trader for a blackmarket item.
 * Strictly guarantees a value greater than the blackmarket cost price (buyPrice):
 * - Buyable items: buyPrice * 1.75 (+75% profit over blackmarket cost)
 * - Legendary items (unbuyable): sellPrice * 1.75
 */
export function getTraderSellPrice(itemOrId: GameItem | string): number {
  const item = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId;
  if (!item) return 0;
  const costPrice = item.buyPrice ?? item.sellPrice;
  return Math.round(costPrice * TRADER_PRICE_MULTIPLIER);
}

/**
 * Returns all other registered items within the same rarity tier eligible for barter exchange.
 */
export function getEligibleExchangeItems(offeredItemId: string): GameItem[] {
  const offered = getItemById(offeredItemId);
  if (!offered) return [];
  return GAME_ITEMS.filter((item) => item.rarity === offered.rarity && item.id !== offered.id);
}

export interface TraderSellResult {
  success: boolean;
  item?: GameItem;
  quantity?: number;
  totalPayout?: number;
  newWallet?: number;
  remainingInInventory?: number;
  message: string;
}

/**
 * Sells a blackmarket item to the Wandering Trader for a considerably higher cash price (+75%).
 */
export async function sellItemToTrader(
  userId: string,
  itemId: string,
  quantity: number = 1,
  date: Date = new Date(),
): Promise<TraderSellResult> {
  if (!isTraderAvailable(date)) {
    return {
      success: false,
      message: 'The Wandering Trader is not in town today. He is only available on Wednesdays and Thursdays.',
    };
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return {
      success: false,
      message: 'Please specify a valid positive whole quantity.',
    };
  }

  const registeredItem = getItemById(itemId);
  const targetId = registeredItem ? registeredItem.id : itemId;

  let existingItem = await prisma.userInventoryItem.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId: targetId,
      },
    },
  });

  if (!existingItem && targetId !== itemId) {
    existingItem = await prisma.userInventoryItem.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
    });
  }

  if (!existingItem || existingItem.quantity <= 0) {
    return {
      success: false,
      message: "You don't have any of this item in your inventory to sell to the Trader.",
    };
  }

  if (existingItem.quantity < quantity) {
    return {
      success: false,
      message: `You only have **${existingItem.quantity}x** of **${existingItem.name}** in your stash.`,
    };
  }

  const unitPayout = registeredItem
    ? getTraderSellPrice(registeredItem)
    : Math.round(existingItem.value * 2 * TRADER_PRICE_MULTIPLIER);
  const totalPayout = unitPayout * quantity;

  // 1. Remove or decrement item from inventory
  const remainingInInventory = existingItem.quantity - quantity;
  if (remainingInInventory === 0) {
    await prisma.userInventoryItem.delete({
      where: { id: existingItem.id },
    });
  } else {
    await prisma.userInventoryItem.update({
      where: { id: existingItem.id },
      data: { quantity: remainingInInventory },
    });
  }

  // 2. Credit premium cash to user's wallet
  const userEco = await getUserEconomy(userId);
  const newWallet = userEco.wallet + totalPayout;
  await prisma.userEconomy.update({
    where: { userId },
    data: { wallet: newWallet },
  });

  log.info({ userId, itemId: targetId, quantity, totalPayout }, 'Item sold to Trader');

  return {
    success: true,
    item: registeredItem ?? {
      id: existingItem.itemId,
      name: existingItem.name,
      emoji: '<:19_contractdocument:1551660016514240532>',
      rarity: 'basic',
      description: '',
      buyPrice: null,
      sellPrice: existingItem.value,
      dailyStock: 0,
    },
    quantity,
    totalPayout,
    newWallet,
    remainingInInventory,
    message: `Sold **${quantity}x ${existingItem.name}** to the Trader for **$${totalPayout.toLocaleString('en-US')}** cash (+75% profit over blackmarket cost)!`,
  };
}

export interface TraderExchangeResult {
  success: boolean;
  offeredItem?: GameItem;
  desiredItem?: GameItem;
  quantity?: number;
  remainingOfferedInInventory?: number;
  remainingDailyExchanges?: number;
  message: string;
}

/**
 * Exchanges (barters) an item from personal inventory for another item of the same rarity tier.
 * Up to 5 total items can be exchanged per day (10 total for Wednesday and Thursday).
 */
export async function exchangeItemWithTrader(
  userId: string,
  offeredItemId: string,
  desiredItemId: string,
  quantity: number = 1,
  date: Date = new Date(),
): Promise<TraderExchangeResult> {
  if (!isTraderAvailable(date)) {
    return {
      success: false,
      message: 'The Wandering Trader is not in town today. He is only available on Wednesdays and Thursdays.',
    };
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return {
      success: false,
      message: 'Please specify a valid positive whole quantity to exchange.',
    };
  }

  const dateStr = getDailyDateString(date);
  const exchangedToday = await getUserExchangedToday(userId, dateStr);
  const remainingAllowance = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - exchangedToday);

  if (remainingAllowance === 0) {
    return {
      success: false,
      message: `You have reached your daily barter limit of **${DAILY_TRADER_EXCHANGE_LIMIT} total items** for today (10 in total across Wednesday and Thursday).`,
    };
  }

  if (quantity > remainingAllowance) {
    return {
      success: false,
      message: `Daily barter limit is ${DAILY_TRADER_EXCHANGE_LIMIT} total items per day. You can only exchange up to **${remainingAllowance}** more item(s) today.`,
    };
  }

  if (!offeredItemId || !desiredItemId || offeredItemId === desiredItemId) {
    return {
      success: false,
      message: 'Please choose a different item to receive in exchange.',
    };
  }

  const offeredItem = getItemById(offeredItemId);
  const desiredItem = getItemById(desiredItemId);

  if (!offeredItem) {
    return {
      success: false,
      message: 'The offered item was not recognized.',
    };
  }

  if (!desiredItem) {
    return {
      success: false,
      message: 'The requested exchange item does not exist.',
    };
  }

  if (offeredItem.rarity !== desiredItem.rarity) {
    return {
      success: false,
      message: `The Trader only accepts item-for-item trades within the same rarity tier (${RARITY_LABELS[offeredItem.rarity].label}).`,
    };
  }

  // Check user inventory for offered item
  const existingOffered = await prisma.userInventoryItem.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId: offeredItem.id,
      },
    },
  });

  if (!existingOffered || existingOffered.quantity <= 0) {
    return {
      success: false,
      message: `You do not have any **${offeredItem.name}** in your inventory to trade.`,
    };
  }

  if (existingOffered.quantity < quantity) {
    return {
      success: false,
      message: `You only have **${existingOffered.quantity}x** of **${offeredItem.name}** in your stash.`,
    };
  }

  // 1. Decrement/delete offered item
  const remainingOffered = existingOffered.quantity - quantity;
  if (remainingOffered === 0) {
    await prisma.userInventoryItem.delete({
      where: { id: existingOffered.id },
    });
  } else {
    await prisma.userInventoryItem.update({
      where: { id: existingOffered.id },
      data: { quantity: remainingOffered },
    });
  }

  // 2. Increment/create desired item
  const existingDesired = await prisma.userInventoryItem.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId: desiredItem.id,
      },
    },
  });

  if (existingDesired) {
    await prisma.userInventoryItem.update({
      where: { id: existingDesired.id },
      data: {
        quantity: existingDesired.quantity + quantity,
        value: desiredItem.sellPrice,
      },
    });
  } else {
    await prisma.userInventoryItem.create({
      data: {
        userId,
        itemId: desiredItem.id,
        name: desiredItem.name,
        quantity,
        value: desiredItem.sellPrice,
        metadata: RARITY_LABELS[desiredItem.rarity].label,
      },
    });
  }

  // 3. Record to daily exchange tracking
  await recordUserExchange(userId, quantity, dateStr);
  const remainingExchanges = Math.max(0, DAILY_TRADER_EXCHANGE_LIMIT - (exchangedToday + quantity));

  log.info(
    { userId, offered: offeredItem.id, desired: desiredItem.id, quantity, remainingExchanges },
    'Item(s) exchanged with Trader',
  );

  return {
    success: true,
    offeredItem,
    desiredItem,
    quantity,
    remainingOfferedInInventory: remainingOffered,
    remainingDailyExchanges: remainingExchanges,
    message: `Traded **${quantity}x ${offeredItem.name}** for **${quantity}x ${desiredItem.name}** (${desiredItem.emoji}) with the Shadow Trader! (${remainingExchanges}/5 daily exchanges remaining today)`,
  };
}

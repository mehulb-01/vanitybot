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

const log = childLogger('blackmarketService');

export const CATALOG_SIZE = 7;
export const MYTHIC_SPAWN_CHANCE = 0.02; // 2% chance for a mythic item to appear in the daily catalog

// In-memory fallback for user purchases per day: `${userId}:${dateStr}:${itemId}` -> count
const userPurchaseCache = new Map<string, number>();

/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 */
export function getDailyDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
function createPrng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes a 32-bit hash integer from a string.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Generates the deterministic 7-item daily catalog for a given date.
 * - Legendary items never appear.
 * - Mythic items have a 2% chance to occupy a slot.
 * - Exactly 7 distinct items are selected.
 */
export function getDailyCatalog(dateStr: string = getDailyDateString()): GameItem[] {
  const seed = hashString(`blackmarket:${dateStr}`);
  const random = createPrng(seed);

  const buyableItems = GAME_ITEMS.filter((item) => item.rarity !== 'legendary' && item.buyPrice !== null);
  const mythicItems = buyableItems.filter((item) => item.rarity === 'mythic');
  const standardItems = buyableItems.filter((item) => item.rarity !== 'mythic');

  const selectedItems: GameItem[] = [];
  const selectedIds = new Set<string>();

  // 2% chance for a mythic item to spawn in today's market
  if (mythicItems.length > 0 && random() < MYTHIC_SPAWN_CHANCE) {
    const mythicIndex = Math.floor(random() * mythicItems.length);
    const chosenMythic = mythicItems[mythicIndex];
    selectedItems.push(chosenMythic);
    selectedIds.add(chosenMythic.id);
  }

  // Shuffle standard items deterministically
  const availableStandards = [...standardItems];
  for (let i = availableStandards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [availableStandards[i], availableStandards[j]] = [availableStandards[j], availableStandards[i]];
  }

  // Fill up to CATALOG_SIZE (7 items)
  for (const item of availableStandards) {
    if (selectedItems.length >= CATALOG_SIZE) break;
    if (!selectedIds.has(item.id)) {
      selectedItems.push(item);
      selectedIds.add(item.id);
    }
  }

  return selectedItems;
}

/**
 * Retrieves the quantity of a specific item purchased by a user today.
 */
export async function getUserPurchasedToday(
  userId: string,
  itemId: string,
  dateStr: string = getDailyDateString(),
): Promise<number> {
  const cacheKey = `${userId}:${dateStr}:${itemId}`;

  // 1. Check in-memory map
  const memCount = userPurchaseCache.get(cacheKey);
  if (memCount !== undefined) {
    return memCount;
  }

  // 2. Check Redis
  try {
    const redisKey = `market:purchased:${userId}:${dateStr}:${itemId}`;
    const raw = await redis.get(redisKey);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      const count = isNaN(parsed) ? 0 : parsed;
      userPurchaseCache.set(cacheKey, count);
      return count;
    }
  } catch (err) {
    log.warn({ err, userId, itemId }, 'Redis query failed for market user purchases');
  }

  return 0;
}

/**
 * Records an item purchase by a user today.
 */
export async function recordUserPurchase(
  userId: string,
  itemId: string,
  quantity: number,
  dateStr: string = getDailyDateString(),
): Promise<number> {
  const cacheKey = `${userId}:${dateStr}:${itemId}`;
  const current = await getUserPurchasedToday(userId, itemId, dateStr);
  const updated = current + quantity;

  userPurchaseCache.set(cacheKey, updated);

  try {
    const redisKey = `market:purchased:${userId}:${dateStr}:${itemId}`;
    // 48 hours expiration so it safely clears after the day passes
    await redis.set(redisKey, updated.toString(), 'EX', 48 * 3600);
  } catch (err) {
    log.warn({ err, userId, itemId }, 'Redis write failed for market user purchase');
  }

  return updated;
}

/**
 * Clears user purchase tracking cache (useful for testing).
 */
export function clearUserPurchaseCache(): void {
  userPurchaseCache.clear();
}

export interface CatalogItemWithStock extends GameItem {
  remainingStock: number;
}

/**
 * Retrieves the daily catalog for a user with their remaining personal stock computed.
 */
export async function getUserCatalog(
  userId: string,
  dateStr: string = getDailyDateString(),
): Promise<CatalogItemWithStock[]> {
  const catalog = getDailyCatalog(dateStr);

  const results: CatalogItemWithStock[] = [];
  for (const item of catalog) {
    const purchased = await getUserPurchasedToday(userId, item.id, dateStr);
    const remainingStock = Math.max(0, item.dailyStock - purchased);
    results.push({
      ...item,
      remainingStock,
    });
  }

  return results;
}

export interface BuyItemResult {
  success: boolean;
  item?: GameItem;
  quantity?: number;
  totalPrice?: number;
  newWallet?: number;
  remainingStock?: number;
  message: string;
}

/**
 * Handles buying an item from the daily blackmarket catalog.
 */
export async function buyMarketItem(
  userId: string,
  itemId: string,
  quantity: number = 1,
  dateStr: string = getDailyDateString(),
): Promise<BuyItemResult> {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: 'Please specify a valid positive whole quantity.' };
  }

  const regItem = getItemById(itemId);
  const targetId = regItem ? regItem.id : itemId;
  const catalog = await getUserCatalog(userId, dateStr);
  const catalogItem = catalog.find((c) => c.id === targetId || c.id === itemId);

  if (!catalogItem) {
    return {
      success: false,
      message: 'This item is not available in the Dark Market catalog today.',
    };
  }

  if (catalogItem.buyPrice === null) {
    return {
      success: false,
      message: 'This item cannot be purchased on the market.',
    };
  }

  if (catalogItem.remainingStock < quantity) {
    return {
      success: false,
      message:
        catalogItem.remainingStock === 0
          ? `You have already bought out all available stock of **${catalogItem.name}** for today.`
          : `Only **${catalogItem.remainingStock}** unit(s) of **${catalogItem.name}** left in your daily allowance.`,
    };
  }

  const totalPrice = catalogItem.buyPrice * quantity;
  const userEco = await getUserEconomy(userId);

  if (userEco.wallet < totalPrice) {
    return {
      success: false,
      message: `Insufficient liquid cash. You need **$${totalPrice.toLocaleString('en-US')}**, but only have **$${userEco.wallet.toLocaleString('en-US')}** in hand.`,
    };
  }

  // 1. Deduct funds from wallet
  const newWallet = userEco.wallet - totalPrice;
  await prisma.userEconomy.update({
    where: { userId },
    data: { wallet: newWallet },
  });

  // 2. Upsert into user's inventory
  const existingInventoryItem = await prisma.userInventoryItem.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId: catalogItem.id,
      },
    },
  });

  if (existingInventoryItem) {
    await prisma.userInventoryItem.update({
      where: { id: existingInventoryItem.id },
      data: {
        quantity: existingInventoryItem.quantity + quantity,
        value: catalogItem.sellPrice,
      },
    });
  } else {
    await prisma.userInventoryItem.create({
      data: {
        userId,
        itemId: catalogItem.id,
        name: catalogItem.name,
        quantity,
        value: catalogItem.sellPrice,
        metadata: RARITY_LABELS[catalogItem.rarity].label,
      },
    });
  }

  // 3. Record purchase to decrement daily user stock
  await recordUserPurchase(userId, catalogItem.id, quantity, dateStr);
  const remainingStock = catalogItem.remainingStock - quantity;

  return {
    success: true,
    item: catalogItem,
    quantity,
    totalPrice,
    newWallet,
    remainingStock,
    message: `Acquired **${quantity}x ${catalogItem.name}** for **$${totalPrice.toLocaleString('en-US')}**!`,
  };
}

export interface SellItemResult {
  success: boolean;
  item?: GameItem;
  quantity?: number;
  totalPayout?: number;
  newWallet?: number;
  remainingInInventory?: number;
  message: string;
}

/**
 * Handles selling (fencing) an item from personal inventory to the dark market.
 * - Legendary items sell for $30,000,000.
 * - Mythic items sell for $450,000-$500,000.
 */
export async function sellMarketItem(
  userId: string,
  itemId: string,
  quantity: number = 1,
): Promise<SellItemResult> {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: 'Please specify a valid positive whole quantity.' };
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
      message: "You don't have any of this item in your inventory to sell.",
    };
  }

  if (existingItem.quantity < quantity) {
    return {
      success: false,
      message: `You only have **${existingItem.quantity}x** of **${existingItem.name}** in your stash.`,
    };
  }

  // Default to stored item.value if registered item not found, but enforce standard prices
  const unitSellPrice = registeredItem?.sellPrice ?? existingItem.value;
  const totalPayout = unitSellPrice * quantity;

  // 1. Remove/decrement item from inventory
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

  // 2. Credit cash to user wallet
  const userEco = await getUserEconomy(userId);
  const newWallet = userEco.wallet + totalPayout;
  await prisma.userEconomy.update({
    where: { userId },
    data: { wallet: newWallet },
  });

  return {
    success: true,
    item: registeredItem ?? {
      id: existingItem.itemId,
      name: existingItem.name,
      emoji: '<:19_contractdocument:1551660016514240532>',
      rarity: 'basic',
      description: '',
      buyPrice: null,
      sellPrice: unitSellPrice,
      dailyStock: 0,
    },
    quantity,
    totalPayout,
    newWallet,
    remainingInInventory,
    message: `Fenced **${quantity}x ${existingItem.name}** for **$${totalPayout.toLocaleString('en-US')}** cash!`,
  };
}

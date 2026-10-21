import { prisma } from '../../database/database';
import { redis } from '../../database/redis';
import { childLogger } from '../../utils/logger';
import { formatNumber } from '../../utils/format';

const log = childLogger('economyService');

export interface JailStatus {
  isJailed: boolean;
  remainingSeconds: number;
}

/**
 * Retrieves the UserEconomy record for a user, creating a default profile
 * with 500 starting credits if one doesn't exist yet.
 */
export async function getUserEconomy(userId: string) {
  if (typeof prisma.userEconomy.findUnique === 'function') {
    const existing = await prisma.userEconomy.findUnique({
      where: { userId },
    });
    if (existing) return existing;
  }

  return prisma.userEconomy.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      wallet: 500,
      bank: 0,
      bankCapacity: 25000,
    },
  });
}

/**
 * Adds credits to a user's wallet. If marked as a crime victory,
 * also updates lifetime crime stats.
 */
export async function addWallet(userId: string, amount: number, isCrime = false) {
  const current = await getUserEconomy(userId);
  const updateData: any = {
    wallet: current.wallet + amount,
  };

  if (isCrime) {
    updateData.crimesTotal = current.crimesTotal + 1;
    updateData.crimesWon = current.crimesWon + 1;
    updateData.netEarnings = current.netEarnings + amount;
    updateData.lastCrimeAt = new Date();
  }

  return prisma.userEconomy.update({
    where: { userId },
    data: updateData,
  });
}

/**
 * Deducts credits from a user's wallet, clamping at 0.
 * Returns the actual amount deducted.
 */
export async function deductWallet(userId: string, amount: number): Promise<number> {
  const current = await getUserEconomy(userId);
  const actualDeduction = Math.min(current.wallet, Math.max(0, amount));
  const newWallet = current.wallet - actualDeduction;

  await prisma.userEconomy.update({
    where: { userId },
    data: { wallet: newWallet },
  });

  return actualDeduction;
}

/**
 * Deposits credits from wallet into bank, bounded by bankCapacity.
 */
export async function depositToBank(
  userId: string,
  amount: number,
  customCapacity?: number,
): Promise<{ success: boolean; deposited: number; message: string }> {
  const current = await getUserEconomy(userId);

  if (amount <= 0) {
    return { success: false, deposited: 0, message: "Enter a positive number. You can't deposit imaginary money." };
  }

  if (current.wallet < amount) {
    return {
      success: false,
      deposited: 0,
      message: `You only have **$${formatNumber(current.wallet)}** in your wallet.`,
    };
  }

  const capacity = customCapacity ?? current.bankCapacity;
  const availableSpace = capacity - current.bank;
  if (availableSpace <= 0) {
    return {
      success: false,
      deposited: 0,
      message: `Your bank vault is completely full! Capacity is **$${formatNumber(capacity)}**.`,
    };
  }

  const toDeposit = Math.min(amount, availableSpace);
  await prisma.userEconomy.update({
    where: { userId },
    data: {
      wallet: current.wallet - toDeposit,
      bank: current.bank + toDeposit,
    },
  });

  const cappedNote = toDeposit < amount ? ` (Capped at bank capacity of $${formatNumber(capacity)})` : '';
  return {
    success: true,
    deposited: toDeposit,
    message: `Deposited **$${formatNumber(toDeposit)}** into your bank vault.${cappedNote}`,
  };
}

/**
 * Withdraws funds from bank into wallet.
 */
export async function withdrawFromBank(
  userId: string,
  amount: number,
): Promise<{ success: boolean; withdrawn: number; message: string }> {
  const current = await getUserEconomy(userId);

  if (amount <= 0) {
    return { success: false, withdrawn: 0, message: "Enter a positive number. You can't withdraw debt." };
  }

  if (current.bank < amount) {
    return {
      success: false,
      withdrawn: 0,
      message: `You only have **$${formatNumber(current.bank)}** in your bank vault.`,
    };
  }

  await prisma.userEconomy.update({
    where: { userId },
    data: {
      wallet: current.wallet + amount,
      bank: current.bank - amount,
    },
  });

  return {
    success: true,
    withdrawn: amount,
    message: `Withdrew **$${formatNumber(amount)}** into your wallet.`,
  };
}

/**
 * Checks if a user is currently in jail.
 */
export async function checkJailStatus(userId: string): Promise<JailStatus> {
  const current = await getUserEconomy(userId);
  if (!current.jailUntil) {
    return { isJailed: false, remainingSeconds: 0 };
  }

  const now = Date.now();
  const jailTime = current.jailUntil.getTime();
  if (now >= jailTime) {
    // Jail term expired, clear status
    await prisma.userEconomy.update({
      where: { userId },
      data: { jailUntil: null },
    });
    return { isJailed: false, remainingSeconds: 0 };
  }

  const remainingSeconds = Math.ceil((jailTime - now) / 1000);
  return { isJailed: true, remainingSeconds };
}

/**
 * Jails a user for a given duration in minutes, deducts a Policia fine,
 * and updates criminal records.
 */
export async function jailUser(
  userId: string,
  durationMinutes: number,
  fineAmount: number,
): Promise<{ finePaid: number; jailUntil: Date; newWallet: number }> {
  const current = await getUserEconomy(userId);
  const finePaid = Math.min(current.wallet, Math.max(0, fineAmount));
  const newWallet = current.wallet - finePaid;
  const jailUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

  await prisma.userEconomy.update({
    where: { userId },
    data: {
      wallet: newWallet,
      jailUntil,
      crimesTotal: current.crimesTotal + 1,
      crimesLost: current.crimesLost + 1,
      netEarnings: current.netEarnings - finePaid,
      lastCrimeAt: new Date(),
    },
  });

  log.info({ userId, durationMinutes, finePaid }, 'User jailed by Policia.');
  return { finePaid, jailUntil, newWallet };
}

/**
 * Frees a user from jail immediately.
 */
export async function releaseFromJail(userId: string) {
  return prisma.userEconomy.update({
    where: { userId },
    data: { jailUntil: null },
  });
}

export const SELF_BAIL_MIN_WALLET = 150_000;

/**
 * Pays bail to free a user from jail using funds from the bailer's wallet.
 * A person can only bail themselves out if their liquid wallet has $150k+ ($150,000) at present.
 */
export async function payBail(
  bailerUserId: string,
  targetUserId: string,
  bailAmount: number,
): Promise<{ success: boolean; message: string }> {
  const bailer = await getUserEconomy(bailerUserId);
  const targetStatus = await checkJailStatus(targetUserId);

  if (!targetStatus.isJailed) {
    return { success: false, message: 'That user is already walking free on the streets.' };
  }

  // Self-bail check: A person can only bail themselves out if their liquid wallet has 150k+ ($150,000)
  if (bailerUserId === targetUserId && bailer.wallet < SELF_BAIL_MIN_WALLET) {
    return {
      success: false,
      message: `You can only bail yourself out if your liquid wallet has **$${formatNumber(SELF_BAIL_MIN_WALLET)}+** at present. You currently have **$${formatNumber(bailer.wallet)}**. Have a gang comrade bail you out instead.`,
    };
  }

  if (bailer.wallet < bailAmount) {
    return {
      success: false,
      message: `You need **$${formatNumber(bailAmount)}** in your wallet to post bail. You have **$${formatNumber(bailer.wallet)}**.`,
    };
  }

  // Deduct bail from bailer
  await prisma.userEconomy.update({
    where: { userId: bailerUserId },
    data: {
      wallet: bailer.wallet - bailAmount,
      bountiesPaid: bailer.bountiesPaid + bailAmount,
    },
  });

  // Release target
  await releaseFromJail(targetUserId);

  return {
    success: true,
    message: `Bail of **$${formatNumber(bailAmount)}** paid! Policia has released <@${targetUserId}> from the holding cell.`,
  };
}

export interface ClockInResult {
  success: boolean;
  reward?: number;
  newWallet?: number;
  remainingMs?: number;
  nextAvailableAt?: Date;
  message: string;
}

export const CLOCKIN_BONUS_AMOUNT = 5000;
export const CLOCKIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Claims the daily login bonus ($5,000 every 24 hours).
 */
export async function clockIn(userId: string): Promise<ClockInResult> {
  const current: any = await getUserEconomy(userId);
  const now = Date.now();

  if (current.lastClockIn) {
    const lastClockInTime = new Date(current.lastClockIn).getTime();
    const elapsed = now - lastClockInTime;
    if (elapsed < CLOCKIN_COOLDOWN_MS) {
      const remainingMs = CLOCKIN_COOLDOWN_MS - elapsed;
      const nextAvailableAt = new Date(lastClockInTime + CLOCKIN_COOLDOWN_MS);
      return {
        success: false,
        remainingMs,
        nextAvailableAt,
        message: 'You have already clocked in for your shift within the last 24 hours.',
      };
    }
  }

  const newWallet = current.wallet + CLOCKIN_BONUS_AMOUNT;
  await (prisma.userEconomy as any).update({
    where: { userId },
    data: {
      wallet: newWallet,
      lastClockIn: new Date(now),
    },
  });

    return {
      success: true,
      reward: CLOCKIN_BONUS_AMOUNT,
      newWallet,
      nextAvailableAt: new Date(now + CLOCKIN_COOLDOWN_MS),
      message: `Shift complete! You received **$${formatNumber(CLOCKIN_BONUS_AMOUNT)}** daily syndicate stipend.`,
    };
  }

  export const MUG_COOLDOWN_MS = 25 * 60 * 1000; // 25 minutes
  export const MUG_MAX_AMOUNT = 2500;
  export const MUG_MIN_AMOUNT = 50;

  const targetMugCooldownCache = new Map<string, number>();

  /**
   * Checks if a target user is on mugging cooldown (25 minutes).
   */
  export async function getTargetMugCooldown(targetUserId: string): Promise<{
    isOnCooldown: boolean;
    remainingMs: number;
    nextAvailableAt?: Date;
  }> {
    const now = Date.now();

    const memExpires = targetMugCooldownCache.get(targetUserId);
    if (memExpires && memExpires > now) {
      const remainingMs = memExpires - now;
      return {
        isOnCooldown: true,
        remainingMs,
        nextAvailableAt: new Date(memExpires),
      };
    }

    try {
      const key = `mug:victim:${targetUserId}`;
      const ttlSeconds = await redis.ttl(key);
      if (ttlSeconds > 0) {
        const remainingMs = ttlSeconds * 1000;
        const nextAvailableAt = new Date(now + remainingMs);
        targetMugCooldownCache.set(targetUserId, nextAvailableAt.getTime());
        return {
          isOnCooldown: true,
          remainingMs,
          nextAvailableAt,
        };
      }
    } catch (err) {
      log.warn({ err, targetUserId }, 'Failed to query redis for mug victim cooldown');
    }

    return { isOnCooldown: false, remainingMs: 0 };
  }

  /**
   * Sets the 25-minute mugging cooldown on a target user.
   */
  export async function setTargetMugCooldown(
    targetUserId: string,
    durationMs: number = MUG_COOLDOWN_MS,
  ): Promise<void> {
    const expiresAt = Date.now() + durationMs;
    targetMugCooldownCache.set(targetUserId, expiresAt);

    try {
      const key = `mug:victim:${targetUserId}`;
      await redis.set(key, expiresAt.toString(), 'EX', Math.ceil(durationMs / 1000));
    } catch (err) {
      log.warn({ err, targetUserId }, 'Failed to set redis mug victim cooldown');
    }
  }

  /**
   * Clears target mug cooldown cache (primarily for tests).
   */
  export function clearTargetMugCooldown(targetUserId?: string): void {
    if (targetUserId) {
      targetMugCooldownCache.delete(targetUserId);
    } else {
      targetMugCooldownCache.clear();
    }
  }

  export interface MugResult {
    success: boolean;
    stolenAmount: number;
    robberNewWallet?: number;
    victimNewWallet?: number;
    remainingMs?: number;
    nextAvailableAt?: Date;
    reason?: 'SELF' | 'BOT' | 'ROBBER_JAILED' | 'TARGET_JAILED' | 'TARGET_COOLDOWN' | 'EMPTY_POCKETS';
    message: string;
  }

  /**
   * Robs a random amount of money from a target user (up to $2,500).
   * Enforces 25-minute victim immunity cooldown.
   */
  export async function mugUser(
    robberUserId: string,
    targetUserId: string,
    isTargetBot = false,
  ): Promise<MugResult> {
    if (robberUserId === targetUserId) {
      return {
        success: false,
        stolenAmount: 0,
        reason: 'SELF',
        message: "You can't mug yourself! Find another mark on the streets.",
      };
    }

    if (isTargetBot) {
      return {
        success: false,
        stolenAmount: 0,
        reason: 'BOT',
        message: "You can't mug a bot! They don't carry street cash.",
      };
    }

    const [robberEco, targetEco] = await Promise.all([
      getUserEconomy(robberUserId),
      getUserEconomy(targetUserId),
    ]);

    const isRobberJailed = robberEco.jailUntil ? robberEco.jailUntil.getTime() > Date.now() : false;
    if (isRobberJailed) {
      const remainingSeconds = Math.ceil((robberEco.jailUntil!.getTime() - Date.now()) / 1000);
      return {
        success: false,
        stolenAmount: 0,
        reason: 'ROBBER_JAILED',
        remainingMs: remainingSeconds * 1000,
        message: `You are currently locked up in Policia detention (${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s remaining). You can't mug anyone from behind bars.`,
      };
    }

    const isTargetJailed = targetEco.jailUntil ? targetEco.jailUntil.getTime() > Date.now() : false;
    if (isTargetJailed) {
      return {
        success: false,
        stolenAmount: 0,
        reason: 'TARGET_JAILED',
        message: `<@${targetUserId}> is currently locked up in Policia detention! They have nothing on them to steal.`,
      };
    }

    const cooldownStatus = await getTargetMugCooldown(targetUserId);
    if (cooldownStatus.isOnCooldown) {
      return {
        success: false,
        stolenAmount: 0,
        reason: 'TARGET_COOLDOWN',
        remainingMs: cooldownStatus.remainingMs,
        nextAvailableAt: cooldownStatus.nextAvailableAt,
        message: `<@${targetUserId}> was recently mugged and has their guard up.`,
      };
    }

    // Activate 25-minute victim cooldown
    await setTargetMugCooldown(targetUserId);
    const nextAvailableAt = new Date(Date.now() + MUG_COOLDOWN_MS);

    // If victim has $0
    if (targetEco.wallet <= 0) {
      return {
        success: true,
        stolenAmount: 0,
        robberNewWallet: robberEco.wallet,
        victimNewWallet: 0,
        reason: 'EMPTY_POCKETS',
        nextAvailableAt,
        message: `You ambushed <@${targetUserId}> in a dark alley, but their pockets were completely empty!`,
      };
    }

    // Determine stolen amount (random amount up to $2,500, bounded by victim's wallet)
    const maxSteal = Math.min(MUG_MAX_AMOUNT, targetEco.wallet);
    const minSteal = Math.min(MUG_MIN_AMOUNT, maxSteal);
    const stolenAmount = Math.floor(Math.random() * (maxSteal - minSteal + 1)) + minSteal;

    const victimNewWallet = Math.max(0, targetEco.wallet - stolenAmount);
    const robberNewWallet = robberEco.wallet + stolenAmount;

    await Promise.all([
      prisma.userEconomy.update({
        where: { userId: targetUserId },
        data: { wallet: victimNewWallet },
      }),
      prisma.userEconomy.update({
        where: { userId: robberUserId },
        data: {
          wallet: robberNewWallet,
          crimesTotal: (robberEco.crimesTotal ?? 0) + 1,
          crimesWon: (robberEco.crimesWon ?? 0) + 1,
          netEarnings: (robberEco.netEarnings ?? 0) + stolenAmount,
          lastCrimeAt: new Date(),
        },
      }),
    ]);

    return {
      success: true,
      stolenAmount,
      robberNewWallet,
      victimNewWallet,
      nextAvailableAt,
      message: `You mugged <@${targetUserId}> and stole **$${formatNumber(stolenAmount)}**!`,
    };
  }


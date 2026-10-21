import { prisma } from '../../database/database';
import { getUserEconomy, deductWallet, addWallet } from '../economy/economyService';
import { getUserGang } from './gangService';
import { formatNumber } from '../../utils/format';

export interface GameResult {
  success: boolean;
  game: 'roulette' | 'gambit' | 'launder';
  wager: number;
  payout: number;
  netProfit: number;
  multiplier: number;
  isWin: boolean;
  isJackpot: boolean;
  newWallet: number;
  title: string;
  narrative: string;
  gangTreasuryBonus?: number;
  error?: string;
}

/**
 * Validates wager and jail status for gang money games.
 */
async function validateWager(
  userId: string,
  wager: number,
  minWager: number,
): Promise<{ valid: boolean; userEco?: any; error?: string }> {
  if (!Number.isInteger(wager) || wager < minWager) {
    return {
      valid: false,
      error: `Minimum wager is **$${formatNumber(minWager)}**. Specify a valid whole amount.`,
    };
  }

  const userEco = await getUserEconomy(userId);

  const isJailed = userEco.jailUntil ? userEco.jailUntil.getTime() > Date.now() : false;
  if (isJailed) {
    const remaining = Math.ceil((userEco.jailUntil!.getTime() - Date.now()) / 1000);
    return {
      valid: false,
      error: `You are behind bars for another **${remaining}s**! You cannot gamble from a jail cell.`,
    };
  }

  if (userEco.wallet < wager) {
    return {
      valid: false,
      error: `You only have **$${formatNumber(userEco.wallet)}** in your wallet. You cannot afford this wager.`,
    };
  }

  return { valid: true, userEco };
}

/**
 * Helper to credit half of lost money into the user's gang treasury.
 */
async function recordGangTreasurySink(userId: string, wager: number): Promise<number> {
  try {
    const membership = await getUserGang(userId);
    if (membership && membership.gangId) {
      const sinkBonus = Math.floor(wager * 0.5);
      if (sinkBonus > 0) {
        await prisma.gang.update({
          where: { id: membership.gangId },
          data: { treasury: { increment: sinkBonus } },
        });
        return sinkBonus;
      }
    }
  } catch {
    // Non-fatal if gang lookup fails
  }
  return 0;
}

/**
 * 1. Underground Russian Roulette (/roulette)
 * High-risk 6-chamber cylinder.
 * - 68% Chance: Live round. Lose 100%. (50% flows to gang vault).
 * - 22% Chance: Click. Survives with 1.4x payout.
 * - 10% Chance: Golden Chamber Lucky Multiplier (5x, 12x, or 30x).
 */
export async function playRoulette(
  userId: string,
  wager: number,
  rng: () => number = Math.random,
): Promise<GameResult> {
  const check = await validateWager(userId, wager, 100);
  if (!check.valid) {
    return {
      success: false,
      game: 'roulette',
      wager,
      payout: 0,
      netProfit: 0,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: check.userEco?.wallet ?? 0,
      title: 'Gambit Declined',
      narrative: check.error!,
      error: check.error,
    };
  }

  await deductWallet(userId, wager);
  const roll = rng();

  if (roll < 0.68) {
    // 68% Live Round / Death
    const gangBonus = await recordGangTreasurySink(userId, wager);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'roulette',
      wager,
      payout: 0,
      netProfit: -wager,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:06_no_entry:1548395760935239823> CLICK... BANG! Firing Pin Struck Live Round',
      narrative:
        `*The heavy iron cylinder spins and stops. The hammer falls on a live 9mm hollow point!* \n\n` +
        `> **Outcome:** Your skull takes the heat and your vision blackens. You lost **$${formatNumber(wager)}**!` +
        (gangBonus > 0 ? `\n> <:54_bank:1551660106582859927> **Gang Vault:** **$${formatNumber(gangBonus)}** was recovered into your gang's treasury.` : ''),
      gangTreasuryBonus: gangBonus,
    };
  }

  if (roll < 0.90) {
    // 22% Scrape By (1.4x payout)
    const multiplier = 1.4;
    const payout = Math.round(wager * multiplier);
    await addWallet(userId, payout);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'roulette',
      wager,
      payout,
      netProfit: payout - wager,
      multiplier,
      isWin: true,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:11_check_green:1548395771852754944> *CLICK!* Empty Chamber — You Survived',
      narrative:
        `*A cold hollow click echoes through the dark room. The chamber was empty!*\n\n` +
        `> **Outcome:** You steady your shaking hands and rake in **$${formatNumber(payout)}** (\`1.4×\` return).\n` +
        `> **Net Profit:** \`+$${formatNumber(payout - wager)}\``,
    };
  }

  // 10% Golden Chamber (Lucky Multiplier: 5x, 12x, or 30x)
  const jackpotRoll = rng();
  let multiplier = 5;
  let tierLabel = '5× Syndicate Multiplier';

  if (jackpotRoll >= 0.95) {
    multiplier = 30;
    tierLabel = '30× Mythic Jackpot Multiplier';
  } else if (jackpotRoll >= 0.70) {
    multiplier = 12;
    tierLabel = '12× High-Roller Multiplier';
  }

  const payout = Math.round(wager * multiplier);
  await addWallet(userId, payout);
  const updatedEco = await getUserEconomy(userId);

  return {
    success: true,
    game: 'roulette',
    wager,
    payout,
    netProfit: payout - wager,
    multiplier,
    isWin: true,
    isJackpot: true,
    newWallet: updatedEco.wallet,
    title: `<:27_star_compass:1548395521687953529> GOLDEN CHAMBER HIT! [${tierLabel}]`,
    narrative:
      `*CHING! The cylinder locks into the gold-engraved master chamber. A blinding flash of sparks erupts across the table!*\n\n` +
      `> **Lucky Multiplier:** \`${multiplier}×\`\n` +
      `> **Total Payout:** \`$${formatNumber(payout)}\`\n` +
      `> **Net Windfall:** \`+$${formatNumber(payout - wager)}\``,
  };
}

/**
 * 2. The Smuggler's Heist Gambit (/gambit)
 * High-stakes illicit contraband convoy.
 * - 70% Chance: DEA / Cartel Ambush. Lose 100%.
 * - 18% Chance: Corrupt Checkpoint Extortion. Returns 0.5x (lose 50%).
 * - 8% Chance: Clean Smuggle. Returns 2.5x payout.
 * - 4% Chance: 💎 Ghost Shipment Lucky Multiplier (15x, 30x, or 50x).
 */
export async function playGambit(
  userId: string,
  wager: number,
  rng: () => number = Math.random,
): Promise<GameResult> {
  const check = await validateWager(userId, wager, 250);
  if (!check.valid) {
    return {
      success: false,
      game: 'gambit',
      wager,
      payout: 0,
      netProfit: 0,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: check.userEco?.wallet ?? 0,
      title: 'Gambit Declined',
      narrative: check.error!,
      error: check.error,
    };
  }

  await deductWallet(userId, wager);
  const roll = rng();

  if (roll < 0.70) {
    // 70% Ambush / Confiscation
    const gangBonus = await recordGangTreasurySink(userId, wager);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'gambit',
      wager,
      payout: 0,
      netProfit: -wager,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:04_siren_alarm:1548395756988268684> CONVOY AMBUSHED! Shipment Confiscated',
      narrative:
        `*Blue and red flashers light up the highway. SWAT and DEA roadblocks encircle your smuggling convoy!*\n\n` +
        `> **Outcome:** Your drivers scatter into the swamps and all wares are confiscated. You lost **$${formatNumber(wager)}**!` +
        (gangBonus > 0 ? `\n> <:54_bank:1551660106582859927> **Gang Recovery:** **$${formatNumber(gangBonus)}** was recovered by your gang.` : ''),
      gangTreasuryBonus: gangBonus,
    };
  }

  if (roll < 0.88) {
    // 18% Corrupt Checkpoint Extortion (0.5x return, 50% loss)
    const multiplier = 0.5;
    const payout = Math.round(wager * multiplier);
    await addWallet(userId, payout);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'gambit',
      wager,
      payout,
      netProfit: payout - wager,
      multiplier,
      isWin: false,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:10_warning_triangle:1548395769562665174> BORDER SHAKEDOWN! Heavy Extortion Paid',
      narrative:
        `*Corrupt border guards impound the trucks until a hefty extortion bribe is paid in untraceable bonds.*\n\n` +
        `> **Outcome:** You salvaged only half your investment: **$${formatNumber(payout)}** (\`0.5×\`).\n` +
        `> **Net Loss:** \`-$${formatNumber(wager - payout)}\``,
    };
  }

  if (roll < 0.96) {
    // 8% Clean Delivery (2.5x payout)
    const multiplier = 2.5;
    const payout = Math.round(wager * multiplier);
    await addWallet(userId, payout);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'gambit',
      wager,
      payout,
      netProfit: payout - wager,
      multiplier,
      isWin: true,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:19_contractdocument:1551660016514240532> CONTRABAND SECURED! Clean Delivery',
      narrative:
        `*The trucks slip beneath the radar and dock into the underground warehouse before dawn.*\n\n` +
        `> **Outcome:** The blackmarket dealers pay out in full: **$${formatNumber(payout)}** (\`2.5×\` return).\n` +
        `> **Net Profit:** \`+$${formatNumber(payout - wager)}\``,
    };
  }

  // 4% Ghost Shipment (Lucky Multiplier: 15x, 30x, or 50x)
  const jackpotRoll = rng();
  let multiplier = 15;
  let tierLabel = '15× Cartel Ghost Crate';

  if (jackpotRoll >= 0.95) {
    multiplier = 50;
    tierLabel = '50× Mythic Ghost Shipment Jackpot';
  } else if (jackpotRoll >= 0.75) {
    multiplier = 30;
    tierLabel = '30× High-Grade Tech Windfall';
  }

  const payout = Math.round(wager * multiplier);
  await addWallet(userId, payout);
  const updatedEco = await getUserEconomy(userId);

  return {
    success: true,
    game: 'gambit',
    wager,
    payout,
    netProfit: payout - wager,
    multiplier,
    isWin: true,
    isJackpot: true,
    newWallet: updatedEco.wallet,
    title: `<:06_diamond:1551659985031659562> GHOST SHIPMENT DISCOVERED! [${tierLabel}]`,
    narrative:
      `*A hidden armored floor in the lead truck reveals classified black-ops tech crates and unmarked bearer bonds!*\n\n` +
      `> **Lucky Multiplier:** \`${multiplier}×\`\n` +
      `> **Total Payout:** \`$${formatNumber(payout)}\`\n` +
      `> **Net Windfall:** \`+$${formatNumber(payout - wager)}\``,
  };
}

/**
 * 3. The Dirty Money Washer (/launder)
 * High-risk shell corporation laundering.
 * - 70% Chance: Federal Asset Freeze. Lose 100%.
 * - 18% Chance: High Laundering Cut. Returns 0.7x (lose 30%).
 * - 8% Chance: Clean Wash. Returns 1.5x payout.
 * - 4% Chance: 🏦 Cayman Windfall Lucky Multiplier (10x, 25x, or 40x).
 */
export async function playLaunder(
  userId: string,
  wager: number,
  rng: () => number = Math.random,
): Promise<GameResult> {
  const check = await validateWager(userId, wager, 200);
  if (!check.valid) {
    return {
      success: false,
      game: 'launder',
      wager,
      payout: 0,
      netProfit: 0,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: check.userEco?.wallet ?? 0,
      title: 'Laundering Aborted',
      narrative: check.error!,
      error: check.error,
    };
  }

  await deductWallet(userId, wager);
  const roll = rng();

  if (roll < 0.70) {
    // 70% Federal Asset Freeze
    const gangBonus = await recordGangTreasurySink(userId, wager);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'launder',
      wager,
      payout: 0,
      netProfit: -wager,
      multiplier: 0,
      isWin: false,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:12_padlock:1548395774432383127> ACCOUNTS FROZEN! Federal Asset Seizure',
      narrative:
        `*Federal financial intelligence flags the wire transfer as suspicious! The shell company is seized.*\n\n` +
        `> **Outcome:** The accounts are locked and the funds are swallowed. You lost **$${formatNumber(wager)}**!` +
        (gangBonus > 0 ? `\n> <:54_bank:1551660106582859927> **Gang Vault:** **$${formatNumber(gangBonus)}** was recovered by your gang's accountants.` : ''),
      gangTreasuryBonus: gangBonus,
    };
  }

  if (roll < 0.88) {
    // 18% Steep Accounting Cut (0.7x return, 30% loss)
    const multiplier = 0.7;
    const payout = Math.round(wager * multiplier);
    await addWallet(userId, payout);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'launder',
      wager,
      payout,
      netProfit: payout - wager,
      multiplier,
      isWin: false,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:05_goldcoins:1551659972473913485> EXPENSIVE WASH! High Laundering Fees',
      narrative:
        `*The wash clears through offshore casinos, but crooked accountants take a steep 30% processing cut.*\n\n` +
        `> **Outcome:** You receive **$${formatNumber(payout)}** clean cash (\`0.7×\` return).\n` +
        `> **Net Loss:** \`-$${formatNumber(wager - payout)}\``,
    };
  }

  if (roll < 0.96) {
    // 8% Clean Wash (1.5x payout)
    const multiplier = 1.5;
    const payout = Math.round(wager * multiplier);
    await addWallet(userId, payout);
    const updatedEco = await getUserEconomy(userId);

    return {
      success: true,
      game: 'launder',
      wager,
      payout,
      netProfit: payout - wager,
      multiplier,
      isWin: true,
      isJackpot: false,
      newWallet: updatedEco.wallet,
      title: '<:16_sparkles_gold:1548395567715979294> DIRTY MONEY CLEANED! Successful Wash',
      narrative:
        `*The funds cycle seamlessly through dummy luxury car dealerships and return 100% clean with interest.*\n\n` +
        `> **Outcome:** Clean cash returned: **$${formatNumber(payout)}** (\`1.5×\` return).\n` +
        `> **Net Profit:** \`+$${formatNumber(payout - wager)}\``,
    };
  }

  // 4% Cayman Windfall (Lucky Multiplier: 10x, 25x, or 40x)
  const jackpotRoll = rng();
  let multiplier = 10;
  let tierLabel = '10× Offshore Arbitrage';

  if (jackpotRoll >= 0.95) {
    multiplier = 40;
    tierLabel = '40× Cayman Island Master Jackpot';
  } else if (jackpotRoll >= 0.70) {
    multiplier = 25;
    tierLabel = '25× Swiss Vault Windfall';
  }

  const payout = Math.round(wager * multiplier);
  await addWallet(userId, payout);
  const updatedEco = await getUserEconomy(userId);

  return {
    success: true,
    game: 'launder',
    wager,
    payout,
    netProfit: payout - wager,
    multiplier,
    isWin: true,
    isJackpot: true,
    newWallet: updatedEco.wallet,
    title: `<:54_bank:1551660106582859927> CAYMAN WINDFALL HIT! [${tierLabel}]`,
    narrative:
      `*A massive offshore currency arbitrage loophole triggers! Your deposit multiplies exponentially!*\n\n` +
      `> **Lucky Multiplier:** \`${multiplier}×\`\n` +
      `> **Total Clean Cash:** \`$${formatNumber(payout)}\`\n` +
      `> **Net Windfall:** \`+$${formatNumber(payout - wager)}\``,
  };
}

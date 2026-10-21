import { addWallet, jailUser } from '../economy/economyService';
import { getUserGang } from './gangService';
import {
  CrimeActionChoice,
  CrimeStage,
  CrimeScenario,
  STREET_HUSTLE_SCENARIOS,
  CONVENIENCE_RAID_SCENARIOS,
  CYBER_VAULT_SCENARIOS,
  ARMORED_CONVOY_SCENARIOS,
} from './crimeScenarios';

export type { CrimeActionChoice, CrimeStage, CrimeScenario };

export interface CrimeOperation {
  id: string;
  name: string;
  emoji: string;
  description: string;
  riskLabel: string;
  baseSuccessRate: number; // 0.0 - 1.0
  minPayout: number;
  maxPayout: number;
  fine: number;
  jailMinutes: number;
  favoredGang: string; // gang.name that receives bonus
  favoredGangBonus: number; // e.g. +0.15 success & +15% payout
  stage1: CrimeStage;
  stage2: CrimeStage;
  scenarios: CrimeScenario[];
}

export const CRIME_OPERATIONS: Record<string, CrimeOperation> = {
  street_hustle: {
    id: 'street_hustle',
    name: 'Street Hustle & Pickpocket',
    emoji: '<:11_weedbag:1551659997627285616>',
    description: 'Work the crowded neon subway stations and tourist markets for quick marks.',
    riskLabel: 'Low Risk (10% Fail)',
    baseSuccessRate: 0.9,
    minPayout: 400,
    maxPayout: 900,
    fine: 80,
    jailMinutes: 1,
    favoredGang: '',
    favoredGangBonus: 0,
    stage1: STREET_HUSTLE_SCENARIOS[0].stage1,
    stage2: STREET_HUSTLE_SCENARIOS[0].stage2,
    scenarios: STREET_HUSTLE_SCENARIOS,
  },
  convenience_raid: {
    id: 'convenience_raid',
    name: 'Neon-Mart Convenience Raid',
    emoji: '<:49_warehouse:1551660095694184458>',
    description: 'Hit a 24/7 franchise store and crack open the safe behind the counter.',
    riskLabel: 'Moderate Risk (20% Fail)',
    baseSuccessRate: 0.8,
    minPayout: 1500,
    maxPayout: 3200,
    fine: 250,
    jailMinutes: 2,
    favoredGang: '',
    favoredGangBonus: 0,
    stage1: CONVENIENCE_RAID_SCENARIOS[0].stage1,
    stage2: CONVENIENCE_RAID_SCENARIOS[0].stage2,
    scenarios: CONVENIENCE_RAID_SCENARIOS,
  },
  cyber_vault: {
    id: 'cyber_vault',
    name: 'Megacorp Cyber Vault Infiltration',
    emoji: '<:18_hackerlaptop:1551660014228348978>',
    description: 'Jack into a secured corporate server node to siphon encrypted crypto funds.',
    riskLabel: 'Technical Risk (28% Fail)',
    baseSuccessRate: 0.72,
    minPayout: 4000,
    maxPayout: 8500,
    fine: 600,
    jailMinutes: 3,
    favoredGang: '',
    favoredGangBonus: 0,
    stage1: CYBER_VAULT_SCENARIOS[0].stage1,
    stage2: CYBER_VAULT_SCENARIOS[0].stage2,
    scenarios: CYBER_VAULT_SCENARIOS,
  },
  armored_convoy: {
    id: 'armored_convoy',
    name: 'Armored Convoy Hijack',
    emoji: '<:41_militarytruck:1551660074408349777>',
    description: 'Ambush a heavily reinforced tactical transport carrying precious diamond bullion.',
    riskLabel: 'High Risk (35% Fail)',
    baseSuccessRate: 0.65,
    minPayout: 10000,
    maxPayout: 22000,
    fine: 1500,
    jailMinutes: 4,
    favoredGang: '',
    favoredGangBonus: 0,
    stage1: ARMORED_CONVOY_SCENARIOS[0].stage1,
    stage2: ARMORED_CONVOY_SCENARIOS[0].stage2,
    scenarios: ARMORED_CONVOY_SCENARIOS,
  },
};

export const GANG_PERK_DESCRIPTIONS: Record<string, string> = {
  kurogane: '⚔️ Kurogane (+15% success on direct breach & combat choices)',
  omerta: '🤫 Omertà (+15% success on Street Hustles & stealth options)',
  calavera: '💀 Calavera (+15% success on Neon-Mart raids & explosive choices)',
  longwei: '🐉 Longwei (+20% bonus payout & success on Syndicate Casino Heists)',
  moroz: '❄️ Moroz (+20% bonus payout & success on Cyber Vault Infiltrations)',
  reapers: '⚰️ Reapers (+15% bonus payout & success on Armored Convoy Hijacks)',
};

/**
 * In-memory active session tracker for ongoing crimes.
 * Key: userId, expires in 90 seconds.
 */
export interface CrimeSession {
  userId: string;
  guildId: string;
  crimeId: string;
  scenarioIndex: number;
  stage1ChoiceId?: string;
  stage1Mod: number;
  stage1Narrative?: string;
  startedAt: number;
}

const activeSessions = new Map<string, CrimeSession>();

export function getActiveCrimeSession(userId: string): CrimeSession | undefined {
  const session = activeSessions.get(userId);
  if (!session) return undefined;
  if (Date.now() - session.startedAt > 90 * 1000) {
    activeSessions.delete(userId);
    return undefined;
  }
  return session;
}

export function startCrimeSession(
  userId: string,
  guildId: string,
  crimeId: string,
  scenarioIndex = 0,
): CrimeSession {
  const session: CrimeSession = {
    userId,
    guildId,
    crimeId,
    scenarioIndex,
    stage1Mod: 0,
    startedAt: Date.now(),
  };
  activeSessions.set(userId, session);
  return session;
}

export function updateCrimeSession(userId: string, update: Partial<CrimeSession>): void {
  const existing = getActiveCrimeSession(userId);
  if (existing) {
    activeSessions.set(userId, { ...existing, ...update });
  }
}

export function clearCrimeSession(userId: string): void {
  activeSessions.delete(userId);
}

export interface CrimeResolutionResult {
  success: boolean;
  payout: number;
  gangBonusAmount: number;
  finePaid: number;
  jailMinutes: number;
  finalSuccessRate: number;
  stage1Narrative: string;
  stage2Narrative: string;
  userGangName?: string;
  gangBonusActive: boolean;
  newWallet: number;
}

/**
 * Resolves a 2-stage crime attempt calculating gang perks, choices, and Policia response.
 */
export async function resolveCrime(
  userId: string,
  crimeId: string,
  stage1ChoiceId: string,
  stage2ChoiceId: string,
  scenarioIndex?: number,
): Promise<CrimeResolutionResult> {
  const crime = CRIME_OPERATIONS[crimeId];
  if (!crime) throw new Error(`Unknown crime operation: ${crimeId}`);

  const userGang = await getUserGang(userId);
  const gangName = userGang?.gang.name;

  // Retrieve chosen scenario
  let scenario: CrimeScenario = crime.scenarios[0];
  if (typeof scenarioIndex === 'number' && crime.scenarios[scenarioIndex]) {
    scenario = crime.scenarios[scenarioIndex];
  } else {
    // Search across scenarios to find the one containing stage1ChoiceId
    const found = crime.scenarios.find((s) => s.stage1.choices.some((c) => c.id === stage1ChoiceId));
    if (found) scenario = found;
  }

  // Find stage1Choice and stage2Choice
  let stage1Choice = scenario.stage1.choices.find((c) => c.id === stage1ChoiceId);
  if (!stage1Choice) {
    for (const sc of crime.scenarios) {
      const match = sc.stage1.choices.find((c) => c.id === stage1ChoiceId);
      if (match) {
        stage1Choice = match;
        break;
      }
    }
  }
  if (!stage1Choice) stage1Choice = scenario.stage1.choices[0];

  let stage2Choice = scenario.stage2.choices.find((c) => c.id === stage2ChoiceId);
  if (!stage2Choice) {
    for (const sc of crime.scenarios) {
      const match = sc.stage2.choices.find((c) => c.id === stage2ChoiceId);
      if (match) {
        stage2Choice = match;
        break;
      }
    }
  }
  if (!stage2Choice) stage2Choice = scenario.stage2.choices[0];

  // Base probability calculation
  let successRate = crime.baseSuccessRate + stage1Choice.successMod + stage2Choice.successMod;

  let gangBonusActive = false;
  let payoutMultiplier = 1.0;

  if (gangName) {
    successRate += 0.05;
    payoutMultiplier = 1.1;
    gangBonusActive = true;
  }

  // Clamp success rate between 10% and 95%
  const finalSuccessRate = Math.min(0.95, Math.max(0.1, successRate));
  const roll = Math.random();
  const passed = roll <= finalSuccessRate;

  clearCrimeSession(userId);

  if (passed) {
    const rawPayout = Math.floor(Math.random() * (crime.maxPayout - crime.minPayout + 1)) + crime.minPayout;
    const totalPayout = Math.floor(rawPayout * payoutMultiplier);
    const gangBonusAmount = totalPayout - rawPayout;

    const updatedEco = await addWallet(userId, totalPayout, true);

    return {
      success: true,
      payout: totalPayout,
      gangBonusAmount,
      finePaid: 0,
      jailMinutes: 0,
      finalSuccessRate: Math.round(finalSuccessRate * 100),
      stage1Narrative: stage1Choice.narrativeText,
      stage2Narrative: stage2Choice.narrativeText,
      userGangName: userGang?.gang.displayName,
      gangBonusActive,
      newWallet: updatedEco.wallet,
    };
  } else {
    const { finePaid, newWallet } = await jailUser(userId, crime.jailMinutes, crime.fine);

    return {
      success: false,
      payout: 0,
      gangBonusAmount: 0,
      finePaid,
      jailMinutes: crime.jailMinutes,
      finalSuccessRate: Math.round(finalSuccessRate * 100),
      stage1Narrative: stage1Choice.narrativeText,
      stage2Narrative: stage2Choice.narrativeText,
      userGangName: userGang?.gang.displayName,
      gangBonusActive,
      newWallet,
    };
  }
}

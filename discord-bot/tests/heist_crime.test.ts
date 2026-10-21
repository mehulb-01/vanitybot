import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HEIST_CATEGORIES,
  REQUIRED_HEIST_CREW,
  createHeistLobby,
  joinHeistLobby,
  leaveHeistLobby,
  cancelHeistLobby,
  executeHeist,
  getHeistLobby,
} from '../src/services/gangs/heistService';
import { CRIME_OPERATIONS } from '../src/services/gangs/crimeService';

const mockMembership = {
  id: 'm1',
  userId: 'user-1',
  gangId: 'g1',
  gang: {
    id: 'g1',
    name: 'omerta',
    displayName: 'Omertà',
    treasury: 10000,
  },
};

const mockEconomy = {
  userId: 'user-1',
  wallet: 1000,
  bank: 5000,
  jailUntil: null,
  crimesTotal: 5,
  crimesWon: 4,
  crimesLost: 1,
  netEarnings: 8000,
};

vi.mock('../src/database/database', () => ({
  prisma: {
    userGangMembership: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(mockMembership)),
    },
    userEconomy: {
      upsert: vi.fn().mockImplementation(() => Promise.resolve(mockEconomy)),
      update: vi.fn().mockImplementation(() => Promise.resolve(mockEconomy)),
    },
    gang: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('Heist Categories & Difficulty Ordering', () => {
  it('has 3 heist categories ordered from least difficult to most difficult', () => {
    const keys = Object.keys(HEIST_CATEGORIES);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(['transit_depot', 'diamond_exchange', 'federal_reserve']);

    const cat1 = HEIST_CATEGORIES.transit_depot;
    const cat2 = HEIST_CATEGORIES.diamond_exchange;
    const cat3 = HEIST_CATEGORIES.federal_reserve;

    // Ordered from least difficult (highest success rate) to most difficult (lowest success rate)
    expect(cat1.baseSuccessRate).toBeGreaterThan(cat2.baseSuccessRate);
    expect(cat2.baseSuccessRate).toBeGreaterThan(cat3.baseSuccessRate);

    // Rewards scale with difficulty
    expect(cat1.maxTotalLoot).toBeLessThan(cat2.maxTotalLoot);
    expect(cat2.maxTotalLoot).toBeLessThan(cat3.maxTotalLoot);
  });

  it('strictly requires 6 operatives in crew', () => {
    expect(REQUIRED_HEIST_CREW).toBe(6);
  });
});

describe('Heist Lobby Lifecycle', () => {
  it('creates, joins, leaves, and enforces 6-player limit', async () => {
    const lobby = createHeistLobby('guild-1', 'channel-1', 'host-1', 'transit_depot');
    expect(lobby.members).toEqual(['host-1']);

    // Add 5 more members to make 6
    for (let i = 2; i <= 6; i++) {
      const res = await joinHeistLobby(lobby.id, `user-${i}`);
      expect(res.success).toBe(true);
    }

    expect(lobby.members).toHaveLength(6);

    // 7th player is rejected (crew is full)
    const extra = await joinHeistLobby(lobby.id, 'user-7');
    expect(extra.success).toBe(false);
    expect(extra.message).toContain('full');

    // Duplicate join is rejected
    const dup = await joinHeistLobby(lobby.id, 'user-2');
    expect(dup.success).toBe(false);
    expect(dup.message).toContain('already signed up');

    // Leave lobby
    const leaveRes = leaveHeistLobby(lobby.id, 'user-6');
    expect(leaveRes.success).toBe(true);
    expect(lobby.members).toHaveLength(5);

    // Host cannot leave, must cancel
    const hostLeave = leaveHeistLobby(lobby.id, 'host-1');
    expect(hostLeave.success).toBe(false);
    expect(hostLeave.message).toContain('cannot leave');

    // Cancel lobby
    const cancelRes = cancelHeistLobby(lobby.id, 'host-1');
    expect(cancelRes.success).toBe(true);
    expect(getHeistLobby(lobby.id)).toBeUndefined();
  });

  it('rejects execution when crew has fewer than 6 operatives', async () => {
    const lobby = createHeistLobby('guild-1', 'channel-1', 'host-solo', 'transit_depot');
    await expect(executeHeist(lobby.id, 'host-solo')).rejects.toThrow('requires exactly 6 operatives');
  });
});

describe('Crime Operations & User Emojis', () => {
  it('has 4 operations with exact user emojis and boosted payouts', () => {
    const keys = Object.keys(CRIME_OPERATIONS);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(['street_hustle', 'convenience_raid', 'cyber_vault', 'armored_convoy']);

    expect(CRIME_OPERATIONS.street_hustle.emoji).toBe('<:11_weedbag:1551659997627285616>');
    expect(CRIME_OPERATIONS.convenience_raid.emoji).toBe('<:49_warehouse:1551660095694184458>');
    expect(CRIME_OPERATIONS.cyber_vault.emoji).toBe('<:18_hackerlaptop:1551660014228348978>');
    expect(CRIME_OPERATIONS.armored_convoy.emoji).toBe('<:41_militarytruck:1551660074408349777>');

    // Payouts are lenient and boosted
    expect(CRIME_OPERATIONS.street_hustle.maxPayout).toBeGreaterThanOrEqual(800);
    expect(CRIME_OPERATIONS.convenience_raid.maxPayout).toBeGreaterThanOrEqual(2500);
    expect(CRIME_OPERATIONS.cyber_vault.maxPayout).toBeGreaterThanOrEqual(7000);
    expect(CRIME_OPERATIONS.armored_convoy.maxPayout).toBeGreaterThanOrEqual(18000);
  });

  it('has at least 8 distinct rotating scenarios for each of the 4 crime categories', () => {
    for (const [crimeKey, op] of Object.entries(CRIME_OPERATIONS)) {
      expect(op.scenarios.length).toBeGreaterThanOrEqual(8);

      // Verify each scenario has unique title, prompt, and choices
      const scenarioIds = new Set<string>();
      for (const scenario of op.scenarios) {
        expect(scenario.title.length).toBeGreaterThan(0);
        expect(scenario.stage1.prompt.length).toBeGreaterThan(0);
        expect(scenario.stage2.prompt.length).toBeGreaterThan(0);
        expect(scenario.stage1.choices).toHaveLength(4);
        expect(scenario.stage2.choices).toHaveLength(4);

        for (const choice of [...scenario.stage1.choices, ...scenario.stage2.choices]) {
          expect(choice.id.length).toBeGreaterThan(0);
          expect(choice.label.length).toBeGreaterThan(0);
          expect(choice.narrativeText.length).toBeGreaterThan(0);
        }

        scenarioIds.add(scenario.id);
      }

      // Check all 8 scenarios in the category are unique
      expect(scenarioIds.size).toBe(op.scenarios.length);
    }
  });
});


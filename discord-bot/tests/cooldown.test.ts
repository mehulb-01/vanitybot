import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkCooldown,
  setCooldown,
  clearMemoryCooldowns,
} from '../src/services/cooldownService';

describe('Cooldown Service', () => {
  beforeEach(() => {
    clearMemoryCooldowns();
  });

  it('reports not on cooldown initially', async () => {
    const status = await checkCooldown('user-1', 'ping', 3000);
    expect(status.onCooldown).toBe(false);
    expect(status.remainingMs).toBe(0);
  });

  it('sets and checks cooldown accurately', async () => {
    await setCooldown('user-1', 'ping', 5000);
    const status = await checkCooldown('user-1', 'ping', 5000);

    expect(status.onCooldown).toBe(true);
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(status.remainingMs).toBeLessThanOrEqual(5000);
  });

  it('isolates cooldowns between different users and commands', async () => {
    await setCooldown('user-1', 'ping', 5000);

    const user2Status = await checkCooldown('user-2', 'ping', 5000);
    expect(user2Status.onCooldown).toBe(false);

    const cmd2Status = await checkCooldown('user-1', 'help', 5000);
    expect(cmd2Status.onCooldown).toBe(false);
  });

  it('handles 0ms cooldown without applying restriction', async () => {
    await setCooldown('user-1', 'ping', 0);
    const status = await checkCooldown('user-1', 'ping', 0);
    expect(status.onCooldown).toBe(false);
  });
});

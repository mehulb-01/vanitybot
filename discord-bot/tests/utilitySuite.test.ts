import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDuration,
  scheduleReminder,
  getUserReminders,
  cancelReminder,
  type Reminder,
} from '../src/services/utility/remindService';
import { setAfk, getAfk, clearAfk } from '../src/services/utility/afkService';
import serverinfoCommand from '../src/bot/commands/utility/serverinfo';
import avatarCommand from '../src/bot/commands/utility/avatar';
import bannerCommand from '../src/bot/commands/utility/banner';
import helpCommand from '../src/bot/commands/utility/help';
import pollCommand from '../src/bot/commands/utility/poll';
import remindCommand from '../src/bot/commands/utility/remind';
import afkCommand from '../src/bot/commands/utility/afk';
import { ButtonStyle } from 'discord.js';

describe('Reminder Service', () => {
  it('parses duration strings accurately', () => {
    expect(parseDuration('10s')).toBe(10_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('1d')).toBe(86_400_000);
    expect(parseDuration('1h30m')).toBe(5_400_000);
    expect(parseDuration('invalid')).toBeNull();
  });

  it('schedules, retrieves, and cancels reminders', () => {
    const mockClient: any = {
      channels: { fetch: vi.fn() },
      users: { fetch: vi.fn() },
    };

    const reminder: Reminder = {
      id: 'test-1',
      userId: 'user-100',
      channelId: 'chan-200',
      message: 'Take out the trash',
      createdAt: Date.now(),
      remindAt: Date.now() + 60_000,
    };

    scheduleReminder(mockClient, reminder);

    const active = getUserReminders('user-100');
    expect(active).toHaveLength(1);
    expect(active[0].message).toBe('Take out the trash');

    const cancelled = cancelReminder('test-1', 'user-100');
    expect(cancelled).toBe(true);
    expect(getUserReminders('user-100')).toHaveLength(0);
  });
});

describe('AFK Service', () => {
  it('sets, retrieves, and clears AFK status', async () => {
    await setAfk('guild-1', 'user-1', 'Grabbing food');

    const status = await getAfk('guild-1', 'user-1');
    expect(status).not.toBeNull();
    expect(status?.reason).toBe('Grabbing food');

    const cleared = await clearAfk('guild-1', 'user-1');
    expect(cleared?.reason).toBe('Grabbing food');

    const afterClear = await getAfk('guild-1', 'user-1');
    expect(afterClear).toBeNull();
  });
});

describe('Utility Slash Commands Metadata', () => {
  it('/serverinfo metadata and execution', async () => {
    expect(serverinfoCommand.data.name).toBe('serverinfo');
    expect(serverinfoCommand.category).toBe('utility');
    expect(serverinfoCommand.guildOnly).toBe(true);

    const mockInteraction: any = {
      guild: {
        id: '123',
        name: 'Test Server',
        ownerId: 'owner-1',
        createdTimestamp: Date.now() - 100000,
        memberCount: 50,
        members: { cache: { filter: () => ({ size: 5 }) } },
        channels: { cache: { filter: () => ({ size: 3 }), size: 6 } },
        roles: { cache: { size: 10 } },
        emojis: { cache: { size: 15 } },
        stickers: { cache: { size: 2 } },
        verificationLevel: 1,
        premiumTier: 1,
        premiumSubscriptionCount: 3,
        explicitContentFilter: 1,
        iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
        bannerURL: vi.fn().mockReturnValue(null),
        fetchOwner: vi.fn().mockResolvedValue({ user: { tag: 'Owner#0001' } }),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await serverinfoCommand.execute(mockInteraction, {} as any);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it('/avatar metadata and execution', async () => {
    expect(avatarCommand.data.name).toBe('avatar');
    expect(avatarCommand.category).toBe('utility');

    const mockInteraction: any = {
      user: {
        id: 'user-1',
        username: 'TestUser',
        displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
      },
      options: {
        getUser: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(false),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await avatarCommand.execute(mockInteraction, {} as any);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it('/banner metadata and execution', async () => {
    expect(bannerCommand.data.name).toBe('banner');
    expect(bannerCommand.category).toBe('utility');

    const mockClient: any = {
      users: {
        fetch: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'TestUser',
          bannerURL: vi.fn().mockReturnValue('https://example.com/banner.png'),
          accentColor: 0x800000,
        }),
      },
    };

    const mockInteraction: any = {
      user: { id: 'user-1', username: 'TestUser' },
      options: {
        getString: vi.fn().mockReturnValue('user'),
        getUser: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await bannerCommand.execute(mockInteraction, mockClient);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it('/help execution and category ordering', async () => {
    expect(helpCommand.data.name).toBe('help');
    expect(helpCommand.category).toBe('utility');

    const mockResponse: any = {
      createMessageComponentCollector: vi.fn().mockReturnValue({
        on: vi.fn(),
      }),
    };

    const mockInteraction: any = {
      user: { id: 'user-1' },
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn().mockResolvedValue(mockResponse),
    };

    const mockClient: any = {
      commands: new Map([
        ['serverinfo', { data: { name: 'serverinfo', description: 'Server' }, category: 'utility' }],
        ['play', { data: { name: 'play', description: 'Play music' }, category: 'music' }],
        ['heist', { data: { name: 'heist', description: 'Heist' }, category: 'gangs' }],
        ['mug', { data: { name: 'mug', description: 'Mug' }, category: 'gangs' }],
      ]),
    };

    await helpCommand.execute(mockInteraction, mockClient);
    expect(mockInteraction.reply).toHaveBeenCalled();

    const replyCall = mockInteraction.reply.mock.calls[0][0];
    const embedJson = replyCall.embeds[0].toJSON();
    const fieldNames = embedJson.fields.map((f: any) => f.name);

    // Verify ordering: Utility, Moderation, Music, Gangs
    expect(fieldNames[0]).toContain('Utils');
    expect(fieldNames[1]).toContain('Moderation');
    expect(fieldNames[2]).toContain('Music');
    expect(fieldNames[3]).toContain('Gangs');

    // Verify emojis
    expect(fieldNames[0]).toContain('1548396205585993748');
    expect(fieldNames[1]).toContain('1551660154875936867');
    expect(fieldNames[2]).toContain('1551671651672784926');
    expect(fieldNames[3]).toContain('1548658839346352148');

    // Verify select menu options
    const selectMenuJson = replyCall.components[0].toJSON().components[0];
    expect(selectMenuJson.options[0].emoji.id).toBe('1548396159016374312');
    expect(selectMenuJson.options[3].emoji.id).toBe('1551671651672784926');
  });

  it('/poll metadata and execution', async () => {
    expect(pollCommand.data.name).toBe('poll');
    expect(pollCommand.category).toBe('utility');

    const mockMessage: any = {
      react: vi.fn().mockResolvedValue(undefined),
    };

    const mockInteraction: any = {
      user: { username: 'Pollster', displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png') },
      options: {
        getString: vi.fn((name: string) => {
          if (name === 'question') return 'Cats or Dogs?';
          if (name === 'choice1') return 'Cats';
          if (name === 'choice2') return 'Dogs';
          return null;
        }),
      },
      reply: vi.fn().mockResolvedValue(mockMessage),
    };

    await pollCommand.execute(mockInteraction, {} as any);
    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(mockMessage.react).toHaveBeenCalledWith('1️⃣');
    expect(mockMessage.react).toHaveBeenCalledWith('2️⃣');
  });

  it('/afk execution', async () => {
    expect(afkCommand.data.name).toBe('afk');
    expect(afkCommand.guildOnly).toBeFalsy();

    const mockInteraction: any = {
      guild: { id: 'guild-1' },
      user: { id: 'user-1' },
      options: {
        getString: vi.fn().mockReturnValue('Sleeping'),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await afkCommand.execute(mockInteraction, {} as any);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });
});

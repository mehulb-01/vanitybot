import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import pruneCommand from '../src/bot/commands/utility/prune';

describe('/prune command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct command metadata and options', () => {
    expect(pruneCommand.data.name).toBe('prune');
    expect(pruneCommand.category).toBe('utility');
    expect(pruneCommand.guildOnly).toBe(true);
    expect(pruneCommand.requiredPermissions).toContain(PermissionFlagsBits.ManageMessages);

    const json = pruneCommand.data.toJSON();
    expect(json.options).toBeDefined();

    const amountOpt = json.options?.find((o) => o.name === 'amount');
    expect(amountOpt).toBeDefined();
    expect(amountOpt?.required).toBe(true);

    const userOpt = json.options?.find((o) => o.name === 'user');
    expect(userOpt).toBeDefined();
    expect(userOpt?.required).toBe(false);
  });

  it('should reject if used outside of a guild', async () => {
    const mockInteraction: any = {
      guild: null,
      channel: null,
      reply: vi.fn(),
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
        embeds: expect.any(Array),
      }),
    );
  });

  it('should reject if the user lacks ManageMessages permission', async () => {
    const mockInteraction: any = {
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1', bulkDelete: vi.fn() },
      memberPermissions: {
        has: vi.fn().mockReturnValue(false),
      },
      reply: vi.fn(),
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
      }),
    );
  });

  it('should reject if the channel does not support bulkDelete', async () => {
    const mockInteraction: any = {
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1' }, // no bulkDelete
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
      reply: vi.fn(),
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
      }),
    );
  });

  it('should reject if the bot lacks ManageMessages permission in channel', async () => {
    const mockInteraction: any = {
      guild: {
        id: 'guild-1',
        members: {
          me: {
            permissionsIn: vi.fn().mockReturnValue({
              has: vi.fn().mockReturnValue(false),
            }),
          },
        },
      },
      channel: { id: 'channel-1', bulkDelete: vi.fn() },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
      reply: vi.fn(),
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
      }),
    );
  });

  it('should bulk delete messages successfully without user filter', async () => {
    const bulkDeleteMock = vi.fn().mockResolvedValue(new Map([['msg-1', {}], ['msg-2', {}]]));
    const mockInteraction: any = {
      guild: {
        id: 'guild-1',
        members: {
          me: {
            permissionsIn: vi.fn().mockReturnValue({
              has: vi.fn().mockReturnValue(true),
            }),
          },
        },
      },
      channel: {
        id: 'channel-1',
        bulkDelete: bulkDeleteMock,
      },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      options: {
        getInteger: vi.fn().mockReturnValue(10),
        getUser: vi.fn().mockReturnValue(null),
      },
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(bulkDeleteMock).toHaveBeenCalledWith(10, true);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it('should filter messages by target user when user option is provided', async () => {
    const targetUserId = 'target-user-123';
    const mockMessages = new Map([
      ['msg-1', { id: 'msg-1', author: { id: targetUserId } }],
      ['msg-2', { id: 'msg-2', author: { id: 'other-user' } }],
      ['msg-3', { id: 'msg-3', author: { id: targetUserId } }],
    ]);

    const bulkDeleteMock = vi.fn().mockResolvedValue(new Map([['msg-1', {}], ['msg-3', {}]]));
    const fetchMock = vi.fn().mockResolvedValue({
      filter: vi.fn().mockImplementation((predicate) => {
        const filtered = new Map();
        for (const [k, v] of mockMessages.entries()) {
          if (predicate(v)) filtered.set(k, v);
        }
        return filtered;
      }),
    });

    const mockInteraction: any = {
      guild: {
        id: 'guild-1',
        members: {
          me: {
            permissionsIn: vi.fn().mockReturnValue({
              has: vi.fn().mockReturnValue(true),
            }),
          },
        },
      },
      channel: {
        id: 'channel-1',
        bulkDelete: bulkDeleteMock,
        messages: {
          fetch: fetchMock,
        },
      },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      options: {
        getInteger: vi.fn().mockReturnValue(5),
        getUser: vi.fn().mockReturnValue({ id: targetUserId }),
      },
    };

    await pruneCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(fetchMock).toHaveBeenCalledWith({ limit: 100 });
    expect(bulkDeleteMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'msg-1' }),
        expect.objectContaining({ id: 'msg-3' }),
      ]),
      true,
    );
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });
});

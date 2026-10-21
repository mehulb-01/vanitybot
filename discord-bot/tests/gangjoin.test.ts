import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveComponentEmoji } from '../src/utils/emoji';
import gangjoinCommand from '../src/bot/commands/gangs/gangjoin';

const mockGangs = [
  { id: 'g1', name: 'kurogane', displayName: 'Kurogane', description: 'Clan 1', emoji: '<:58_samuraimask:1551660117966196797>' },
  { id: 'g2', name: 'omerta', displayName: 'Omertà', description: 'Clan 2', emoji: '<:59_mafiaboss:1551660120591827084>' },
  { id: 'g3', name: 'calavera', displayName: 'Calavera', description: 'Clan 3', emoji: '<:60_sugarskull:1551660123213135932>' },
  { id: 'g4', name: 'longwei', displayName: 'Longwei', description: 'Clan 4', emoji: '<:61_dragon:1551660125926723715>' },
  { id: 'g5', name: 'moroz', displayName: 'Moroz', description: 'Clan 5', emoji: '<:62_snowflake:1551660128627855421>' },
  { id: 'g6', name: 'reapers', displayName: 'Reapers', description: 'Clan 6', emoji: '<:63_grimreaper:1551660130817417296>' },
];

vi.mock('../src/database/database', () => ({
  prisma: {
    gang: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
        const id = where?.id ?? where?.OR?.find((o: any) => o.id)?.id;
        const name = where?.name ?? where?.OR?.find((o: any) => o.name)?.name;
        const found = mockGangs.find((g) => (id && g.id === id) || (name && g.name === name));
        return Promise.resolve(found ?? null);
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        return Promise.resolve(mockGangs.find((g) => g.id === where.id) ?? null);
      }),
    },
    userGangMembership: {
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    serverGangSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../src/services/gangs/gangService', () => ({
  getAllGangs: vi.fn().mockImplementation(() => Promise.resolve(mockGangs)),
  getUserGang: vi.fn().mockResolvedValue(null),
  areGangsEnabled: vi.fn().mockResolvedValue(true),
  enableGangs: vi.fn().mockResolvedValue(undefined),
  disableGangs: vi.fn().mockResolvedValue(undefined),
  ensureGangChannel: vi.fn().mockResolvedValue(null),
  ensureGuildRecord: vi.fn().mockResolvedValue(undefined),
  invalidateUserGangCache: vi.fn(),
  invalidateGuildGangsCache: vi.fn(),
  OMERTA_PERMANENT_BOSS_ID: '798851339119624203',
  GANG_MOTTOS: {
    kurogane: 'Forged in iron, bound by honor.',
    omerta: 'Silence is loyalty, betrayal is death.',
    calavera: 'Fear no death, remember the fallen.',
    longwei: 'Patience of the serpent, fury of the dragon.',
    moroz: 'Winter shows no mercy, nor do we.',
    reapers: 'Swift as shadows, silent as death.',
  },
}));

describe('resolveComponentEmoji utility', () => {
  it('correctly resolves custom static emojis', () => {
    const res = resolveComponentEmoji('<:58_samuraimask:1551660117966196797>');
    expect(res).toEqual({
      name: '58_samuraimask',
      id: '1551660117966196797',
      animated: false,
    });
  });

  it('correctly resolves animated emojis', () => {
    const res = resolveComponentEmoji('<a:fire_anim:123456789012345678>');
    expect(res).toEqual({
      name: 'fire_anim',
      id: '123456789012345678',
      animated: true,
    });
  });

  it('returns raw unicode emojis untouched', () => {
    const res = resolveComponentEmoji('🔥');
    expect(res).toBe('🔥');
  });
});

describe('gangjoin command buttons and embed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates emoji-only buttons with no name labels in a 3x2 grid', async () => {
    const mockInteraction: any = {
      guildId: 'guild-123',
      guild: { id: 'guild-123' },
      user: { id: 'user-123' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await gangjoinCommand.execute(mockInteraction, {} as any);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(mockInteraction.editReply).toHaveBeenCalled();
    const replyCall = mockInteraction.editReply.mock.calls[0][0];

    // Check components
    expect(replyCall.components).toHaveLength(2); // 2 rows (3 per row)
    const row1Buttons = replyCall.components[0].components;
    const row2Buttons = replyCall.components[1].components;

    expect(row1Buttons).toHaveLength(3);
    expect(row2Buttons).toHaveLength(3);

    // Verify all 6 buttons have emoji set and NO label
    const allButtons = [...row1Buttons, ...row2Buttons];
    expect(allButtons).toHaveLength(6);

    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i].data;
      expect(btn.custom_id).toBe(`gang_join_${mockGangs[i].id}`);
      // Label must be undefined (no names on buttons)
      expect(btn.label).toBeUndefined();
      // Emoji must be properly resolved with ID and name
      expect(btn.emoji).toBeDefined();
      expect(btn.emoji.id).toBeDefined();
      expect(btn.emoji.name).toBeDefined();
    }

    // Check embed title and fields
    const embed = replyCall.embeds[0].data;
    expect(embed.title).toContain('Choose Your Gang');
    expect(embed.fields).toHaveLength(6);
  });
});

describe('Omertà Elite Gating & Petition Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prohibits direct joining of Omertà and presents interrogation embed with petition button', async () => {
    const { handleGangButton } = await import('../src/bot/events/gangInteractionHandler');
    const { prisma } = await import('../src/database/database');

    const mockInteraction: any = {
      guildId: 'guild-123',
      guild: {
        id: 'guild-123',
        members: { fetch: vi.fn() },
      },
      user: { id: 'user-123', username: 'TestUser' },
      customId: 'gang_join_g2', // Omertà
      update: vi.fn().mockResolvedValue(undefined),
    };

    await handleGangButton(mockInteraction);

    // Must NOT have created gang membership
    expect(prisma.userGangMembership.create).not.toHaveBeenCalled();

    // Must have updated with Omertà interrogation embed
    expect(mockInteraction.update).toHaveBeenCalled();
    const updateCall = mockInteraction.update.mock.calls[0][0];
    const embed = updateCall.embeds[0].data;

    expect(embed.title).toContain('The Gates of Omertà Are Sealed');
    expect(embed.description).toContain('question your worth');
    expect(embed.description).toContain('High Table of Omertà');
    expect(embed.description).toContain('petition the High Table');

    // Component button must be present
    expect(updateCall.components).toHaveLength(1);
    const buttons = updateCall.components[0].components;
    expect(buttons[0].data.custom_id).toBe('omerta_petition_open');
    expect(buttons[0].data.label).toBe('Drop Message to the High Table');
  });

  it('allows normal gangs like Kurogane to be joined directly', async () => {
    const { handleGangButton } = await import('../src/bot/events/gangInteractionHandler');
    const { prisma } = await import('../src/database/database');

    const mockInteraction: any = {
      guildId: 'guild-123',
      guild: {
        id: 'guild-123',
        members: { fetch: vi.fn().mockResolvedValue({ roles: { add: vi.fn() } }) },
      },
      user: { id: 'user-456', username: 'KuroganeRecruit' },
      customId: 'gang_join_g1', // Kurogane
      update: vi.fn().mockResolvedValue(undefined),
    };

    await handleGangButton(mockInteraction);

    expect(prisma.userGangMembership.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-456',
        gangId: 'g1',
      },
    });
    expect(mockInteraction.update).toHaveBeenCalled();
    const updateCall = mockInteraction.update.mock.calls[0][0];
    expect(updateCall.embeds[0].data.description).toContain('Welcome to the Kurogane family');
  });

  it('opens modal when Drop Message to the High Table is clicked', async () => {
    const { handleGangButton } = await import('../src/bot/events/gangInteractionHandler');

    const mockInteraction: any = {
      guildId: 'guild-123',
      guild: { id: 'guild-123' },
      customId: 'omerta_petition_open',
      showModal: vi.fn().mockResolvedValue(undefined),
    };

    await handleGangButton(mockInteraction);

    expect(mockInteraction.showModal).toHaveBeenCalled();
    const modalCall = mockInteraction.showModal.mock.calls[0][0];
    expect(modalCall.data.custom_id).toBe('omerta_petition_modal');
  });

  it('delivers direct message with review reactions to boss 798851339119624203 when petition is submitted', async () => {
    const { handleOmertaPetitionModal, OMERTA_APPROVE_EMOJI, OMERTA_DISAPPROVE_EMOJI } = await import('../src/bot/events/gangInteractionHandler');

    const mockReact = vi.fn().mockResolvedValue(undefined);
    const mockCollector = { on: vi.fn() };
    const mockSentMessage = {
      react: mockReact,
      createReactionCollector: vi.fn().mockReturnValue(mockCollector),
    };
    const mockBossSend = vi.fn().mockResolvedValue(mockSentMessage);
    const mockClient = {
      users: {
        fetch: vi.fn().mockImplementation((id: string) => {
          if (id === '798851339119624203') {
            return Promise.resolve({
              id: '798851339119624203',
              send: mockBossSend,
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    const mockModalInteraction: any = {
      client: mockClient,
      guildId: 'guild-123',
      guild: { name: 'Syndicate HQ' },
      user: {
        id: 'applicant-777',
        tag: 'Applicant#0001',
        displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
      },
      fields: {
        getTextInputValue: vi.fn().mockReturnValue('I offer my silence and complete devotion to the High Table.'),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await handleOmertaPetitionModal(mockModalInteraction);

    expect(mockModalInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(mockClient.users.fetch).toHaveBeenCalledWith('798851339119624203');
    expect(mockBossSend).toHaveBeenCalled();
    const sendCall = mockBossSend.mock.calls[0][0];
    expect(sendCall.embeds[0].data.title).toContain('New Omertà Membership Petition');
    expect(sendCall.embeds[0].data.description).toContain('I offer my silence and complete devotion');
    expect(sendCall.embeds[0].data.description).toContain('applicant-777');

    // Must have added review reactions
    expect(mockReact).toHaveBeenCalledWith(OMERTA_APPROVE_EMOJI);
    expect(mockReact).toHaveBeenCalledWith(OMERTA_DISAPPROVE_EMOJI);

    expect(mockModalInteraction.editReply).toHaveBeenCalled();
    const editCall = mockModalInteraction.editReply.mock.calls[0][0];
    expect(editCall.embeds[0].data.title).toContain('Your Words Have Reached the Shadows');
    expect(editCall.embeds[0].data.description).toContain('High Table of Omertà');
  });

  it('approves applicant when boss reacts with check emoji, inducts user and sends DM', async () => {
    const { processOmertaPetitionReaction, OMERTA_APPROVE_EMOJI_ID } = await import('../src/bot/events/gangInteractionHandler');
    const { prisma } = await import('../src/database/database');

    const mockApplicantSend = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      users: {
        fetch: vi.fn().mockImplementation((id: string) => {
          if (id === 'applicant-999') {
            return Promise.resolve({
              id: 'applicant-999',
              send: mockApplicantSend,
            });
          }
          return Promise.resolve(null);
        }),
      },
      guilds: {
        fetch: vi.fn().mockResolvedValue(null),
      },
    };

    const mockEdit = vi.fn().mockResolvedValue(undefined);
    const mockReaction: any = {
      emoji: { id: OMERTA_APPROVE_EMOJI_ID, name: '11_check_green' },
      message: {
        id: 'msg-review-1',
        embeds: [{
          title: '<:59_mafiaboss:1551660120591827084> New Omertà Membership Petition',
          description: '**Applicant:** <@applicant-999>\n**User ID:** `applicant-999`\n**Server Origin:** HQ (`guild-123`)',
          fields: [],
        }],
        edit: mockEdit,
        client: mockClient,
      },
    };

    const mockBossUser: any = {
      id: '798851339119624203',
      bot: false,
    };

    const result = await processOmertaPetitionReaction(mockReaction, mockBossUser, mockClient as any);

    expect(result.success).toBe(true);
    expect(result.action).toBe('APPROVED');
    expect(result.applicantId).toBe('applicant-999');

    // Must have updated user gang membership in database
    expect(prisma.userGangMembership.upsert).toHaveBeenCalledWith({
      where: { userId: 'applicant-999' },
      create: expect.objectContaining({ userId: 'applicant-999' }),
      update: expect.objectContaining({ joinedAt: expect.any(Date) }),
    });

    // Must have sent DM to approved applicant
    expect(mockApplicantSend).toHaveBeenCalled();
    const welcomeCall = mockApplicantSend.mock.calls[0][0];
    expect(welcomeCall.embeds[0].data.title).toContain('The High Table Has Spoken — Welcome to Omertà');

    // Must have edited boss DM to show approved status
    expect(mockEdit).toHaveBeenCalled();
    const editCall = mockEdit.mock.calls[0][0];
    expect(editCall.embeds[0].data.fields.some((f: any) => f.name.includes('Verdict') && f.value.includes('APPROVED'))).toBe(true);
  });

  it('disapproves applicant when boss reacts with uncheck emoji, and sends NO DM', async () => {
    const { processOmertaPetitionReaction, OMERTA_DISAPPROVE_EMOJI_ID } = await import('../src/bot/events/gangInteractionHandler');
    const { prisma } = await import('../src/database/database');

    const mockApplicantSend = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      users: {
        fetch: vi.fn().mockImplementation((id: string) => {
          if (id === 'applicant-888') {
            return Promise.resolve({
              id: 'applicant-888',
              send: mockApplicantSend,
            });
          }
          return Promise.resolve(null);
        }),
      },
      guilds: {
        fetch: vi.fn().mockResolvedValue(null),
      },
    };

    const mockEdit = vi.fn().mockResolvedValue(undefined);
    const mockReaction: any = {
      emoji: { id: OMERTA_DISAPPROVE_EMOJI_ID, name: 'uncheck' },
      message: {
        id: 'msg-review-2',
        embeds: [{
          title: '<:59_mafiaboss:1551660120591827084> New Omertà Membership Petition',
          description: '**Applicant:** <@applicant-888>\n**User ID:** `applicant-888`\n**Server Origin:** HQ (`guild-123`)',
          fields: [],
        }],
        edit: mockEdit,
        client: mockClient,
      },
    };

    const mockBossUser: any = {
      id: '798851339119624203',
      bot: false,
    };

    const result = await processOmertaPetitionReaction(mockReaction, mockBossUser, mockClient as any);

    expect(result.success).toBe(true);
    expect(result.action).toBe('DISAPPROVED');
    expect(result.applicantId).toBe('applicant-888');

    // Must NOT have touched gang membership
    expect(prisma.userGangMembership.upsert).not.toHaveBeenCalled();

    // Must NOT have sent any DM to applicant
    expect(mockApplicantSend).not.toHaveBeenCalled();

    // Must have edited boss DM to show disapproved status
    expect(mockEdit).toHaveBeenCalled();
    const editCall = mockEdit.mock.calls[0][0];
    expect(editCall.embeds[0].data.fields.some((f: any) => f.name.includes('Verdict') && f.value.includes('DISAPPROVED'))).toBe(true);
  });

  it('ignores reactions from non-boss users and bots', async () => {
    const { processOmertaPetitionReaction, OMERTA_APPROVE_EMOJI_ID } = await import('../src/bot/events/gangInteractionHandler');

    const mockReaction: any = {
      emoji: { id: OMERTA_APPROVE_EMOJI_ID, name: '11_check_green' },
      message: {
        embeds: [{ title: 'New Omertà Membership Petition' }],
      },
    };

    // Random non-boss user
    const randomUser: any = { id: 'random-user-123', bot: false };
    const res1 = await processOmertaPetitionReaction(mockReaction, randomUser);
    expect(res1.success).toBe(false);

    // Bot user
    const botUser: any = { id: '798851339119624203', bot: true };
    const res2 = await processOmertaPetitionReaction(mockReaction, botUser);
    expect(res2.success).toBe(false);
  });
});

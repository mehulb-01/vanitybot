import { describe, it, expect, vi } from 'vitest';
import { ButtonStyle } from 'discord.js';
import inviteCommand, { INVITE_URL, INVITE_EMOJI } from '../src/bot/commands/utility/invite';

describe('/invite command', () => {
  it('should have correct command metadata', () => {
    expect(inviteCommand.data.name).toBe('invite');
    expect(inviteCommand.category).toBe('utility');
    expect(inviteCommand.cooldownMs).toBe(3000);
    expect(INVITE_URL).toBe(
      'https://discord.com/oauth2/authorize?client_id=1547568026734559232&permissions=8&integration_type=0&scope=bot',
    );
    expect(INVITE_EMOJI).toBe('<:20_chain_broken:1548658859986522203>');
  });

  it('should reply with embed and link button containing custom emoji', async () => {
    const mockReply = vi.fn().mockResolvedValue(undefined);
    const mockInteraction: any = {
      reply: mockReply,
    };

    await inviteCommand.execute(mockInteraction, {} as any);

    expect(mockReply).toHaveBeenCalledTimes(1);
    const replyArg = mockReply.mock.calls[0][0];

    // Assert embed
    expect(replyArg.embeds).toBeDefined();
    expect(replyArg.embeds).toHaveLength(1);
    const embedData = replyArg.embeds[0].toJSON();
    expect(embedData.title).toBe('Desperate For Decent Company?');
    expect(embedData.description).toContain('Invite me to your server, since you clearly lack good company');
    expect(embedData.description).toContain(INVITE_URL);
    expect(embedData.description).toContain(INVITE_EMOJI);

    // Assert link button row
    expect(replyArg.components).toBeDefined();
    expect(replyArg.components).toHaveLength(1);
    const rowJson = replyArg.components[0].toJSON();
    expect(rowJson.components).toHaveLength(1);

    const button = rowJson.components[0];
    expect(button.style).toBe(ButtonStyle.Link);
    expect(button.url).toBe(INVITE_URL);
    expect(button.label).toBe('Invite Me');
    expect(button.emoji).toEqual({
      animated: false,
      name: '20_chain_broken',
      id: '1548658859986522203',
    });
  });
});

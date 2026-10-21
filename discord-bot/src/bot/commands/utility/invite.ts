import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';
import { resolveComponentEmoji } from '../../../utils/emoji';

export const INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1547568026734559232&permissions=8&integration_type=0&scope=bot';
export const USER_INSTALL_URL =
  'https://discord.com/oauth2/authorize?client_id=1547568026734559232&integration_type=1&scope=applications.commands';
export const INVITE_EMOJI = '<:20_chain_broken:1548658859986522203>';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Invite me to your server, since you clearly lack good company.'),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction) => {
    const inviteButton = new ButtonBuilder()
      .setLabel('Invite Me')
      .setStyle(ButtonStyle.Link)
      .setURL(INVITE_URL)
      .setEmoji(resolveComponentEmoji(INVITE_EMOJI));

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(inviteButton);

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle('Desperate For Decent Company?')
      .setDescription(
        `Invite me to your server, since you clearly lack good company. You can also install me as a personal app to access my commands anywhere.\n\n` +
          `${INVITE_EMOJI} [Add to Server (Guild)](${INVITE_URL})\n` +
          `<:06_globe_cursor:1548396159016374312> [Install to Account (Personal App)](${USER_INSTALL_URL})`,
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};

export default command;

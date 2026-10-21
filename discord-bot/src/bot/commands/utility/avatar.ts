import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Inspect a user's avatar in high resolution.")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user whose avatar you want to inspect').setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('server')
        .setDescription('Show their server-specific avatar instead of global avatar')
        .setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction) => {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const preferServer = interaction.options.getBoolean('server') ?? false;

    let avatarUrl: string | null = null;
    let title = `${targetUser.username}'s Avatar`;

    if (preferServer && interaction.guild) {
      const member = interaction.guild.members.cache.get(targetUser.id);
      if (member && member.avatar) {
        avatarUrl = member.displayAvatarURL({ size: 1024, extension: 'png' });
        title = `${targetUser.username}'s Server Avatar`;
      }
    }

    if (!avatarUrl) {
      avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(title)
      .setImage(avatarUrl)
      .setFooter({ text: `Requested by ${interaction.user.username} • Admiring the pixels?` })
      .setTimestamp();

    const linkButton = new ButtonBuilder()
      .setLabel('Open in Browser')
      .setStyle(ButtonStyle.Link)
      .setURL(avatarUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};

export default command;

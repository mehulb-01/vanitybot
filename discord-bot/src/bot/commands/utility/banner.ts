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
    .setName('banner')
    .setDescription("Inspect a user's profile banner or this server's banner.")
    .addStringOption((opt) =>
      opt
        .setName('target')
        .setDescription('Target to inspect')
        .setRequired(false)
        .addChoices(
          { name: 'User', value: 'user' },
          { name: 'Server', value: 'server' },
        ),
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user whose banner you want to inspect').setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    const targetType = interaction.options.getString('target') ?? 'user';

    if (targetType === 'server') {
      if (!interaction.guild) {
        await interaction.reply({ content: '<:10_warning_triangle:1548395769562665174> Server banners only exist in servers, obviously.', ephemeral: true });
        return;
      }

      const bannerUrl = interaction.guild.bannerURL({ size: 1024, extension: 'png' });
      if (!bannerUrl) {
        await interaction.reply({
          content: '<:10_warning_triangle:1548395769562665174> This server has no banner. Either unboosted or lacking aesthetic ambition.',
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`${interaction.guild.name}'s Banner`)
        .setImage(bannerUrl)
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setLabel('Open in Browser')
        .setStyle(ButtonStyle.Link)
        .setURL(bannerUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    // Target is user
    const userOption = interaction.options.getUser('user') ?? interaction.user;

    // Must fetch user to retrieve banner asset
    let fetchedUser;
    try {
      fetchedUser = await client.users.fetch(userOption.id, { force: true });
    } catch {
      fetchedUser = userOption;
    }

    const bannerUrl = fetchedUser.bannerURL({ size: 1024, extension: 'png' });
    if (!bannerUrl) {
      await interaction.reply({
        content: `<:10_warning_triangle:1548395769562665174> **${fetchedUser.username}** does not have a banner. Either too broke for Nitro or couldn't decide on a picture.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(fetchedUser.accentColor ?? Colors.INFO)
      .setTitle(`${fetchedUser.username}'s Banner`)
      .setImage(bannerUrl)
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setLabel('Open in Browser')
      .setStyle(ButtonStyle.Link)
      .setURL(bannerUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

export default command;

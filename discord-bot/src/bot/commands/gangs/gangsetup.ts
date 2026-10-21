import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
import type { Command } from '../../../types/command';
import { getAllGangs, areGangsEnabled, getOrFindGangChannel } from '../../../services/gangs/gangService';
import { createInfoEmbed } from '../../../utils/embeds';
import { renderGangOverviewView } from '../../events/gangInteractionHandler';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gangsetup')
    .setDescription('Set up gangs on this server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'gangs',
  cooldownMs: 5000,
  execute: async (interaction) => {
    if (!interaction.guildId || !interaction.guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [isEnabled, allGangs] = await Promise.all([
      areGangsEnabled(interaction.guildId),
      getAllGangs(),
    ]);

    // Check if channel already exists, but do NOT create one yet if gangs are not enabled!
    // The channel is only created when the admin clicks the "Enable Gangs" button.
    const gangChannel = await getOrFindGangChannel(interaction.guild);

    const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
    const hasPerms = botMember?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false;

    let channelDisplay = '`#gangs` (Will be created automatically when enabled)';
    if (gangChannel) {
      channelDisplay = `<#${gangChannel.id}>`;
    } else if (isEnabled) {
      channelDisplay = hasPerms
        ? '`#gangs` (Channel creation failed - check channel limits)'
        : '<:10_warning_triangle:1548395769562665174> `#gangs` (Grant bot `Manage Channels` permission or create a `#gangs` channel manually)';
    } else if (!hasPerms) {
      channelDisplay = '<:10_warning_triangle:1548395769562665174> `#gangs` (Grant bot `Manage Channels` permission so it can create the channel upon enabling)';
    }

    if (isEnabled) {
      const view = await renderGangOverviewView(interaction.guild);
      await interaction.editReply({ embeds: [view.embed], components: view.components });
    } else {
      // Show setup menu
      const embed = createInfoEmbed(
        'Enable gangs on this server and configure gang roles.',
        '🎩 Gang Setup',
      ).addFields([
        { name: 'Available Gangs', value: allGangs.map(g => `${g.emoji} ${g.displayName}`).join('\n'), inline: false },
        { name: '📢 Syndicate Dispatch Channel', value: channelDisplay, inline: false },
        { name: 'What this does', value: 'Once enabled, users can join gangs using `/gangjoin` and will receive corresponding roles. The Syndicate election verdicts are published to the dispatch channel.', inline: false },
      ]);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('gang_enable')
          .setLabel('Enable Gangs')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};

export default command;


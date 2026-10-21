import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { Command } from '../../../types/command';
import {
  getUserGang,
  getGangNominees,
  castBossVote,
  getCurrentTermMonth,
  getCurrentBoss,
} from '../../../services/gangs/gangService';
import { createErrorEmbed, createSuccessEmbed, createWarningEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('bossvote')
    .setDescription('Vote for your gang Boss among the top 5 monthly nominees.')
    .addUserOption((opt) =>
      opt
        .setName('candidate')
        .setDescription('Nominated gang member to vote for')
        .setRequired(false),
    ),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    const membership = await getUserGang(interaction.user.id);
    if (!membership) {
      await interaction.reply({
        embeds: [
          createWarningEmbed(
            'You must belong to a gang to vote in the monthly Boss election. Use `/gangjoin` to join a gang.',
            'No Gang Allegiance',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (membership.gang.name.toLowerCase() === 'omerta') {
      await interaction.reply({
        embeds: [
          createWarningEmbed(
            'Omertà does not hold democratic elections. The Don (<@798851339119624203>) commands total allegiance by sovereign decree.',
            'Sovereign Decreed',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentMonth = getCurrentTermMonth();
    const nominees = await getGangNominees(membership.gangId, currentMonth);

    // Check if voter is among the nominated top 5:
    const isNominated = nominees.some((n) => n.userId === interaction.user.id);
    if (isNominated) {
      await interaction.reply({
        content: "You have been nominated for voting this month, don't act smart.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (nominees.length === 0) {
      await interaction.reply({
        embeds: [
          createWarningEmbed(
            'There are currently no active rank holders nominated for this election cycle.',
            'No Nominees Available',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = interaction.options.getUser('candidate');

    if (targetUser) {
      const result = await castBossVote(interaction.user.id, targetUser.id);
      if (!result.success) {
        if (result.reason === 'NOMINATED') {
          await interaction.reply({
            content: "You have been nominated for voting this month, don't act smart.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          embeds: [createErrorEmbed(result.message, 'Ballot Rejected')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [createSuccessEmbed(result.message, '🗳️ Ballot Accepted')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show ballot embed with top 5 nominees and dropdown menu
    const gang = membership.gang;
    const currentBoss = await getCurrentBoss(membership.gangId);
    const currentBossText = currentBoss ? `<@${currentBoss.userId}>` : '*Vacant*';

    const nomineeLines = nominees
      .map(
        (n, i) =>
          `**#${i + 1}** <@${n.userId}>\n` +
          `> ${n.rankEmoji} **${n.rankRoman}: ${n.rankTitle}** • <:17_rose_red:1548395572468392026> \`${formatNumber(n.loyaltyScore)} pts\` • 🗳️ \`${n.votesReceived} vote${n.votesReceived === 1 ? '' : 's'}\``,
      )
      .join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle(`🗳️ ${gang.emoji} ${gang.displayName} — Monthly Boss Election`)
      .setDescription(
        `Every month, the top 5 global rank holders by Loyalty from **${gang.displayName}** are nominated to lead the faction.\n\n` +
          `> 👑 **Incumbent Boss:** ${currentBossText}\n` +
          `> 📅 **Election Cycle:** \`${currentMonth}\`\n\n` +
          `### 📋 Official Nominees:\n${nomineeLines}\n\n` +
          `*Cast your ballot using the select menu below or \`/bossvote candidate:@user\`.*`,
      )
      .setFooter({ text: 'The Syndicate enforces honest elections. Ballots are final.' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('gang_bossvote_select')
      .setPlaceholder('Select a candidate to cast your vote...')
      .setMinValues(1)
      .setMaxValues(1);

    for (let i = 0; i < nominees.length; i++) {
      const n = nominees[i];
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`Candidate #${i + 1} (${n.rankTitle})`)
          .setValue(n.userId)
          .setDescription(`${n.rankRoman} • ${formatNumber(n.loyaltyScore)} pts • ${n.votesReceived} votes`),
      );
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;

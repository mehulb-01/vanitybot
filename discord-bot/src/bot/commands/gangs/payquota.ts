import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { payGangQuota, getUserGang } from '../../../services/gangs/gangService';
import { createErrorEmbed, createWarningEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('payquota')
    .setDescription('Contribute daily quota to your gang Treasury (max 20,000/day). Earns loyalty score.')
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount to deposit ($1 - $20,000)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20000),
    ),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const amount = interaction.options.getInteger('amount', true);

    const membership = await getUserGang(interaction.user.id);
    if (!membership) {
      await interaction.editReply({
        embeds: [
          createWarningEmbed(
            'You are not a member of any gang! Join a gang first with `/gangjoin` before contributing quota.',
            'No Gang Allegiance',
          ),
        ],
      });
      return;
    }

    const result = await payGangQuota(interaction.user.id, amount);

    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.message, 'Quota Deposit Failed')],
      });
      return;
    }

    const gang = membership.gang;
    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle(`<:04_moneybag:1551659970083430612> Quota Tribute Received — ${gang.displayName}`)
      .setDescription(
        `Thank you for honoring your obligation to the family, <@${interaction.user.id}>.\n` +
          `Your contribution has been secured in the **${gang.displayName}** Treasury.\n\n` +
          `> <:05_goldcoins:1551659972473913485> **Amount Deposited:** \`$${formatNumber(result.amountPaid)}\`\n` +
          `> <:17_rose_red:1548395572468392026> **Loyalty Points Earned:** \`+${formatNumber(result.loyaltyPointsEarned)} pts\` (strengthens your rank)\n` +
          `> <:54_bank:1551660106582859927> **Gang Treasury Vault:** \`$${formatNumber(result.newTreasury)}\``,
      )
      .addFields(
        {
          name: '<:07_refresh_sync:1548658829355655289> Daily Quota Progress',
          value:
            `• **Deposited Today:** \`$${formatNumber(result.depositedToday)} / $20,000\`\n` +
            `• **Remaining Quota Today:** \`$${formatNumber(result.remainingQuota)}\``,
          inline: false,
        },
      )
      .setFooter({ text: 'Daily quotas reset at 00:00 UTC. The gang protects its faithful.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

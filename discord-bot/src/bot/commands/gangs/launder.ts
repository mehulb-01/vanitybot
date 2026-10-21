import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { playLaunder } from '../../../services/gangs/gangGamesService';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('launder')
    .setDescription('Launder dirty cash through offshore shell companies with asset-freeze risk and a Cayman Jackpot.')
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount of dirty cash to wash through offshore accounts (minimum $200).')
        .setRequired(true)
        .setMinValue(200),
    ),
  category: 'gangs',
  cooldownMs: 5000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const wager = interaction.options.getInteger('amount', true);

    const result = await playLaunder(interaction.user.id, wager);

    const embed = new EmbedBuilder()
      .setColor(result.isWin ? Colors.SUCCESS : Colors.ERROR)
      .setTitle(result.title)
      .setDescription(
        `${result.narrative}\n\n` +
        `> <:01_cashstack:1551659962839732416> **Deposited:** \`$${formatNumber(result.wager)}\`\n` +
        `> :08_briefcasecrown: **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
      )
      .setFooter({
        text: 'Offshore Money Laundering • High Risk Currency Sink',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

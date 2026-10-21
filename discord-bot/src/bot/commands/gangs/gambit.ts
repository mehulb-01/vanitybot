import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { playGambit } from '../../../services/gangs/gangGamesService';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gambit')
    .setDescription("Fund a high-stakes smuggler's convoy with high seizure risk and a Ghost Lucky Multiplier.")
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount of capital to invest into the smuggling run (minimum $250).')
        .setRequired(true)
        .setMinValue(250),
    ),
  category: 'gangs',
  cooldownMs: 5000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const wager = interaction.options.getInteger('amount', true);

    const result = await playGambit(interaction.user.id, wager);

    const embed = new EmbedBuilder()
      .setColor(result.isWin ? Colors.SUCCESS : Colors.ERROR)
      .setTitle(result.title)
      .setDescription(
        `${result.narrative}\n\n` +
          `> <:01_cashstack:1551659962839732416> **Invested:** \`$${formatNumber(result.wager)}\`\n` +
          `> <:08_briefcasecrown:1551659990681387058> **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
      )
      .setFooter({
        text: "The Smuggler's Heist Gambit • High Volatility Run",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

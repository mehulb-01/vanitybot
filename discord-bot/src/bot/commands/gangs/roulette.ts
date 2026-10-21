import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { playRoulette } from '../../../services/gangs/gangGamesService';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Play underground Russian Roulette with high stakes and a rare Lucky Multiplier.')
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount of cash to wager on the 6-chamber cylinder (minimum $100).')
        .setRequired(true)
        .setMinValue(100),
    ),
  category: 'gangs',
  cooldownMs: 5000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const wager = interaction.options.getInteger('amount', true);

    const result = await playRoulette(interaction.user.id, wager);

    const embed = new EmbedBuilder()
      .setColor(result.isWin ? Colors.SUCCESS : Colors.ERROR)
      .setTitle(result.title)
      .setDescription(
        `${result.narrative}\n\n` +
        `> <:01_cashstack:1551659962839732416> **Wager:** \`$${formatNumber(result.wager)}\`\n` +
        `> :08_briefcasecrown: **Wallet Balance:** \`$${formatNumber(result.newWallet)}\``,
      )
      .setFooter({
        text: 'Underground Russian Roulette • High Risk Money Sink',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

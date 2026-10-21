import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { withdrawFromBank, getUserEconomy } from '../../../services/economy/economyService';
import {
  getUserGang,
  calculateLoyalty,
  getCurrentBoss,
  getRankFromLoyalty,
} from '../../../services/gangs/gangService';
import { createSuccessEmbed, createErrorEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw funds from your bank vault into your liquid wallet.')
    .addStringOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount to withdraw, or "all"')
        .setRequired(true),
    ),
  category: 'gangs',
  cooldownMs: 2000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const rawAmount = interaction.options.getString('amount', true).trim().toLowerCase();

    // Concurrently fetch user economy and gang membership
    const [economy, membership] = await Promise.all([
      getUserEconomy(interaction.user.id),
      getUserGang(interaction.user.id),
    ]);

    // Compute dynamic rank bank capacity
    let bankCapacity = 1_000_000;
    if (membership) {
      const loyalty = calculateLoyalty(
        membership.joinedAt,
        economy.crimesWon,
        economy.bountiesPaid,
        0,
        membership.quotaContributed,
      );
      const currentBoss = await getCurrentBoss(membership.gangId);
      const isBoss = currentBoss?.userId === interaction.user.id;
      const rank = getRankFromLoyalty(loyalty.score, isBoss);
      bankCapacity = rank.bankCapacity;
    }

    let amount: number;
    if (rawAmount === 'all' || rawAmount === 'max') {
      amount = economy.bank;
    } else {
      amount = parseInt(rawAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        await interaction.editReply({
          embeds: [createErrorEmbed('Please provide a valid positive number or "all".')],
        });
        return;
      }
    }

    const result = await withdrawFromBank(interaction.user.id, amount);
    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.message)],
      });
      return;
    }

    const newWallet = economy.wallet + result.withdrawn;
    const newBank = economy.bank - result.withdrawn;
    const embed = createSuccessEmbed(
      `<:04_moneybag:1551659970083430612> ${result.message}\n\n` +
        `<:05_goldcoins:1551659972473913485> **Wallet:** \`$${formatNumber(newWallet)}\`\n` +
        `<:54_bank:1551660106582859927> **Bank Vault:** \`$${formatNumber(newBank)} / $${formatNumber(bankCapacity)}\``,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

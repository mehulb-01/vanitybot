import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { clockIn } from '../../../services/economy/economyService';
import { createSuccessEmbed, createWarningEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Claim your daily login bonus ($5,000 every 24h).'),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();

    const result = await clockIn(interaction.user.id);

    if (!result.success) {
      const nextTimeUnix = Math.floor((result.nextAvailableAt?.getTime() ?? Date.now()) / 1000);
      const embed = createWarningEmbed(
        `You have already clocked in for your syndicate shift today.\n\n` +
          `<:07_refresh_sync:1548658829355655289> **Next Shift Available:** <t:${nextTimeUnix}:R> (<t:${nextTimeUnix}:f>)\n\n` +
          `*Take a break operative, the streets will still be here.*`,
        'Shift Cooldown',
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const nextTimeUnix = Math.floor((result.nextAvailableAt?.getTime() ?? Date.now()) / 1000);
    const embed = createSuccessEmbed(
      `You reported for duty and collected your daily syndicate shift bonus!\n\n` +
        `<:04_moneybag:1551659970083430612> **Daily Bonus:** \`+$5,000\`\n` +
        `<:05_goldcoins:1551659972473913485> **Liquid Wallet:** \`$${formatNumber(result.newWallet)}\`\n` +
        `<:07_refresh_sync:1548658829355655289> **Next Shift Available:** <t:${nextTimeUnix}:R>\n\n` +
        `*Stay dangerous and keep your head on a swivel.*`,
      'Shift Logged — Daily Bonus Collected',
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

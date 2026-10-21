import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { mugUser } from '../../../services/economy/economyService';
import { createSuccessEmbed, createErrorEmbed, createWarningEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('mug')
    .setDescription('Rob a random amount of money from an unsuspecting user (up to $2,500).')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('The user to mug')
        .setRequired(true),
    ),
  category: 'gangs',
  cooldownMs: 8000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user', true);

    const result = await mugUser(interaction.user.id, targetUser.id, targetUser.bot);

    if (!result.success) {
      if (result.reason === 'TARGET_COOLDOWN') {
        const nextTimeUnix = Math.floor((result.nextAvailableAt?.getTime() ?? Date.now()) / 1000);
        const embed = createWarningEmbed(
          `Hold on! <@${targetUser.id}> was recently mugged and has their guard up on high alert.\n\n` +
            `<:07_refresh_sync:1548658829355655289> **Can be targeted again:** <t:${nextTimeUnix}:R> (<t:${nextTimeUnix}:t>)\n\n` +
            `*Target another mark on the streets or wait for them to let their guard down.*`,
          'Target On High Alert',
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await interaction.editReply({
        embeds: [createErrorEmbed(result.message)],
      });
      return;
    }

    const nextTimeUnix = Math.floor((result.nextAvailableAt?.getTime() ?? Date.now()) / 1000);

    if (result.reason === 'EMPTY_POCKETS') {
      const embed = createWarningEmbed(
        `You ambushed <@${targetUser.id}> in a dark alley, but their pockets were completely empty!\n\n` +
          `<:04_moneybag:1551659970083430612> **Cash Stolen:** \`$0\`\n` +
          `<:07_refresh_sync:1548658829355655289> **Victim Cooldown:** <t:${nextTimeUnix}:R> (immune for 25 mins)\n\n` +
          `*They didn't have a dime on them. Better luck next time.*`,
        'Empty Pockets',
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = createSuccessEmbed(
      `You ambushed <@${targetUser.id}> and caught them off guard!\n\n` +
        `<:04_moneybag:1551659970083430612> **Cash Stolen:** \`+$${formatNumber(result.stolenAmount)}\`\n` +
        `<:05_goldcoins:1551659972473913485> **Your Wallet:** \`$${formatNumber(result.robberNewWallet)}\`\n` +
        `<:07_refresh_sync:1548658829355655289> **Victim Cooldown:** <t:${nextTimeUnix}:R> (immune for 25 mins)\n\n` +
        `*A clean mugging on the streets. Watch your back before someone comes for retribution.*`,
      'Street Mugging Executed',
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

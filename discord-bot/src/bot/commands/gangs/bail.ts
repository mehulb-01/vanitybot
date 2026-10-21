import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { checkJailStatus, payBail } from '../../../services/economy/economyService';
import { createSuccessEmbed, createErrorEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('bail')
    .setDescription('Pay off Policia bail bond to spring yourself ($150k+ liquid wallet required) or a comrade.')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Jailed gang member to bail out (defaults to yourself)')
        .setRequired(false),
    ),
  category: 'gangs',
  cooldownMs: 5000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    const jailStatus = await checkJailStatus(targetUser.id);
    if (!jailStatus.isJailed) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            isSelf
              ? "You aren't in jail. Enjoy your freedom while it lasts."
              : `<@${targetUser.id}> is not in Policia detention. Save your cash.`,
          ),
        ],
      });
      return;
    }

    // Bail calculation: $10 per remaining second (min $250, max $3000)
    const bailCost = Math.min(3000, Math.max(250, jailStatus.remainingSeconds * 10));

    const result = await payBail(interaction.user.id, targetUser.id, bailCost);
    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.message, isSelf ? 'Self-Bail Denied' : 'Bail Payment Failed')],
      });
      return;
    }

    const timeSaved = `${Math.floor(jailStatus.remainingSeconds / 60)}m ${jailStatus.remainingSeconds % 60}s.`;

    const description = isSelf
      ? `<:19_contractdocument:1551660016514240532> You've bailed yourself out. Time saved: ${timeSaved}`
      : `<:19_contractdocument:1551660016514240532> Bail of $${formatNumber(bailCost)} paid! Policia has released <@${targetUser.id}> from the holding cell.\nCost: $${formatNumber(bailCost)} paid by <@${interaction.user.id}>.\nTime saved: ${timeSaved}`;

    const embed = createSuccessEmbed(description);

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

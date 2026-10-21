import { ButtonInteraction, MessageFlags } from 'discord.js';
import {
  makeMove,
  joinTicTacToeGame,
  startVsVanity,
  cancelTicTacToeGame,
  buildTicTacToeView,
} from '../../services/utility/tictactoeService';
import { createErrorEmbed } from '../../utils/embeds';
import { childLogger } from '../../utils/logger';

const log = childLogger('tictactoeHandler');

export async function handleTicTacToeButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  // ttt:<action>:<gameId>:[cellIndex]
  const action = parts[1];
  const gameId = parts[2];

  try {
    if (action === 'join') {
      const result = joinTicTacToeGame(gameId, {
        id: interaction.user.id,
        username: interaction.user.username,
      });

      if (!result.success) {
        await interaction.reply({
          embeds: [createErrorEmbed(result.error ?? 'Failed to join match.', 'Join Failed')],
          flags: MessageFlags.Ephemeral,
        }).catch(() => undefined);
        return;
      }

      const view = buildTicTacToeView(result.game!);
      await interaction.update({
        embeds: [view.embed],
        components: view.components,
      });
      return;
    }

    if (action === 'vanity') {
      const result = startVsVanity(gameId, interaction.user.id);

      if (!result.success) {
        await interaction.reply({
          embeds: [createErrorEmbed(result.error ?? 'Failed to start match vs Vanity.', 'Action Failed')],
          flags: MessageFlags.Ephemeral,
        }).catch(() => undefined);
        return;
      }

      const view = buildTicTacToeView(result.game!);
      await interaction.update({
        embeds: [view.embed],
        components: view.components,
      });
      return;
    }

    if (action === 'cancel') {
      const result = cancelTicTacToeGame(gameId, interaction.user.id);

      if (!result.success) {
        await interaction.reply({
          embeds: [createErrorEmbed(result.error ?? 'Failed to cancel match.', 'Action Failed')],
          flags: MessageFlags.Ephemeral,
        }).catch(() => undefined);
        return;
      }

      const view = buildTicTacToeView(result.game!);
      await interaction.update({
        embeds: [view.embed],
        components: view.components,
      });
      return;
    }

    if (action === 'move') {
      const cellIndex = parseInt(parts[3], 10);
      if (isNaN(cellIndex)) return;

      const result = makeMove(gameId, cellIndex, interaction.user.id);

      if (!result.success) {
        await interaction.reply({
          embeds: [createErrorEmbed(result.error ?? 'Invalid move.', 'Invalid Move')],
          flags: MessageFlags.Ephemeral,
        }).catch(() => undefined);
        return;
      }

      const view = buildTicTacToeView(result.game!);
      await interaction.update({
        embeds: [view.embed],
        components: view.components,
      });
      return;
    }
  } catch (err) {
    log.error({ err, gameId, action, user: interaction.user.id }, 'Error processing TicTacToe button');
  }
}

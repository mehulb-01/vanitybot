import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import {
  createTicTacToeGame,
  buildTicTacToeView,
} from '../../../services/utility/tictactoeService';
import { createErrorEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Play Tic-Tac-Toe (vs Vanity or vs another player who joins in).')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Choose mode: Play vs Vanity or wait for a player to join')
        .setRequired(false)
        .addChoices(
          { name: 'Play vs Vanity', value: 'vanity' },
          { name: 'Open Match (Wait for player to join)', value: 'open' },
        ),
    )
    .addUserOption((opt) =>
      opt
        .setName('opponent')
        .setDescription('Optional: Challenge a specific player directly')
        .setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const opponent = interaction.options.getUser('opponent');
    const selectedMode = interaction.options.getString('mode');

    if (opponent && opponent.id === interaction.user.id) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            'You cannot play against yourself! Choose another player or play vs Vanity.',
            'Invalid Opponent',
          ),
        ],
      });
      return;
    }

    if (opponent && opponent.bot) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            'You cannot challenge other Discord bots. Play against Vanity or invite a human player.',
            'Invalid Opponent',
          ),
        ],
      });
      return;
    }

    let mode: 'vanity' | 'open' | 'player' = 'open';
    if (opponent) {
      mode = 'player';
    } else if (selectedMode === 'vanity') {
      mode = 'vanity';
    } else {
      mode = 'open';
    }

    const game = createTicTacToeGame(
      { id: interaction.user.id, username: interaction.user.username },
      mode,
      opponent ? { id: opponent.id, username: opponent.username } : undefined,
    );

    const view = buildTicTacToeView(game);

    await interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  },
};

export default command;

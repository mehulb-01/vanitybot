import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { requirePlayer } from '../../../services/music/playerService';
import { runMusicCommand } from '../../../services/music/commandHelpers';
import { createQueueEmbed } from '../../../services/music/musicEmbeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue.')
    .addIntegerOption((opt) => opt.setName('page').setDescription('Page number').setMinValue(1)),
  category: 'music',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      const page = interaction.options.getInteger('page') ?? 1;
      await interaction.reply({ embeds: [createQueueEmbed(player, page)] });
    });
  },
};

export default command;

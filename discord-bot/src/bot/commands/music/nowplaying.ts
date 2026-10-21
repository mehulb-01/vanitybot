import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { requirePlayer } from '../../../services/music/playerService';
import { runMusicCommand } from '../../../services/music/commandHelpers';
import { createMusicPanelButtons, createNowPlayingEmbed } from '../../../services/music/musicEmbeds';
import { MusicServiceError } from '../../../services/music/playerService';

const command: Command = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show what is currently playing.'),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      if (!player.queue.current) {
        throw new MusicServiceError('Nothing in the queue. Stunning. A music bot with no music.');
      }
      await interaction.reply({
        embeds: [createNowPlayingEmbed(player, player.queue.current)],
        components: [createMusicPanelButtons(player)],
      });
    });
  },
};

export default command;

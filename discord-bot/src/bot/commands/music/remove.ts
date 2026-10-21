import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, removeTrack, requirePlayer } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue by position.')
    .addIntegerOption((opt) =>
      opt.setName('position').setDescription('Queue position (see /queue)').setRequired(true).setMinValue(1),
    ),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const position = interaction.options.getInteger('position', true);
      const title = player.queue.tracks[position - 1]?.info.title ?? 'that track';
      await removeTrack(player, position);
      await interaction.reply({ embeds: [createSuccessEmbed(`Removed **${title}** from the queue.`)] });
    });
  },
};

export default command;

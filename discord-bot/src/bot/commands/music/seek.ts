import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, requirePlayer, seek } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';
import { MusicServiceError } from '../../../services/music/playerService';

function parseTimestamp(input: string): number {
  const parts = input.split(':').map(Number);
  if (parts.some(Number.isNaN)) throw new MusicServiceError('Use a format like `1:30` or `90` (seconds).');
  if (parts.length === 1) return parts[0] * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  throw new MusicServiceError('Use a format like `1:30` or `90` (seconds).');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track.')
    .addStringOption((opt) =>
      opt.setName('position').setDescription('Timestamp, e.g. 1:30 or 90').setRequired(true),
    ),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const positionMs = parseTimestamp(interaction.options.getString('position', true));
      await seek(player, positionMs);
      await interaction.reply({ embeds: [createSuccessEmbed('Jumped. Try to keep up.')] });
    });
  },
};

export default command;

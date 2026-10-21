import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, pause, requirePlayer } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track.'),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      await pause(player);
      await interaction.reply({ embeds: [createSuccessEmbed('Paused. The silence was requested.')] });
    });
  },
};

export default command;

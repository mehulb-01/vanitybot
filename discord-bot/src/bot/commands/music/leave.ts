import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, leaveVoice, requirePlayer } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Disconnect from voice and clear the queue.'),
  category: 'music',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      await leaveVoice(player);
      await interaction.reply({ embeds: [createSuccessEmbed("Left. Don't get used to the peace and quiet.")] });
    });
  },
};

export default command;

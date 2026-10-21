import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, requirePlayer, shuffleQueue } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue.'),
  category: 'music',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      shuffleQueue(player);
      await interaction.reply({ embeds: [createSuccessEmbed('Shuffled. Chaos, but organized.')] });
    });
  },
};

export default command;

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, moveTrack, requirePlayer } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different position in the queue.')
    .addIntegerOption((opt) => opt.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('to').setDescription('Target position').setRequired(true).setMinValue(1)),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const from = interaction.options.getInteger('from', true);
      const to = interaction.options.getInteger('to', true);
      await moveTrack(player, from, to);
      await interaction.reply({ embeds: [createSuccessEmbed(`Moved track #${from} to #${to}.`)] });
    });
  },
};

export default command;

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { getOrCreatePlayer } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';
import { MusicServiceError } from '../../../services/music/playerService';

const command: Command = {
  data: new SlashCommandBuilder().setName('join').setDescription('Bring the bot into your voice channel.'),
  category: 'music',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    if (!interaction.guildId || !interaction.guild) return;
    await runMusicCommand(interaction, async () => {
      const voiceChannelId = getMemberVoiceChannelId(interaction);
      if (!voiceChannelId) {
        throw new MusicServiceError('Join a voice channel first. I only take requests in person.');
      }
      await interaction.deferReply();
      await getOrCreatePlayer(client, {
        guildId: interaction.guildId!,
        guildName: interaction.guild!.name,
        voiceChannelId,
        textChannelId: interaction.channelId,
      });
      await interaction.editReply({ embeds: [createSuccessEmbed(`Joined <#${voiceChannelId}>. This better be worth it.`)] });
    });
  },
};

export default command;

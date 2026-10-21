import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { getOrCreatePlayer, searchAndQueue, type SearchSourceOption } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue.')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Song name or URL (YouTube, SoundCloud, Spotify link)').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('source')
        .setDescription('Where to search if not passing a direct URL')
        .setRequired(false)
        .addChoices(
          { name: 'Auto (YouTube Music → YouTube → SoundCloud)', value: 'auto' },
          { name: 'YouTube Music', value: 'youtube' },
          { name: 'Spotify', value: 'spotify' },
          { name: 'SoundCloud', value: 'soundcloud' },
        ),
    ),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId || !interaction.guild) return;

    await interaction.deferReply();

    await runMusicCommand(interaction, async () => {
      const voiceChannelId = getMemberVoiceChannelId(interaction);
      if (!voiceChannelId) {
        await interaction.editReply("You expect me to perform in the void? Join a voice channel first.");
        return;
      }

      const player = await getOrCreatePlayer(client, {
        guildId: interaction.guildId!,
        guildName: interaction.guild!.name,
        voiceChannelId,
        textChannelId: interaction.channelId,
      });

      const query = interaction.options.getString('query', true);
      const source = (interaction.options.getString('source') as SearchSourceOption | null) ?? 'auto';
      const { result, queuedCount } = await searchAndQueue(player, query, interaction.user.id, source);

      const description =
        result.loadType === 'playlist'
          ? `Queued **${queuedCount}** tracks from playlist **${result.playlist?.title ?? 'Unknown'}**.`
          : `Queued **${result.tracks[0].info.title}**.`;

      await interaction.editReply({ embeds: [createSuccessEmbed(description)] });
    });
  },
};

export default command;

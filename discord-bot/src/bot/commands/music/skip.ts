import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, requirePlayer, skip } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';

const command: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track.'),
  category: 'music',
  cooldownMs: 1500,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const title = player.queue.current?.info.title ?? 'that';
      await skip(player);
      await interaction.reply({ embeds: [createSuccessEmbed(`Skipped **${title}**. Next victim queued.`)] });
    });
  },
};

export default command;

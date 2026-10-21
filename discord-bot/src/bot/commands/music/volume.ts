import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, requirePlayer, setVolume } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';
import { updateGuildMusicSettings } from '../../../database/repositories/guildSettingsRepository';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume (0-200).')
    .addIntegerOption((opt) =>
      opt.setName('level').setDescription('Volume percentage').setRequired(true).setMinValue(0).setMaxValue(200),
    ),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const level = interaction.options.getInteger('level', true);
      await setVolume(player, level);
      await updateGuildMusicSettings(interaction.guildId!, { defaultVolume: level });
      await interaction.reply({ embeds: [createSuccessEmbed(`Volume set to **${level}%**. Your ears, your funeral.`)] });
    });
  },
};

export default command;

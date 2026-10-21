import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { assertSameVoiceChannel, requirePlayer, setLoop } from '../../../services/music/playerService';
import { getMemberVoiceChannelId, runMusicCommand } from '../../../services/music/commandHelpers';
import { createSuccessEmbed } from '../../../utils/embeds';
import { LoopMode } from '../../../types/music';

const LABELS: Record<LoopMode, string> = {
  [LoopMode.OFF]: 'Loop off. Every track gets exactly one shot now.',
  [LoopMode.TRACK]: "Looping this track. I hope you actually like it.",
  [LoopMode.QUEUE]: 'Looping the whole queue. Commitment.',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode.')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: LoopMode.OFF },
          { name: 'Track', value: LoopMode.TRACK },
          { name: 'Queue', value: LoopMode.QUEUE },
        ),
    ),
  category: 'music',
  cooldownMs: 2000,
  execute: async (interaction, client) => {
    if (!interaction.guildId) return;
    await runMusicCommand(interaction, async () => {
      const player = requirePlayer(client, interaction.guildId!);
      assertSameVoiceChannel(player, getMemberVoiceChannelId(interaction));
      const mode = interaction.options.getString('mode', true) as LoopMode;
      await setLoop(player, mode);
      await interaction.reply({ embeds: [createSuccessEmbed(LABELS[mode])] });
    });
  },
};

export default command;

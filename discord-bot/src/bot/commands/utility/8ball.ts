import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { roll8Ball, build8BallEmbed } from '../../../services/utility/eightBallService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Consult the sarcastic Magic 8-Ball for an answer to your question.')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('The question you wish to present to the 8-Ball.')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(256),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction) => {
    const question = interaction.options.getString('question', true).trim();
    const result = roll8Ball(question);
    const view = build8BallEmbed(result, interaction.user);

    await interaction.reply({
      embeds: [view.embed],
      components: view.components,
    });
  },
};

export default command;

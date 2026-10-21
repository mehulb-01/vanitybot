import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a community poll with automatic reaction voting.')
    .addStringOption((opt) =>
      opt.setName('question').setDescription('The poll question or topic').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('choice1').setDescription('First option').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('choice2').setDescription('Second option').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('choice3').setDescription('Third option').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('choice4').setDescription('Fourth option').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('choice5').setDescription('Fifth option').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('choice6').setDescription('Sixth option').setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 5000,
  execute: async (interaction) => {
    const question = interaction.options.getString('question', true).trim();

    const rawChoices = [
      interaction.options.getString('choice1'),
      interaction.options.getString('choice2'),
      interaction.options.getString('choice3'),
      interaction.options.getString('choice4'),
      interaction.options.getString('choice5'),
      interaction.options.getString('choice6'),
    ].filter((c): c is string => Boolean(c && c.trim().length > 0));

    const isMultipleChoice = rawChoices.length >= 2;

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(`📊 Poll: ${question}`)
      .setAuthor({
        name: `${interaction.user.username}'s Poll`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setFooter({ text: 'Vanity • Cast your vote by clicking the reactions below.' })
      .setTimestamp();

    if (isMultipleChoice) {
      const formatted = rawChoices.map((choice, i) => `${NUMBER_EMOJIS[i]} ${choice}`).join('\n\n');
      embed.setDescription(formatted);

      const message = await interaction.reply({ embeds: [embed], fetchReply: true });

      for (let i = 0; i < rawChoices.length; i++) {
        await message.react(NUMBER_EMOJIS[i]).catch(() => undefined);
      }
    } else {
      embed.setDescription('*React with 👍 for Yes or 👎 for No.*');
      const message = await interaction.reply({ embeds: [embed], fetchReply: true });

      await message.react('👍').catch(() => undefined);
      await message.react('👎').catch(() => undefined);
    }
  },
};

export default command;

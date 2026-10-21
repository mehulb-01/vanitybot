import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';
import { setAfk } from '../../../services/utility/afkService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself as Away From Keyboard with an optional reason.')
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why are you stepping away?').setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction) => {
    const guildId = interaction.guildId ?? 'global';
    const reason = interaction.options.getString('reason')?.trim() || 'AFK';
    await setAfk(guildId, interaction.user.id, reason);

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setDescription(`<@${interaction.user.id}> is AFK: **${reason}**. Don't ping them.`);

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;

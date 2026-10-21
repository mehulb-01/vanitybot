import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { isTraderAvailable } from '../../../services/economy/traderService';
import { renderTraderMainView, renderTraderClosedView } from '../../events/traderHandler';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('trader')
    .setDescription('Visit the mysterious Wandering Trader (available Wednesday through Thursday globally).'),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const isOpen = isTraderAvailable();
    const view = isOpen
      ? await renderTraderMainView(interaction.user.id)
      : renderTraderClosedView(interaction.user.id);

    await interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  },
};

export default command;

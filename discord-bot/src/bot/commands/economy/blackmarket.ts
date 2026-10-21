import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { renderMarketCatalogView } from '../../events/blackmarketHandler';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('blackmarket')
    .setDescription('Access the underground Blackmarket catalog to buy and sell contraband.'),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const view = await renderMarketCatalogView(interaction.user.id);
    await interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  },
};

export default command;

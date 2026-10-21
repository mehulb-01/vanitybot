import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Check how long I\'ve been awake'),
  category: 'utility',
  cooldownMs: 5000,
  execute: async (interaction, client) => {
    if (!client.readyTimestamp) {
      await interaction.reply({
        content: '<:10_warning_triangle:1548395769562665174> I\'m not ready yet. Try again in a moment.',
      });
      return;
    }

    const uptime = Date.now() - client.readyTimestamp;
    
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    let uptimeString = '';
    if (days > 0) uptimeString += `${days}d `;
    if (hours > 0 || days > 0) uptimeString += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) uptimeString += `${minutes}m `;
    uptimeString += `${seconds}s`;

    const uptimeInfo = [
      `<:07_refresh_sync:1548658829355655289> **Uptime:** ${uptimeString}`,
      `<:08_wifi_off:1548658831922561095> **Started:** <t:${Math.floor(client.readyTimestamp / 1000)}:R>`,
    ].join('\n');

    await interaction.reply({
      content: uptimeInfo,
    });
  },
};

export default command;
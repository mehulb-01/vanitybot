import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';

const command: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Checks if I still exist.'),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    const startTime = Date.now();
    
    // Initial reply
    await interaction.reply({
      content: 'Calculating your lack of patience...',
    });

    // Calculate metrics
    const endTime = Date.now();
    const restLatency = endTime - startTime;
    const wsLatency = Math.round(client.ws.ping);
    
    // Get shard info
    const shardId = interaction.guild?.shardId ?? 0;
    const shardCount = client.ws.shards.size;
    
    // Format the metrics
    const metrics = [
      `<:05_wifi:1548396156986589274> WS: ${wsLatency}ms • REST: ${restLatency}ms`,
      `<:16_refresh_sync:1548396181850161283> Edit: ${endTime - startTime}ms • Shard: ${shardId}/${shardCount}`,
    ].join('\n');

    // Edit with final metrics
    await interaction.editReply({
      content: metrics,
    });
  },
};

export default command;

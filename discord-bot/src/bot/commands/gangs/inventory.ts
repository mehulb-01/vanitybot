import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { getUserInventory, getUserGang } from '../../../services/gangs/gangService';
import { getItemById, RARITY_LABELS } from '../../../services/economy/itemRegistry';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items, tactical tools, and contraband.'),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    await interaction.deferReply();

    const [inventory, membership] = await Promise.all([
      getUserInventory(interaction.user.id),
      getUserGang(interaction.user.id),
    ]);

    const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.value, 0);

    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle(`<:35_backpack:1551660057995780246> Personal Inventory — ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({
        text: membership
          ? `Sworn to ${membership.gang.displayName} • Note: Defecting via /gangchange forfeits all items`
          : 'Street Civilian • Note: Joining or changing gangs affects inventory',
      })
      .setTimestamp();

    if (inventory.length === 0) {
      embed.setDescription(
        `<:08_briefcasecrown:1551659990681387058> **Unique Items:** \`0\` | <:06_diamond:1551659985031659562> **Total Estimated Value:** \`$0\`\n\n` +
        `## __<:trchest:1561454424130330845> Stashed Equipment:__\n` +
        `*Your stash is currently empty.*`,
      );
    } else {
      const itemsList = inventory
        .map((item) => {
          const reg = getItemById(item.itemId);
          const itemEmoji = reg?.emoji ?? '<:19_contractdocument:1551660016514240532>';
          const rarityBadge = reg ? RARITY_LABELS[reg.rarity].badge : (item.metadata ? `*${item.metadata}*` : '');
          return `${itemEmoji} **${item.name}** × \`${item.quantity}\` • ${rarityBadge}`;
        })
        .join('\n');

      embed.setDescription(
        `<:08_briefcasecrown:1551659990681387058> **Unique Items:** \`${inventory.length}\` | <:06_diamond:1551659985031659562> **Total Estimated Value:** \`$${formatNumber(totalValue)}\`\n\n` +
        `## __<:trchest:1561454424130330845> Stashed Equipment:__\n${itemsList}`,
      );
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

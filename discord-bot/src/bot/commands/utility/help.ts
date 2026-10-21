import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors, CommandCategoryLabels, CategoryEmojis } from '../../../constants';
import { resolveComponentEmoji } from '../../../utils/emoji';

function buildCategoryEmbed(
  commands: Command[],
  selectedCategory?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTimestamp();

  if (!selectedCategory || selectedCategory === 'all') {
    embed
      .setTitle('Vanity • Command Directory')
      .setDescription(
        'Here is the list of everything I can do. Pick a category from the dropdown below to inspect individual modules.\n\n' +
        'Use `/help command:<name>` to view detailed parameters for any command.',
      );

    const categories = ['utility', 'moderation', 'music', 'gangs'];
    for (const cat of categories) {
      const catCommands = commands.filter(
        (c) => c.category === cat || (cat === 'gangs' && c.category === 'economy'),
      );
      const label = CommandCategoryLabels[cat] ?? cat.toUpperCase();
      if (catCommands.length > 0) {
        embed.addFields({
          name: `${label} (${catCommands.length})`,
          value: catCommands.map((c) => `\`/${c.data.name}\``).join(' '),
          inline: false,
        });
      } else if (cat === 'moderation') {
        embed.addFields({
          name: `${label} (0)`,
          value: '*Under construction. Rules will be enforced eventually.*',
          inline: false,
        });
      }
    }

    embed.setFooter({ text: `Total commands registered: ${commands.length}` });
    return embed;
  }

  const catCommands = commands.filter(
    (c) => c.category === selectedCategory || (selectedCategory === 'gangs' && c.category === 'economy'),
  );
  const label = CommandCategoryLabels[selectedCategory] ?? selectedCategory.toUpperCase();

  embed
    .setTitle(`${label} Commands`)
    .setDescription(
      selectedCategory === 'moderation' && catCommands.length === 0
        ? 'Moderation commands are not built yet. Enjoy the anarchy while it lasts.'
        : `Showing **${catCommands.length}** commands in this module.\nNeed specific parameter info? Run \`/help command:<name>\`.`,
    );

  for (const cmd of catCommands) {
    const desc = cmd.data.description || 'No description provided.';
    embed.addFields({
      name: `/${cmd.data.name}`,
      value: `${desc} *(Cooldown: ${Math.round((cmd.cooldownMs ?? 0) / 1000)}s)*`,
      inline: false,
    });
  }

  embed.setFooter({ text: `Category: ${selectedCategory} • Vanity` });
  return embed;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Explore Vanity’s commands, categories, and capabilities.')
    .addStringOption((opt) =>
      opt
        .setName('command')
        .setDescription('Get detailed documentation for a specific command')
        .setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    const commandQuery = interaction.options.getString('command')?.toLowerCase().trim();
    const allCommands = Array.from(client.commands.values());

    // Single command inspection
    if (commandQuery) {
      const target = client.commands.get(commandQuery);
      if (!target) {
        await interaction.reply({
          content: `Command \`/${commandQuery}\` does not exist. Did you hallucinate it?`,
          ephemeral: true,
        });
        return;
      }

      const rawJson = target.data.toJSON();
      const optionsList =
        rawJson.options && rawJson.options.length > 0
          ? rawJson.options
            .map((o) => `• **${o.name}**${o.required ? ' *(required)*' : ''}: ${o.description}`)
            .join('\n')
          : '*None*';

      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`Command: /${target.data.name}`)
        .setDescription(target.data.description || '*No description*')
        .addFields(
          {
            name: '📂 Category',
            value: CommandCategoryLabels[target.category] ?? target.category,
            inline: true,
          },
          {
            name: '⏱️ Cooldown',
            value: `${Math.round((target.cooldownMs ?? 0) / 1000)} seconds`,
            inline: true,
          },
          {
            name: '<:12_padlock:1548395774432383127> Server Only',
            value: target.guildOnly ? 'Yes' : 'No',
            inline: true,
          },
          {
            name: '⚙️ Parameters / Options',
            value: optionsList,
            inline: false,
          },
        )
        .setFooter({ text: 'Vanity • Syntax & Documentation' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Interactive category explorer
    const initialEmbed = buildCategoryEmbed(allCommands, 'all');

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help:category_select')
      .setPlaceholder('Filter by module category...')
      .addOptions(
        {
          label: 'All Commands',
          value: 'all',
          emoji: resolveComponentEmoji(CategoryEmojis.ALL),
          description: 'Overview of all available commands',
        },
        {
          label: 'Utils',
          value: 'utility',
          emoji: resolveComponentEmoji(CategoryEmojis.UTILITY),
          description: 'Server demographics, avatars, reminders & tools',
        },
        {
          label: 'Moderation',
          value: 'moderation',
          emoji: resolveComponentEmoji(CategoryEmojis.MODERATION),
          description: 'Server moderation suite (not built yet)',
        },
        {
          label: 'Music',
          value: 'music',
          emoji: resolveComponentEmoji(CategoryEmojis.MUSIC),
          description: 'Playback, queue, 8-part slider & audio controls',
        },
        {
          label: 'Gangs',
          value: 'gangs',
          emoji: resolveComponentEmoji(CategoryEmojis.GANGS),
          description: 'Syndicates, voting, heists, vault & economy',
        },
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const response = await interaction.reply({
      embeds: [initialEmbed],
      components: [row],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 90_000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: '<:10_warning_triangle:1548395769562665174> Not your menu. Run `/help` yourself.', ephemeral: true });
        return;
      }

      const selected = i.values[0];
      const updatedEmbed = buildCategoryEmbed(allCommands, selected);
      await i.update({ embeds: [updatedEmbed] });
    });

    collector.on('end', async () => {
      // Disable select menu on timeout
      selectMenu.setDisabled(true);
      await interaction.editReply({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)] }).catch(() => undefined);
    });
  },
};

export default command;

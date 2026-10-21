import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { Command } from '../../../types/command';
import { getAllGangs, getUserGang, areGangsEnabled, GANG_MOTTOS } from '../../../services/gangs/gangService';
import { createErrorEmbed, createInfoEmbed } from '../../../utils/embeds';
import { resolveComponentEmoji } from '../../../utils/emoji';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gangjoin')
    .setDescription('Join one of the 6 global gangs'),
  category: 'gangs',
  cooldownMs: 30000,
  execute: async (interaction) => {
    if (!interaction.guildId || !interaction.guild) return;

    // Immediately acknowledge interaction ephemerally to prevent Discord 3s timeout (10062)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Fetch gangsEnabled, user membership, and all gangs in parallel for maximum speed
    const [gangsEnabled, existingMembership, allGangs] = await Promise.all([
      areGangsEnabled(interaction.guildId),
      getUserGang(interaction.user.id),
      getAllGangs(),
    ]);

    // Check if gangs are enabled on this server
    if (!gangsEnabled) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Gangs have not been set up on this server. Ask an admin to use `/gangsetup`.')],
      });
      return;
    }

    // Check if user already has a gang
    if (existingMembership) {
      await interaction.editReply({
        embeds: [createErrorEmbed(`You're already a member of **${existingMembership.gang.displayName}**. Use /gangleave if you want to leave.`)],
      });
      return;
    }

    // Create gang selection buttons (emoji only, no names)
    const buttons = allGangs.map((gang) =>
      new ButtonBuilder()
        .setCustomId(`gang_join_${gang.id}`)
        .setEmoji(resolveComponentEmoji(gang.emoji))
        .setStyle(ButtonStyle.Primary),
    );

    // Create action rows (3 buttons per row for a clean 3x2 grid)
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 3) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 3));
      rows.push(row);
    }

    const embed = createInfoEmbed(
      'Select one of the 6 global gangs to join. Your choice will be reflected across all servers where gangs are enabled.',
      'Choose Your Gang',
    ).addFields(
      allGangs.map((gang) => ({
        name: `${gang.emoji} ${gang.displayName}`,
        value: `*“${GANG_MOTTOS[gang.name] ?? gang.description}”*`,
        inline: false,
      })),
    );

    await interaction.editReply({ embeds: [embed], components: rows });
  },
};

export default command;

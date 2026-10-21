import { ButtonInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { prisma } from '../../database/database';
import { getAllGangs, enableGangs, disableGangs } from '../../services/gangs/gangService';
import { createSuccessEmbed, createInfoEmbed } from '../../utils/embeds';
import { resolveComponentEmoji } from '../../utils/emoji';

export async function handleGangButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const customId = interaction.customId;

  if (customId === 'gang_enable') {
    await enableGangs(interaction.guildId);
    await interaction.update({
      embeds: [createSuccessEmbed('Gangs enabled on this server! Use `/gangjoin` to join a gang.')],
      components: [],
    });
  } else if (customId === 'gang_disable') {
    await disableGangs(interaction.guildId);
    await interaction.update({
      embeds: [createSuccessEmbed('Gangs disabled on this server. All gang roles will remain but new joins won\'t get roles.')],
      components: [],
    });
  } else if (customId === 'gang_configure') {
    await showGangConfigurationMenu(interaction);
  }
}

async function showGangConfigurationMenu(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const allGangs = await getAllGangs();
  const serverGangSettings = await prisma.serverGangSettings.findMany({
    where: { guildId: interaction.guildId },
  });

  const configuredGangIds = new Set(serverGangSettings.map((s: { gangId: string }) => s.gangId));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('gang_select')
    .setPlaceholder('Select a gang to configure')
    .setMinValues(1)
    .setMaxValues(1);

  for (const gang of allGangs) {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(gang.displayName)
      .setEmoji(resolveComponentEmoji(gang.emoji))
      .setValue(gang.id)
      .setDescription(configuredGangIds.has(gang.id) ? '✓ Configured' : gang.description);

    selectMenu.addOptions(option);
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({
    embeds: [createInfoEmbed('**Configure Gang Roles**').setDescription('Select a gang to set up its role on this server.')],
    components: [row],
  });
}

export async function handleGangSelect(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  // This will be handled in the main interactionCreate event
  // For now, let's move the logic there
}

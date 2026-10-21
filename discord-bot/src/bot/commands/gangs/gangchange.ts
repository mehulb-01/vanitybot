import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { Command } from '../../../types/command';
import {
  getUserGang,
  getAllGangs,
  changeGang,
} from '../../../services/gangs/gangService';
import { getUserEconomy } from '../../../services/economy/economyService';
import { createErrorEmbed, createWarningEmbed } from '../../../utils/embeds';
import { resolveComponentEmoji } from '../../../utils/emoji';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gangchange')
    .setDescription('Defect to another gang (WARNING: Forfeits all inventory items and personal funds).')
    .addStringOption((opt) =>
      opt
        .setName('gang')
        .setDescription('Target gang to pledge allegiance to')
        .setRequired(false)
        .addChoices(
          { name: 'Kurogane', value: 'kurogane' },
          { name: 'Omertà', value: 'omerta' },
          { name: 'Calavera', value: 'calavera' },
          { name: 'Longwei', value: 'longwei' },
          { name: 'Moroz', value: 'moroz' },
          { name: 'Reapers', value: 'reapers' },
        ),
    ),
  category: 'gangs',
  cooldownMs: 30000,
  execute: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const membership = await getUserGang(interaction.user.id);
    if (!membership) {
      await interaction.editReply({
        embeds: [
          createWarningEmbed(
            'You are not currently sworn to any gang. Use `/gangjoin` to choose your first faction without penalty!',
            'No Gang Affiliation',
          ),
        ],
      });
      return;
    }

    const targetGangInput = interaction.options.getString('gang');

    // If a gang was chosen directly in the command
    if (targetGangInput) {
      const result = await changeGang(
        interaction.user.id,
        targetGangInput,
        interaction.guild ?? undefined,
      );

      if (!result.success) {
        await interaction.editReply({
          embeds: [createErrorEmbed(result.message, 'Defection Rejected')],
        });
        return;
      }

      const { oldGang, newGang, totalSeized, itemsWiped } = result;

      const embed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle(`⚡ Gang Defection Decreed — ${interaction.user.username}`)
        .setDescription(
          `You have broken your blood oath with **${oldGang?.displayName}** and defected to **${newGang?.displayName}**!\n\n` +
            `The underworld code is absolute. As retribution for your betrayal, your assets have been seized:\n\n` +
            `> <:19_contractdocument:1551660016514240532> **New Allegiance:** ${newGang?.emoji} **${newGang?.displayName}**\n` +
            `> <:35_backpack:1551660057995780246> **Inventory Cleared:** \`${itemsWiped ?? 0} item(s) destroyed\`\n` +
            `> <:54_bank:1551660106582859927> **Tribute Seized:** \`$${formatNumber(totalSeized ?? 0)}\` transferred into **${oldGang?.displayName}** Treasury!\n` +
            `> <:07_refresh_sync:1548658829355655289> **Tenure Reset:** Re-inducted as a fresh recruit`,
        )
        .setFooter({ text: 'Betrayal has its price. Protect your new colors.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // No target provided: Show high-stakes warning and selection buttons
    const [allGangs, userEco] = await Promise.all([
      getAllGangs(),
      getUserEconomy(interaction.user.id),
    ]);
    const otherGangs = allGangs.filter((g) => g.id !== membership.gangId && g.name !== membership.gang.name);
    const fortuneAtRisk = userEco.wallet + userEco.bank;

    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle('<:10_warning_triangle:1548395769562665174> WARNING: Blood Oath Defection Protocol')
      .setDescription(
        `You are currently sworn to ${membership.gang.emoji} **${membership.gang.displayName}**.\n\n` +
          `Defecting to another gang is considered treason on the streets. If you proceed:\n\n` +
          `<:35_backpack:1551660057995780246> All inventory items will be permanently confiscated.\n` +
          `<:04_moneybag:1551659970083430612> All liquid cash & bank funds ($${formatNumber(fortuneAtRisk)}) will be surrendered directly into the ${membership.gang.displayName} Treasury.\n` +
          `<:07_refresh_sync:1548658829355655289> Your tenure and accumulated quota will be reset to 0.\n\n` +
          `Select a gang below ONLY if you accept complete asset forfeiture:\n` +
          `Choose your new allegiance wisely.`,
      )
      .setFooter({ text: 'Choose your new allegiance wisely.' });

    const buttons = otherGangs.map((g) =>
      new ButtonBuilder()
        .setCustomId(`gang_change_to_${g.name}`)
        .setLabel(g.displayName)
        .setEmoji(resolveComponentEmoji(g.emoji))
        .setStyle(ButtonStyle.Danger),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 3) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 3)));
    }

    await interaction.editReply({
      embeds: [embed],
      components: rows,
    });
  },
};

export default command;

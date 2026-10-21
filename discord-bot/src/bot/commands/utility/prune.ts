import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors, Emojis } from '../../../constants';
import { createErrorEmbed, createWarningEmbed } from '../../../utils/embeds';
import { childLogger } from '../../../utils/logger';

const log = childLogger('command:prune');

const PRUNE_FOOTNOTES = [
  'Vanished without a trace. As if they never existed.',
  'Evidence destroyed. What messages?',
  "Cleaned up the mess. You're welcome.",
  'Swept under the rug. Nobody saw anything.',
  'Memory wiped. Total deniability achieved.',
  'Gone. Reduced to digital ash.',
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('prune')
    .setDescription('Bulk delete messages from the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Only delete messages sent by this specific user')
        .setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 3000,
  guildOnly: true,
  requiredPermissions: [PermissionFlagsBits.ManageMessages],
  execute: async (interaction) => {
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({
        embeds: [createErrorEmbed('This command can only be used in a server channel.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Permission check for user
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        embeds: [createErrorEmbed('You need the `Manage Messages` permission to use this command.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channel;
    if (!('bulkDelete' in channel) || typeof channel.bulkDelete !== 'function') {
      await interaction.reply({
        embeds: [createErrorEmbed('Messages cannot be bulk deleted in this channel type.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check bot's permission in the channel
    const botMember =
      interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        embeds: [
          createErrorEmbed('I do not have the `Manage Messages` permission in this channel.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user');

    try {
      let deletedCount = 0;

      if (targetUser) {
        const fetched = await channel.messages.fetch({ limit: 100 });
        const userMessages = fetched.filter((m) => m.author.id === targetUser.id);
        const toDelete = Array.from(userMessages.values()).slice(0, amount);

        if (toDelete.length === 0) {
          await interaction.editReply({
            embeds: [
              createWarningEmbed(
                `No recent messages found from <@${targetUser.id}> in the last 100 messages.`,
                'No Messages Found',
              ),
            ],
          });
          return;
        }

        const deleted = await channel.bulkDelete(toDelete, true);
        deletedCount = deleted.size;
      } else {
        const deleted = await channel.bulkDelete(amount, true);
        deletedCount = deleted.size;
      }

      if (deletedCount === 0) {
        await interaction.editReply({
          embeds: [
            createWarningEmbed(
              'No messages could be deleted. Note that Discord prevents bulk deleting messages older than 14 days.',
              'Nothing Deleted',
            ),
          ],
        });
        return;
      }

      const randomFootnote = PRUNE_FOOTNOTES[Math.floor(Math.random() * PRUNE_FOOTNOTES.length)];
      const userMention = targetUser ? ` from <@${targetUser.id}>` : '';
      const skippedNotice =
        !targetUser && deletedCount < amount
          ? `\n\n*(Note: ${amount - deletedCount} message(s) older than 14 days were skipped.)*`
          : '';

      const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`${Emojis.SUCCESS} Channel Pruned`)
        .setDescription(
          `<:34_terminal:1548658895646367814> Deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'}${userMention}.${skippedNotice}`,
        )
        .setFooter({ text: randomFootnote })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      log.error({ err, channelId: channel.id }, 'Failed to prune messages.');
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            'An error occurred while attempting to delete messages. Make sure messages are not pinned or older than 14 days.',
          ),
        ],
      });
    }
  },
};

export default command;

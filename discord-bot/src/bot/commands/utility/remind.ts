import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';
import {
  cancelReminder,
  getUserReminders,
  parseDuration,
  scheduleReminder,
  type Reminder,
} from '../../../services/utility/remindService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set or manage reminders so you don’t forget important (or trivial) things.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a reminder')
        .addStringOption((opt) =>
          opt
            .setName('time')
            .setDescription('Duration (e.g. 10m, 2h, 1d, 45s)')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setDescription('What should I remind you about?')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List your active reminders'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel an active reminder')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('Reminder ID from /remind list').setRequired(true),
        ),
    ),
  category: 'utility',
  cooldownMs: 3000,
  execute: async (interaction, client) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const timeStr = interaction.options.getString('time', true);
      const message = interaction.options.getString('message', true);

      const durationMs = parseDuration(timeStr);
      if (!durationMs) {
        await interaction.reply({
          content: '<:10_warning_triangle:1548395769562665174> Invalid time format. Use formats like `10m`, `2h`, `1d`, or `30s`.',
          ephemeral: true,
        });
        return;
      }

      if (durationMs < 5000) {
        await interaction.reply({
          content: '<:10_warning_triangle:1548395769562665174> Reminders must be at least 5 seconds into the future. Your attention span isn’t that short.',
          ephemeral: true,
        });
        return;
      }

      const id = Math.random().toString(36).substring(2, 8);
      const remindAt = Date.now() + durationMs;
      const reminder: Reminder = {
        id,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        message,
        createdAt: Date.now(),
        remindAt,
      };

      try {
        scheduleReminder(client, reminder);
      } catch (err: any) {
        await interaction.reply({ content: `<:10_warning_triangle:1548395769562665174> ${err.message}`, ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('⏰ Reminder Set')
        .setDescription(
          `I will remind you about:\n> ${message}\n\n**When:** <t:${Math.floor(remindAt / 1000)}:R> (<t:${Math.floor(remindAt / 1000)}:T>)\n**ID:** \`${id}\``,
        )
        .setFooter({ text: 'Vanity • Try not to forget until then.' });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'list') {
      const reminders = getUserReminders(interaction.user.id);
      if (reminders.length === 0) {
        await interaction.reply({
          content: 'You have no active reminders. Your mind is blissfully empty.',
          ephemeral: true,
        });
        return;
      }

      const lines = reminders.map(
        (r, i) =>
          `**${i + 1}.** \`[${r.id}]\` <t:${Math.floor(r.remindAt / 1000)}:R> — ${r.message}`,
      );

      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('📋 Your Active Reminders')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'Use `/remind cancel <id>` to cancel any.' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'cancel') {
      const id = interaction.options.getString('id', true).trim();
      const removed = cancelReminder(id, interaction.user.id);

      if (!removed) {
        await interaction.reply({
          content: `<:10_warning_triangle:1548395769562665174> No active reminder found with ID \`${id}\`. Check \`/remind list\`.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `Reminder \`${id}\` has been cancelled. One less burden on your calendar.`,
        ephemeral: true,
      });
    }
  },
};

export default command;

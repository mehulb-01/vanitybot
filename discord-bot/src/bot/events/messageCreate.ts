import type { BotEvent } from '../loaders/eventLoader';
import { clearAfk, getAfk } from '../../services/utility/afkService';
import { EmbedBuilder } from 'discord.js';
import { Colors } from '../../constants';

const event: BotEvent<'messageCreate'> = {
  name: 'messageCreate',
  execute: async (_client, message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Check if the author itself was AFK -> welcome them back and clear AFK
    const authorAfk = await clearAfk(message.guild.id, message.author.id);
    if (authorAfk) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setDescription(
          `You're back, <@${message.author.id}>. Nobody noticed. (<t:${authorAfk.timestamp}:R>)`,
        );

      await message.reply({ embeds: [welcomeEmbed] }).catch(() => undefined);
    }

    // 2. Check if any mentioned users are currently AFK
    if (message.mentions.users.size > 0) {
      const mentionedUsers = message.mentions.users.filter(
        (u) => !u.bot && u.id !== message.author.id,
      );

      for (const [, user] of mentionedUsers) {
        const afk = await getAfk(message.guild.id, user.id);
        if (afk) {
          const afkNotice = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setDescription(
              `**${user.username}** is AFK: **${afk.reason}** (<t:${afk.timestamp}:R>). Stop pinging them.`,
            );

          await message.reply({ embeds: [afkNotice] }).catch(() => undefined);
          break; // Avoid spamming multiple notices for mass mentions
        }
      }
    }
  },
};

export default event;

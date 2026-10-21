import { ChannelType, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';

const VERIFICATION_LEVELS: Record<number, string> = {
  0: 'None',
  1: 'Low (Verified Email)',
  2: 'Medium (Registered > 5m)',
  3: 'High (Member > 10m)',
  4: 'Highest (Verified Phone)',
};

const TIER_LEVELS: Record<number, string> = {
  0: 'Level 0',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Inspect server demographics and details. Prepare to be underwhelmed.'),
  category: 'utility',
  guildOnly: true,
  cooldownMs: 5000,
  execute: async (interaction) => {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '<:10_warning_triangle:1548395769562665174> Run this in a server, genius.', ephemeral: true });
      return;
    }

    // Try fetching owner if not cached
    let ownerTag = `<@${guild.ownerId}>`;
    try {
      const owner = await guild.fetchOwner();
      ownerTag = `${owner.user.tag} (<@${guild.ownerId}>)`;
    } catch {
      // Fallback to snowflake mention
    }

    // Categorize channels
    const channels = guild.channels.cache;
    const textChannels = channels.filter(
      (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement,
    ).size;
    const voiceChannels = channels.filter(
      (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice,
    ).size;
    const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

    // Categorize members
    const totalMembers = guild.memberCount;
    const cachedBots = guild.members.cache.filter((m) => m.user.bot).size;
    const cachedHumans = guild.members.cache.filter((m) => !m.user.bot).size;

    const rolesCount = Math.max(0, guild.roles.cache.size - 1);
    const emojisCount = guild.emojis.cache.size;
    const stickersCount = guild.stickers.cache.size;

    const createdSec = Math.floor(guild.createdTimestamp / 1000);
    const verification = VERIFICATION_LEVELS[guild.verificationLevel] ?? 'Unknown';
    const boostTier = TIER_LEVELS[guild.premiumTier] ?? `Level ${guild.premiumTier}`;
    const boostCount = guild.premiumSubscriptionCount ?? 0;

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(guild.name)
      .setDescription(guild.description || '*No server description set. Pure mystery.*')
      .setThumbnail(guild.iconURL({ size: 1024 }) ?? null)
      .addFields(
        {
          name: '👑 Ownership & Origin',
          value: `**Owner:** ${ownerTag}\n**Created:** <t:${createdSec}:D> (<t:${createdSec}:R>)`,
          inline: false,
        },
        {
          name: `👥 Members (${totalMembers})`,
          value: `**Humans:** ${cachedHumans > 0 ? cachedHumans : 'Cached on load'}\n**Bots:** ${cachedBots}`,
          inline: true,
        },
        {
          name: `💬 Channels (${channels.size})`,
          value: `**Text:** ${textChannels}\n**Voice:** ${voiceChannels}\n**Categories:** ${categories}`,
          inline: true,
        },
        {
          name: '💎 Server Perks',
          value: `**Boosts:** ${boostCount} (${boostTier})\n**Roles:** ${rolesCount}\n**Emojis/Stickers:** ${emojisCount} / ${stickersCount}`,
          inline: true,
        },
        {
          name: '🛡️ Security',
          value: `**Verification:** ${verification}\n**Explicit Filter:** Level ${guild.explicitContentFilter}`,
          inline: true,
        },
        {
          name: '🆔 Server ID',
          value: `\`${guild.id}\``,
          inline: true,
        },
      )
      .setFooter({ text: 'Vanity • A thriving hub of questionable life choices.' })
      .setTimestamp();

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }) ?? null);
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;

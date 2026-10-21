import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { getGangProfile } from '../../../services/gangs/gangService';
import { createWarningEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const GANG_PROF_FOOTNOTES = [
  'Loyalty is earned in blood, paid in respect.',
  'In the shadows, the syndicate thrives.',
  'Protect the family, protect the vault.',
  'Honor the code, survive the streets.',
  'A capo without loyalty is just a dead man waiting.',
  'The syndicate remembers every dollar and every betrayal.',
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gangprof')
    .setDescription('View your gang allegiance, loyalty score, rank standing, balance, and syndicate dossier.')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Syndicate member to inspect (defaults to yourself)')
        .setRequired(false),
    ),
  category: 'gangs',
  cooldownMs: 3000,
  execute: async (interaction) => {
    // Acknowledge interaction immediately (< 100ms) to prevent Discord 3s timeout
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    const profile = await getGangProfile(targetUser.id, interaction.guildId ?? undefined);

    if (!profile) {
      const title = isSelf
        ? 'No Syndicate Allegiance'
        : `No Syndicate Allegiance — ${targetUser.username}`;
      const description = isSelf
        ? "You're currently a **Street Civilian** with no crew watching your back.\n\nUse `/gangjoin` to pledge allegiance to one of the 6 global syndicates and unlock heists, perks, and prestige!"
        : `<@${targetUser.id}> is currently a **Street Civilian** with no gang affiliation.`;
      await interaction.editReply({
        embeds: [createWarningEmbed(description, title)],
      });
      return;
    }

    const {
      membership,
      economy,
      jailStatus,
      loyalty,
      rank,
      bankCapacity,
      voiceSeconds,
      currentBoss,
      isBoss,
      inventoryCount,
      gangTreasury,
    } = profile;

    const gang = membership.gang;
    const netProfitSign = economy.netEarnings >= 0 ? '+' : '';
    const winRate =
      economy.crimesTotal > 0
        ? Math.round((economy.crimesWon / economy.crimesTotal) * 100)
        : 0;

    const voiceHours = Math.floor(voiceSeconds / 3600);
    const voiceMinutes = Math.floor((voiceSeconds % 3600) / 60);
    const randomFootnote = GANG_PROF_FOOTNOTES[Math.floor(Math.random() * GANG_PROF_FOOTNOTES.length)];

    const currentBossDisplay = currentBoss
      ? `<@${currentBoss.userId}>`
      : 'Seat Vacant (Pending Election)';

    const joinedTimestamp = Math.floor(membership.joinedAt.getTime() / 1000);
    const rankDisplay = isBoss
      ? `<:68_crown:1551660143152865441> Gang Boss`
      : `${rank.emoji} ${rank.title}`;

    const recordDisplay = jailStatus.isJailed
      ? `<:04_siren_alarm:1548395756988268684> In Policia Detention (${Math.ceil(jailStatus.remainingSeconds / 60)}m remaining)`
      : `<:21_monitor_pulse:1548396194156253184> Clean Record (Active on Streets)`;

    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle(`${gang.emoji} Gang Profile — ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `${gang.emoji} Gang: ${gang.displayName}\n` +
          `<:54_bank:1551660106582859927> Gang Treasury: $${formatNumber(gangTreasury ?? 0)}\n` +
          `<:68_crown:1551660143152865441> Gang Boss: ${currentBossDisplay}\n` +
          `<:64_handshake:1551660133103304810> Inducted: <t:${joinedTimestamp}:D> (<t:${joinedTimestamp}:R>)`,
      )
      .addFields(
        {
          name: '<:74_medal:1551660157199581227> **__Rank & Standing__**',
          value:
            `${rankDisplay}\n` +
            `<:17_rose_red:1548395572468392026> Loyalty Score: ${formatNumber(loyalty.score)} pts\n` +
            `<:04_moneybag:1551659970083430612> $${formatNumber(membership.quotaContributed ?? 0)} contributed`,
          inline: false,
        },
        {
          name: '<:53_safe:1551660104271667230> **__Financial Status__**',
          value:
            `• <:05_goldcoins:1551659972473913485> $${formatNumber(economy.wallet)} in hand\n` +
            `• <:54_bank:1551660106582859927> $${formatNumber(economy.bank)} / $${formatNumber(bankCapacity)}\n` +
            `• <:35_backpack:1551660057995780246> Inventory has ${inventoryCount} item${inventoryCount === 1 ? '' : 's'}`,
          inline: false,
        },
        {
          name: '<:19_contractdocument:1551660016514240532> **__Criminal Operations__**',
          value:
            `<:39_gasmask:1551660068871868466> ${economy.crimesWon} / ${economy.crimesTotal} (${winRate}%) heists pulled\n` +
            `<:06_diamond:1551659985031659562> ${netProfitSign}$${formatNumber(economy.netEarnings)} profit made\n` +
            `<:75_dogtags:1551660159976345610> $${formatNumber(economy.bountiesPaid)} spent for crew bails`,
          inline: false,
        },
        {
          name: '<:policia:1551952986425528350> **__Policia Status & Comms__**',
          value:
            `${recordDisplay}\n` +
            `<:76_radiosignal:1551660162509578372> Voice Comms Logged: ${voiceHours}h ${voiceMinutes}m`,
          inline: false,
        },
      )
      .setFooter({
        text: isSelf ? randomFootnote : `Dossier inspected by ${interaction.user.username}`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

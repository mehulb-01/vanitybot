import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { Command } from '../../../types/command';
import { areGangsEnabled, getUserGang } from '../../../services/gangs/gangService';
import { getUserEconomy } from '../../../services/economy/economyService';
import {
  HEIST_CATEGORIES,
  REQUIRED_HEIST_CREW,
  createHeistLobby,
} from '../../../services/gangs/heistService';
import { createErrorEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

export function buildHeistLobbyEmbed(lobby: ReturnType<typeof createHeistLobby>): EmbedBuilder {
  const category = HEIST_CATEGORIES[lobby.categoryId] ?? HEIST_CATEGORIES.transit_depot;
  const isFull = lobby.members.length >= REQUIRED_HEIST_CREW;

  const rosterLines = [];
  for (let i = 0; i < REQUIRED_HEIST_CREW; i++) {
    if (i < lobby.members.length) {
      const isHost = lobby.members[i] === lobby.hostId;
      rosterLines.push(`#${i + 1} <@${lobby.members[i]}>${isHost ? '  (Leader)' : ''}`);
    } else {
      rosterLines.push(`#${i + 1} Awaiting operative...`);
    }
  }

  const statusText = isFull
    ? `<:07_refresh_sync:1548658829355655289> Recruiting Crew: (6/6 Operatives Signed Up)\nThe heist leader can now commence the operation!`
    : `<:07_refresh_sync:1548658829355655289> Recruiting Crew: (${lobby.members.length}/${REQUIRED_HEIST_CREW} Operatives Signed Up)\nNeed ${REQUIRED_HEIST_CREW - lobby.members.length} more gang members to commence.`;

  return new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`<:04_siren_alarm:1548395756988268684> Syndicate Heist Operation — ${category.name}`)
    .setDescription(
      `${category.emoji} ${category.name}\n` +
        `${category.description}\n\n` +
        `<:65_crosshairtarget:1551660135389208627> Difficulty Tier: ${category.tierLabel}\n` +
        `<:04_moneybag:1551659970083430612> Total Target Vault: $${formatNumber(category.minTotalLoot)} - $${formatNumber(category.maxTotalLoot)}\n` +
        `<:05_goldcoins:1551659972473913485> Individual Share: ~$${formatNumber(Math.floor(category.minTotalLoot / REQUIRED_HEIST_CREW))} - $${formatNumber(Math.floor(category.maxTotalLoot / REQUIRED_HEIST_CREW))}\n` +
        `<:10_warning_triangle:1548395769562665174> Bust Penalty: $${formatNumber(category.finePerMember)} fine + ${category.jailMinutes}m Policia detention\n\n` +
        `<:66_crewcrown:1551660137482162357> Crew Manifest (Strictly 6 Operatives Required):\n${rosterLines.join('\n')}\n\n` +
        statusText,
    );
}

export function buildHeistLobbyComponents(lobby: ReturnType<typeof createHeistLobby>): ActionRowBuilder<ButtonBuilder>[] {
  const isFull = lobby.members.length >= REQUIRED_HEIST_CREW;

  const joinBtn = new ButtonBuilder()
    .setCustomId(`heist:join:${lobby.id}`)
    .setLabel('Join Crew')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isFull);

  const leaveBtn = new ButtonBuilder()
    .setCustomId(`heist:leave:${lobby.id}`)
    .setLabel('Leave Crew')
    .setStyle(ButtonStyle.Primary);

  const startBtn = new ButtonBuilder()
    .setCustomId(`heist:start:${lobby.id}`)
    .setLabel('Commence Heist')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!isFull);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`heist:cancel:${lobby.id}`)
    .setLabel('Cancel Heist')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, leaveBtn, startBtn, cancelBtn);
  return [row];
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Assemble a 6-player syndicate crew to take down major financial targets across 3 difficulty tiers.')
    .addStringOption((opt) =>
      opt
        .setName('target')
        .setDescription('Heist target category (ordered from least difficult to most difficult)')
        .setRequired(false)
        .addChoices(
          {
            name: 'Sub-Level Transit Depot (Tier 1 • Least Difficult)',
            value: 'transit_depot',
          },
          {
            name: 'Crown Diamond Exchange (Tier 2 • Moderate-High Difficulty)',
            value: 'diamond_exchange',
          },
          {
            name: 'Apex Syndicate Reserve (Tier 3 • Most Difficult)',
            value: 'federal_reserve',
          },
        ),
    ),
  category: 'gangs',
  cooldownMs: 10000,
  execute: async (interaction) => {
    if (!interaction.guildId || !interaction.channel) return;

    await interaction.deferReply();

    const [enabled, membership, userEco] = await Promise.all([
      areGangsEnabled(interaction.guildId),
      getUserGang(interaction.user.id),
      getUserEconomy(interaction.user.id),
    ]);

    if (!enabled) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Gangs are not set up on this server yet. Ask an admin to run `/gangsetup`.')],
      });
      return;
    }

    if (!membership) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "You're a street nobody with no crew to watch your back. Join a gang first using `/gangjoin` before assembling a heist crew!",
          ),
        ],
      });
      return;
    }

    const isJailed = userEco.jailUntil ? userEco.jailUntil.getTime() > Date.now() : false;
    if (isJailed) {
      const remainingSeconds = Math.ceil((userEco.jailUntil!.getTime() - Date.now()) / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const prisonEmbed = new EmbedBuilder()
        .setColor(Colors.NEUTRAL)
        .setTitle('<:56_prison:1551660112391704747> You are in The Prison!')
        .setDescription(
          `Remaining sentence: ${minutes}m ${seconds}s.\nWait it out or have a gang brother spring you with \`/bail user:@${interaction.user.username}\`.`,
        );
      await interaction.editReply({
        embeds: [prisonEmbed],
      });
      return;
    }

    const categoryId = interaction.options.getString('target') ?? 'transit_depot';
    const lobby = createHeistLobby(
      interaction.guildId,
      interaction.channelId,
      interaction.user.id,
      categoryId,
    );

    const embed = buildHeistLobbyEmbed(lobby);
    const components = buildHeistLobbyComponents(lobby);

    await interaction.editReply({
      embeds: [embed],
      components,
    });
  },
};

export default command;

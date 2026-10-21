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
import { CRIME_OPERATIONS } from '../../../services/gangs/crimeService';
import { createErrorEmbed } from '../../../utils/embeds';
import { formatNumber } from '../../../utils/format';
import { Colors } from '../../../constants';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Launch an underground crime operation to earn cash for yourself and your gang.'),
  category: 'gangs',
  cooldownMs: 8000,
  execute: async (interaction) => {
    if (!interaction.guildId || !interaction.guild) return;

    // Immediately acknowledge interaction to prevent Discord 3s timeout / Unknown interaction 10062
    await interaction.deferReply();

    // Parallel fetch for blazing response times (< 200ms)
    const [enabled, membership, userEco] = await Promise.all([
      areGangsEnabled(interaction.guildId),
      getUserGang(interaction.user.id),
      getUserEconomy(interaction.user.id),
    ]);

    // 1. Verify gangs enabled on server
    if (!enabled) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Gangs are not set up on this server yet. Ask an admin to run `/gangsetup`.')],
      });
      return;
    }

    // 2. Verify user has joined a gang
    if (!membership) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "You're a street nobody with no crew to watch your back. Join a gang first using `/gangjoin` before attempting an operation!",
          ),
        ],
      });
      return;
    }

    // 3. Check if user is currently jailed by Policia
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

    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle('<:65_crosshairtarget:1551660135389208627> Underground Crime Terminal')
      .setDescription(
        `Welcome to the syndicate operations board, <@${interaction.user.id}>.\n` +
          `Choose an operation to attempt. Each crime tests your decision-making through 2 tactical phases with Policia response protocols.`,
      )
      .addFields(
        Object.values(CRIME_OPERATIONS).map((crime) => ({
          name: `${crime.emoji} ${crime.name}`,
          value:
            `**Risk:** \`${crime.riskLabel}\`\n` +
            `**Loot:** \`$${formatNumber(crime.minPayout)} - $${formatNumber(crime.maxPayout)}\`\n` +
            `**Penalty:** \`$${formatNumber(crime.fine)} fine + ${crime.jailMinutes}m jail\``,
          inline: false,
        })),
      )
      .setFooter({ text: 'Select an operation below to commence the job.' });

    // Buttons for 4 operations
    const buttons = [
      new ButtonBuilder()
        .setCustomId(`crime:select:street_hustle:${interaction.user.id}`)
        .setLabel('Street Hustle')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`crime:select:convenience_raid:${interaction.user.id}`)
        .setLabel('Neon-Mart')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`crime:select:cyber_vault:${interaction.user.id}`)
        .setLabel('Megacorp Cyber')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`crime:select:armored_convoy:${interaction.user.id}`)
        .setLabel('Armored Convoy')
        .setStyle(ButtonStyle.Primary),
    ];

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 2));
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(2, 4));

    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2],
    });
  },
};

export default command;

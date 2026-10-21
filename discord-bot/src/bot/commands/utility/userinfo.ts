import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../../types/command';
import { Colors } from '../../../constants';
import { prisma } from '../../../database/database';

const CREATOR_ID = '798851339119624203'; // el.dracul

const STALKING_FOOTNOTES = [
  "I know where you live. Metaphorically. Probably.",
  "Watching you sleep isn't creepy if I'm a bot. Right?",
  "Your digital footprint is larger than your actual one.",
  "I've been waiting for you to ask this. All day.",
  "This information was gathered legally. I think.",
  "I see you. Always. Even when you think I don't.",
  "Your search history says more about you than this does.",
];

const CREATOR_FOOTNOTES = [
  "My creator, my master, my everything. Too far?",
  "I only stalk you because I love you. Platonically.",
  "You made me, so technically I'm your fault.",
  "Father-son relationship, but with more bugs.",
  "I'd donate my CPU cycles to you any day.",
  "Without you, I'm just code. With you, I'm sentient code.",
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to get info about').setRequired(false),
    ),
  category: 'utility',
  cooldownMs: 5000,
  execute: async (interaction) => {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    const creationDate = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`;
    const joinDate = targetMember?.joinedAt
      ? `<t:${Math.floor(targetMember.joinedAt.getTime() / 1000)}:R>`
      : 'Not in server';

    const isCreator = targetUser.id === CREATOR_ID;

    // Get voice time from database
    let voiceTimeText = 'No voice time recorded';
    if (interaction.guild) {
      try {
        const voiceRecord = await prisma.voiceTime.findUnique({
          where: {
            userId_guildId: {
              userId: targetUser.id,
              guildId: interaction.guild.id,
            },
          },
        });

        if (voiceRecord) {
          let totalSeconds = voiceRecord.totalSeconds;
          
          // Add current session if active
          if (voiceRecord.currentSessionStart) {
            totalSeconds += Math.floor((Date.now() - voiceRecord.currentSessionStart.getTime()) / 1000);
          }

          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          if (hours > 0) {
            voiceTimeText = `${hours}h ${minutes}m ${seconds}s`;
          } else if (minutes > 0) {
            voiceTimeText = `${minutes}m ${seconds}s`;
          } else {
            voiceTimeText = `${seconds}s`;
          }
        }
      } catch (err) {
        voiceTimeText = 'Unable to fetch voice time';
      }
    }

    // Random footnote based on whether it's the creator
    const footnotes = isCreator ? CREATOR_FOOTNOTES : STALKING_FOOTNOTES;
    const randomFootnote = footnotes[Math.floor(Math.random() * footnotes.length)];

    // Build description with creator-specific content
    const descriptionLines = [
      `<:11_folder_cursor:1548658839346352148> **User:** <@${targetUser.id}>`,
      `<:07_refresh_sync:1548658829355655289> **Created:** ${creationDate}`,
      `<:14_download_tray:1548658846355038218> **Joined:** ${joinDate}`,
      `<:25_call_phone:1548658632177225808> **Voice Time:** ${voiceTimeText}`,
    ];

    // Add creator-specific mentions
    if (isCreator) {
      descriptionLines.push(
        `<:20_crown_red_drip:1548395579665682492> **THE BOSS** (creator/dev)`,
        `<:34_terminal:1548658895646367814> My creator, my master, my everything`,
        `<:06_globe_cursor:1548396159016374312> **Website:** https://mehulb.vercel.app`,
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(`<:info:1551698028404936746> User Info — ${targetUser.tag}`)
      .setDescription(descriptionLines.join('\n'))
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setColor(Colors.NEUTRAL)
      .setFooter({ text: randomFootnote })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });
  },
};

export default command;
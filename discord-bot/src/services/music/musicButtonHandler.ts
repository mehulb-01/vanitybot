import { type ButtonInteraction, MessageFlags } from 'discord.js';
import type { BotClient } from '../../bot/client';
import { getPlayer, pause, resume, skip, stopAndClear, setLoop, shuffleQueue } from './playerService';
import { getMemberVoiceChannelId } from './commandHelpers';
import { createMusicPanelButtons, createNowPlayingEmbed } from './musicEmbeds';
import { LoopMode } from '../../types/music';
import { childLogger } from '../../utils/logger';

const log = childLogger('musicButtonHandler');

export async function handleMusicButton(interaction: ButtonInteraction, client: BotClient): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const player = getPlayer(client, interaction.guildId);
  if (!player) {
    await interaction.reply({
      content: "<:10_warning_triangle:1548395769562665174> Nothing's playing right now. There's nothing to control.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const memberVoiceChannelId = getMemberVoiceChannelId(interaction);
  if (!memberVoiceChannelId || memberVoiceChannelId !== player.voiceChannelId) {
    await interaction.reply({
      content: "<:10_warning_triangle:1548395769562665174> We're not in the same voice channel. Come join me first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const action = interaction.customId.replace('music:', '');

  try {
    switch (action) {
      case 'pauseresume': {
        if (player.paused) {
          await resume(player);
        } else {
          await pause(player);
        }

        const current = player.queue.current;
        if (current) {
          await interaction.update({
            embeds: [createNowPlayingEmbed(player, current)],
            components: [createMusicPanelButtons(player)],
          });
        } else {
          await interaction.reply({
            content: player.paused ? 'Paused.' : 'Resumed.',
            flags: MessageFlags.Ephemeral,
          });
        }
        break;
      }

      case 'skip': {
        if (!player.queue.current) {
          await interaction.reply({ content: '<:10_warning_triangle:1548395769562665174> Nothing to skip.', flags: MessageFlags.Ephemeral });
          return;
        }
        const skippedTitle = player.queue.current.info.title;
        await skip(player);
        await interaction.reply({
          content: `Skipped **${skippedTitle}**.`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'shuffle': {
        if (player.queue.tracks.length < 2) {
          await interaction.reply({
            content: '<:10_warning_triangle:1548395769562665174> Not enough tracks queued to bother shuffling.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        shuffleQueue(player);
        await interaction.reply({
          content: `Shuffled **${player.queue.tracks.length}** tracks.`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'loop': {
        const nextMode =
          player.repeatMode === 'off'
            ? LoopMode.TRACK
            : player.repeatMode === 'track'
              ? LoopMode.QUEUE
              : LoopMode.OFF;

        await setLoop(player, nextMode);

        const current = player.queue.current;
        if (current) {
          await interaction.update({
            embeds: [createNowPlayingEmbed(player, current)],
            components: [createMusicPanelButtons(player)],
          });
        } else {
          const label =
            nextMode === LoopMode.TRACK
              ? 'Looping track'
              : nextMode === LoopMode.QUEUE
                ? 'Looping queue'
                : 'Loop off';
          await interaction.reply({ content: label, flags: MessageFlags.Ephemeral });
        }
        break;
      }

      case 'stop': {
        await stopAndClear(player);
        await interaction.update({
          content: 'Stopped playback and cleared the queue.',
          embeds: [],
          components: [],
        }).catch(async () => {
          await interaction.reply({ content: 'Stopped playback and cleared the queue.', flags: MessageFlags.Ephemeral });
        });
        break;
      }

      default:
        log.warn({ action }, 'Unknown music button action.');
        await interaction.reply({ content: '<:10_warning_triangle:1548395769562665174> Unknown action.', flags: MessageFlags.Ephemeral });
        break;
    }
  } catch (err) {
    log.error({ err, action }, 'Failed to handle music button.');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '<:10_warning_triangle:1548395769562665174> Failed to process that action.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

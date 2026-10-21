import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { BotClient } from '../client';
import {
  MusicServiceError,
  assertSameVoiceChannel,
  pause,
  requirePlayer,
  resume,
  shuffleQueue,
  skip,
  stopAndClear,
} from '../../services/music/playerService';
import { setLoop } from '../../services/music/playerService';
import { LoopMode } from '../../types/music';
import { createMusicPanelButtons, createNowPlayingEmbed } from '../../services/music/musicEmbeds';
import { childLogger } from '../../utils/logger';

const log = childLogger('musicPanel');

const LOOP_CYCLE: LoopMode[] = [LoopMode.OFF, LoopMode.TRACK, LoopMode.QUEUE];

export async function handleMusicButton(interaction: ButtonInteraction, client: BotClient): Promise<void> {
  if (!interaction.guildId) return;
  const action = interaction.customId.split(':')[1];

  try {
    const player = requirePlayer(client, interaction.guildId);
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    assertSameVoiceChannel(player, member?.voice.channelId ?? null);

    switch (action) {
      case 'pauseresume':
        if (player.paused) await resume(player);
        else await pause(player);
        break;
      case 'skip':
        await skip(player);
        break;
      case 'shuffle':
        shuffleQueue(player);
        break;
      case 'loop': {
        const current = (player.repeatMode as LoopMode) ?? LoopMode.OFF;
        const next = LOOP_CYCLE[(LOOP_CYCLE.indexOf(current) + 1) % LOOP_CYCLE.length];
        await setLoop(player, next);
        break;
      }
      case 'stop':
        await stopAndClear(player);
        break;
      default:
        return;
    }

    if (action === 'stop' || !player.queue.current) {
      await interaction.update({ content: 'Stopped. Silence, as requested.', embeds: [], components: [] });
      return;
    }

    await interaction.update({
      embeds: [createNowPlayingEmbed(player, player.queue.current)],
      components: [createMusicPanelButtons(player)],
    });
  } catch (err) {
    if (err instanceof MusicServiceError) {
      await interaction.reply({ content: `<:10_warning_triangle:1548395769562665174> ${err.message}`, flags: MessageFlags.Ephemeral });
      return;
    }
    log.error({ err }, 'Music panel button failed.');
    await interaction.reply({
      content: "<:10_warning_triangle:1548395769562665174> Something broke behind the curtain. I've notified whoever is supposed to fix this.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import { Colors } from '../../constants';
import { resolveComponentEmoji } from '../../utils/emoji';

export const MUSIC_EMOJIS = {
  PLAY: '<:28_playbutton:1551671658115244074>',
  PAUSE: '<:29_pausebutton:1551671661382598678>',
  STOP: '<:30_stopbutton:1551671666680012840>',
  SKIP: '<:32_fastforwardbutton:1551671670886895736>',
  SHUFFLE: '<:33_shuffle:1551671673093234888>',
  LOOP: '<:34_repeat:1551671675160887396>',
  SLIDER_LINE: '<:02_slider_line:1559138414077673473>',
  POINTER: '<:01_left_end_emblem:1559138410768375879>',
} as const;

function formatDuration(ms: number, isStream: boolean): string {
  if (isStream) return 'LIVE';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function createDynamicSlider(
  positionMs: number,
  durationMs: number,
  maxSegments = 8,
): string {
  if (durationMs <= 0) {
    return (
      MUSIC_EMOJIS.POINTER +
      MUSIC_EMOJIS.SLIDER_LINE.repeat(Math.max(0, maxSegments - 1))
    );
  }

  const ratio = Math.max(0, Math.min(1, positionMs / durationMs));
  const pointerIndex = Math.min(maxSegments - 1, Math.floor(ratio * maxSegments));

  const emojis: string[] = [];
  for (let i = 0; i < maxSegments; i++) {
    emojis.push(i === pointerIndex ? MUSIC_EMOJIS.POINTER : MUSIC_EMOJIS.SLIDER_LINE);
  }

  return emojis.join('');
}

export function progressBar(positionMs: number, durationMs: number, length = 8): string {
  return createDynamicSlider(positionMs, durationMs, length);
}

export function formatTimestampLine(positionMs: number, durationMs: number, isStream: boolean): string {
  if (isStream) {
    const startedSec = Math.floor((Date.now() - positionMs) / 1000);
    return `LIVE • Started <t:${startedSec}:R>`;
  }

  const durationStr = formatDuration(durationMs, false);
  const positionStr = formatDuration(positionMs, false);

  if (durationMs > 0) {
    const remainingMs = Math.max(0, durationMs - positionMs);
    const endsSec = Math.floor((Date.now() + remainingMs) / 1000);
    return `${positionStr} / ${durationStr} • <t:${endsSec}:R>`;
  }

  return `${positionStr} / ${durationStr}`;
}

export function createNowPlayingEmbed(player: Player, track: Track): EmbedBuilder {
  const requesterId = typeof track.requester === 'string' ? track.requester : (track.requester as { id: string })?.id;
  const duration = track.info.duration ?? 0;
  const isStream = track.info.isStream ?? false;

  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setAuthor({ name: 'Now Playing' })
    .setTitle(track.info.title)
    .setURL(track.info.uri ?? null)
    .setThumbnail(track.info.artworkUrl ?? null)
    .setDescription(
      `${createDynamicSlider(player.position, duration, 8)}\n\n` +
        formatTimestampLine(player.position, duration, isStream),
    )
    .addFields(
      { name: 'Requested by', value: requesterId ? `<@${requesterId}>` : 'Unknown', inline: true },
      { name: 'Volume', value: `${player.volume}%`, inline: true },
      { name: 'Loop', value: player.repeatMode === 'off' ? 'Off' : player.repeatMode === 'track' ? 'Track' : 'Queue', inline: true },
    )
    .setFooter({ text: `${player.queue.tracks.length} track(s) queued` });
}

export function createQueueEmbed(player: Player, page: number, pageSize = 10): EmbedBuilder {
  const tracks = player.queue.tracks;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const start = (page - 1) * pageSize;
  const slice = tracks.slice(start, start + pageSize);

  const lines = slice.map(
    (t, i) =>
      `**${start + i + 1}.** ${t.info.title} — ${formatDuration(t.info.duration ?? 0, t.info.isStream ?? false)}`,
  );

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('Queue')
    .setFooter({ text: `Page ${page}/${totalPages}` });

  if (player.queue.current) {
    embed.addFields({
      name: 'Now Playing',
      value: `${player.queue.current.info.title} — ${formatDuration(player.queue.current.info.duration ?? 0, player.queue.current.info.isStream ?? false)}`,
    });
  }

  embed.setDescription(lines.length > 0 ? lines.join('\n') : 'Nothing queued. Riveting silence.');
  return embed;
}

export function createMusicPanelButtons(player: Player): ActionRowBuilder<ButtonBuilder> {
  const isLoopActive = player.repeatMode !== 'off';
  const pauseResumeEmoji = player.paused ? MUSIC_EMOJIS.PLAY : MUSIC_EMOJIS.PAUSE;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music:pauseresume')
      .setEmoji(resolveComponentEmoji(pauseResumeEmoji))
      .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:skip')
      .setEmoji(resolveComponentEmoji(MUSIC_EMOJIS.SKIP))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:shuffle')
      .setEmoji(resolveComponentEmoji(MUSIC_EMOJIS.SHUFFLE))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:loop')
      .setEmoji(resolveComponentEmoji(MUSIC_EMOJIS.LOOP))
      .setStyle(isLoopActive ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:stop')
      .setEmoji(resolveComponentEmoji(MUSIC_EMOJIS.STOP))
      .setStyle(ButtonStyle.Danger),
  );
}

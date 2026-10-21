import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/database/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

import {
  createNowPlayingEmbed,
  createQueueEmbed,
  createMusicPanelButtons,
  createDynamicSlider,
  MUSIC_EMOJIS,
} from '../src/services/music/musicEmbeds';
import { getMemberVoiceChannelId } from '../src/services/music/commandHelpers';
import { searchAndQueue } from '../src/services/music/playerService';
import type { Player, Track } from 'lavalink-client';
import { ButtonStyle } from 'discord.js';

// Mock minimal player
function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    guildId: 'guild-123',
    voiceChannelId: 'vc-123',
    textChannelId: 'tc-123',
    position: 45000,
    volume: 80,
    paused: false,
    playing: true,
    repeatMode: 'off',
    queue: {
      current: null,
      tracks: [],
      previous: [],
    },
    ...overrides,
  } as unknown as Player;
}

// Mock minimal track
function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    encoded: 'mock_encoded_data',
    info: {
      identifier: 'xyz123',
      title: 'Bohemian Rhapsody',
      author: 'Queen',
      duration: 354000,
      isSeekable: true,
      isStream: false,
      uri: 'https://youtube.com/watch?v=xyz123',
      artworkUrl: 'https://example.com/artwork.jpg',
      sourceName: 'youtube',
      isrc: null,
    },
    requester: 'user-456',
    ...overrides,
  } as unknown as Track;
}

describe('Music Embeds', () => {
  it('should create now playing embed with track metadata and progress bar', () => {
    const track = createMockTrack();
    const player = createMockPlayer({
      position: 60000,
      volume: 75,
      repeatMode: 'track',
      queue: { current: track, tracks: [createMockTrack()], previous: [] } as unknown as Player['queue'],
    });

    const embed = createNowPlayingEmbed(player, track);
    const data = embed.toJSON();

    expect(data.title).toBe('Bohemian Rhapsody');
    expect(data.url).toBe('https://youtube.com/watch?v=xyz123');
    expect(data.thumbnail?.url).toBe('https://example.com/artwork.jpg');
    expect(data.fields).toContainEqual({ name: 'Requested by', value: '<@user-456>', inline: true });
    expect(data.fields).toContainEqual({ name: 'Volume', value: '75%', inline: true });
    expect(data.fields).toContainEqual({ name: 'Loop', value: 'Track', inline: true });
    expect(data.footer?.text).toContain('1 track(s) queued');
    expect(data.description).toContain(MUSIC_EMOJIS.POINTER);
    expect(data.description).toContain(MUSIC_EMOJIS.SLIDER_LINE);
    expect(data.description).toContain('\n\n'); // One line space between slider and timestamp
    expect(data.description).toContain('<t:'); // Dynamic relative timestamp
  });

  it('should segment duration dynamically into 8 parts with 8 emojis in sequence', () => {
    const duration = 80_000; // 80 seconds (10s each segment)

    // Segment 0: 0s - 9s
    const seg0 = createDynamicSlider(0, duration, 8);
    expect(seg0).toBe(
      MUSIC_EMOJIS.POINTER + MUSIC_EMOJIS.SLIDER_LINE.repeat(7),
    );

    // Segment 1: 15s
    const seg1 = createDynamicSlider(15_000, duration, 8);
    expect(seg1).toBe(
      MUSIC_EMOJIS.SLIDER_LINE + MUSIC_EMOJIS.POINTER + MUSIC_EMOJIS.SLIDER_LINE.repeat(6),
    );

    // Segment 4: 45s
    const seg4 = createDynamicSlider(45_000, duration, 8);
    expect(seg4).toBe(
      MUSIC_EMOJIS.SLIDER_LINE.repeat(4) + MUSIC_EMOJIS.POINTER + MUSIC_EMOJIS.SLIDER_LINE.repeat(3),
    );

    // Segment 7: 75s
    const seg7 = createDynamicSlider(75_000, duration, 8);
    expect(seg7).toBe(
      MUSIC_EMOJIS.SLIDER_LINE.repeat(7) + MUSIC_EMOJIS.POINTER,
    );
  });

  it('should handle missing duration and stream safely in now playing embed', () => {
    const streamTrack = createMockTrack({
      info: {
        identifier: 'live123',
        title: 'Lofi Girl Live',
        author: 'Lofi Girl',
        duration: undefined as unknown as number,
        isSeekable: false,
        isStream: true,
        uri: 'https://youtube.com/live',
        artworkUrl: null as unknown as string,
        sourceName: 'youtube',
        isrc: null,
      },
    });
    const player = createMockPlayer({ position: 0 });

    const embed = createNowPlayingEmbed(player, streamTrack);
    const data = embed.toJSON();

    expect(data.description).toContain('LIVE');
  });

  it('should create queue embed with pagination and now playing track', () => {
    const current = createMockTrack({ info: { title: 'Current Song', duration: 180000 } as unknown as Track['info'] });
    const queued1 = createMockTrack({ info: { title: 'Song 1', duration: 120000 } as unknown as Track['info'] });
    const queued2 = createMockTrack({ info: { title: 'Song 2', duration: 240000 } as unknown as Track['info'] });

    const player = createMockPlayer({
      queue: {
        current,
        tracks: [queued1, queued2],
        previous: [],
      } as unknown as Player['queue'],
    });

    const embed = createQueueEmbed(player, 1, 10);
    const data = embed.toJSON();

    expect(data.title).toBe('Queue');
    expect(data.fields?.[0]?.name).toBe('Now Playing');
    expect(data.fields?.[0]?.value).toContain('Current Song');
    expect(data.description).toContain('**1.** Song 1');
    expect(data.description).toContain('**2.** Song 2');
    expect(data.footer?.text).toBe('Page 1/1');
  });

  it('should show empty placeholder when queue is empty', () => {
    const player = createMockPlayer({
      queue: { current: null, tracks: [], previous: [] } as unknown as Player['queue'],
    });

    const embed = createQueueEmbed(player, 1);
    const data = embed.toJSON();

    expect(data.description).toBe('Nothing queued. Riveting silence.');
  });
});

describe('Music Panel Buttons', () => {
  it('should build 5 control buttons with proper custom IDs', () => {
    const player = createMockPlayer({ paused: false, repeatMode: 'off' });
    const row = createMusicPanelButtons(player);
    const components = row.toJSON().components as Array<{ custom_id?: string; style?: ButtonStyle; emoji?: { name?: string } }>;

    expect(components).toHaveLength(5);
    expect(components[0].custom_id).toBe('music:pauseresume');
    expect(components[1].custom_id).toBe('music:skip');
    expect(components[2].custom_id).toBe('music:shuffle');
    expect(components[3].custom_id).toBe('music:loop');
    expect(components[4].custom_id).toBe('music:stop');
  });

  it('should reflect paused status with Success button style and play emoji', () => {
    const player = createMockPlayer({ paused: true });
    const row = createMusicPanelButtons(player);
    const components = row.toJSON().components as Array<{ custom_id?: string; style?: ButtonStyle; emoji?: { name?: string; id?: string } }>;

    expect(components[0].style).toBe(ButtonStyle.Success);
    expect(components[0].emoji?.name).toBe('28_playbutton');
    expect(components[0].emoji?.id).toBe('1551671658115244074');
  });

  it('should reflect playing status with Secondary button style and pause emoji', () => {
    const player = createMockPlayer({ paused: false });
    const row = createMusicPanelButtons(player);
    const components = row.toJSON().components as Array<{ custom_id?: string; style?: ButtonStyle; emoji?: { name?: string; id?: string } }>;

    expect(components[0].style).toBe(ButtonStyle.Secondary);
    expect(components[0].emoji?.name).toBe('29_pausebutton');
    expect(components[0].emoji?.id).toBe('1551671661382598678');
    expect(components[1].emoji?.name).toBe('32_fastforwardbutton');
    expect(components[2].emoji?.name).toBe('33_shuffle');
    expect(components[2].emoji?.id).toBe('1551671673093234888');
    expect(components[4].emoji?.name).toBe('30_stopbutton');
  });

  it('should reflect loop status with Primary button style and active loop emoji', () => {
    const player = createMockPlayer({ repeatMode: 'track' });
    const row = createMusicPanelButtons(player);
    const components = row.toJSON().components as Array<{ custom_id?: string; style?: ButtonStyle; emoji?: { name?: string; id?: string } }>;

    expect(components[3].style).toBe(ButtonStyle.Primary);
    expect(components[3].emoji?.name).toBe('34_repeat');
    expect(components[3].emoji?.id).toBe('1551671675160887396');
  });
});

describe('Command Helpers', () => {
  it('should extract voice channel ID from interaction member', () => {
    const mockInteraction = {
      member: {
        voice: {
          channelId: 'voice-channel-999',
        },
      },
    } as unknown as Parameters<typeof getMemberVoiceChannelId>[0];

    expect(getMemberVoiceChannelId(mockInteraction)).toBe('voice-channel-999');
  });

  it('should return null when member is not in a voice channel', () => {
    const mockInteraction = {
      member: {
        voice: {
          channelId: null,
        },
      },
    } as unknown as Parameters<typeof getMemberVoiceChannelId>[0];

    expect(getMemberVoiceChannelId(mockInteraction)).toBeNull();
  });
});

describe('Search and Queue Fallback', () => {
  it('should prioritize ytmsearch and return official tracks directly', async () => {
    const ytmTrack = createMockTrack({ info: { title: 'Acid', author: 'Rupam Islam' } as unknown as Track['info'] });
    const searchMock = vi.fn().mockResolvedValue({ loadType: 'search', tracks: [ytmTrack], playlist: null, exception: null, pluginInfo: {} });

    const mockPlayer = createMockPlayer({
      search: searchMock as unknown as Player['search'],
      queue: {
        tracks: [],
        add: vi.fn(),
        current: null,
      } as unknown as Player['queue'],
      play: vi.fn(),
    });

    const { result, queuedCount } = await searchAndQueue(mockPlayer, 'acid fossils', 'user-123');

    expect(searchMock).toHaveBeenCalledWith({ query: 'acid fossils', source: 'ytmsearch' }, 'user-123');
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(queuedCount).toBe(1);
    expect(result.tracks[0].info.title).toBe('Acid');
    expect(result.tracks[0].info.author).toBe('Rupam Islam');
  });

  it('should fall back across ytmsearch -> ytsearch -> scsearch when earlier sources return empty', async () => {
    const scTrack = createMockTrack({ info: { title: 'SoundCloud Track' } as unknown as Track['info'] });
    const searchMock = vi.fn().mockImplementation((queryObj: { query: string; source?: string }) => {
      if (queryObj.source === 'ytmsearch' || queryObj.source === 'ytsearch') {
        return Promise.resolve({ loadType: 'empty', tracks: [], playlist: null, exception: null, pluginInfo: {} });
      }
      if (queryObj.source === 'scsearch') {
        return Promise.resolve({ loadType: 'search', tracks: [scTrack], playlist: null, exception: null, pluginInfo: {} });
      }
      return Promise.resolve({ loadType: 'empty', tracks: [], playlist: null, exception: null, pluginInfo: {} });
    });

    const mockPlayer = createMockPlayer({
      search: searchMock as unknown as Player['search'],
      queue: {
        tracks: [],
        add: vi.fn(),
        current: null,
      } as unknown as Player['queue'],
      play: vi.fn(),
    });

    const { result, queuedCount } = await searchAndQueue(mockPlayer, 'obscure indie demo', 'user-123');

    expect(searchMock).toHaveBeenCalledWith({ query: 'obscure indie demo', source: 'ytmsearch' }, 'user-123');
    expect(searchMock).toHaveBeenCalledWith({ query: 'obscure indie demo', source: 'ytsearch' }, 'user-123');
    expect(searchMock).toHaveBeenCalledWith({ query: 'obscure indie demo', source: 'scsearch' }, 'user-123');
    expect(queuedCount).toBe(1);
    expect(result.tracks[0].info.title).toBe('SoundCloud Track');
  });

  it('should directly query spsearch when spotify is chosen as preferred source', async () => {
    const spotifyTrack = createMockTrack({ info: { title: 'Direct Spotify' } as unknown as Track['info'] });
    const searchMock = vi.fn().mockResolvedValue({ loadType: 'search', tracks: [spotifyTrack], playlist: null, exception: null, pluginInfo: {} });

    const mockPlayer = createMockPlayer({
      search: searchMock as unknown as Player['search'],
      queue: {
        tracks: [],
        add: vi.fn(),
        current: null,
      } as unknown as Player['queue'],
      play: vi.fn(),
    });

    const { result, queuedCount } = await searchAndQueue(mockPlayer, 'shoytaan fossils', 'user-123', 'spotify');

    expect(searchMock).toHaveBeenCalledWith({ query: 'shoytaan fossils', source: 'spsearch' }, 'user-123');
    expect(queuedCount).toBe(1);
    expect(result.tracks[0].info.title).toBe('Direct Spotify');
  });

  it('should not prepend search prefix for direct URLs (YouTube or Spotify)', async () => {
    const mockTrack = createMockTrack();
    const searchMock = vi.fn().mockResolvedValue({ loadType: 'track', tracks: [mockTrack], playlist: null, exception: null, pluginInfo: {} });

    const mockPlayer = createMockPlayer({
      search: searchMock as unknown as Player['search'],
      queue: {
        tracks: [],
        add: vi.fn(),
        current: null,
      } as unknown as Player['queue'],
      play: vi.fn(),
    });

    const { result, queuedCount } = await searchAndQueue(
      mockPlayer,
      'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      'user-123',
    );

    expect(searchMock).toHaveBeenCalledWith({ query: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' }, 'user-123');
    expect(queuedCount).toBe(1);
    expect(result.tracks[0]).toBe(mockTrack);
  });
});



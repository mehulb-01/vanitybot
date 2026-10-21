export enum LoopMode {
  OFF = 'off',
  TRACK = 'track',
  QUEUE = 'queue',
}

export interface RequestedTrackInfo {
  title: string;
  author: string;
  uri: string;
  durationMs: number;
  isStream: boolean;
  artworkUrl?: string;
  requesterId: string;
}

export interface MusicPermissionContext {
  guildId: string;
  userId: string;
  userVoiceChannelId: string | null;
  botVoiceChannelId: string | null;
  djRoleId: string | null;
  memberRoleIds: string[];
  isServerAdmin: boolean;
}

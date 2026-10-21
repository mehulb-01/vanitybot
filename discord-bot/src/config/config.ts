import { env } from './env';

/**
 * Static, non-secret app configuration. Guild-specific overrides
 * (mod log channel, currency name, automod thresholds, etc.) live in
 * PostgreSQL via GuildSettings — never here.
 */
export const appConfig = {
  environment: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',

  discord: {
    token: env.DISCORD_TOKEN,
    clientId: env.CLIENT_ID,
    devGuildId: env.DEV_GUILD_ID,
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  lavalink: {
    nodes: env.LAVALINK_NODES,
    host: env.LAVALINK_HOST,
    port: env.LAVALINK_PORT,
    password: env.LAVALINK_PASSWORD,
    secure: env.LAVALINK_SECURE,
  },

  economy: {
    defaultCurrencyName: env.DEFAULT_CURRENCY_NAME,
  },

  music: {
    idleLeaveMs: 5 * 60 * 1000, // 5 minutes
    maxQueueSize: 100,
    defaultVolume: 50,
  },

  spotify: {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  ai: {
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
  },
} as const;

export type AppConfig = typeof appConfig;

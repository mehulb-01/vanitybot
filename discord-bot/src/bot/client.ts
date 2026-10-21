import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type { Command } from '../types/command';
import { createLavalinkManager } from '../services/music/lavalinkManager';

/**
 * Discord.js's Client isn't generic over custom properties, so we extend it.
 * Every place that needs `client.commands` should type against BotClient,
 * not the base discord.js Client.
 */
export class BotClient extends Client {
  public readonly commands = new Collection<string, Command>();
  public readonly lavalink: LavalinkManager;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates, // required for Lavalink voice connections
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
      ],
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
      ],
      presence: {
        status: 'idle',
      },
    });

    this.lavalink = createLavalinkManager(this);

    // Lavalink needs raw VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE payloads
    // to manage voice connections itself, bypassing @discordjs/voice.
    this.on('raw', (packet) => this.lavalink.sendRawData(packet));
  }
}

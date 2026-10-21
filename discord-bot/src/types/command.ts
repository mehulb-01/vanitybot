import {
  ChatInputCommandInteraction,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { BotClient } from '../bot/client';

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export type CommandCategory = 'moderation' | 'economy' | 'music' | 'utility' | 'fun' | 'gangs';

/**
 * Every slash command in bot/commands/** must default-export an object
 * matching this shape. Commands stay thin: validate input, call a service,
 * present the result. Business logic belongs in services/, not here.
 */
export interface Command {
  data: SlashCommandData;
  category: CommandCategory;
  /** Cooldown in milliseconds. Enforced centrally by the cooldown service. */
  cooldownMs?: number;
  /** Discord permission(s) required to even see/use this command. */
  requiredPermissions?: PermissionResolvable[];
  /** If true, only usable in guilds (never DMs). Defaults to true in practice. */
  guildOnly?: boolean;
  execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
}

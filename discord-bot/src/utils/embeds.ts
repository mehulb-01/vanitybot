import { EmbedBuilder } from 'discord.js';
import { Colors, Emojis } from '../constants';

function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder().setTimestamp();
}

export function createSuccessEmbed(description: string, title?: string): EmbedBuilder {
  const finalTitle = title
    ? (title.includes('1548395771852754944') ? title : `${Emojis.SUCCESS} ${title.replace(/^[✅\s]+/, '')}`)
    : `${Emojis.SUCCESS} Success`;
  return baseEmbed().setColor(Colors.SUCCESS).setTitle(finalTitle).setDescription(description);
}

export function createErrorEmbed(description: string, title?: string): EmbedBuilder {
  const finalTitle = title
    ? (title.includes('1548395769562665174') ? title : `${Emojis.ERROR} ${title.replace(/^[❌⚠️\s]+/, '')}`)
    : `${Emojis.ERROR} Error`;
  return baseEmbed().setColor(Colors.ERROR).setTitle(finalTitle).setDescription(description);
}

export function createWarningEmbed(description: string, title?: string): EmbedBuilder {
  const finalTitle = title
    ? (title.includes('1548395769562665174') ? title : `${Emojis.WARNING} ${title.replace(/^[⚠️❌\s]+/, '')}`)
    : `${Emojis.WARNING} Warning`;
  return baseEmbed().setColor(Colors.WARNING).setTitle(finalTitle).setDescription(description);
}

export function createInfoEmbed(description: string, title?: string): EmbedBuilder {
  const finalTitle = title
    ? (title.includes('1551698028404936746') ? title : `${Emojis.INFO} ${title.replace(/^[ℹ️\s]+/, '')}`)
    : `${Emojis.INFO} Info`;
  return baseEmbed().setColor(Colors.INFO).setTitle(finalTitle).setDescription(description);
}

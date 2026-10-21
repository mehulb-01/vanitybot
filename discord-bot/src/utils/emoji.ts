import type { ComponentEmojiResolvable } from 'discord.js';

/**
 * Parses an emoji string (custom Discord format `<:name:id>` / `<a:name:id>` or unicode)
 * into a format suitable for Discord.js component builders (buttons, select menus).
 */
export function resolveComponentEmoji(emojiStr: string): ComponentEmojiResolvable {
  const trimmed = emojiStr.trim();
  const match = trimmed.match(/^<(a)?:(\w+):(\d+)>$/);

  if (match) {
    return {
      animated: Boolean(match[1]),
      name: match[2],
      id: match[3],
    };
  }

  return trimmed;
}

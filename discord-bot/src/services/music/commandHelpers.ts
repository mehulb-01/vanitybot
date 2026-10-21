import { type ChatInputCommandInteraction, type GuildMember, type RepliableInteraction, MessageFlags } from 'discord.js';
import { MusicServiceError } from './playerService';
import { childLogger } from '../../utils/logger';

const log = childLogger('musicCommand');

export function getMemberVoiceChannelId(interaction: RepliableInteraction): string | null {
  const member = interaction.member as GuildMember | null;
  return member?.voice?.channelId ?? null;
}

/**
 * Every music command follows the same shape: do the thing, catch
 * MusicServiceError and show it to the user as-is (it's already
 * personality-flavored and safe to show), catch anything else and hide it.
 */
export async function runMusicCommand(
  interaction: ChatInputCommandInteraction,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof MusicServiceError) {
      const msg = `<:10_warning_triangle:1548395769562665174> ${err.message}`;
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => undefined);
      } else if (interaction.replied) {
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
      return;
    }
    log.error({ err, command: interaction.commandName }, 'Music command failed.');
    throw err; // let the global interactionCreate handler show the generic error
  }
}

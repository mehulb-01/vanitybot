import { ButtonInteraction, MessageFlags } from 'discord.js';
import { roll8Ball, build8BallEmbed } from '../../services/utility/eightBallService';
import { createErrorEmbed } from '../../utils/embeds';
import { childLogger } from '../../utils/logger';

const log = childLogger('eightBallHandler');

export async function handleEightBallButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const ownerId = parts[2];

  if (action !== 'shake') return;

  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      embeds: [
        createErrorEmbed(
          'Only the person who asked can re-shake this 8-Ball. Run `/8ball` to ask your own question.',
          'Not Your 8-Ball',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => undefined);
    return;
  }

  try {
    // Extract the original question from the embed description
    const embed = interaction.message.embeds[0];
    const desc = embed?.description ?? '';
    const match =
      desc.match(/Question:\s*\n"([\s\S]+?)"\s*\nAnswer:/i) ||
      desc.match(/Question:\s*\n"([^"]+)"/i) ||
      desc.match(/Question:\*\*\s*\n>\s*\*"([^"]+)"\*/i);
    const question = match && match[1] ? match[1].trim() : 'What does the future hold?';

    const result = roll8Ball(question);
    const view = build8BallEmbed(result, interaction.user);

    await interaction.update({
      embeds: [view.embed],
      components: view.components,
    });
  } catch (err) {
    log.error({ err, userId: interaction.user.id }, 'Error re-shaking 8-Ball');
  }
}

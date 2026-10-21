import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  User,
} from 'discord.js';
import { Colors } from '../../constants';
import { resolveComponentEmoji } from '../../utils/emoji';

export type EightBallVerdict = 'yes' | 'no' | 'unsure';

export interface EightBallResponse {
  question: string;
  verdict: EightBallVerdict;
  response: string;
}

export const EIGHT_BALL_RESPONSES: Record<EightBallVerdict, readonly string[]> = {
  yes: [
    'Against all mathematical probability and my personal preference, yes.',
    'Yes. Now please stop staring at me like a lost stray.',
    "Surprisingly, the stars aligned. Don't go getting an ego over it.",
    'Yes, but if this blows up in your face, we never had this conversation.',
    'The ledger cleared and the answer is yes. Proceed before your luck runs out.',
    "Miracles happen, apparently. It's a yes—don't ruin it.",
    "Yes. Even a broken clock gets two minutes of glory, and right now that's you.",
    'All signs point to yes. Now take the win and leave my back room.',
    "Yes. Go ahead, test fate. At least it'll be entertaining to watch.",
    'The underworld council nodded. Yes. Now act like you have some sense.',
  ],
  no: [
    'Not in this lifetime, and quite frankly, not in the next one either.',
    'No. I ran the numbers twice just to enjoy disappointing you.',
    'The answer is a resounding no. Did you genuinely think otherwise?',
    'No. The feds are already laughing, and so am I.',
    "Absolutely not. Put down whatever delusion you're smoking and walk away.",
    'No. Even the stray dogs in the alleyway know better than to attempt that.',
    "My sources say no, common sense screams no, and I'm saying definitely not.",
    'A catastrophic no. If you try anyway, leave me out of your eulogy.',
    'No. The vault door is sealed, and your luck just flatlined.',
    'Look at your track record. What part of you honestly expected a yes? No.',
  ],
  unsure: [
    'The smoke is too thick and my patience is too thin. Ask again later.',
    'Fate is currently ghosting you. Check back when the dust settles.',
    'The crystal ball fogged up just to avoid having to look at your question.',
    'Even the syndicate informants are scratching their heads. Cannot predict now.',
    'The cards slipped off the table. Try again once your hands stop shaking.',
    'My psychic reception is weak, probably corrupted by your poor decision-making. Try again.',
    "Ask again later. Preferably much later. When I'm in a better mood.",
    'The odds are currently tied between tragic failure and hilarious disaster. Hazy at best.',
    'The underworld wires are crossed. Concentrate on a smarter question and re-shake.',
    "I could tell you, but then I'd have to listen to you panic. Better not to say right now.",
  ],
} as const;

/**
 * Rolls an RNG-based 8-Ball response for a given question.
 * Uses high-quality RNG to choose between Yes, No, and Unsure,
 * and then selects one of the 10 distinct responses for that category.
 */
export function roll8Ball(
  question: string,
  rng: () => number = Math.random,
): EightBallResponse {
  const verdicts: EightBallVerdict[] = ['yes', 'no', 'unsure'];
  const rawVerdictRoll = rng();
  const verdictIndex = Math.min(
    Math.floor(rawVerdictRoll * verdicts.length),
    verdicts.length - 1,
  );
  const verdict = verdicts[verdictIndex];

  const pool = EIGHT_BALL_RESPONSES[verdict];
  const rawPoolRoll = rng();
  const responseIndex = Math.min(
    Math.floor(rawPoolRoll * pool.length),
    pool.length - 1,
  );
  const response = pool[responseIndex];

  return {
    question,
    verdict,
    response,
  };
}

/**
 * Builds the Discord Embed and ActionRow components for the 8-Ball game.
 */
export function build8BallEmbed(
  result: EightBallResponse,
  user: User,
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const cleanQuestion = result.question.replace(/^"|"$/g, '').trim();
  const cleanResponse = result.response.replace(/^"|"$/g, '').trim();

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle('<:8ballcon:1561439074647015535> The Magic 8-Ball')
    .setAuthor({
      name: `${user.username} consulted the 8-Ball`,
      iconURL: user.displayAvatarURL(),
    })
    .setDescription(`Question:\n"${cleanQuestion}"\nAnswer:\n"${cleanResponse}"`)
    .setFooter({
      text: 'Vanity • The Magic 8-Ball',
    })
    .setTimestamp();

  const shakeBtn = new ButtonBuilder()
    .setCustomId(`8ball:shake:${user.id}`)
    .setLabel('Shake Again')
    .setEmoji(resolveComponentEmoji('<:8ballcon:1561439074647015535>'))
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(shakeBtn);

  return { embed, components: [row] };
}

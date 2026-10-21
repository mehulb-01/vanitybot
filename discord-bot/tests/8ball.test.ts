import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  roll8Ball,
  build8BallEmbed,
  EIGHT_BALL_RESPONSES,
  EightBallResponse,
} from '../src/services/utility/eightBallService';
import eightBallCommand from '../src/bot/commands/utility/8ball';
import { handleEightBallButton } from '../src/bot/events/eightBallHandler';

describe('Magic 8-Ball Game (RNG-based)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Response Pool Verification', () => {
    it('contains exactly 10 distinct responses for yes', () => {
      expect(EIGHT_BALL_RESPONSES.yes).toHaveLength(10);
      const unique = new Set(EIGHT_BALL_RESPONSES.yes);
      expect(unique.size).toBe(10);
      EIGHT_BALL_RESPONSES.yes.forEach((r) => {
        expect(typeof r).toBe('string');
        expect(r.trim().length).toBeGreaterThan(0);
      });
    });

    it('contains exactly 10 distinct responses for no', () => {
      expect(EIGHT_BALL_RESPONSES.no).toHaveLength(10);
      const unique = new Set(EIGHT_BALL_RESPONSES.no);
      expect(unique.size).toBe(10);
      EIGHT_BALL_RESPONSES.no.forEach((r) => {
        expect(typeof r).toBe('string');
        expect(r.trim().length).toBeGreaterThan(0);
      });
    });

    it('contains exactly 10 distinct responses for unsure', () => {
      expect(EIGHT_BALL_RESPONSES.unsure).toHaveLength(10);
      const unique = new Set(EIGHT_BALL_RESPONSES.unsure);
      expect(unique.size).toBe(10);
      EIGHT_BALL_RESPONSES.unsure.forEach((r) => {
        expect(typeof r).toBe('string');
        expect(r.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('RNG Roll Logic', () => {
    it('returns a valid response using default RNG', () => {
      const result = roll8Ball('Will my gang pull off the heist?');
      expect(result.question).toBe('Will my gang pull off the heist?');
      expect(['yes', 'no', 'unsure']).toContain(result.verdict);
      expect(EIGHT_BALL_RESPONSES[result.verdict]).toContain(result.response);
    });

    it('deterministically selects yes when RNG favors first category', () => {
      // 0.1 * 3 = 0.3 -> floor is 0 ('yes'); second call selects response in yes pool
      let callCount = 0;
      const mockRng = () => {
        callCount++;
        return callCount === 1 ? 0.05 : 0.25; // 0.25 * 10 = index 2
      };

      const result = roll8Ball('Is this real?', mockRng);
      expect(result.verdict).toBe('yes');
      expect(result.response).toBe(EIGHT_BALL_RESPONSES.yes[2]);
    });

    it('deterministically selects no when RNG favors second category', () => {
      // 0.45 * 3 = 1.35 -> floor is 1 ('no'); second call selects response in no pool
      let callCount = 0;
      const mockRng = () => {
        callCount++;
        return callCount === 1 ? 0.45 : 0.0; // 0.0 * 10 = index 0
      };

      const result = roll8Ball('Can I trust the informant?', mockRng);
      expect(result.verdict).toBe('no');
      expect(result.response).toBe(EIGHT_BALL_RESPONSES.no[0]);
    });

    it('deterministically selects unsure when RNG favors third category', () => {
      // 0.8 * 3 = 2.4 -> floor is 2 ('unsure'); second call selects response in unsure pool
      let callCount = 0;
      const mockRng = () => {
        callCount++;
        return callCount === 1 ? 0.85 : 0.95; // 0.95 * 10 = index 9
      };

      const result = roll8Ball('What does tomorrow hold?', mockRng);
      expect(result.verdict).toBe('unsure');
      expect(result.response).toBe(EIGHT_BALL_RESPONSES.unsure[9]);
    });
  });

  describe('Embed & Component Builder', () => {
    const mockUser: any = {
      id: 'user-123',
      username: 'ShadowSeeker',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
    };

    it('builds an embed with custom title, exact Question and Answer format, and shake button', () => {
      const result: EightBallResponse = {
        question: 'Should I bet it all?',
        verdict: 'yes',
        response: EIGHT_BALL_RESPONSES.yes[0],
      };

      const view = build8BallEmbed(result, mockUser);
      expect(view.embed.data.title).toBe('<:8ballcon:1561439074647015535> The Magic 8-Ball');
      expect(view.embed.data.description).toBe(
        `Question:\n"Should I bet it all?"\nAnswer:\n"${EIGHT_BALL_RESPONSES.yes[0]}"`,
      );
      expect(view.embed.data.footer?.text).toBe('Vanity • The Magic 8-Ball');

      expect(view.components).toHaveLength(1);
      const btn = (view.components[0] as any).components[0].data;
      expect(btn.custom_id).toBe('8ball:shake:user-123');
      expect(btn.label).toBe('Shake Again');
      expect(btn.emoji.id).toBe('1561439074647015535');
    });

    it('formats clean quotes even if user input already contains quotes', () => {
      const result: EightBallResponse = {
        question: '"suck my d?"',
        verdict: 'no',
        response: 'No way.',
      };

      const view = build8BallEmbed(result, mockUser);
      expect(view.embed.data.description).toBe('Question:\n"suck my d?"\nAnswer:\n"No way."');
    });
  });

  describe('Interaction Execution & Button Handling', () => {
    it('executes /8ball command and replies with embed', async () => {
      const mockInteraction: any = {
        user: {
          id: 'user-456',
          username: 'LuckyGambler',
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/456/avatar.png',
        },
        options: {
          getString: vi.fn().mockReturnValue('Is the boss pleased with my work?'),
        },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await eightBallCommand.execute(mockInteraction, {} as any);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
    });

    it('rejects another user attempting to click someone elses shake button', async () => {
      const mockInteraction: any = {
        customId: '8ball:shake:user-original-owner',
        user: { id: 'intruder-user' },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handleEightBallButton(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          flags: 64, // Ephemeral
        }),
      );
    });

    it('allows original user to re-shake and updates message with new RNG roll', async () => {
      const mockInteraction: any = {
        customId: '8ball:shake:user-owner',
        user: {
          id: 'user-owner',
          username: 'OwnerUser',
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/789/avatar.png',
        },
        message: {
          embeds: [
            {
              description: `Question:\n"Will I escape the raid?"\nAnswer:\n"Not a chance."`,
            },
          ],
        },
        update: vi.fn().mockResolvedValue(undefined),
      };

      await handleEightBallButton(mockInteraction);
      expect(mockInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
    });
  });
});

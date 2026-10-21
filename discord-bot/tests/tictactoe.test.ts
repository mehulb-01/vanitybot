import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTicTacToeGame,
  joinTicTacToeGame,
  startVsVanity,
  cancelTicTacToeGame,
  getTicTacToeGame,
  makeMove,
  checkBoardWinner,
  buildTicTacToeView,
  TICTACTOE_EMOJIS,
  BoardCell,
} from '../src/services/utility/tictactoeService';
import tictactoeCommand from '../src/bot/commands/utility/tictactoe';
import { handleTicTacToeButton } from '../src/bot/events/tictactoeHandler';

describe('Vanity Tic-Tac-Toe Game', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Game Initialization & Modes', () => {
    it('creates an open match lobby waiting for a player to join', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      expect(game.id).toBeDefined();
      expect(game.playerX.id).toBe('player-1');
      expect(game.playerO).toBeNull();
      expect(game.status).toBe('waiting');
      expect(game.isVsAi).toBe(false);
      expect(game.board).toHaveLength(9);
    });

    it('allows a second player to join an open match', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const joinResult = joinTicTacToeGame(game.id, { id: 'player-2', username: 'Bob' });
      expect(joinResult.success).toBe(true);
      expect(game.status).toBe('in_progress');
      expect(game.playerO?.id).toBe('player-2');
      expect(game.playerO?.username).toBe('Bob');
      expect(game.isVsAi).toBe(false);
    });

    it('prevents the host from joining their own open match', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const joinResult = joinTicTacToeGame(game.id, { id: 'player-1', username: 'Alice' });
      expect(joinResult.success).toBe(false);
      expect(joinResult.error).toContain('You are the host');
    });

    it('initializes a match vs Vanity directly', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'vanity');
      expect(game.isVsAi).toBe(true);
      expect(game.status).toBe('in_progress');
      expect(game.playerO?.id).toBe('vanity');
      expect(game.playerO?.username).toBe('Vanity');
    });

    it('allows switching an open match to play vs Vanity', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const vanityResult = startVsVanity(game.id, 'player-1');
      expect(vanityResult.success).toBe(true);
      expect(game.status).toBe('in_progress');
      expect(game.isVsAi).toBe(true);
      expect(game.playerO?.id).toBe('vanity');
      expect(game.playerO?.username).toBe('Vanity');
    });

    it('prevents non-hosts from switching an open match to Vanity', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const result = startVsVanity(game.id, 'intruder-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Only the host');
    });

    it('allows host to cancel an open match', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const cancelResult = cancelTicTacToeGame(game.id, 'player-1');
      expect(cancelResult.success).toBe(true);
      expect(game.status).toBe('cancelled');
    });
  });

  describe('Board Move & Win Logic', () => {
    it('allows player X to make first move in 1v1 match', () => {
      const game = createTicTacToeGame(
        { id: 'player-1', username: 'Alice' },
        'player',
        { id: 'player-2', username: 'Bob' },
      );

      const result = makeMove(game.id, 0, 'player-1');
      expect(result.success).toBe(true);
      expect(game.board[0]).toBe('X');
      expect(game.currentTurn).toBe('O');
    });

    it('rejects moves out of turn', () => {
      const game = createTicTacToeGame(
        { id: 'player-1', username: 'Alice' },
        'player',
        { id: 'player-2', username: 'Bob' },
      );

      // Player 2 attempts to move first
      const result = makeMove(game.id, 0, 'player-2');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not your turn');
    });

    it('rejects moves on already occupied cells', () => {
      const game = createTicTacToeGame(
        { id: 'player-1', username: 'Alice' },
        'player',
        { id: 'player-2', username: 'Bob' },
      );

      makeMove(game.id, 4, 'player-1'); // X takes center
      const result = makeMove(game.id, 4, 'player-2'); // O tries to take center
      expect(result.success).toBe(false);
      expect(result.error).toContain('already occupied');
    });

    it('detects horizontal win for player X', () => {
      const board: BoardCell[] = [
        'X', 'X', 'X',
        'O', 'O', null,
        null, null, null,
      ];
      const check = checkBoardWinner(board);
      expect(check.winner).toBe('X');
      expect(check.line).toEqual([0, 1, 2]);
    });

    it('detects vertical win for player O', () => {
      const board: BoardCell[] = [
        'O', 'X', null,
        'O', 'X', null,
        'O', null, null,
      ];
      const check = checkBoardWinner(board);
      expect(check.winner).toBe('O');
      expect(check.line).toEqual([0, 3, 6]);
    });

    it('detects diagonal win for player X', () => {
      const board: BoardCell[] = [
        'X', 'O', null,
        null, 'X', 'O',
        null, null, 'X',
      ];
      const check = checkBoardWinner(board);
      expect(check.winner).toBe('X');
      expect(check.line).toEqual([0, 4, 8]);
    });

    it('detects stalemate draw', () => {
      const board: BoardCell[] = [
        'X', 'O', 'X',
        'X', 'O', 'O',
        'O', 'X', 'X',
      ];
      const check = checkBoardWinner(board);
      expect(check.winner).toBe('tie');
    });

    it('triggers Vanity AI counter-move automatically in vs Vanity mode', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'vanity');
      const result = makeMove(game.id, 0, 'player-1');
      expect(result.success).toBe(true);
      // X played cell 0, Vanity AI should have played an open cell
      expect(game.board[0]).toBe('X');
      const oMoves = game.board.filter((c) => c === 'O');
      expect(oMoves).toHaveLength(1);
      expect(game.currentTurn).toBe('X');
    });
  });

  describe('View & Component Rendering', () => {
    it('renders lobby view with Join and Play vs Vanity buttons when waiting', () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');
      const view = buildTicTacToeView(game);

      expect(view.embed.data.title).toContain('Open Match');
      expect(view.embed.data.description).toContain('Alice');
      expect(view.embed.data.description).toContain('Waiting for a player to join');
      expect(view.components).toHaveLength(1);
      expect(view.components[0].components).toHaveLength(3);
    });

    it('renders 3x3 grid pattern with custom ring and cross emojis when in progress', () => {
      const game = createTicTacToeGame(
        { id: 'player-1', username: 'Alice' },
        'player',
        { id: 'player-2', username: 'Bob' },
      );
      game.board[0] = 'X';
      game.board[4] = 'O';

      const view = buildTicTacToeView(game);
      expect(view.embed.data.title).toContain('Tic-Tac-Toe');
      expect(view.embed.data.description).toContain(TICTACTOE_EMOJIS.CROSS);
      expect(view.embed.data.description).toContain(TICTACTOE_EMOJIS.RING);
      expect(view.embed.data.description).toContain('Alice');
      expect(view.embed.data.description).toContain('Bob');

      // 3 ActionRows
      expect(view.components).toHaveLength(3);
      // 3 buttons per row
      expect(view.components[0].components).toHaveLength(3);
      expect(view.components[1].components).toHaveLength(3);
      expect(view.components[2].components).toHaveLength(3);

      // Verify custom button emojis
      const btn0 = view.components[0].components[0].data as any;
      expect(btn0.emoji.id).toBe('1561455732929601607'); // Cross

      const btn4 = view.components[1].components[1].data as any;
      expect(btn4.emoji.id).toBe('1561456974309236798'); // Ring
    });
  });

  describe('Slash Command & Button Handling', () => {
    it('executes /tictactoe command and replies with open lobby by default', async () => {
      const mockInteraction: any = {
        user: { id: 'user-1', username: 'Alice' },
        options: {
          getUser: vi.fn().mockReturnValue(null),
          getString: vi.fn().mockReturnValue(null),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await tictactoeCommand.execute(mockInteraction, {} as any);
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
    });

    it('executes /tictactoe with mode vanity and starts game immediately', async () => {
      const mockInteraction: any = {
        user: { id: 'user-1', username: 'Alice' },
        options: {
          getUser: vi.fn().mockReturnValue(null),
          getString: vi.fn().mockReturnValue('vanity'),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await tictactoeCommand.execute(mockInteraction, {} as any);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('rejects challenging yourself', async () => {
      const mockInteraction: any = {
        user: { id: 'user-1', username: 'Alice' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'user-1', username: 'Alice' }),
          getString: vi.fn().mockReturnValue(null),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await tictactoeCommand.execute(mockInteraction, {} as any);
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('handles button click to execute move and updates message', async () => {
      const game = createTicTacToeGame(
        { id: 'player-1', username: 'Alice' },
        'player',
        { id: 'player-2', username: 'Bob' },
      );

      const mockInteraction: any = {
        customId: `ttt:move:${game.id}:0`,
        user: { id: 'player-1' },
        update: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handleTicTacToeButton(mockInteraction);
      expect(mockInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
      expect(game.board[0]).toBe('X');
    });

    it('handles join button click to allow second player into game', async () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const mockInteraction: any = {
        customId: `ttt:join:${game.id}`,
        user: { id: 'player-2', username: 'Bob' },
        update: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handleTicTacToeButton(mockInteraction);
      expect(mockInteraction.update).toHaveBeenCalled();
      expect(game.status).toBe('in_progress');
      expect(game.playerO?.username).toBe('Bob');
    });

    it('handles play vs vanity button click to switch match to AI', async () => {
      const game = createTicTacToeGame({ id: 'player-1', username: 'Alice' }, 'open');

      const mockInteraction: any = {
        customId: `ttt:vanity:${game.id}`,
        user: { id: 'player-1', username: 'Alice' },
        update: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handleTicTacToeButton(mockInteraction);
      expect(mockInteraction.update).toHaveBeenCalled();
      expect(game.status).toBe('in_progress');
      expect(game.isVsAi).toBe(true);
      expect(game.playerO?.username).toBe('Vanity');
    });
  });
});

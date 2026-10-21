import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { Colors } from '../../constants';
import { resolveComponentEmoji } from '../../utils/emoji';

export const TICTACTOE_EMOJIS = {
  RING: '<:ringa:1561456974309236798>',
  CROSS: '<:hexa:1561455732929601607>',
  EMPTY: '⬛',
} as const;

export type BoardCell = 'X' | 'O' | null;
export type TicTacToeStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

export interface TicTacToeGame {
  id: string;
  playerX: { id: string; username: string }; // Host / Cross <:hexa:1561455732929601607>
  playerO: { id: string; username: string } | null; // Opponent / Ring <:ringa:1561456974309236798>
  board: BoardCell[]; // 9 cells
  currentTurn: 'X' | 'O';
  winner: 'X' | 'O' | 'tie' | null;
  winningLine?: number[];
  isVsAi: boolean;
  status: TicTacToeStatus;
  updatedAt: number;
}

const activeGames = new Map<string, TicTacToeGame>();

// Auto-cleanup games inactive for > 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, game] of activeGames.entries()) {
    if (now - game.updatedAt > 15 * 60 * 1000) {
      activeGames.delete(id);
    }
  }
}, 60 * 1000).unref?.();

const WINNING_COMBOS = [
  [0, 1, 2], // rows
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6], // cols
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8], // diagonals
  [2, 4, 6],
];

export function checkBoardWinner(board: BoardCell[]): {
  winner: 'X' | 'O' | 'tie' | null;
  line?: number[];
} {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as 'X' | 'O', line: combo };
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { winner: 'tie' };
  }

  return { winner: null };
}

/**
 * Minimax / Heuristic AI move choice for Vanity (playing O).
 */
export function getAiBestMove(board: BoardCell[]): number {
  // 1. Check if Vanity can win on this move
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const copy = [...board];
      copy[i] = 'O';
      if (checkBoardWinner(copy).winner === 'O') return i;
    }
  }

  // 2. Check if opponent (X) is about to win and block them
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const copy = [...board];
      copy[i] = 'X';
      if (checkBoardWinner(copy).winner === 'X') return i;
    }
  }

  // 3. Take center if available
  if (board[4] === null) return 4;

  // 4. Take corners
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Take any remaining open cell
  const openCells = board.map((c, i) => (c === null ? i : null)).filter((i): i is number => i !== null);
  return openCells[Math.floor(Math.random() * openCells.length)];
}

/**
 * Initializes a new game session.
 * - mode === 'vanity': Plays against Vanity bot AI directly.
 * - mode === 'open': Creates an open match waiting for another player to join.
 * - mode === 'player': Direct match against a challenged user.
 */
export function createTicTacToeGame(
  playerX: { id: string; username: string },
  mode: 'vanity' | 'open' | 'player' = 'open',
  opponent?: { id: string; username: string },
): TicTacToeGame {
  const gameId = Math.random().toString(36).substring(2, 10);
  const isVsAi = mode === 'vanity';
  const isOpponent = Boolean(opponent && mode === 'player');

  const game: TicTacToeGame = {
    id: gameId,
    playerX,
    playerO: isVsAi
      ? { id: 'vanity', username: 'Vanity' }
      : isOpponent
        ? opponent!
        : null,
    board: Array(9).fill(null),
    currentTurn: 'X',
    winner: null,
    isVsAi,
    status: isVsAi || isOpponent ? 'in_progress' : 'waiting',
    updatedAt: Date.now(),
  };

  activeGames.set(gameId, game);
  return game;
}

export function getTicTacToeGame(gameId: string): TicTacToeGame | undefined {
  return activeGames.get(gameId);
}

/**
 * Handles a second player joining an open lobby.
 */
export function joinTicTacToeGame(
  gameId: string,
  user: { id: string; username: string },
): { success: boolean; game?: TicTacToeGame; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { success: false, error: 'This Tic-Tac-Toe lobby has expired or no longer exists.' };
  }

  if (game.status !== 'waiting') {
    return { success: false, error: 'This match is already in progress or completed.' };
  }

  if (user.id === game.playerX.id) {
    return {
      success: false,
      error: 'You are the host of this match. Wait for an opponent to join, or click "Play vs Vanity".',
    };
  }

  game.playerO = { id: user.id, username: user.username };
  game.isVsAi = false;
  game.status = 'in_progress';
  game.updatedAt = Date.now();

  return { success: true, game };
}

/**
 * Allows the match host to switch an open match to play against Vanity AI.
 */
export function startVsVanity(
  gameId: string,
  userId: string,
): { success: boolean; game?: TicTacToeGame; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { success: false, error: 'This Tic-Tac-Toe lobby has expired or no longer exists.' };
  }

  if (game.status !== 'waiting') {
    return { success: false, error: 'This match is already in progress or completed.' };
  }

  if (userId !== game.playerX.id) {
    return { success: false, error: 'Only the host of this match can choose to play against Vanity.' };
  }

  game.playerO = { id: 'vanity', username: 'Vanity' };
  game.isVsAi = true;
  game.status = 'in_progress';
  game.updatedAt = Date.now();

  return { success: true, game };
}

/**
 * Cancels a match lobby.
 */
export function cancelTicTacToeGame(
  gameId: string,
  userId: string,
): { success: boolean; game?: TicTacToeGame; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { success: false, error: 'This Tic-Tac-Toe lobby has expired or no longer exists.' };
  }

  if (userId !== game.playerX.id) {
    return { success: false, error: 'Only the match host can cancel this game.' };
  }

  game.status = 'cancelled';
  activeGames.delete(gameId);
  return { success: true, game };
}

/**
 * Executes a move on the board for a player.
 */
export function makeMove(
  gameId: string,
  cellIndex: number,
  userId: string,
): { success: boolean; game?: TicTacToeGame; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { success: false, error: 'This Tic-Tac-Toe match has expired or ended.' };
  }

  if (game.status !== 'in_progress') {
    return { success: false, error: 'This match is not in progress.' };
  }

  if (game.winner !== null) {
    return { success: false, error: 'This match is already over.' };
  }

  if (cellIndex < 0 || cellIndex > 8 || game.board[cellIndex] !== null) {
    return { success: false, error: 'That cell is already occupied.' };
  }

  // Validate turn
  const expectedUserId = game.currentTurn === 'X' ? game.playerX.id : game.playerO?.id;
  if (userId !== expectedUserId) {
    const isPlayer = userId === game.playerX.id || userId === game.playerO?.id;
    if (!isPlayer) {
      return { success: false, error: 'You are not a participant in this match.' };
    }
    return { success: false, error: "It is not your turn yet. Please wait for your opponent's move." };
  }

  // Place player's mark
  game.board[cellIndex] = game.currentTurn;
  game.updatedAt = Date.now();

  // Check victory
  const winCheck = checkBoardWinner(game.board);
  if (winCheck.winner !== null) {
    game.winner = winCheck.winner;
    game.winningLine = winCheck.line;
    game.status = 'completed';
    return { success: true, game };
  }

  // Switch turn
  game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

  // If playing against Vanity AI and it's O's turn, Vanity makes its move immediately
  if (game.isVsAi && game.currentTurn === 'O') {
    const aiMove = getAiBestMove(game.board);
    if (aiMove !== undefined && aiMove >= 0) {
      game.board[aiMove] = 'O';
      const aiWinCheck = checkBoardWinner(game.board);
      if (aiWinCheck.winner !== null) {
        game.winner = aiWinCheck.winner;
        game.winningLine = aiWinCheck.line;
        game.status = 'completed';
      } else {
        game.currentTurn = 'X';
      }
    }
  }

  return { success: true, game };
}

/**
 * Builds the visual Discord Embed and Components for Tic-Tac-Toe.
 */
export function buildTicTacToeView(game: TicTacToeGame): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  // 1. Lobby view when waiting for a player to join
  if (game.status === 'waiting') {
    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle(`🎮 Tic-Tac-Toe — Open Match`)
      .setDescription(
        `**Host:** ${TICTACTOE_EMOJIS.CROSS} **${game.playerX.username}** *(Cross)*\n` +
          `**Opponent:** ${TICTACTOE_EMOJIS.RING} *Waiting for a player to join...*\n\n` +
          `Click **Join Match** below to play as Ring (${TICTACTOE_EMOJIS.RING}),\n` +
          `or **${game.playerX.username}** can click **Play vs Vanity** to start against the bot!`,
      )
      .setFooter({
        text: 'Vanity • 3x3 Tic-Tac-Toe',
      })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ttt:join:${game.id}`)
        .setLabel('Join Match')
        .setEmoji(resolveComponentEmoji(TICTACTOE_EMOJIS.RING))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ttt:vanity:${game.id}`)
        .setLabel('Play vs Vanity')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ttt:cancel:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    return { embed, components: [row] };
  }

  // 2. Cancelled view
  if (game.status === 'cancelled') {
    const embed = new EmbedBuilder()
      .setColor(Colors.NEUTRAL)
      .setTitle('🎮 Tic-Tac-Toe Match Cancelled')
      .setDescription(`Match was cancelled by **${game.playerX.username}**.`)
      .setFooter({ text: 'Vanity • 3x3 Tic-Tac-Toe' })
      .setTimestamp();
    return { embed, components: [] };
  }

  // 3. Active or Completed Game view
  const cellSymbol = (cell: BoardCell) => {
    if (cell === 'X') return TICTACTOE_EMOJIS.CROSS;
    if (cell === 'O') return TICTACTOE_EMOJIS.RING;
    return TICTACTOE_EMOJIS.EMPTY;
  };

  const gridDisplay = [
    `> ${cellSymbol(game.board[0])}  ${cellSymbol(game.board[1])}  ${cellSymbol(game.board[2])}`,
    `> ${cellSymbol(game.board[3])}  ${cellSymbol(game.board[4])}  ${cellSymbol(game.board[5])}`,
    `> ${cellSymbol(game.board[6])}  ${cellSymbol(game.board[7])}  ${cellSymbol(game.board[8])}`,
  ].join('\n');

  let statusText = '';
  if (game.winner === 'X') {
    statusText = `🏆 **${game.playerX.username}** claimed victory! ${TICTACTOE_EMOJIS.CROSS}`;
  } else if (game.winner === 'O') {
    statusText = `🏆 **${game.playerO?.username ?? 'Vanity'}** claimed victory! ${TICTACTOE_EMOJIS.RING}`;
  } else if (game.winner === 'tie') {
    statusText = `⚖️ **Stalemate!** The board is locked in a draw.`;
  } else {
    const activePlayer = game.currentTurn === 'X' ? game.playerX : game.playerO;
    const activeEmoji = game.currentTurn === 'X' ? TICTACTOE_EMOJIS.CROSS : TICTACTOE_EMOJIS.RING;
    statusText = `⏳ **Turn:** ${activeEmoji} **${activePlayer?.username}**'s move`;
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.NEUTRAL)
    .setTitle(`🎮 Tic-Tac-Toe Match`)
    .setDescription(
      `**Players:**\n` +
        `> ${TICTACTOE_EMOJIS.CROSS} **${game.playerX.username}** *(Cross)*\n` +
        `> ${TICTACTOE_EMOJIS.RING} **${game.playerO?.username ?? 'Vanity'}** *(Ring)*\n\n` +
        `**Grid:**\n` +
        `${gridDisplay}\n\n` +
        `${statusText}`,
    )
    .setFooter({
      text: 'Vanity • 3x3 Tic-Tac-Toe',
    })
    .setTimestamp();

  // Build 3 ActionRows of 3 ButtonBuilders
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const index = r * 3 + c;
      const cell = game.board[index];
      const btn = new ButtonBuilder().setCustomId(`ttt:move:${game.id}:${index}`);

      if (cell === 'X') {
        btn
          .setEmoji(resolveComponentEmoji(TICTACTOE_EMOJIS.CROSS))
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true);
      } else if (cell === 'O') {
        btn
          .setEmoji(resolveComponentEmoji(TICTACTOE_EMOJIS.RING))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true);
      } else {
        btn
          .setLabel('➖')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(Boolean(game.winner));
      }

      row.addComponents(btn);
    }
    rows.push(row);
  }

  return { embed, components: rows };
}

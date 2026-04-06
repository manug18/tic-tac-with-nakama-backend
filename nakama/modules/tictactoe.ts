// =============================================================================
// Tic-Tac-Toe – Nakama Server-Authoritative Game Module (TypeScript)
// =============================================================================
// Covers:
//   • Match lifecycle (matchInit / matchJoinAttempt / matchJoin / matchLeave /
//     matchLoop / matchTerminate / matchSignal)
//   • All game state managed & validated exclusively on the server
//   • Matchmaking via MatchmakerMatched hook
//   • Leaderboard writes after each game
//   • Timer-based mode (30 s per turn, auto-forfeit)
//   • Concurrent game isolation through per-match state
// =============================================================================

// ─── Op-codes ────────────────────────────────────────────────────────────────
const OP_CODE_UPDATE   = 1;   // server → client: full state snapshot
const OP_CODE_MOVE     = 2;   // client → server: player makes a move
const OP_CODE_READY    = 3;   // client → server: player ready (with mode flag)
const OP_CODE_PING     = 4;   // client → server / server → client: keep-alive
const OP_CODE_REMATCH  = 5;   // client → server: player wants to rematch

// ─── Constants ───────────────────────────────────────────────────────────────
const TICK_RATE           = 5;    // Hz – match loop frequency
const TURN_TIME_SEC       = 30;   // timed-mode turn limit
const LEADERBOARD_ID      = "global_points";  // primary – sorted by total score
const LEADERBOARD_WINS    = "global_wins";    // win count per player
const LEADERBOARD_LOSSES  = "global_losses";  // loss count per player
const LEADERBOARD_DRAWS   = "global_draws";   // draw count per player
const WIN_POINTS          = 200;
const DRAW_POINTS         = 50;
const REMATCH_TIMEOUT_SEC = 60;   // seconds to wait for rematch votes before terminating

// ─── Type helpers ────────────────────────────────────────────────────────────
type Board = (string | null)[];   // 9-cell array, null | "X" | "O"

interface MatchState {
  players:        Record<string, string>;   // presenceId → symbol ("X"/"O")
  userIds:        Record<string, string>;   // presenceId → userId
  userNames:      Record<string, string>;   // presenceId → username
  board:          Board;
  currentTurn:    string;                   // presenceId whose turn it is
  phase:          "lobby" | "playing" | "finished";
  winner:         string | null;            // presenceId, "draw", or null
  timedMode:      boolean;
  turnStart:      number;                   // epoch ms when current turn began
  readyFlags:     Record<string, boolean>;
  modeVotes:      Record<string, boolean>;  // presenceId → wants timed mode
  rematchVotes:   Record<string, boolean>;  // presenceId → wants rematch
  finishedAtTick: number;                   // tick when game ended (for timeout)
}

// ─── Win-condition check (pure function) ─────────────────────────────────────
function checkWinner(board: Board): string | null {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],   // rows
    [0,3,6],[1,4,7],[2,5,8],   // cols
    [0,4,8],[2,4,6],           // diagonals
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as string;
    }
  }
  return null;
}

function isDraw(board: Board): boolean {
  return board.every(cell => cell !== null);
}

// ─── Serialise state for broadcast ───────────────────────────────────────────
function encodeState(state: MatchState, presences: nkruntime.Presence[]): string {
  return JSON.stringify({
    board:       state.board,
    currentTurn: state.currentTurn,
    phase:       state.phase,
    winner:      state.winner,
    timedMode:   state.timedMode,
    turnStart:   state.turnStart,
    turnTimeSec: TURN_TIME_SEC,
    players:     presences.map(p => ({
      userId:   p.userId,
      username: p.username,
      symbol:   state.players[p.sessionId] ?? null,
    })),
  });
}

// ─── Match Handlers ──────────────────────────────────────────────────────────

var matchInitImpl: nkruntime.MatchInitFunction<MatchState> = (
  _ctx, _logger, _nk, params
) => {
  const state: MatchState = {
    players:        {},
    userIds:        {},
    userNames:      {},
    board:          Array(9).fill(null),
    currentTurn:    "",
    phase:          "lobby",
    winner:         null,
    timedMode:      params?.["timed"] === "true",
    turnStart:      0,
    readyFlags:     {},
    modeVotes:      {},
    rematchVotes:   {},
    finishedAtTick: 0,
  };
  return { state, tickRate: TICK_RATE, label: JSON.stringify({ open: true, timed: state.timedMode }) };
};

var matchJoinAttemptImpl: nkruntime.MatchJoinAttemptFunction<MatchState> = (
  _ctx, logger, _nk, _dispatcher, _tick, state, presence, _metadata
) => {
  if (state.phase !== "lobby") {
    logger.warn("Join rejected – game already in progress for match");
    return { state, accept: false, rejectMessage: "Game already started" };
  }
  if (Object.keys(state.players).length >= 2) {
    return { state, accept: false, rejectMessage: "Match is full" };
  }
  return { state, accept: true };
};

var matchJoinImpl: nkruntime.MatchJoinFunction<MatchState> = (
  _ctx, logger, _nk, dispatcher, _tick, state, presences
) => {
  for (const p of presences) {
    const symbol = Object.keys(state.players).length === 0 ? "X" : "O";
    state.players[p.sessionId]   = symbol;
    state.userIds[p.sessionId]   = p.userId;
    state.userNames[p.sessionId] = p.username;
    state.readyFlags[p.sessionId] = false;
    logger.info(`Player ${p.username} joined as ${symbol}`);
  }
  // Update label so matchmaking knows seat count
  const open = Object.keys(state.players).length < 2;
  dispatcher.matchLabelUpdate(JSON.stringify({ open, timed: state.timedMode }));
  return { state };
};

var matchLeaveImpl: nkruntime.MatchLeaveFunction<MatchState> = (
  ctx, logger, nk, dispatcher, _tick, state, presences
) => {
  for (const p of presences) {
    delete state.players[p.sessionId];
    delete state.userIds[p.sessionId];
    delete state.userNames[p.sessionId];
    delete state.readyFlags[p.sessionId];
    logger.info(`Player ${p.userId} left`);
  }
  if (state.phase === "playing" && Object.keys(state.players).length < 2) {
    // Remaining player wins by default
    const remainingId = Object.keys(state.players)[0] ?? null;
    state.winner         = remainingId ?? "draw";
    state.phase          = "finished";
    state.finishedAtTick = 0;  // trigger immediate termination (opponent left)
    _recordResult(ctx, logger, nk, state);
  }
  // If a player leaves during the finished/rematch phase, terminate immediately
  if (state.phase === "finished" && Object.keys(state.players).length < 2) {
    state.finishedAtTick = 0;
  }
  dispatcher.matchLabelUpdate(JSON.stringify({ open: true, timed: state.timedMode }));
  return { state };
};

var matchLoopImpl: nkruntime.MatchLoopFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, messages
) => {
  const allPresences = Object.keys(state.players);

  // ── Process inbound messages ────────────────────────────────────────────
  for (const msg of messages) {
    const senderId = msg.sender.sessionId;

    switch (msg.opCode) {

      // ── READY / mode-vote ────────────────────────────────────────────────
      case OP_CODE_READY: {
        if (state.phase !== "lobby") break;
        let data: { timed?: boolean } = {};
        try { data = JSON.parse(nk.binaryToString(msg.data)); } catch {}
        state.readyFlags[senderId] = true;
        if (data.timed !== undefined) state.modeVotes[senderId] = !!data.timed;

        const readyCount = Object.values(state.readyFlags).filter(Boolean).length;
        if (readyCount === 2 && allPresences.length === 2) {
          // Both players must vote timed for timed mode
          state.timedMode = Object.values(state.modeVotes).every(Boolean);
          state.phase      = "playing";
          // Randomly pick who goes first
          state.currentTurn = allPresences[Math.floor(Math.random() * 2)];
          state.turnStart   = Date.now();
          dispatcher.matchLabelUpdate(JSON.stringify({ open: false, timed: state.timedMode }));
          logger.info(`Match started. Timed: ${state.timedMode}. First turn: ${state.currentTurn}`);
        }
        break;
      }

      // ── MOVE ──────────────────────────────────────────────────────────────
      case OP_CODE_MOVE: {
        if (state.phase !== "playing") break;
        if (senderId !== state.currentTurn) break;   // not your turn

        let data: { index?: number } = {};
        try { data = JSON.parse(nk.binaryToString(msg.data)); } catch {
          logger.warn("Invalid move JSON from " + senderId);
          break;
        }

        const idx = data.index;
        if (typeof idx !== "number" || idx < 0 || idx > 8) break;
        if (state.board[idx] !== null) break;   // cell already occupied

        const symbol = state.players[senderId];
        state.board[idx] = symbol;

        const winSymbol = checkWinner(state.board);
        if (winSymbol) {
          // Map winning symbol back to presenceId
          state.winner         = Object.entries(state.players).find(([, s]) => s === winSymbol)?.[0] ?? null;
          state.phase          = "finished";
          state.finishedAtTick = tick;
          _recordResult(ctx, logger, nk, state);
        } else if (isDraw(state.board)) {
          state.winner         = "draw";
          state.phase          = "finished";
          state.finishedAtTick = tick;
          _recordResult(ctx, logger, nk, state);
        } else {
          // Swap turn
          state.currentTurn = allPresences.find(id => id !== senderId) ?? senderId;
          state.turnStart   = Date.now();
        }
        break;
      }

      // ── REMATCH ──────────────────────────────────────────────────────────
      case OP_CODE_REMATCH: {
        if (state.phase !== "finished") break;
        state.rematchVotes[senderId] = true;

        const votedIds = Object.keys(state.rematchVotes).filter(id => state.rematchVotes[id]);
        if (votedIds.length === 2 && allPresences.length === 2) {
          // Swap symbols for fairness, then restart immediately
          for (const id of Object.keys(state.players)) {
            state.players[id] = state.players[id] === "X" ? "O" : "X";
          }
          state.board          = Array(9).fill(null);
          state.winner         = null;
          state.currentTurn    = allPresences[Math.floor(Math.random() * 2)];
          state.turnStart      = Date.now();
          state.phase          = "playing";
          state.rematchVotes   = {};
          state.finishedAtTick = 0;
          state.readyFlags     = {};
          dispatcher.matchLabelUpdate(JSON.stringify({ open: false, timed: state.timedMode }));
          logger.info("Rematch started!");
        }
        break;
      }

      // ── PING ─────────────────────────────────────────────────────────────
      case OP_CODE_PING:
        dispatcher.broadcastMessage(OP_CODE_PING, null, [msg.sender]);
        break;
    }
  }

  // ── Timer enforcement ───────────────────────────────────────────────────
  if (state.phase === "playing" && state.timedMode && state.turnStart > 0) {
    const elapsed = (Date.now() - state.turnStart) / 1000;
    if (elapsed >= TURN_TIME_SEC) {
      // Current player forfeits – opponent wins
      const opponent = allPresences.find(id => id !== state.currentTurn);
      state.winner         = opponent ?? "draw";
      state.phase          = "finished";
      state.finishedAtTick = tick;
      logger.info(`Player ${state.currentTurn} timed out. Winner: ${state.winner}`);
      _recordResult(ctx, logger, nk, state);
    }
  }

  // ── Broadcast state every tick ──────────────────────────────────────────
  if (allPresences.length > 0) {
    // We need actual Presence objects; reconstruct minimal payload instead
    try {
      const payload = JSON.stringify({
        board:        state.board,
        currentTurn:  state.currentTurn,
        phase:        state.phase,
        winner:       state.winner,
        timedMode:    state.timedMode,
        turnStart:    state.turnStart,
        turnTimeSec:  TURN_TIME_SEC,
        // Symbol map keyed by sessionId so the client can identify themselves
        symbols:      state.players,
        rematchVotes: Object.keys(state.rematchVotes).filter(id => state.rematchVotes[id]),
      });
      dispatcher.broadcastMessage(OP_CODE_UPDATE, payload, null);
    } catch (e) {
      logger.error("Broadcast error: " + e);
    }
  }

  // Terminate finished matches after rematch timeout (or if only 1 player left)
  if (state.phase === "finished") {
    if (allPresences.length < 2) return null;
    if (state.finishedAtTick > 0 && (tick - state.finishedAtTick) > REMATCH_TIMEOUT_SEC * TICK_RATE) {
      return null;
    }
  }

  return { state };
};

var matchTerminateImpl: nkruntime.MatchTerminateFunction<MatchState> = (
  _ctx, logger, _nk, _dispatcher, _tick, state, _graceSeconds
) => {
  logger.info("Match terminated. Winner: " + state.winner);
  return { state };
};

var matchSignalImpl: nkruntime.MatchSignalFunction<MatchState> = (
  _ctx, _logger, _nk, _dispatcher, _tick, state, data
) => {
  return { state, data };
};

// ─── Leaderboard helper ───────────────────────────────────────────────────────
function _recordResult(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  state: MatchState,
) {
  const playerSids = Object.keys(state.players);

  if (state.winner === "draw") {
    // Both players get draw points and a draw count
    for (const sid of playerSids) {
      const uid   = state.userIds[sid]   ?? sid;
      const uname = state.userNames[sid] ?? "";
      try {
        nk.leaderboardRecordWrite(LEADERBOARD_ID,    uid, uname, DRAW_POINTS, 0, 2);
        nk.leaderboardRecordWrite(LEADERBOARD_DRAWS, uid, uname, 1,           0, 2);
      } catch (e) { logger.error("Leaderboard draw write failed: " + e); }
    }
    return;
  }

  const winnerSid = state.winner!;
  const loserSid  = playerSids.find(id => id !== winnerSid);
  if (!winnerSid || !loserSid) return;

  const winnerUid   = state.userIds[winnerSid]   ?? winnerSid;
  const winnerUname = state.userNames[winnerSid] ?? "";
  const loserUid    = state.userIds[loserSid]    ?? loserSid;
  const loserUname  = state.userNames[loserSid]  ?? "";

  try {
    nk.leaderboardRecordWrite(LEADERBOARD_ID,     winnerUid,  winnerUname, WIN_POINTS, 0, 2);
    nk.leaderboardRecordWrite(LEADERBOARD_WINS,   winnerUid,  winnerUname, 1,          0, 2);
    nk.leaderboardRecordWrite(LEADERBOARD_LOSSES, loserUid,   loserUname,  1,          0, 2);
  } catch (e) {
    logger.error("Leaderboard write failed: " + e);
  }
}

// ─── Matchmaker Matched Hook ──────────────────────────────────────────────────
// Called when the matchmaker finds enough players. Creates a match and returns
// the match ID so Nakama auto-redirects matched clients.
var matchmakerMatched: nkruntime.MatchmakerMatchedFunction = (
  _ctx, logger, nk, matches
): string | void => {
  const timedMode = matches.some(m => m.properties["timed"] === true);
  try {
    const matchId = nk.matchCreate("tictactoe", { timed: String(timedMode) });
    logger.info(`Matchmaker created match ${matchId} (timed=${timedMode})`);
    return matchId;
  } catch (e) {
    logger.error("Failed to create match via matchmaker: " + e);
  }
};

// ─── RPC: Create private match ────────────────────────────────────────────────
var rpcCreateMatch: nkruntime.RpcFunction = (
  _ctx, logger, nk, payload
): string => {
  let timed = false;
  try { timed = JSON.parse(payload ?? "{}").timed === true; } catch {}
  const matchId = nk.matchCreate("tictactoe", { timed: String(timed) });
  logger.info(`RPC created match ${matchId}`);
  return JSON.stringify({ matchId });
};

// ─── RPC: Get leaderboard top-10 ─────────────────────────────────────────────
var rpcGetLeaderboard: nkruntime.RpcFunction = (
  _ctx, _logger, nk
): string => {
  const result = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 10, undefined, 0);
  const topIds = result.records.map(r => r.ownerId);

  let winMap:  Record<string, number> = {};
  let lossMap: Record<string, number> = {};
  let drawMap: Record<string, number> = {};

  if (topIds.length > 0) {
    const winRes  = nk.leaderboardRecordsList(LEADERBOARD_WINS,   topIds, topIds.length, undefined, 0);
    const lossRes = nk.leaderboardRecordsList(LEADERBOARD_LOSSES, topIds, topIds.length, undefined, 0);
    const drawRes = nk.leaderboardRecordsList(LEADERBOARD_DRAWS,  topIds, topIds.length, undefined, 0);
    for (const r of winRes.ownerRecords)  winMap[r.ownerId]  = r.score;
    for (const r of lossRes.ownerRecords) lossMap[r.ownerId] = r.score;
    for (const r of drawRes.ownerRecords) drawMap[r.ownerId] = r.score;
  }

  const records = result.records.map(r => ({
    rank:     r.rank,
    userId:   r.ownerId,
    username: r.username,
    score:    r.score,
    wins:     winMap[r.ownerId]  ?? 0,
    losses:   lossMap[r.ownerId] ?? 0,
    draws:    drawMap[r.ownerId] ?? 0,
  }));
  return JSON.stringify({ records });
};

// ─── InitModule entry-point ───────────────────────────────────────────────────
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
) {
  // Create leaderboards (idempotent)
  const lbIds = [LEADERBOARD_ID, LEADERBOARD_WINS, LEADERBOARD_LOSSES, LEADERBOARD_DRAWS];
  for (const id of lbIds) {
    try {
      nk.leaderboardCreate(
        id,
        false,   // non-authoritative
        1,       // nkruntime.SortOrder.DESCENDING
        2,       // nkruntime.Operator.INCREMENTAL
        null,    // nkruntime.ResetSchedule.NEVER
        null,
      );
    } catch { /* already exists */ }
  }

  initializer.registerMatch<MatchState>("tictactoe", {
    matchInit:        matchInitImpl,
    matchJoinAttempt: matchJoinAttemptImpl,
    matchJoin:        matchJoinImpl,
    matchLeave:       matchLeaveImpl,
    matchLoop:        matchLoopImpl,
    matchTerminate:   matchTerminateImpl,
    matchSignal:      matchSignalImpl,
  });

  initializer.registerMatchmakerMatched(matchmakerMatched);
  initializer.registerRpc("create_match",    rpcCreateMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);

  logger.info("Tic-Tac-Toe module initialised");
}

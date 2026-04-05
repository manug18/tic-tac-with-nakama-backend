// Shared TypeScript types used across the frontend

export type Symbol = "X" | "O";
export type Board  = (Symbol | null)[];
export type Phase  = "lobby" | "playing" | "finished";

export interface PlayerInfo {
  userId:   string;
  username: string;
  symbol:   Symbol | null;
}

/** Payload the server broadcasts every tick (OP_CODE_UPDATE = 1) */
export interface ServerState {
  board:       Board;
  currentTurn: string;          // sessionId of player whose turn it is
  phase:       Phase;
  winner:      string | null;   // sessionId, "draw", or null
  timedMode:   boolean;
  turnStart:   number;          // epoch ms
  turnTimeSec: number;
  symbols:     Record<string, Symbol>;  // sessionId → symbol
}

export interface LeaderboardEntry {
  rank:     number;
  userId:   string;
  username: string;
  wins:     number;
}

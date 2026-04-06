// useGame – central hook managing Nakama match lifecycle and state
import { useCallback, useEffect, useRef, useState } from "react";
import { MatchData } from "@heroiclabs/nakama-js";
import { getSession, getSocket } from "../lib/nakama";
import { OP_CODE_MOVE, OP_CODE_READY, OP_CODE_REMATCH, OP_CODE_UPDATE } from "../lib/opcodes";
import type { ServerState } from "../types";

interface UseGameReturn {
  gameState:   ServerState | null;
  mySessionId: string;
  sendMove:    (index: number) => void;
  sendReady:   (timed: boolean) => void;
  sendRematch: () => void;
  error:       string | null;
}

export function useGame(matchId: string): UseGameReturn {
  const [gameState,   setGameState]   = useState<ServerState | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [mySessionId, setMySessionId] = useState<string>("");

  // Keep a ref to the latest game state for use in closures
  const stateRef = useRef<ServerState | null>(null);
  stateRef.current = gameState;

  useEffect(() => {
    const socket  = getSocket();
    const session = getSession();
    if (!socket || !session) {
      setError("Not connected to Nakama");
      return;
    }

    // ── Handle incoming match data ──────────────────────────────────────────
    // Register handler BEFORE joining so no messages are missed
    // sidRef holds the real WebSocket session_id (available after joinMatch resolves)
    const sidRef = { current: "" };

    socket.onmatchdata = (data: MatchData) => {
      if (data.op_code === OP_CODE_UPDATE) {
        try {
          let raw: string;
          if (typeof data.data === "string") {
            raw = data.data;
          } else if (data.data instanceof Uint8Array) {
            raw = new TextDecoder().decode(data.data);
          } else {
            raw = String(data.data);
          }
          const next: ServerState = JSON.parse(raw);
          // Skip re-render when only the turn timer timestamp changed
          // (useCountdown has its own interval for smooth countdown)
          setGameState(prev => {
            if (
              prev &&
              prev.phase       === next.phase &&
              prev.currentTurn === next.currentTurn &&
              prev.winner      === next.winner &&
              prev.timedMode   === next.timedMode &&
              prev.turnStart   === next.turnStart &&
              JSON.stringify(prev.board)        === JSON.stringify(next.board) &&
              JSON.stringify(prev.rematchVotes) === JSON.stringify(next.rematchVotes) &&
              JSON.stringify(prev.symbols)      === JSON.stringify(next.symbols)
            ) {
              return prev;   // nothing meaningful changed – skip re-render
            }
            return next;
          });
        } catch (e) {
          console.error("Failed to parse server state", e);
        }
      }
    };

    // ── Join the match ──────────────────────────────────────────────────────
    let hasJoined = false;
    socket.joinMatch(matchId)
      .then((match) => {
        hasJoined = true;
        // Use the WebSocket session_id from the match response
        const wsSessionId = match.self?.session_id ?? session.session_id ?? "";
        sidRef.current = wsSessionId;
        setMySessionId(wsSessionId);
      })
      .catch(e => {
        setError("Failed to join match: " + (e?.message ?? e));
      });

    return () => {
      // Only send leaveMatch if we actually completed the join
      if (hasJoined) socket.leaveMatch(matchId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const sendMove = useCallback((index: number) => {
    const socket = getSocket();
    if (!socket) return;
    socket.sendMatchState(matchId, OP_CODE_MOVE, JSON.stringify({ index }));
  }, [matchId]);

  const sendReady = useCallback((timed: boolean) => {
    const socket = getSocket();
    if (!socket) return;
    socket.sendMatchState(matchId, OP_CODE_READY, JSON.stringify({ timed }));
  }, [matchId]);

  const sendRematch = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.sendMatchState(matchId, OP_CODE_REMATCH, JSON.stringify({}));
  }, [matchId]);

  return { gameState, mySessionId, sendMove, sendReady, sendRematch, error };
}

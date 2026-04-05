// Game page – the active match view
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Board }        from "../components/Board";
import { Timer }        from "../components/Timer";
import { useGame }      from "../hooks/useGame";
import { useCountdown } from "../hooks/useCountdown";
import { getSession }   from "../lib/nakama";
import type { Symbol }  from "../types";
import styles from "./Game.module.css";

export function Game() {
  const { matchId }     = useParams<{ matchId: string }>();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const [sentReady, setSentReady]     = useState(false);
  const [copied,    setCopied]        = useState(false);

  const id = matchId ?? "";
  // timed mode can be passed as a URL query param ?timed=1, default classic
  const wantTimed = searchParams.get("timed") === "1";

  const { gameState, mySessionId, mySymbol, sendMove, sendReady, sendRematch, error } = useGame(id);
  const countdown = useCountdown(gameState);

  // Auto-navigate if not authenticated
  useEffect(() => {
    if (!getSession()) navigate("/");
  }, [navigate]);

  // ── Auto-send ready as soon as both players have joined ─────────────────
  useEffect(() => {
    if (sentReady || !gameState || gameState.phase !== "lobby") return;
    const playerCount = Object.keys(gameState.symbols ?? {}).length;
    if (playerCount >= 2) {
      sendReady(wantTimed);
      setSentReady(true);
    }
  }, [gameState, sentReady, wantTimed, sendReady]);

  function copyRoomId() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Connecting (no state yet) ───────────────────────────────────────────
  if (!gameState) {
    return (
      <div className={styles.center}>
        <p className={styles.waiting}>Connecting to match…</p>
        <div className={styles.roomBox}>
          <span className={styles.roomLabel}>Room ID</span>
          <code className={styles.roomCode}>{id}</code>
          <button className={styles.copyBtn} onClick={copyRoomId}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  const { board, currentTurn, phase, winner, timedMode, symbols, rematchVotes } = gameState;
  const isMyTurn       = currentTurn === mySessionId;
  const playerCount    = Object.keys(symbols ?? {}).length;
  const iHaveVoted     = (rematchVotes ?? []).includes(mySessionId);
  const opponentVoted  = (rematchVotes ?? []).some(id => id !== mySessionId);

  // ── Lobby (waiting for second player) ──────────────────────────────────
  if (phase === "lobby") {
    return (
      <div className={styles.center}>
        <p className={styles.waiting}>
          {playerCount < 2 ? "Waiting for opponent…" : "Starting…"}
        </p>
        <div className={styles.roomBox}>
          <span className={styles.roomLabel}>Room ID</span>
          <code className={styles.roomCode}>{id}</code>
          <button className={styles.copyBtn} onClick={copyRoomId}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className={styles.hint}>Share the Room ID with your opponent</p>
      </div>
    );
  }

  // ── Result text ─────────────────────────────────────────────────────────
  let resultText = "";
  if (phase === "finished") {
    if (winner === "draw")          resultText = "It's a draw!";
    else if (winner === mySessionId) resultText = "You win! 🎉";
    else                            resultText = "You lose 😔";
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Tic-Tac-Toe</h1>

      {/* Player symbols */}
      <div className={styles.symbolRow}>
        {Object.entries(symbols).map(([sid, sym]) => (
          <span key={sid} className={`${styles.symbol} ${styles[(sym as Symbol).toLowerCase() as "x" | "o"]}`}>
            {sym} {sid === mySessionId ? "(you)" : "(opponent)"}
          </span>
        ))}
      </div>

      {/* Timer – only in timed mode */}
      {timedMode && phase === "playing" && (
        <Timer seconds={countdown} isMyTurn={isMyTurn} />
      )}

      {/* Status */}
      {phase === "playing" && (
        <p className={`${styles.status} ${isMyTurn ? styles.myTurn : ""}`}>
          {isMyTurn ? "Your turn" : "Opponent's turn"}
        </p>
      )}

      {/* Result */}
      {phase === "finished" && (
        <div className={styles.result}>
          <p className={styles.resultText}>{resultText}</p>
          <div className={styles.rematchRow}>
            {iHaveVoted ? (
              <p className={styles.waiting}>Waiting for opponent…</p>
            ) : (
              <button className={styles.playAgainBtn} onClick={sendRematch}>
                {opponentVoted ? "Opponent wants to play again — Accept!" : "Play Again"}
              </button>
            )}
          </div>
          <button className={styles.homeBtn} onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      )}

      <Board
        board={board}
        mySymbol={mySymbol as Symbol | null}
        isMyTurn={isMyTurn}
        phase={phase}
        onCellClick={sendMove}
      />

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

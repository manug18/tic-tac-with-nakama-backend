// Game page – the active match view
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Board }        from "../components/Board";
import { Timer }        from "../components/Timer";
import { useGame }      from "../hooks/useGame";
import { useCountdown } from "../hooks/useCountdown";
import { getSession, nakamaClient }   from "../lib/nakama";
import type { Symbol, LeaderboardEntry }  from "../types";
import styles from "./Game.module.css";

export function Game() {
  const { matchId }     = useParams<{ matchId: string }>();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const [sentReady,   setSentReady]               = useState(false);
  const [sentRematch, setSentRematch]              = useState(false);
  const [copied,      setCopied]                   = useState(false);
  const [postGameLB,  setPostGameLB]               = useState<LeaderboardEntry[]>([]);

  const id = matchId ?? "";
  // timed mode can be passed as a URL query param ?timed=1, default classic
  const wantTimed = searchParams.get("timed") === "1";

  const { gameState, mySessionId, sendMove, sendReady, sendRematch, error } = useGame(id);
  const countdown = useCountdown(gameState);

  // Derive mySymbol directly from gameState (no separate state = no extra renders)
  const mySymbol = gameState?.symbols?.[mySessionId] ?? null;

  // Auto-navigate if not authenticated
  useEffect(() => {
    if (!getSession()) navigate("/");
  }, [navigate]);

  // ── Reset ready/rematch flags when game restarts after rematch ──────────────
  const prevPhaseRef = useRef<string>("");
  useEffect(() => {
    if (!gameState) return;
    const prev = prevPhaseRef.current;
    const curr = gameState.phase;
    // finished → playing means rematch started – reset both flags
    if (prev === "finished" && curr === "playing") {
      setSentReady(false);
      setSentRematch(false);
      setPostGameLB([]);
    }
    prevPhaseRef.current = curr;
  }, [gameState?.phase]);

  // ── Fetch leaderboard when game finishes ────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.phase !== "finished") return;
    const session = getSession();
    if (!session) return;
    nakamaClient
      .rpc(session, "get_leaderboard", {})
      .then(res => {
        const { records } = res.payload as { records: LeaderboardEntry[] };
        setPostGameLB(records?.slice(0, 5) ?? []);
      })
      .catch(() => {});
  }, [gameState?.phase]);

  // ── Auto-send ready as soon as both players have joined ─────────────────
  useEffect(() => {
    if (sentReady || !gameState || gameState.phase !== "lobby") return;
    const playerCount = Object.keys(gameState.symbols ?? {}).length;
    if (playerCount >= 2) {
      sendReady(false);   // mode is fixed server-side by the room creator
      setSentReady(true);
    }
  }, [gameState, sentReady, sendReady]);

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
  const isMyTurn      = currentTurn === mySessionId;
  const playerCount   = Object.keys(symbols ?? {}).length;
  const iHaveVoted    = (rematchVotes ?? []).includes(mySessionId);
  const opponentVoted = (rematchVotes ?? []).some(id => id !== mySessionId);

  // Stable player info: X always first, then O
  const playerInfos = Object.entries(symbols)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([sid, sym]) => ({ sid, sym, isMe: sid === mySessionId }));

  // ── Lobby (waiting for second player or both to ready up) ─────────────
  if (phase === "lobby") {
    return (
      <div className={styles.center}>
        {gameState.timedMode && (
          <p className={styles.timedBadge}>⏱ Timed Mode – 30s per turn</p>
        )}
        <p className={styles.waiting}>
          {playerCount < 2 ? "Waiting for opponent…" : sentReady ? "Waiting for opponent to ready up…" : "Opponent joined!"}
        </p>
        <div className={styles.roomBox}>
          <span className={styles.roomLabel}>Room ID</span>
          <code className={styles.roomCode}>{id}</code>
          <button className={styles.copyBtn} onClick={copyRoomId}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {playerCount >= 2 && !sentReady && (
          <button className={styles.readyBtn} onClick={() => {
            sendReady(false);
            setSentReady(true);
          }}>
            Ready!
          </button>
        )}
        {playerCount < 2 && <p className={styles.hint}>Share the Room ID with your opponent</p>}
      </div>
    );
  }

  // ── Result text + points ───────────────────────────────────────────────
  let resultText  = "";
  let pointsEarned = 0;
  if (phase === "finished") {
    if (winner === "draw")           { resultText = "It's a draw!";   pointsEarned = 50;  }
    else if (winner === mySessionId) { resultText = "You win! 🎉";    pointsEarned = 200; }
    else                             { resultText = "You lose 😔";    pointsEarned = 0;   }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Tic-Tac-Toe</h1>

      {/* Player symbols – stable, shown once */}
      <div className={styles.symbolRow}>
        {playerInfos.map(({ sid, sym, isMe }) => (
          <span key={sid} className={`${styles.symbol} ${styles[(sym as Symbol).toLowerCase() as "x" | "o"]}`}>
            {sym} <span className={styles.playerLabel}>({isMe ? "you" : "opp"})</span>
          </span>
        ))}
      </div>

      {/* Timed mode badge */}
      {timedMode && (
        <p className={styles.timedBadge}>⏱ Timed Mode</p>
      )}

      {/* Whose turn – only shown during play, no blinking */}
      {phase === "playing" && !timedMode && (
        <p className={styles.turnBadge}>
          {isMyTurn ? "Your turn" : "Opponent's turn"}
        </p>
      )}

      {/* Timer – timed mode: large countdown */}
      {timedMode && phase === "playing" && (
        <Timer seconds={countdown} isMyTurn={isMyTurn} />
      )}

      {/* Result */}
      {phase === "finished" && (
        <div className={styles.result}>
          <p className={styles.resultText}>{resultText}</p>
          {pointsEarned > 0 && (
            <p className={styles.points}>+{pointsEarned} pts</p>
          )}

          {/* Mini leaderboard */}
          {postGameLB.length > 0 && (
            <div className={styles.miniLeaderboard}>
              <p className={styles.miniLbTitle}>Leaderboard</p>
              <table className={styles.miniLbTable}>
                <thead>
                  <tr><th>#</th><th>Player</th><th>W / L / D</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {postGameLB.map(e => (
                    <tr key={e.userId} className={e.userId === getSession()?.user_id ? styles.miniLbMe : ""}>
                      <td>{e.rank}</td>
                      <td>{e.username || e.userId.slice(0, 8)}</td>
                      <td>{e.wins} / {e.losses} / {e.draws}</td>
                      <td>{e.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.rematchRow}>
            {iHaveVoted || sentRematch ? (
              <p className={styles.waiting}>Waiting for opponent…</p>
            ) : (
              <button className={styles.playAgainBtn} onClick={() => {
                setSentRematch(true);
                sendRematch();
              }}>
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

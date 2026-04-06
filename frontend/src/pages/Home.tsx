// Home page – authentication + matchmaking / room creation
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticate, getSession, nakamaClient, openSocket } from "../lib/nakama";
import styles from "./Home.module.css";

export function Home() {
  const navigate = useNavigate();
  const [username,   setUsername]   = useState("");
  const [roomId,     setRoomId]     = useState("");
  const [timedMode,  setTimedMode]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [loggedIn,   setLoggedIn]   = useState(!!getSession());

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const session = await authenticate(username.trim() || undefined);
      await openSocket(session);
      setLoggedIn(true);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Quick match (matchmaker) ───────────────────────────────────────────────
  async function handleQuickMatch() {
    setLoading(true);
    setError(null);
    try {
      const session = getSession()!;
      const socket  = (await openSocket(session))!;

      // Add self to matchmaker queue; Nakama will call matchmakerMatched server-side
      await socket.addMatchmaker(
        "*",
        2,    // minCount
        2,    // maxCount
        { timed: timedMode },
      );

      socket.onmatchmakermatched = (matched) => {
        navigate(`/game/${matched.match_id ?? matched.token}?queued=1`);
      };
    } catch (e: unknown) {
      setError((e as Error).message ?? "Matchmaking failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Create private room ───────────────────────────────────────────────────
  async function handleCreateRoom() {
    setLoading(true);
    setError(null);
    try {
      const session = getSession()!;
      await openSocket(session);
      const result = await nakamaClient.rpc(session, "create_match", { timed: timedMode });
      const { matchId } = result.payload as { matchId: string };
      navigate(`/game/${matchId}${timedMode ? "?timed=1" : ""}`);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  // ── Join by room ID ───────────────────────────────────────────────────────
  async function handleJoinRoom() {
    if (!roomId.trim()) { setError("Enter a room ID"); return; }
    const session = getSession()!;
    await openSocket(session);
    navigate(`/game/${roomId.trim()}`);
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  function handleLeaderboard() { navigate("/leaderboard"); }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Tic-Tac-Toe</h1>
      <p className={styles.subtitle}>Multiplayer · Server-Authoritative</p>

      {!loggedIn ? (
        <div className={styles.card}>
          <h2>Enter your name</h2>
          <input
            className={styles.input}
            type="text"
            placeholder="Username (optional)"
            maxLength={20}
            value={username}
            onChange={(e: { target: { value: any; }; }) => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          <button className={styles.btn} onClick={handleLogin} disabled={loading}>
            {loading ? "Connecting…" : "Play"}
          </button>
        </div>
      ) : (
        <div className={styles.card}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={timedMode}
              onChange={e => setTimedMode(e.target.checked)}
            />
            Timed mode (30 s per turn)
          </label>

          <button className={styles.btn} onClick={handleQuickMatch} disabled={loading}>
            {loading ? "Searching…" : "Quick Match"}
          </button>

          <hr className={styles.divider} />

          <button className={`${styles.btn} ${styles.secondary}`} onClick={handleCreateRoom} disabled={loading}>
            Create Private Room
          </button>

          <div className={styles.joinRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
            />
            <button className={`${styles.btn} ${styles.secondary}`} onClick={handleJoinRoom} disabled={loading}>
              Join
            </button>
          </div>

          <hr className={styles.divider} />

          <button className={`${styles.btn} ${styles.ghost}`} onClick={handleLeaderboard}>
            View Leaderboard
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

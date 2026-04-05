// Leaderboard page
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaderboard } from "../components/Leaderboard";
import { getSession, nakamaClient } from "../lib/nakama";
import type { LeaderboardEntry } from "../types";
import styles from "./LeaderboardPage.module.css";

export function LeaderboardPage() {
  const navigate = useNavigate();
  const [entries,  setEntries]  = useState<LeaderboardEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const myUserId = getSession()?.user_id ?? "";

  useEffect(() => {
    const session = getSession();
    if (!session) { navigate("/"); return; }

    nakamaClient
      .rpc(session, "get_leaderboard", "{}")
      .then(res => {
        const { records } = res.payload as { records: LeaderboardEntry[] };
        setEntries(records ?? []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <div className={styles.container}>
      <button className={styles.back} onClick={() => navigate("/")}>← Back</button>
      {loading ? (
        <p className={styles.msg}>Loading…</p>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : (
        <Leaderboard entries={entries} myUserId={myUserId} />
      )}
    </div>
  );
}

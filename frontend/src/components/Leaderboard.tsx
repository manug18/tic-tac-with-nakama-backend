import type { LeaderboardEntry } from "../types";
import styles from "./Leaderboard.module.css";

interface Props {
  entries: LeaderboardEntry[];
  myUserId: string;
}

export function Leaderboard({ entries, myUserId }: Props) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>🏆 Global Leaderboard</h2>
      {entries.length === 0 ? (
        <p className={styles.empty}>No records yet. Play some games!</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.userId} className={e.userId === myUserId ? styles.me : ""}>
                <td>{e.rank}</td>
                <td>{e.username || e.userId.slice(0, 8)}</td>
                <td>{e.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

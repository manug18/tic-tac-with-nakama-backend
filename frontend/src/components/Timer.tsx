import styles from "./Timer.module.css";

interface Props {
  seconds:  number;
  isMyTurn: boolean;
}

export function Timer({ seconds, isMyTurn }: Props) {
  const urgent = seconds <= 10 && seconds > 0;

  return (
    <div className={`${styles.timer} ${urgent ? styles.urgent : ""} ${isMyTurn ? styles.mine : ""}`}>
      <span className={styles.label}>{isMyTurn ? "Your turn" : "Opponent's turn"}</span>
      <span className={styles.countdown}>{seconds}s</span>
    </div>
  );
}

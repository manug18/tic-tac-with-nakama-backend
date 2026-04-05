import type { Board as BoardType, Symbol } from "../types";
import styles from "./Board.module.css";

interface Props {
  board:       BoardType;
  mySymbol:    Symbol | null;
  isMyTurn:    boolean;
  phase:       string;
  onCellClick: (index: number) => void;
}

export function Board({ board, mySymbol, isMyTurn, phase, onCellClick }: Props) {
  const canClick = isMyTurn && phase === "playing";

  return (
    <div className={styles.grid} aria-label="Tic-Tac-Toe board">
      {board.map((cell, i) => (
        <button
          key={i}
          className={`${styles.cell} ${cell ? styles[cell.toLowerCase() as "x" | "o"] : ""} ${canClick && !cell ? styles.clickable : ""}`}
          onClick={() => canClick && !cell && onCellClick(i)}
          disabled={!canClick || !!cell}
          aria-label={cell ? `Cell ${i + 1}: ${cell}` : `Cell ${i + 1}: empty`}
        >
          {cell}
        </button>
      ))}
    </div>
  );
}

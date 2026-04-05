// useCountdown – returns remaining seconds for the current turn timer
import { useEffect, useState } from "react";
import type { ServerState } from "../types";

export function useCountdown(gameState: ServerState | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!gameState || !gameState.timedMode || gameState.phase !== "playing") {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const elapsed  = (Date.now() - gameState.turnStart) / 1000;
      const left     = Math.max(0, gameState.turnTimeSec - elapsed);
      setRemaining(Math.ceil(left));
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [gameState]);

  return remaining;
}

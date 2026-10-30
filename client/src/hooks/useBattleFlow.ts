import { useCallback, useEffect, useRef, useState } from "react";
import type { EncounterState } from "../store/game.store.ts";

/**
 * Keeps the battle screen open from the moment a fight starts until its closing
 * animation finishes, even though the server marks the encounter as over right away.
 */
export function useBattleFlow(status: EncounterState["status"]) {
  const [open, setOpen] = useState(false);
  const [fightKey, setFightKey] = useState(0);
  const previous = useRef<EncounterState["status"]>("idle");

  useEffect(() => {
    if (status === "active" && previous.current !== "active") {
      setFightKey((k) => k + 1);
      setOpen(true);
    }
    previous.current = status;
  }, [status]);

  const close = useCallback(() => setOpen(false), []);
  return { open, fightKey, close };
}

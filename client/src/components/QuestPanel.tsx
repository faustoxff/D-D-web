import React, { useState } from "react";
import type { Quest } from "@dnd/shared";
import { authFetch } from "../lib/auth.ts";

interface Props {
  quest: Quest | null;
  onQuestClaimed: () => void;
}

export default function QuestPanel({ quest, onQuestClaimed }: Props) {
  const [open, setOpen] = useState(true);
  const shell = "w-64 rounded-lg border border-parchment-500/40 bg-dungeon-900/80 p-3 shadow-xl backdrop-blur-sm";

  const handleClaim = async () => {
    if (!quest) return;
    await authFetch(`/api/quests/${quest.id}/claim`, { method: "POST" });
    onQuestClaimed();
  };

  if (!quest) {
    return (
      <div className={shell}>
        <h3 className="text-parchment-400 text-sm font-semibold mb-1">
          📜 Misión Diaria
        </h3>
        <p className="text-parchment-500 text-xs italic">
          No hay misión activa.
        </p>
      </div>
    );
  }

  const progressPercent = Math.round(
    (quest.progress / quest.target_count) * 100,
  );
  const isClaimed = quest.status === "claimed";
  const isCompleted = quest.status === "completed";

  return (
    <div className={`${shell} space-y-2`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="text-parchment-400 text-sm font-semibold">📜 Misión Diaria</h3>
        <span className="text-xs text-parchment-500">
          {quest.progress}/{quest.target_count} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && <p className="text-parchment-200 text-sm">{quest.description}</p>}

      <div>
        <div className="flex justify-between text-xs text-parchment-500 mb-1">
          <span>Progreso</span>
          <span>
            {quest.progress} / {quest.target_count}
          </span>
        </div>
        <div className="h-2 bg-dungeon-900 rounded overflow-hidden">
          <div
            className="h-full bg-parchment-500 rounded transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="text-xs text-parchment-500 flex gap-4">
        <span>+{quest.reward_xp} XP</span>
        <span>+{quest.reward_currency} 💰</span>
      </div>

      {isCompleted && (
        <button
          onClick={handleClaim}
          className="w-full bg-parchment-500 hover:bg-parchment-400 text-dungeon-900 font-bold py-2 rounded text-sm transition-colors"
        >
          ✦ Reclamar Recompensa
        </button>
      )}

      {isClaimed && (
        <p className="text-green-400 text-xs font-semibold text-center">
          ✓ Recompensa reclamada
        </p>
      )}
    </div>
  );
}

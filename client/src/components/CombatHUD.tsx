import React from "react";
import type { EncounterState } from "../store/game.store.ts";

interface Props {
  encounter: EncounterState;
  onAttack: () => void;
  onFlee: () => void;
  playerHp: number;
  playerMaxHp: number;
}

export default function CombatHUD({
  encounter,
  onAttack,
  onFlee,
  playerHp,
  playerMaxHp,
}: Props) {
  if (encounter.status === "idle") {
    return (
      <div className="bg-dungeon-800 border border-dungeon-600 rounded-lg p-4 text-center">
        <p className="text-parchment-400 text-sm mb-3">
          Estás en La Taberna del Grifo. Los peligros te acechan.
        </p>
        <button
          onClick={onAttack}
          className="w-full bg-red-800 hover:bg-red-700 text-parchment-200 font-bold py-3 rounded transition-colors text-lg"
        >
          ⚔ ¡Buscar Combate!
        </button>
      </div>
    );
  }

  if (encounter.status !== "active") {
    const outcomeColor =
      encounter.status === "won"
        ? "text-green-400"
        : encounter.status === "lost"
          ? "text-red-400"
          : "text-yellow-400";
    const outcomeText =
      encounter.status === "won"
        ? "¡Victoria!"
        : encounter.status === "lost"
          ? "Has sido derrotado."
          : "Escapaste del combate.";

    return (
      <div className="bg-dungeon-800 border border-dungeon-600 rounded-lg p-4 text-center">
        <p className={`text-xl font-bold mb-3 ${outcomeColor}`}>{outcomeText}</p>
        <button
          onClick={onAttack}
          className="w-full bg-red-800 hover:bg-red-700 text-parchment-200 font-bold py-3 rounded transition-colors text-lg"
        >
          ⚔ ¡Buscar Nuevo Enemigo!
        </button>
      </div>
    );
  }

  const enemyHpPercent = Math.round(
    (encounter.enemyHp / encounter.enemyMaxHp) * 100,
  );
  const playerHpPercent = Math.round((playerHp / playerMaxHp) * 100);
  const isPlayerTurn = encounter.turn === "player";

  return (
    <div className="bg-dungeon-800 border border-red-900 rounded-lg p-4 space-y-4">
      <div className="text-center">
        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">
          ⚔ COMBATE — Ronda {encounter.round}
        </span>
      </div>

      {/* Enemy HP */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-red-300 font-semibold">{encounter.enemyName}</span>
          <span className="text-parchment-400">
            {encounter.enemyHp} / {encounter.enemyMaxHp} HP
          </span>
        </div>
        <div className="h-3 bg-dungeon-900 rounded overflow-hidden">
          <div
            className="h-full bg-red-700 rounded transition-all"
            style={{ width: `${enemyHpPercent}%` }}
          />
        </div>
      </div>

      {/* Player HP in combat */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-parchment-300 font-semibold">Tú</span>
          <span className="text-parchment-400">
            {playerHp} / {playerMaxHp} HP
          </span>
        </div>
        <div className="h-3 bg-dungeon-900 rounded overflow-hidden">
          <div
            className={`h-full rounded transition-all ${
              playerHpPercent > 50
                ? "bg-green-600"
                : playerHpPercent > 25
                  ? "bg-yellow-600"
                  : "bg-red-600"
            }`}
            style={{ width: `${playerHpPercent}%` }}
          />
        </div>
      </div>

      <div className="text-center text-xs text-parchment-500">
        {isPlayerTurn ? "🟢 Tu turno" : "🔴 Turno del enemigo..."}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onAttack}
          disabled={!isPlayerTurn}
          className="bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-parchment-200 font-bold py-3 rounded transition-colors"
        >
          ⚔ Atacar
        </button>
        <button
          onClick={onFlee}
          disabled={!isPlayerTurn}
          className="bg-dungeon-700 hover:bg-dungeon-600 disabled:opacity-40 disabled:cursor-not-allowed text-parchment-400 hover:text-parchment-200 font-bold py-3 rounded transition-colors"
        >
          🏃 Huir
        </button>
      </div>
    </div>
  );
}

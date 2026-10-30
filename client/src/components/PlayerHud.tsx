import React, { useState } from "react";
import { CLASSES, RACES, abilityModifier, xpToNextLevel, type Character } from "@dnd/shared";

interface Props {
  character: Character;
}

const STATS: Array<[keyof Character, string]> = [
  ["str", "FUE"],
  ["dex", "DES"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "SAB"],
  ["cha", "CAR"],
];

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-black/60">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** Compact character panel; click the header to reveal the full ability scores. */
export default function PlayerHud({ character }: Props) {
  const [open, setOpen] = useState(false);
  const hpPercent = (character.hp / Math.max(1, character.max_hp)) * 100;
  const xpNeeded = xpToNextLevel(character.level);
  const xpPercent = (character.xp / xpNeeded) * 100;
  const hpColor = hpPercent > 50 ? "bg-green-500" : hpPercent > 25 ? "bg-yellow-500" : "bg-red-600";

  return (
    <div className="w-64 rounded-lg border border-parchment-500/40 bg-dungeon-900/80 p-3 shadow-xl backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between text-left"
        title="Ver atributos"
      >
        <div className="min-w-0">
          <div className="truncate font-bold text-parchment-200">{character.name}</div>
          <div className="text-xs text-parchment-500">
            Nv.{character.level} {RACES[character.race]?.label ?? character.race}{" "}
            {CLASSES[character.class]?.label ?? character.class}
          </div>
        </div>
        <span className="text-xs text-parchment-500">{open ? "▲" : "▼"}</span>
      </button>

      <div className="mt-2 space-y-1.5">
        <div>
          <div className="mb-0.5 flex justify-between text-[11px] text-parchment-400">
            <span>PV</span>
            <span>
              {character.hp} / {character.max_hp}
            </span>
          </div>
          <Bar percent={hpPercent} color={hpColor} />
        </div>
        <div>
          <div className="mb-0.5 flex justify-between text-[11px] text-parchment-400">
            <span>XP</span>
            <span>
              {character.xp} / {xpNeeded}
            </span>
          </div>
          <Bar percent={xpPercent} color="bg-sky-500" />
        </div>
        <div className="text-xs text-parchment-300">💰 {character.currency}</div>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {STATS.map(([key, label]) => {
            const value = character[key] as number;
            const mod = abilityModifier(value);
            return (
              <div key={key} className="rounded bg-black/40 p-1.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-parchment-500">{label}</div>
                <div className="font-bold text-parchment-200">{value}</div>
                <div className="text-[10px] text-parchment-400">{mod >= 0 ? `+${mod}` : mod}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

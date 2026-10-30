import React from "react";
import {
  INVENTORY_SLOTS,
  RECIPES,
  ITEM_CATALOG,
  SKILL_IDS,
  SKILLS,
  iconFor,
  levelForXp,
  totalLevel,
  xpForLevel,
  emptySkills,
} from "@dnd/shared";
import { useGameStore } from "../store/game.store.ts";

const shell =
  "w-64 rounded-lg border border-parchment-500/40 bg-dungeon-900/85 p-3 shadow-xl backdrop-blur-sm";

function InventoryPanel({ onUse }: { onUse: (inventoryItemId: string) => void }) {
  const inventory = useGameStore((s) => s.inventory);
  const slots = Array.from({ length: INVENTORY_SLOTS }, (_, i) => inventory[i] ?? null);

  return (
    <div className={shell}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-title text-sm font-bold text-parchment-200">🎒 Mochila</h3>
        <span className="text-xs text-parchment-400">
          {inventory.length}/{INVENTORY_SLOTS}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((entry, i) => {
          const name = entry?.item?.name ?? "";
          const def = ITEM_CATALOG[name];
          const edible = def?.kind === "food" || def?.kind === "potion";
          const cookable = RECIPES.some((r) => r.raw === name);
          return (
            <button
              key={entry?.id ?? `empty-${i}`}
              type="button"
              disabled={!entry}
              onClick={() => entry && (edible || cookable) && onUse(entry.id)}
              title={entry ? `${name}${def ? ` — ${def.description}` : ""}${edible ? "\nClic para usar" : cookable ? "\nClic cerca de una fogata para cocinar" : ""}` : "Espacio vacío"}
              className={`relative flex h-9 items-center justify-center rounded border text-xl transition ${
                entry
                  ? `border-parchment-500/40 bg-black/45 hover:border-parchment-300 hover:bg-black/60 ${edible || cookable ? "cursor-pointer" : "cursor-default"}`
                  : "border-white/5 bg-black/25"
              }`}
            >
              {entry && iconFor(name)}
              {entry && entry.quantity > 1 && (
                <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-yellow-200 [text-shadow:0_1px_2px_#000]">
                  {entry.quantity}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-parchment-500">Comida y pociones: clic para usar. Pescado crudo: clic junto a una fogata.</p>
    </div>
  );
}

function SkillsPanel() {
  const skills = useGameStore((s) => s.skills) ?? emptySkills();

  return (
    <div className={shell}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-title text-sm font-bold text-parchment-200">📈 Habilidades</h3>
        <span className="text-xs text-parchment-400">Total {totalLevel(skills)}</span>
      </div>
      <div className="space-y-2.5">
        {SKILL_IDS.map((id) => {
          const { xp } = skills[id];
          const level = levelForXp(xp);
          const base = xpForLevel(level);
          const next = xpForLevel(level + 1);
          const pct = level >= 99 ? 100 : ((xp - base) / Math.max(1, next - base)) * 100;
          return (
            <div key={id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-parchment-100">
                  {SKILLS[id].icon} {SKILLS[id].label}
                </span>
                <span className="font-bold tabular-nums text-parchment-200">{level}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-0.5 text-right text-[10px] tabular-nums text-parchment-500">
                {xp.toLocaleString()} XP{level < 99 ? ` · faltan ${(next - xp).toLocaleString()}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Slide-in side panels toggled from the HUD (I = mochila, K = habilidades). */
export default function SidePanels({ onUseItem }: { onUseItem: (inventoryItemId: string) => void }) {
  const panel = useGameStore((s) => s.panel);
  if (panel === "inventory") return <InventoryPanel onUse={onUseItem} />;
  if (panel === "skills") return <SkillsPanel />;
  return null;
}

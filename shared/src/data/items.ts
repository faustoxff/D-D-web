import type { SkillId } from "./skills.js";

export type ToolType = "axe" | "pickaxe" | "rod";
export type ItemKind = "tool" | "resource" | "food" | "potion" | "junk";

export interface ItemDef {
  name: string;
  icon: string;
  kind: ItemKind;
  description: string;
  /** Gold to buy it from a shop; 0 = not sold in shops. */
  cost: number;
  /** Gold a shop pays when you sell it. */
  sellValue: number;
  tool?: ToolType;
  /** Dice expression restored when eaten (works with the rules engine's roller). */
  heal?: string;
}

const items: ItemDef[] = [
  { name: "Hacha de bronce", icon: "🪓", kind: "tool", tool: "axe", cost: 30, sellValue: 10, description: "Para talar árboles." },
  { name: "Pico de bronce", icon: "⛏️", kind: "tool", tool: "pickaxe", cost: 30, sellValue: 10, description: "Para picar vetas de mineral." },
  { name: "Caña de pescar", icon: "🎣", kind: "tool", tool: "rod", cost: 25, sellValue: 8, description: "Para pescar en la orilla." },

  { name: "Troncos", icon: "🪵", kind: "resource", cost: 0, sellValue: 4, description: "Madera de un árbol común." },
  { name: "Troncos de pino", icon: "🪵", kind: "resource", cost: 0, sellValue: 14, description: "Madera de pino, más dura." },
  { name: "Troncos de abeto", icon: "🪵", kind: "resource", cost: 0, sellValue: 28, description: "Madera de abeto helado." },

  { name: "Mineral de cobre", icon: "🟠", kind: "resource", cost: 0, sellValue: 6, description: "Mineral de cobre sin refinar." },
  { name: "Mineral de estaño", icon: "⚪", kind: "resource", cost: 0, sellValue: 6, description: "Mineral de estaño sin refinar." },
  { name: "Mineral de hierro", icon: "🔩", kind: "resource", cost: 0, sellValue: 18, description: "Mineral de hierro sin refinar." },
  { name: "Carbón", icon: "⚫", kind: "resource", cost: 0, sellValue: 30, description: "Combustible para la forja." },
  { name: "Mineral de oro", icon: "🟡", kind: "resource", cost: 0, sellValue: 60, description: "Brilla incluso en la oscuridad." },

  { name: "Camarones crudos", icon: "🦐", kind: "resource", cost: 0, sellValue: 3, description: "Hay que cocinarlos en una fogata." },
  { name: "Trucha cruda", icon: "🐟", kind: "resource", cost: 0, sellValue: 10, description: "Hay que cocinarla en una fogata." },
  { name: "Salmón crudo", icon: "🐠", kind: "resource", cost: 0, sellValue: 20, description: "Hay que cocinarlo en una fogata." },

  { name: "Camarones cocidos", icon: "🍤", kind: "food", heal: "0d1+3", cost: 0, sellValue: 6, description: "Restaura 3 PV." },
  { name: "Trucha cocida", icon: "🍖", kind: "food", heal: "0d1+7", cost: 0, sellValue: 18, description: "Restaura 7 PV." },
  { name: "Salmón cocido", icon: "🍣", kind: "food", heal: "0d1+10", cost: 0, sellValue: 34, description: "Restaura 10 PV." },
  { name: "Pescado quemado", icon: "🔥", kind: "junk", cost: 0, sellValue: 0, description: "Se te pasó de fuego." },

  { name: "Poción de Curación", icon: "🧪", kind: "potion", heal: "2d6", cost: 25, sellValue: 8, description: "Restaura 2d6 puntos de golpe." },
];

export const ITEM_CATALOG: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.name, i]));
export const ITEM_LIST: ItemDef[] = items;

export const STARTER_KIT = ["Hacha de bronce", "Pico de bronce", "Caña de pescar"] as const;
export const INVENTORY_SLOTS = 28;

export function iconFor(itemName: string): string {
  return ITEM_CATALOG[itemName]?.icon ?? "📦";
}

export interface Recipe {
  raw: string;
  cooked: string;
  level: number;
  xp: number;
  /** Chance to burn at the required level; it drops as the cook levels up. */
  burnBase: number;
}

export const RECIPES: Recipe[] = [
  { raw: "Camarones crudos", cooked: "Camarones cocidos", level: 1, xp: 30, burnBase: 0.45 },
  { raw: "Trucha cruda", cooked: "Trucha cocida", level: 15, xp: 70, burnBase: 0.5 },
  { raw: "Salmón crudo", cooked: "Salmón cocido", level: 25, xp: 90, burnBase: 0.55 },
];

export function burnChance(recipe: Recipe, cookingLevel: number): number {
  return Math.max(0.03, recipe.burnBase - (cookingLevel - recipe.level) * 0.035);
}

export function skillForTool(tool: ToolType): SkillId {
  return tool === "axe" ? "woodcutting" : tool === "pickaxe" ? "mining" : "fishing";
}

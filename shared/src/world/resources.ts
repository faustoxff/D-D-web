import { hash2 } from "./noise.js";
import { CAPITAL_ORIGIN, WORLD_LAMPS, WORLD_HEIGHT, WORLD_WIDTH, biomeAt, tileAt } from "./world.js";
import type { SkillId } from "../data/skills.js";
import type { ToolType } from "../data/items.js";

export type ResourceKind = "tree" | "rock" | "fish";
export type GatherAction = "chop" | "mine" | "fish";

export interface ResourceDef {
  id: string;
  kind: ResourceKind;
  name: string;
  skill: SkillId;
  level: number;
  xp: number;
  item: string;
  tool: ToolType;
  action: GatherAction;
  /** How long a node stays exhausted. */
  respawnMs: number;
  /** Chance the node is used up after a successful gather. */
  depleteChance: number;
}

const def = (d: ResourceDef) => d;

export const RESOURCES: Record<string, ResourceDef> = {
  tree_normal: def({ id: "tree_normal", kind: "tree", name: "Árbol", skill: "woodcutting", level: 1, xp: 25, item: "Troncos", tool: "axe", action: "chop", respawnMs: 12_000, depleteChance: 0.35 }),
  tree_pine: def({ id: "tree_pine", kind: "tree", name: "Pino", skill: "woodcutting", level: 15, xp: 45, item: "Troncos de pino", tool: "axe", action: "chop", respawnMs: 18_000, depleteChance: 0.3 }),
  tree_fir: def({ id: "tree_fir", kind: "tree", name: "Abeto", skill: "woodcutting", level: 30, xp: 80, item: "Troncos de abeto", tool: "axe", action: "chop", respawnMs: 28_000, depleteChance: 0.3 }),

  ore_copper: def({ id: "ore_copper", kind: "rock", name: "Veta de cobre", skill: "mining", level: 1, xp: 18, item: "Mineral de cobre", tool: "pickaxe", action: "mine", respawnMs: 6_000, depleteChance: 1 }),
  ore_tin: def({ id: "ore_tin", kind: "rock", name: "Veta de estaño", skill: "mining", level: 1, xp: 18, item: "Mineral de estaño", tool: "pickaxe", action: "mine", respawnMs: 6_000, depleteChance: 1 }),
  ore_iron: def({ id: "ore_iron", kind: "rock", name: "Veta de hierro", skill: "mining", level: 15, xp: 35, item: "Mineral de hierro", tool: "pickaxe", action: "mine", respawnMs: 12_000, depleteChance: 1 }),
  ore_coal: def({ id: "ore_coal", kind: "rock", name: "Veta de carbón", skill: "mining", level: 30, xp: 50, item: "Carbón", tool: "pickaxe", action: "mine", respawnMs: 20_000, depleteChance: 1 }),
  ore_gold: def({ id: "ore_gold", kind: "rock", name: "Veta de oro", skill: "mining", level: 40, xp: 65, item: "Mineral de oro", tool: "pickaxe", action: "mine", respawnMs: 40_000, depleteChance: 1 }),

  fish_shrimp: def({ id: "fish_shrimp", kind: "fish", name: "Banco de camarones", skill: "fishing", level: 1, xp: 10, item: "Camarones crudos", tool: "rod", action: "fish", respawnMs: 0, depleteChance: 0 }),
  fish_trout: def({ id: "fish_trout", kind: "fish", name: "Banco de truchas", skill: "fishing", level: 20, xp: 50, item: "Trucha cruda", tool: "rod", action: "fish", respawnMs: 0, depleteChance: 0 }),
  fish_salmon: def({ id: "fish_salmon", kind: "fish", name: "Banco de salmones", skill: "fishing", level: 30, xp: 70, item: "Salmón crudo", tool: "rod", action: "fish", respawnMs: 0, depleteChance: 0 }),
};

export type TreeModel = "oak" | "pine" | "snowPine" | "cactus" | "dead";

/** Which tree model a `tree` tile is drawn with; the renderer and the resource rules both use this. */
export function treeModelAt(x: number, y: number): TreeModel {
  const biome = biomeAt(x, y);
  if (biome === "snow") return "snowPine";
  if (biome === "desert") return "cactus";
  if (biome === "swamp") return "dead";
  if (biome === "forest" || biome === "mountain") return hash2(x, y, 4242) > 0.3 ? "pine" : "oak";
  return "oak";
}

export const ORE_IDS = ["ore_copper", "ore_tin", "ore_iron", "ore_coal", "ore_gold"] as const;

export function oreAt(x: number, y: number): (typeof ORE_IDS)[number] {
  let h = hash2(x, y, 777);
  // Around the starting tavern only the beginner ores appear (copper and tin)
  if (Math.hypot(x - CAPITAL_ORIGIN.x - 15, y - CAPITAL_ORIGIN.y - 11) < 45) h *= 0.55;
  if (h < 0.34) return "ore_copper";
  if (h < 0.58) return "ore_tin";
  if (h < 0.78) return "ore_iron";
  if (h < 0.92) return "ore_coal";
  return "ore_gold";
}

function isWater(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t === "water" || t === "deepwater";
}

/** A shoreline water tile where fish gather (about 1 in 8 shore tiles). */
export function fishSpotAt(x: number, y: number): ResourceDef | null {
  if (tileAt(x, y) !== "water") return null;
  if (hash2(x, y, 991) >= 0.13) return null;
  const touchesLand =
    !isWater(x - 1, y) || !isWater(x + 1, y) || !isWater(x, y - 1) || !isWater(x, y + 1);
  if (!touchesLand) return null;
  const h = hash2(x, y, 992);
  return RESOURCES[h < 0.62 ? "fish_shrimp" : h < 0.92 ? "fish_trout" : "fish_salmon"] ?? null;
}

/** The gatherable resource on a tile, if any. */
export function resourceAt(x: number, y: number): ResourceDef | null {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return null;
  const tile = tileAt(x, y);
  if (tile === "tree") {
    const model = treeModelAt(x, y);
    if (model === "oak") return RESOURCES["tree_normal"] ?? null;
    if (model === "pine") return RESOURCES["tree_pine"] ?? null;
    if (model === "snowPine") return RESOURCES["tree_fir"] ?? null;
    return null;
  }
  if (tile === "rock") return RESOURCES[oreAt(x, y)] ?? null;
  if (tile === "water") return fishSpotAt(x, y);
  return null;
}

export const GATHER_REACH = 1.9;

export interface NearbyResource {
  tx: number;
  ty: number;
  def: ResourceDef;
}

/** The resource closest to the player, preferring the one they are facing. */
export function findNearbyResource(
  x: number,
  y: number,
  aim?: { x: number; y: number },
  reach = GATHER_REACH,
): NearbyResource | null {
  const len = aim ? Math.hypot(aim.x, aim.y) : 0;
  const ax = aim && len > 0.001 ? aim.x / len : 0;
  const ay = aim && len > 0.001 ? aim.y / len : 0;
  let best: NearbyResource | null = null;
  let bestScore = Infinity;
  const r = Math.ceil(reach);
  for (let ty = Math.floor(y) - r; ty <= Math.floor(y) + r; ty += 1) {
    for (let tx = Math.floor(x) - r; tx <= Math.floor(x) + r; tx += 1) {
      const def = resourceAt(tx, ty);
      if (!def) continue;
      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const score = d - 0.6 * ((dx * ax + dy * ay) / Math.max(d, 0.001));
      if (score < bestScore) {
        bestScore = score;
        best = { tx, ty, def };
      }
    }
  }
  return best;
}

export const COOK_REACH = 2.3;

/** A fire (campfire or hearth) close enough to cook on. */
export function findNearbyFire(x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = COOK_REACH;
  for (const lamp of WORLD_LAMPS) {
    if (lamp.kind === "lamp") continue;
    const d = Math.hypot(lamp.x - x, lamp.y - y);
    if (d < bestD) {
      bestD = d;
      best = { x: lamp.x, y: lamp.y };
    }
  }
  return best;
}

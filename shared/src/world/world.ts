import {
  BIOME_IDS,
  TILE_IDS,
  generateWorld,
  type Biome,
  type Direction,
  type EnemyKind,
  type TileId,
  type WorldEnemy,
  type WorldLamp,
  type WorldNpc,
  type WorldTown,
} from "./generate.js";

export { BIOME_IDS, TILE_IDS };
export type { Biome, Direction, EnemyKind, TileId, WorldEnemy, WorldLamp, WorldNpc, WorldTown };

export const WORLD_WIDTH = 256;
export const WORLD_HEIGHT = 256;
export const WORLD_SEED = 20261015;
export const PLAYER_RADIUS = 0.32;
export const CHUNK_SIZE = 16;

const WORLD = generateWorld(WORLD_WIDTH, WORLD_HEIGHT, WORLD_SEED);

/** Raw tile codes (index into TILE_IDS), row-major. */
export const WORLD_TILES: Uint8Array = WORLD.tiles;
/** Raw biome codes (index into BIOME_IDS), row-major. */
export const WORLD_BIOMES: Uint8Array = WORLD.biomes;
export const NPCS: WorldNpc[] = WORLD.npcs;
export const WORLD_ENEMIES: WorldEnemy[] = WORLD.enemies;
export const WORLD_TOWNS: WorldTown[] = WORLD.towns;
export const WORLD_LAMPS: WorldLamp[] = WORLD.lamps;
export const CAPITAL_ORIGIN = WORLD.capitalOrigin;

const BLOCKING_TILES = new Set<TileId>(["wall", "water", "deepwater", "tree", "rock", "house"]);
const BLOCKING_CODES = new Uint8Array(TILE_IDS.length);
TILE_IDS.forEach((id, i) => {
  BLOCKING_CODES[i] = BLOCKING_TILES.has(id) ? 1 : 0;
});

export function tileCodeAt(tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH || tileY >= WORLD_HEIGHT) {
    return TILE_IDS.indexOf("deepwater");
  }
  return WORLD_TILES[tileY * WORLD_WIDTH + tileX] ?? 0;
}

export function tileAt(tileX: number, tileY: number): TileId {
  return TILE_IDS[tileCodeAt(tileX, tileY)] ?? "deepwater";
}

export function biomeAt(tileX: number, tileY: number): Biome {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH || tileY >= WORLD_HEIGHT) return "ocean";
  return BIOME_IDS[WORLD_BIOMES[tileY * WORLD_WIDTH + tileX] ?? 0] ?? "ocean";
}

export function isBlockingTile(tile: TileId): boolean {
  return BLOCKING_TILES.has(tile);
}

function isBlockingCode(code: number): boolean {
  return BLOCKING_CODES[code] === 1;
}

export function hitsBlockedTile(x: number, y: number, radius = PLAYER_RADIUS): boolean {
  const left = Math.floor(x - radius);
  const right = Math.floor(x + radius);
  const top = Math.floor(y - radius);
  const bottom = Math.floor(y + radius);

  return (
    isBlockingCode(tileCodeAt(left, top)) ||
    isBlockingCode(tileCodeAt(right, top)) ||
    isBlockingCode(tileCodeAt(left, bottom)) ||
    isBlockingCode(tileCodeAt(right, bottom))
  );
}

export function hitsNpc(x: number, y: number, radius = PLAYER_RADIUS): boolean {
  return NPCS.some(
    (npc) => Math.abs(npc.x - x) < radius + 0.38 && Math.abs(npc.y - y) < radius + 0.38,
  );
}

export function directionVector(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "north":
      return { x: 0, y: -1 };
    case "south":
      return { x: 0, y: 1 };
    case "west":
      return { x: -1, y: 0 };
    case "east":
      return { x: 1, y: 0 };
  }
}

export function findNearbyNpc(
  x: number,
  y: number,
  facing: Direction,
  /** Exact facing (unit-ish vector); preferred over the 4-way `facing` when given. */
  aim?: { x: number; y: number },
): WorldNpc | null {
  const len = aim ? Math.hypot(aim.x, aim.y) : 0;
  const direction = aim && len > 0.001 ? { x: aim.x / len, y: aim.y / len } : directionVector(facing);
  let best: WorldNpc | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const npc of NPCS) {
    const dx = npc.x - x;
    const dy = npc.y - y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
    const distance = Math.hypot(dx, dy);
    const ahead = dx * direction.x + dy * direction.y > -0.15;

    if (distance <= 1.35 && ahead && distance < bestDistance) {
      best = npc;
      bestDistance = distance;
    }
  }

  return best;
}

export function findTouchedEnemy(
  x: number,
  y: number,
  defeatedEnemyIds: Set<string>,
): WorldEnemy | null {
  for (const enemy of WORLD_ENEMIES) {
    if (Math.abs(enemy.x - x) > 1 || Math.abs(enemy.y - y) > 1) continue;
    if (defeatedEnemyIds.has(enemy.id)) continue;
    if (Math.hypot(enemy.x - x, enemy.y - y) < 0.68) return enemy;
  }
  return null;
}

export function clampToWorld(value: number, axis: "x" | "y"): number {
  const max = axis === "x" ? WORLD_WIDTH - 1.5 : WORLD_HEIGHT - 1.5;
  return Math.max(1.5, Math.min(max, value));
}

// ─── Regions ─────────────────────────────────────────────────────────

const REGION_NAMES: Record<Biome, string> = {
  ocean: "Mar Abierto",
  coast: "Costa Salada",
  plains: "Praderas del Alba",
  forest: "Bosque Susurrante",
  desert: "Desierto Ceniza",
  snow: "Tundra Helada",
  swamp: "Pantano Sombrío",
  mountain: "Cordillera Colmillo",
  town: "Tierras Habitadas",
};

export interface Region {
  name: string;
  biome: Biome;
  town: WorldTown | null;
}

export function regionAt(x: number, y: number): Region {
  const biome = biomeAt(Math.floor(x), Math.floor(y));
  for (const town of WORLD_TOWNS) {
    if (Math.hypot(town.x - x, town.y - y) < town.radius) {
      return { name: town.name, biome, town };
    }
  }
  return { name: REGION_NAMES[biome], biome, town: null };
}

// ─── Server-authoritative movement ───────────────────────────────────

export const WORLD_SPAWN: { readonly x: number; readonly y: number } = WORLD.spawn;
export const MOVE_SPEED = 4.1; // tiles / second

export function canStandAt(x: number, y: number): boolean {
  return !hitsBlockedTile(x, y, PLAYER_RADIUS) && !hitsNpc(x, y, PLAYER_RADIUS);
}

export interface MoveResult {
  ok: boolean;
  x: number;
  y: number;
}

/**
 * Validates a client-reported position against the previous authoritative one.
 * Rejects teleports (more than MOVE_SPEED * elapsed + slack) and blocked tiles.
 */
export function validateMove(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  elapsedSeconds: number,
): MoveResult {
  const nx = clampToWorld(toX, "x");
  const ny = clampToWorld(toY, "y");
  const allowed = MOVE_SPEED * Math.min(elapsedSeconds, 1) * 1.6 + 0.35;

  if (Math.hypot(nx - fromX, ny - fromY) > allowed) {
    return { ok: false, x: fromX, y: fromY };
  }
  if (!canStandAt(nx, ny)) {
    return { ok: false, x: fromX, y: fromY };
  }
  return { ok: true, x: nx, y: ny };
}

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BIOME_IDS,
  CHUNK_SIZE,
  TILE_IDS,
  WORLD_HEIGHT,
  WORLD_LAMPS,
  WORLD_WIDTH,
  biomeAt,
  fishSpotAt,
  hash2,
  resourceAt,
  treeModelAt,
  tileCodeAt,
  valueNoise,
  type Biome,
  type TileId,
  type WorldLamp,
} from "../game/world.ts";

// Builds one chunk (CHUNK_SIZE x CHUNK_SIZE tiles) of the world as three merged,
// vertex-coloured meshes: solid (ground + props), water, and glow (lamps/windows).

type RGB = [number, number, number];

interface Template {
  pos: Float32Array;
  col: Float32Array;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

function rgb(hex: string): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function makeTemplate(parts: Part[]): Template {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.at ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(m);
    const [r, gr, b] = rgb(p.color);
    const count = g.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = r;
      colors[i * 3 + 1] = gr;
      colors[i * 3 + 2] = b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    return g;
  });
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error("template merge failed");
  return {
    pos: merged.getAttribute("position").array as Float32Array,
    col: merged.getAttribute("color").array as Float32Array,
  };
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg);
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0);

const TPL = {
  pine: makeTemplate([
    { geo: box(0.22, 0.7, 0.22), color: "#6b3f1f", at: [0, 0.35, 0] },
    { geo: cone(0.78, 1.0, 6), color: "#1f5f34", at: [0, 0.95, 0] },
    { geo: cone(0.6, 0.9, 6), color: "#2a7339", at: [0, 1.5, 0] },
    { geo: cone(0.4, 0.8, 6), color: "#368a42", at: [0, 2.0, 0] },
  ]),
  snowPine: makeTemplate([
    { geo: box(0.22, 0.7, 0.22), color: "#5a3a22", at: [0, 0.35, 0] },
    { geo: cone(0.78, 1.0, 6), color: "#b9d0dc", at: [0, 0.95, 0] },
    { geo: cone(0.6, 0.9, 6), color: "#d7e6ee", at: [0, 1.5, 0] },
    { geo: cone(0.4, 0.8, 6), color: "#f1f8fc", at: [0, 2.0, 0] },
  ]),
  oak: makeTemplate([
    { geo: box(0.26, 0.9, 0.26), color: "#6b4424", at: [0, 0.45, 0] },
    { geo: ico(0.78), color: "#3b8a3c", at: [0, 1.25, 0], scale: [1, 0.85, 1] },
    { geo: ico(0.5), color: "#4a9a45", at: [0.4, 1.0, 0.15] },
    { geo: ico(0.46), color: "#2f7a35", at: [-0.35, 1.1, -0.25] },
  ]),
  cactus: makeTemplate([
    { geo: box(0.3, 1.2, 0.3), color: "#4f8f4a", at: [0, 0.6, 0] },
    { geo: box(0.45, 0.18, 0.18), color: "#4f8f4a", at: [0.35, 0.65, 0] },
    { geo: box(0.18, 0.45, 0.18), color: "#4f8f4a", at: [0.52, 0.85, 0] },
    { geo: box(0.4, 0.18, 0.18), color: "#4f8f4a", at: [-0.3, 0.45, 0] },
    { geo: box(0.18, 0.35, 0.18), color: "#4f8f4a", at: [-0.45, 0.62, 0] },
  ]),
  dead: makeTemplate([
    { geo: box(0.16, 1.4, 0.16), color: "#4a3a2a", at: [0, 0.7, 0] },
    { geo: box(0.7, 0.1, 0.1), color: "#4a3a2a", at: [0.28, 1.0, 0], rot: [0, 0, 0.5] },
    { geo: box(0.55, 0.1, 0.1), color: "#4a3a2a", at: [-0.22, 1.15, 0.05], rot: [0, 0, -0.6] },
  ]),
  bush: makeTemplate([{ geo: ico(0.34), color: "#3d8a3a", at: [0, 0.28, 0], scale: [1.2, 0.8, 1.2] }]),
  pebble: makeTemplate([{ geo: ico(0.26), color: "#7d776c", at: [0, 0.14, 0], scale: [1.2, 0.7, 1] }]),
  spire: makeTemplate([
    { geo: cone(0.85, 2.6, 5), color: "#6c6c78", at: [0, 1.3, 0] },
    { geo: cone(0.55, 1.6, 5), color: "#7c7c88", at: [0.55, 0.8, 0.3] },
  ]),
  spireSnow: makeTemplate([
    { geo: cone(0.85, 2.6, 5), color: "#6c6c78", at: [0, 1.3, 0] },
    { geo: cone(0.55, 1.6, 5), color: "#7c7c88", at: [0.55, 0.8, 0.3] },
    { geo: cone(0.38, 0.95, 5), color: "#f4f8ff", at: [0, 2.25, 0] },
  ]),
  flowerPink: makeFlowers("#ff9aa8"),
  flowerYellow: makeFlowers("#ffd176"),
  flowerBlue: makeFlowers("#b9d7ff"),
  cube: makeTemplate([{ geo: box(1, 1, 1), color: "#ffffff", at: [0, 0.5, 0] }]),
  stump: makeTemplate([
    { geo: box(0.34, 0.26, 0.34), color: "#6b4424", at: [0, 0.13, 0] },
    { geo: box(0.28, 0.03, 0.28), color: "#c9a06a", at: [0, 0.27, 0] },
  ]),
  roof: makeTemplate([
    { geo: cone(0.7071, 1, 4), color: "#ffffff", at: [0, 0.5, 0], rot: [0, Math.PI / 4, 0] },
  ]),
  flame: makeTemplate([
    { geo: cone(0.18, 0.5, 5), color: "#ff9a3c", at: [0, 0.4, 0] },
    { geo: cone(0.1, 0.35, 5), color: "#ffe08a", at: [0, 0.35, 0] },
  ]),
};

function makeFlowers(color: string): Template {
  const parts: Part[] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = Math.sin(i * 2.1 + 1) * 0.3;
    const z = Math.cos(i * 1.7 + 2) * 0.3;
    parts.push({ geo: box(0.03, 0.2, 0.03), color: "#3f7a34", at: [x, 0.1, z] });
    parts.push({ geo: box(0.1, 0.07, 0.1), color: i % 2 ? "#fff3a8" : color, at: [x, 0.22, z] });
  }
  return makeTemplate(parts);
}

// ─── Geometry accumulator ────────────────────────────────────────────

class Acc {
  pos: number[] = [];
  col: number[] = [];
  /** Per-vertex wind weight: 0 = rigid (ground, walls, houses), 1 = foliage. */
  sw: number[] = [];

  get empty() {
    return this.pos.length === 0;
  }

  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    ca: RGB, cb: RGB, cc: RGB,
  ) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.col.push(...ca, ...cb, ...cc);
    this.sw.push(0, 0, 0);
  }

  /** Horizontal quad, corners ordered (x0,z0) (x1,z0) (x1,z1) (x0,z1), facing up. */
  topQuad(x0: number, z0: number, x1: number, z1: number, y: number, c: [RGB, RGB, RGB, RGB]) {
    this.tri(x0, y, z0, x0, y, z1, x1, y, z0, c[0], c[3], c[1]);
    this.tri(x1, y, z0, x0, y, z1, x1, y, z1, c[1], c[3], c[2]);
  }

  /** Vertical quad between two ground points, dropping from yTop to yBottom. */
  wall(ax: number, az: number, bx: number, bz: number, yTop: number, yBottom: number, c: RGB) {
    this.tri(ax, yTop, az, bx, yTop, bz, ax, yBottom, az, c, c, c);
    this.tri(bx, yTop, bz, bx, yBottom, bz, ax, yBottom, az, c, c, c);
  }

  template(
    tpl: Template,
    x: number,
    y: number,
    z: number,
    rotY: number,
    sx: number,
    sy: number,
    sz: number,
    tint: RGB,
    sway = 0,
  ) {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const n = tpl.pos.length;
    for (let i = 0; i < n; i += 3) {
      const px = tpl.pos[i]! * sx;
      const py = tpl.pos[i + 1]! * sy;
      const pz = tpl.pos[i + 2]! * sz;
      this.pos.push(px * cos + pz * sin + x, py + y, -px * sin + pz * cos + z);
      this.col.push(tpl.col[i]! * tint[0], tpl.col[i + 1]! * tint[1], tpl.col[i + 2]! * tint[2]);
      this.sw.push(sway);
    }
  }

  toMesh(material: THREE.Material, shadows: boolean, boost = 1): THREE.Mesh | null {
    if (this.empty) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(boost === 1 ? this.col : this.col.map((v) => v * boost), 3),
    );
    geometry.setAttribute("sway", new THREE.Float32BufferAttribute(this.sw, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  }
}

// ─── Materials (shared by every chunk) ───────────────────────────────

/** Shared clock for the foliage wind shader; the scene advances it every frame. */
export const windUniform = { value: 0 };

export const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
solidMaterial.onBeforeCompile = (shader) => {
  shader.uniforms["uTime"] = windUniform;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform float uTime;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float lift = sway * clamp(position.y * 0.55, 0.0, 1.0);
      transformed.x += sin(uTime * 1.7 + position.x * 0.8 + position.z * 0.6) * 0.07 * lift;
      transformed.z += cos(uTime * 1.3 + position.x * 0.5 + position.z * 0.9) * 0.05 * lift;`,
    );
};
export const waterMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  transparent: true,
  opacity: 0.9,
});
export const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

// ─── Colours ─────────────────────────────────────────────────────────

const GROUND: Record<string, RGB> = {
  grassPlains: rgb("#5b9b40"),
  grassForest: rgb("#3f7b35"),
  grassCoast: rgb("#6ba54b"),
  stone: rgb("#85806f"),
  dirt: rgb("#8c6239"),
  wood: rgb("#9a6231"),
  sand: rgb("#dcc88c"),
  snow: rgb("#eef3fa"),
  rock: rgb("#5d5d66"),
  swamp: rgb("#4f6332"),
  water: rgb("#2f86a8"),
  deep: rgb("#1c5683"),
};

function groundFor(tile: TileId, biome: Biome): RGB {
  switch (tile) {
    case "stone":
    case "house":
    case "wall":
      return GROUND.stone!;
    case "dirt":
      return GROUND.dirt!;
    case "wood":
      return GROUND.wood!;
    case "sand":
      return GROUND.sand!;
    case "snow":
      return GROUND.snow!;
    case "rock":
      return GROUND.rock!;
    case "swamp":
      return GROUND.swamp!;
    case "tree":
    case "flower":
    case "grass":
    default:
      if (biome === "snow") return GROUND.snow!;
      if (biome === "desert") return GROUND.sand!;
      if (biome === "swamp") return GROUND.swamp!;
      if (biome === "mountain") return GROUND.stone!;
      if (biome === "forest") return GROUND.grassForest!;
      if (biome === "coast") return GROUND.grassCoast!;
      return GROUND.grassPlains!;
  }
}

function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function isWaterTile(code: number): boolean {
  const t = TILE_IDS[code];
  return t === "water" || t === "deepwater";
}

const SEED = 4242;

// Resource nodes that are currently used up ("x,y"); the scene updates this and rebuilds
// the affected chunks so a felled tree shows a stump until it grows back.
let depleted = new Set<string>();
export function setDepletedNodes(next: Set<string>) {
  depleted = next;
}
export function isNodeDepleted(x: number, y: number): boolean {
  return depleted.has(`${x},${y}`);
}

const ORE_TINT: Record<string, RGB> = {
  ore_copper: [1.3, 0.82, 0.55],
  ore_tin: [0.95, 1.02, 1.15],
  ore_iron: [1.12, 0.8, 0.72],
  ore_coal: [0.42, 0.42, 0.48],
  ore_gold: [1.4, 1.18, 0.5],
};

// ─── Lamps indexed by chunk ──────────────────────────────────────────

const lampsByChunk = new Map<string, WorldLamp[]>();
for (const lamp of WORLD_LAMPS) {
  const key = `${Math.floor(lamp.x / CHUNK_SIZE)},${Math.floor(lamp.y / CHUNK_SIZE)}`;
  const list = lampsByChunk.get(key) ?? [];
  list.push(lamp);
  lampsByChunk.set(key, list);
}

const WHITE: RGB = [1, 1, 1];

export interface ChunkMeshes {
  group: THREE.Group;
}

export function buildChunk(cx: number, cy: number): THREE.Group {
  const solid = new Acc();
  const water = new Acc();
  const glow = new Acc();
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;

  for (let y = y0; y < y0 + CHUNK_SIZE; y += 1) {
    for (let x = x0; x < x0 + CHUNK_SIZE; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) continue;
      const code = tileCodeAt(x, y);
      const tile = TILE_IDS[code] ?? "grass";
      const biome = biomeAt(x, y);
      const h = hash2(x, y, SEED);
      const h2 = hash2(x, y, SEED + 1);
      const h3 = hash2(x, y, SEED + 2);

      if (isWaterTile(code)) {
        const base = tile === "deepwater" ? GROUND.deep! : GROUND.water!;
        const k = 0.94 + h * 0.12;
        water.topQuad(x, y, x + 1, y + 1, -0.12, [
          shade(base, k),
          shade(base, k * 1.04),
          shade(base, k),
          shade(base, k * 0.96),
        ]);
        if (tile === "water" && fishSpotAt(x, y)) {
          // Pale ripple rings mark a school of fish
          const ring: RGB = [0.75, 0.92, 1];
          const cx = x + 0.5;
          const cz = y + 0.5;
          water.topQuad(cx - 0.34, cz - 0.34, cx + 0.34, cz - 0.24, -0.105, [ring, ring, ring, ring]);
          water.topQuad(cx - 0.34, cz + 0.24, cx + 0.34, cz + 0.34, -0.105, [ring, ring, ring, ring]);
          water.topQuad(cx - 0.34, cz - 0.24, cx - 0.24, cz + 0.24, -0.105, [ring, ring, ring, ring]);
          water.topQuad(cx + 0.24, cz - 0.24, cx + 0.34, cz + 0.24, -0.105, [ring, ring, ring, ring]);
        }
        continue;
      }

      // Ground tile
      const base = groundFor(tile, biome);
      const k = 0.9 + h * 0.2;
      const corner = (dx: number, dy: number): RGB =>
        shade(base, k * (0.97 + hash2(x + dx, y + dy, SEED + 9) * 0.06));
      solid.topQuad(x, y, x + 1, y + 1, 0, [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]);

      // Banks where land meets water
      const bank = shade(base, 0.55);
      if (isWaterTile(tileCodeAt(x - 1, y))) solid.wall(x, y + 1, x, y, 0, -0.16, bank);
      if (isWaterTile(tileCodeAt(x + 1, y))) solid.wall(x + 1, y, x + 1, y + 1, 0, -0.16, bank);
      if (isWaterTile(tileCodeAt(x, y - 1))) solid.wall(x, y, x + 1, y, 0, -0.16, bank);
      if (isWaterTile(tileCodeAt(x, y + 1))) solid.wall(x + 1, y + 1, x, y + 1, 0, -0.16, bank);

      const px = x + 0.5 + (h2 - 0.5) * 0.3;
      const pz = y + 0.5 + (h3 - 0.5) * 0.3;
      const tint = 0.88 + h * 0.24;
      const tintRGB: RGB = [tint, tint, tint];

      switch (tile) {
        case "tree": {
          const s = 0.85 + h2 * 0.4;
          const rot = h3 * Math.PI * 2;
          const model = treeModelAt(x, y);
          if (depleted.size > 0 && depleted.has(`${x},${y}`) && resourceAt(x, y)) {
            solid.template(TPL.stump, px, 0, pz, rot, s, s, s, tintRGB, 0);
            break;
          }
          const tpl: Template =
            model === "snowPine" ? TPL.snowPine : model === "cactus" ? TPL.cactus : model === "dead" ? TPL.dead : model === "pine" ? TPL.pine : TPL.oak;
          solid.template(tpl, px, 0, pz, rot, s, s, s, tintRGB, model === "cactus" ? 0.25 : 1);
          break;
        }
        case "flower": {
          const tpl = h > 0.66 ? TPL.flowerPink : h > 0.33 ? TPL.flowerYellow : TPL.flowerBlue;
          solid.template(tpl, x + 0.5, 0, y + 0.5, h2 * 6, 1, 1, 1, WHITE, 1.4);
          break;
        }
        case "rock": {
          if (depleted.size > 0 && depleted.has(`${x},${y}`)) {
            solid.template(TPL.pebble, x + 0.3, 0, y + 0.35, h * 6, 1.3, 1.1, 1.3, [0.55, 0.55, 0.58]);
            solid.template(TPL.pebble, x + 0.68, 0, y + 0.6, h2 * 6, 1.0, 0.9, 1.0, [0.5, 0.5, 0.54]);
            break;
          }
          // Coherent noise makes ridges and peaks instead of a uniform spike field
          const peak = valueNoise(x / 4.5, y / 4.5, SEED + 3);
          const width = 0.9 + h2 * 0.6 + peak * 0.5;
          const height = 0.6 + peak * peak * 2.8 + h * 0.5;
          const light = 0.7 + peak * 0.55;
          const tpl = peak > 0.6 ? TPL.spireSnow : TPL.spire;
          const ore = ORE_TINT[resourceAt(x, y)?.id ?? ""] ?? [1, 1, 1];
          const mix = (c: number) => 1 + (c - 1) * 0.75;
          solid.template(tpl, x + 0.5, 0, y + 0.5, h3 * 6, width, height, width, [
            light * mix(ore[0]) * (0.95 + h * 0.1),
            light * mix(ore[1]) * (0.95 + h2 * 0.1),
            light * mix(ore[2]),
          ]);
          break;
        }
        case "wall": {
          const ruinLike = biome !== "town" && biome !== "plains" ? true : false;
          const height = ruinLike ? 0.5 + h * 0.9 : 1.1 + h * 0.25;
          const wc = shade(rgb(ruinLike ? "#8a8274" : "#7a6e60"), 0.85 + h2 * 0.3);
          solid.template(TPL.cube, x + 0.5, 0, y + 0.5, 0, 1, height, 1, wc);
          break;
        }
        case "house": {
          const west = tileCodeAt(x - 1, y) === code;
          const north = tileCodeAt(x, y - 1) === code;
          if (west || north) break;
          const hx = x + 1.5;
          const hz = y + 1.5;
          const variant = hash2(x, y, SEED + 5);
          const wallC = variant > 0.66 ? rgb("#c9b48a") : variant > 0.33 ? rgb("#b8a584") : rgb("#d4c3a0");
          const roofC = variant > 0.66 ? rgb("#8a3b2c") : variant > 0.33 ? rgb("#4a6a8a") : rgb("#7a4a2a");
          solid.template(TPL.cube, hx, 0, hz, 0, 2.7, 1.5, 2.7, wallC);
          solid.template(TPL.roof, hx, 1.5, hz, 0, 3.4, 1.4, 3.4, roofC);
          solid.template(TPL.cube, hx, 0, hz + 1.36, 0, 0.5, 0.9, 0.06, rgb("#4a3020"));
          glow.template(TPL.cube, hx - 0.85, 0.7, hz + 1.37, 0, 0.4, 0.4, 0.05, rgb("#ffd27a"));
          glow.template(TPL.cube, hx + 0.85, 0.7, hz + 1.37, 0, 0.4, 0.4, 0.05, rgb("#ffd27a"));
          break;
        }
        case "grass": {
          if (h3 > 0.985 && biome !== "town") {
            solid.template(TPL.pebble, px, 0, pz, h * 6, 1, 1, 1, tintRGB);
          } else if (h3 < 0.02 && (biome === "forest" || biome === "plains")) {
            solid.template(TPL.bush, px, 0, pz, h * 6, 1, 1, 1, tintRGB, 0.8);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // Lamps, campfires, hearth
  for (const lamp of lampsByChunk.get(`${cx},${cy}`) ?? []) {
    if (lamp.kind === "lamp") {
      solid.template(TPL.cube, lamp.x, 0, lamp.y, 0, 0.08, 1.3, 0.08, rgb("#3a2a1a"));
      glow.template(TPL.cube, lamp.x, 1.3, lamp.y, 0, 0.22, 0.22, 0.22, rgb("#ffd68a"));
    } else if (lamp.kind === "fire") {
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        solid.template(
          TPL.pebble,
          lamp.x + Math.cos(a) * 0.35,
          0,
          lamp.y + Math.sin(a) * 0.35,
          a,
          1,
          1,
          1,
          rgb("#8a847a"),
        );
      }
      glow.template(TPL.flame, lamp.x, 0, lamp.y, 0, 1, 1, 1, WHITE, 2.5);
    } else {
      glow.template(TPL.cube, lamp.x, 0.05, lamp.y, 0, 0.7, 0.18, 0.5, rgb("#ff7a2a"));
    }
  }

  const group = new THREE.Group();
  const solidMesh = solid.toMesh(solidMaterial, true);
  const waterMesh = water.toMesh(waterMaterial, false);
  // >1 so the bloom pass picks lamps, windows and fires up (HDR)
  const glowMesh = glow.toMesh(glowMaterial, false, 3.2);
  if (solidMesh) group.add(solidMesh);
  if (waterMesh) {
    waterMesh.receiveShadow = true;
    group.add(waterMesh);
  }
  if (glowMesh) group.add(glowMesh);
  return group;
}

export function disposeChunk(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

export { BIOME_IDS };

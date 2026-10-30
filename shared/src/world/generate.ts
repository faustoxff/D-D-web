import { clamp01, dist, fbm, hash2, mulberry32, smoothstep } from "./noise.js";

export const TILE_IDS = [
  "grass",
  "stone",
  "water",
  "deepwater",
  "wall",
  "wood",
  "tree",
  "dirt",
  "flower",
  "sand",
  "snow",
  "rock",
  "swamp",
  "house",
] as const;
export type TileId = (typeof TILE_IDS)[number];

export const BIOME_IDS = [
  "ocean",
  "coast",
  "plains",
  "forest",
  "desert",
  "snow",
  "swamp",
  "mountain",
  "town",
] as const;
export type Biome = (typeof BIOME_IDS)[number];

export type Direction = "north" | "south" | "east" | "west";
export type EnemyKind = "Goblin" | "Esqueleto" | "Lobo";

export interface WorldNpc {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Direction;
  color: string;
  dialogue: string[];
  /** Opens the shop when you talk to them. */
  shop?: boolean;
}

export interface WorldEnemy {
  id: string;
  name: EnemyKind;
  x: number;
  y: number;
  level: number;
}

export interface WorldTown {
  id: string;
  name: string;
  /** Center in tile coordinates. */
  x: number;
  y: number;
  radius: number;
}

export interface WorldLamp {
  x: number;
  y: number;
  kind: "lamp" | "hearth" | "fire";
}

export interface WorldData {
  width: number;
  height: number;
  tiles: Uint8Array;
  biomes: Uint8Array;
  towns: WorldTown[];
  npcs: WorldNpc[];
  enemies: WorldEnemy[];
  lamps: WorldLamp[];
  spawn: { x: number; y: number };
  /** Top-left tile of the starting tavern area. */
  capitalOrigin: { x: number; y: number };
}

const T = Object.fromEntries(TILE_IDS.map((t, i) => [t, i])) as Record<TileId, number>;
const B = Object.fromEntries(BIOME_IDS.map((b, i) => [b, i])) as Record<Biome, number>;

const BLOCKING = new Set<number>([T.wall, T.water, T.deepwater, T.tree, T.rock, T.house]);

interface TownSpec {
  id: string;
  name: string;
  tx: number; // target fraction of width
  ty: number;
  npcs: Array<{ name: string; color: string; dx: number; dy: number; lines: string[]; shop?: boolean }>;
}

const TOWN_SPECS: TownSpec[] = [
  {
    id: "robleda",
    name: "Villa Robleda",
    tx: 0.24,
    ty: 0.5,
    npcs: [
      {
        name: "Alcalde Brenn",
        color: "#c9a14a",
        dx: 7,
        dy: 5,
        lines: [
          "Bienvenido a Villa Robleda, viajero.",
          "Los lobos del bosque se acercan cada noche. Necesitamos manos firmes.",
        ],
      },
      {
        name: "Leñadora Tilda",
        color: "#7aa35a",
        dx: 10,
        dy: 8,
        lines: ["El bosque es generoso, pero no perdona descuidos.", "Evita los claros al caer la noche."],
        shop: true,
      },
    ],
  },
  {
    id: "puerto",
    name: "Puerto Sal",
    tx: 0.52,
    ty: 0.84,
    npcs: [
      {
        name: "Capitán Marea",
        color: "#4f8fbf",
        dx: 7,
        dy: 5,
        lines: ["El mar trae de todo: pescado, rumores y problemas.", "Dicen que hay ruinas al este, llenas de huesos que caminan."],
      },
      {
        name: "Mercader Orso",
        color: "#b86b3f",
        dx: 10,
        dy: 8,
        lines: ["Compro, vendo y no hago preguntas.", "Pronto abriré el puesto. Vuelve más tarde."],
        shop: true,
      },
    ],
  },
  {
    id: "helada",
    name: "Fortaleza Helada",
    tx: 0.5,
    ty: 0.14,
    npcs: [
      {
        name: "Comandante Yrsa",
        color: "#9fb8d8",
        dx: 7,
        dy: 5,
        lines: ["El frío mata más rápido que los lobos.", "Si cruzas la tundra, ve abrigado y no te separes del camino."],
      },
      {
        name: "Tendero Holt",
        color: "#d8d8e8",
        dx: 10,
        dy: 8,
        lines: ["Vendo y compro de todo, aunque el frío me congela los dedos.", "Algo se mueve entre la nieve. No es el viento."],
        shop: true,
      },
    ],
  },
  {
    id: "oasis",
    name: "Oasis Dorado",
    tx: 0.8,
    ty: 0.8,
    npcs: [
      {
        name: "Sabia Naji",
        color: "#e0b050",
        dx: 7,
        dy: 5,
        lines: ["El desierto guarda secretos bajo la arena.", "Los esqueletos no descansan... alguien los despertó."],
      },
      {
        name: "Camellero Basil",
        color: "#c98a4a",
        dx: 10,
        dy: 8,
        lines: ["Agua y sombra, eso vale más que el oro aquí."],
        shop: true,
      },
    ],
  },
  {
    id: "cenagosa",
    name: "Aldea Cenagosa",
    tx: 0.2,
    ty: 0.82,
    npcs: [
      {
        name: "Curandera Mora",
        color: "#6f9a6a",
        dx: 7,
        dy: 5,
        lines: ["La ciénaga cura y envenena por igual.", "No bebas el agua quieta, forastero."],
      },
      {
        name: "Pescador Juno",
        color: "#8a8a5a",
        dx: 10,
        dy: 8,
        lines: ["Aquí los goblins roban hasta las redes.", "Si los ahuyentas, te invito a cenar."],
        shop: true,
      },
    ],
  },
  {
    id: "colmillo",
    name: "Paso del Colmillo",
    tx: 0.82,
    ty: 0.34,
    npcs: [
      {
        name: "Herrero Dagan",
        color: "#a0583a",
        dx: 7,
        dy: 5,
        lines: ["Forjo con el hierro de estas montañas.", "Tráeme buen material y te haré un arma digna."],
        shop: true,
      },
      {
        name: "Montañesa Kira",
        color: "#7f8fa8",
        dx: 10,
        dy: 8,
        lines: ["Las cumbres nevadas esconden cuevas antiguas.", "Nadie que subió volvió igual."],
      },
    ],
  },
];

class MinHeap {
  private f: number[] = [];
  private o: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(f: number, order: number, value: number) {
    let i = this.v.length;
    this.f.push(f);
    this.o.push(order);
    this.v.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(p, i)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0]!;
    const lastF = this.f.pop()!;
    const lastO = this.o.pop()!;
    const lastV = this.v.pop()!;
    if (this.v.length > 0) {
      this.f[0] = lastF;
      this.o[0] = lastO;
      this.v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.v.length && !this.less(m, l)) m = l;
        if (r < this.v.length && !this.less(m, r)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    return this.f[a]! < this.f[b]! || (this.f[a]! === this.f[b]! && this.o[a]! <= this.o[b]!);
  }
  private swap(a: number, b: number) {
    [this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!];
    [this.o[a], this.o[b]] = [this.o[b]!, this.o[a]!];
    [this.v[a], this.v[b]] = [this.v[b]!, this.v[a]!];
  }
}

export function generateWorld(W: number, H: number, seed: number): WorldData {
  const tiles = new Uint8Array(W * H);
  const biomes = new Uint8Array(W * H);
  const elev = new Float32Array(W * H);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  const getT = (x: number, y: number) => (inside(x, y) ? tiles[idx(x, y)]! : T.deepwater);
  const setT = (x: number, y: number, t: number) => {
    if (inside(x, y)) tiles[idx(x, y)] = t;
  };
  const setB = (x: number, y: number, b: number) => {
    if (inside(x, y)) biomes[idx(x, y)] = b;
  };

  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);

  // ── 1. Terrain, climate, biomes ────────────────────────────────
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      let e = fbm(x / 56, y / 56, seed, 5) * 1.3 - 0.04;
      e -= smoothstep(0.8, 1.1, d) * 0.7;
      const near = clamp01(1 - dist(x, y, cx, cy) / 42);
      e += (0.52 - e) * near * near;
      elev[idx(x, y)] = e;

      const ridge = 1 - Math.abs(2 * fbm(x / 38, y / 38, seed + 55, 4) - 1);
      const mt = e + (ridge - 0.55) * 0.4 - near * 0.6;

      const t = y / H + (fbm(x / 70, y / 70, seed + 9, 3) - 0.5) * 0.3;
      const m = clamp01((fbm(x / 60, y / 60, seed + 21, 4) - 0.5) * 2.4 + 0.5);
      const h = hash2(x, y, seed + 77);
      const cluster = fbm(x / 9, y / 9, seed + 33, 3);

      let tile = T.grass;
      let biome = B.plains;

      if (e < 0.3) {
        tile = T.deepwater;
        biome = B.ocean;
      } else if (e < 0.36) {
        tile = T.water;
        biome = B.ocean;
      } else if (mt > 0.93 && e > 0.45) {
        tile = T.rock;
        biome = B.mountain;
      } else if (e < 0.4) {
        tile = T.sand;
        biome = B.coast;
      } else if (mt > 0.84) {
        tile = t < 0.25 ? T.snow : T.stone;
        biome = B.mountain;
        if (h < 0.05) tile = T.tree;
      } else if (t < 0.26) {
        tile = T.snow;
        biome = B.snow;
        if (cluster > 0.5 && h < 0.4) tile = T.tree;
      } else if (t > 0.64 && m < 0.5) {
        tile = T.sand;
        biome = B.desert;
        if (h < 0.018) tile = T.tree; // cactus
      } else if (e < 0.56 && m > 0.66) {
        tile = T.swamp;
        biome = B.swamp;
        const pond = fbm(x / 7, y / 7, seed + 91, 3);
        if (pond > 0.64) tile = T.water;
        else if (h < 0.05) tile = T.tree;
      } else if (m > 0.44) {
        tile = T.grass;
        biome = B.forest;
        if (cluster > 0.42 && h < 0.5) tile = T.tree;
      } else {
        tile = T.grass;
        biome = B.plains;
        if (h < 0.025) tile = T.tree;
        else if (h > 0.95) tile = T.flower;
      }

      tiles[idx(x, y)] = tile;
      biomes[idx(x, y)] = biome;
    }
  }

  // ── 2. Rivers (run downhill from the highlands to the sea) ─────
  let riverCount = 0;
  for (let attempt = 0; attempt < 400 && riverCount < 7; attempt += 1) {
    let x = 20 + Math.floor(rng() * (W - 40));
    let y = 20 + Math.floor(rng() * (H - 40));
    if (elev[idx(x, y)]! < 0.62 || getT(x, y) === T.rock) continue;
    if (dist(x, y, cx, cy) < 40) continue;
    riverCount += 1;
    const visited = new Set<number>();
    for (let step = 0; step < 500; step += 1) {
      if (!inside(x, y)) break;
      const i = idx(x, y);
      visited.add(i);
      const t = tiles[i]!;
      if (t === T.deepwater) break;
      if (t !== T.rock) {
        setT(x, y, T.water);
        setT(x + 1, y, getT(x + 1, y) === T.rock ? T.rock : T.water);
        setB(x, y, B.ocean);
      }
      let best = -1;
      let bestScore = Infinity;
      for (let ddy = -1; ddy <= 1; ddy += 1) {
        for (let ddx = -1; ddx <= 1; ddx += 1) {
          if (ddx === 0 && ddy === 0) continue;
          const nx = x + ddx;
          const ny = y + ddy;
          if (!inside(nx, ny) || visited.has(idx(nx, ny))) continue;
          const score = elev[idx(nx, ny)]! + rng() * 0.035;
          if (score < bestScore) {
            bestScore = score;
            best = idx(nx, ny);
          }
        }
      }
      if (best < 0) break;
      x = best % W;
      y = Math.floor(best / W);
      if (elev[best]! < 0.34) break;
    }
  }

  // ── 3. Capital: the original tavern area ───────────────────────
  const ox = cx - 15;
  const oy = cy - 11;
  const fillRect = (sx: number, sy: number, w: number, h: number, tile: number) => {
    for (let y = sy; y < sy + h; y += 1) for (let x = sx; x < sx + w; x += 1) setT(x, y, tile);
  };
  const setBRect = (sx: number, sy: number, w: number, h: number, biome: number) => {
    for (let y = sy; y < sy + h; y += 1) for (let x = sx; x < sx + w; x += 1) setB(x, y, biome);
  };

  fillRect(ox - 5, oy - 5, 40, 32, T.grass);
  setBRect(ox - 5, oy - 5, 40, 32, B.plains);
  setBRect(ox, oy, 30, 22, B.town);

  fillRect(ox + 1, oy + 11, 28, 2, T.stone);
  fillRect(ox + 14, oy + 1, 2, 20, T.stone);
  fillRect(ox + 6, oy + 9, 1, 3, T.stone);
  fillRect(ox + 3, oy + 4, 8, 6, T.wood);
  fillRect(ox + 3, oy + 4, 8, 1, T.wall);
  fillRect(ox + 3, oy + 9, 3, 1, T.wall);
  fillRect(ox + 7, oy + 9, 4, 1, T.wall);
  fillRect(ox + 3, oy + 4, 1, 6, T.wall);
  fillRect(ox + 10, oy + 4, 1, 6, T.wall);
  setT(ox + 6, oy + 9, T.wood);
  fillRect(ox + 22, oy + 2, 6, 6, T.water);
  setT(ox + 22, oy + 2, T.grass);
  setT(ox + 22, oy + 3, T.grass);
  setT(ox + 27, oy + 7, T.grass);
  fillRect(ox + 1, oy + 1, 6, 3, T.tree);
  fillRect(ox + 2, oy + 16, 5, 4, T.tree);
  fillRect(ox + 24, oy + 18, 4, 3, T.tree);
  fillRect(ox + 18, oy + 13, 3, 2, T.wall);
  fillRect(ox + 20, oy + 9, 4, 2, T.dirt);
  for (const [fx, fy] of [
    [11, 15],
    [12, 15],
    [18, 17],
    [19, 18],
  ] as const) {
    setT(ox + fx, oy + fy, T.flower);
  }
  for (const dxx of [8, 9, 10]) setT(ox + dxx, oy + 14, T.dirt);

  // A small outcrop east of the tavern so new players can mine without a long trek
  for (const [rx, ry] of [
    [26, 12],
    [27, 12],
    [28, 12],
    [26, 13],
    [27, 13],
    [27, 14],
  ] as const) {
    setT(ox + rx, oy + ry, T.rock);
    setB(ox + rx, oy + ry, B.mountain);
  }

  const spawn = { x: ox + 6.5, y: oy + 12.5 };

  // ── 4. Towns ───────────────────────────────────────────────────
  const towns: WorldTown[] = [
    { id: "grifo", name: "La Taberna del Grifo", x: ox + 15, y: oy + 12, radius: 18 },
  ];
  const npcs: WorldNpc[] = [
    {
      id: "innkeeper",
      name: "Mirna",
      shop: true,
      x: ox + 6.5,
      y: oy + 7.5,
      facing: "south",
      color: "#d4a843",
      dialogue: [
        "Bienvenido a La Taberna del Grifo.",
        "Los caminos están inquietos. Si ves ojos brillando entre los arbustos, no esperes a que saluden.",
        "Hay pueblos en los cuatro vientos: Villa Robleda al oeste, Puerto Sal al sur, la Fortaleza Helada al norte.",
      ],
    },
    {
      id: "guard",
      name: "Guardia Rurik",
      x: ox + 16.5,
      y: oy + 11.5,
      facing: "west",
      color: "#8fb8ff",
      dialogue: [
        "Los caminos de piedra llevan a todos los pueblos. Quédate en ellos al caer la noche.",
        "Abre el mapa con M para ver el mundo.",
      ],
    },
    {
      id: "herbalist",
      name: "Savia",
      x: ox + 20.5,
      y: oy + 16.5,
      facing: "north",
      color: "#7dd87d",
      dialogue: [
        "El agua marca el límite seguro.",
        "Si vuelves con heridas, busca una poción antes de tentar al destino otra vez.",
      ],
    },
  ];
  const lamps: WorldLamp[] = [
    { x: ox + 5.5, y: oy + 10.4, kind: "lamp" },
    { x: ox + 8.2, y: oy + 10.4, kind: "lamp" },
    { x: ox + 13.4, y: oy + 10.4, kind: "lamp" },
    { x: ox + 16.6, y: oy + 13.6, kind: "lamp" },
    { x: ox + 6.5, y: oy + 6.5, kind: "hearth" },
  ];

  const townCenters = (): Array<{ x: number; y: number }> => towns.map((t) => ({ x: t.x, y: t.y }));
  const SW = 18;
  const SH = 14;

  const siteOk = (x0: number, y0: number): boolean => {
    if (x0 < 6 || y0 < 6 || x0 + SW > W - 6 || y0 + SH > H - 6) return false;
    for (const c of townCenters()) {
      if (dist(x0 + SW / 2, y0 + SH / 2, c.x, c.y) < 45) return false;
    }
    for (let y = y0; y < y0 + SH; y += 1) {
      for (let x = x0; x < x0 + SW; x += 1) {
        const t = getT(x, y);
        if (t === T.water || t === T.deepwater || t === T.rock) return false;
        const e = elev[idx(x, y)]!;
        if (e < 0.4 || e > 0.7) return false;
      }
    }
    return true;
  };

  for (const spec of TOWN_SPECS) {
    const targetX = Math.floor(spec.tx * W);
    const targetY = Math.floor(spec.ty * H);
    let site: { x: number; y: number } | null = null;
    for (let r = 0; r <= 64 && !site; r += 1) {
      for (let dy = -r; dy <= r && !site; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x0 = targetX + dx - SW / 2;
          const y0 = targetY + dy - SH / 2;
          if (siteOk(x0, y0)) {
            site = { x: x0, y: y0 };
            break;
          }
        }
      }
    }
    if (!site) continue;

    const { x: x0, y: y0 } = site;
    const base = biomes[idx(x0 + 9, y0 + 7)] ?? B.plains;
    const ground = base === B.snow ? T.snow : base === B.desert || base === B.coast ? T.sand : T.grass;
    fillRect(x0 - 3, y0 - 3, SW + 6, SH + 6, ground);
    setBRect(x0 - 2, y0 - 2, SW + 4, SH + 4, B.town);
    fillRect(x0 + 8, y0, 2, SH, T.dirt);
    fillRect(x0, y0 + 6, SW, 2, T.dirt);
    fillRect(x0 + 6, y0 + 4, 6, 6, T.stone);
    for (const [hx, hy] of [
      [1, 1],
      [14, 1],
      [1, 10],
      [14, 10],
    ] as const) {
      fillRect(x0 + hx, y0 + hy, 3, 3, T.house);
    }

    towns.push({ id: spec.id, name: spec.name, x: x0 + 9, y: y0 + 7, radius: 15 });
    for (const [lx, ly] of [
      [6.5, 3.5],
      [11.5, 3.5],
      [6.5, 10.5],
      [11.5, 10.5],
    ] as const) {
      lamps.push({ x: x0 + lx, y: y0 + ly, kind: "lamp" });
    }
    spec.npcs.forEach((n, i) => {
      npcs.push({
        id: `${spec.id}-${i}`,
        name: n.name,
        x: x0 + n.dx + 0.5,
        y: y0 + n.dy + 0.5,
        facing: i === 0 ? "south" : "west",
        color: n.color,
        dialogue: n.lines,
        ...(n.shop ? { shop: true } : {}),
      });
    });
  }

  // ── 5. Roads (A* from the capital to every town, bridges over water) ──
  const tileCost = (t: number): number => {
    switch (t) {
      case T.stone:
      case T.wood:
        return 0.8;
      case T.dirt:
        return 0.7;
      case T.swamp:
        return 2;
      case T.snow:
        return 1.3;
      case T.tree:
        return 5;
      case T.water:
        return 7;
      case T.wall:
      case T.house:
      case T.rock:
      case T.deepwater:
        return Infinity;
      default:
        return 1;
    }
  };

  const findPath = (sx: number, sy: number, gx: number, gy: number): number[] | null => {
    const gScore = new Float32Array(W * H).fill(Infinity);
    const came = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const heap = new MinHeap();
    let order = 0;
    const start = idx(sx, sy);
    const goal = idx(gx, gy);
    gScore[start] = 0;
    heap.push(0, order++, start);
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) {
        const path: number[] = [];
        for (let c = cur; c !== -1; c = came[c]!) path.push(c);
        return path.reverse();
      }
      const x = cur % W;
      const y = Math.floor(cur / W);
      for (const [ddx, ddy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + ddx;
        const ny = y + ddy;
        if (!inside(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (closed[ni]) continue;
        const cost = tileCost(tiles[ni]!);
        if (cost === Infinity) continue;
        const g = gScore[cur]! + cost;
        if (g < gScore[ni]!) {
          gScore[ni] = g;
          came[ni] = cur;
          const h = (Math.abs(nx - gx) + Math.abs(ny - gy)) * 0.7;
          heap.push(g + h, order++, ni);
        }
      }
    }
    return null;
  };

  const hub = towns[0]!;
  for (const town of towns.slice(1)) {
    const path = findPath(hub.x, hub.y, town.x, town.y);
    if (!path) continue;
    for (const i of path) {
      const x = i % W;
      const y = Math.floor(i / W);
      const t = tiles[i]!;
      if (t === T.water) tiles[i] = T.wood;
      else if (t === T.stone || t === T.wood || t === T.house || t === T.wall) continue;
      else tiles[i] = T.dirt;
      if (biomes[i] === B.ocean) setB(x, y, B.plains);
    }
  }

  // ── 6. Points of interest + enemies ────────────────────────────
  const enemies: WorldEnemy[] = [];
  let enemyCounter = 0;
  const levelAt = (x: number, y: number) => 1 + Math.min(7, Math.floor(dist(x, y, cx, cy) / 26));
  const standable = (x: number, y: number) => !BLOCKING.has(getT(Math.floor(x), Math.floor(y)));
  const nearTown = (x: number, y: number, margin: number) =>
    towns.some((t) => dist(x, y, t.x, t.y) < t.radius + margin);

  const addEnemy = (name: EnemyKind, x: number, y: number) => {
    enemyCounter += 1;
    enemies.push({
      id: `enemy-${String(enemyCounter).padStart(3, "0")}`,
      name,
      x,
      y,
      level: levelAt(x, y),
    });
  };

  // Starter enemies around the capital keep the original encounters
  addEnemy("Goblin", ox + 21.5, oy + 6.5);
  addEnemy("Esqueleto", ox + 24.5, oy + 16.5);
  addEnemy("Lobo", ox + 10.5, oy + 18.5);
  for (const e of enemies) e.level = 1;

  const clearArea = (x0: number, y0: number, w: number, h: number, ground: number) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const t = getT(x, y);
        if (t !== T.water && t !== T.deepwater && t !== T.rock) setT(x, y, ground);
      }
    }
  };

  const areaFree = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const t = getT(x, y);
        if (t === T.water || t === T.deepwater || t === T.rock || t === T.house) return false;
        if (biomes[idx(x, y)] === B.town) return false;
      }
    }
    return !nearTown(x0 + w / 2, y0 + h / 2, 14);
  };

  // Ruins with skeletons
  let ruins = 0;
  for (let attempt = 0; attempt < 600 && ruins < 8; attempt += 1) {
    const x0 = 10 + Math.floor(rng() * (W - 24));
    const y0 = 10 + Math.floor(rng() * (H - 24));
    if (!areaFree(x0, y0, 7, 7)) continue;
    ruins += 1;
    clearArea(x0 - 1, y0 - 1, 9, 9, T.stone);
    for (let k = 0; k < 7; k += 1) {
      for (const [rx, ry] of [
        [k, 0],
        [k, 6],
        [0, k],
        [6, k],
      ] as const) {
        if (hash2(x0 + rx, y0 + ry, seed + 5) < 0.3) continue;
        setT(x0 + rx, y0 + ry, T.wall);
      }
    }
    addEnemy("Esqueleto", x0 + 2.5, y0 + 3.5);
    addEnemy("Esqueleto", x0 + 4.5, y0 + 3.5);
    lamps.push({ x: x0 + 3.5, y: y0 + 3.5, kind: "fire" });
  }

  // Goblin camps
  let camps = 0;
  for (let attempt = 0; attempt < 600 && camps < 8; attempt += 1) {
    const x0 = 10 + Math.floor(rng() * (W - 24));
    const y0 = 10 + Math.floor(rng() * (H - 24));
    if (!areaFree(x0, y0, 6, 6)) continue;
    const biome = biomes[idx(x0 + 3, y0 + 3)];
    if (biome === B.snow || biome === B.desert) continue;
    camps += 1;
    clearArea(x0 - 1, y0 - 1, 8, 8, T.dirt);
    addEnemy("Goblin", x0 + 1.5, y0 + 1.5);
    addEnemy("Goblin", x0 + 4.5, y0 + 2.5);
    addEnemy("Goblin", x0 + 2.5, y0 + 4.5);
    lamps.push({ x: x0 + 3, y: y0 + 3, kind: "fire" });
  }

  // Wolf dens in forests and snow
  let dens = 0;
  for (let attempt = 0; attempt < 800 && dens < 8; attempt += 1) {
    const x0 = 10 + Math.floor(rng() * (W - 24));
    const y0 = 10 + Math.floor(rng() * (H - 24));
    const biome = biomes[idx(x0, y0)];
    if (biome !== B.forest && biome !== B.snow) continue;
    if (!areaFree(x0, y0, 6, 6)) continue;
    dens += 1;
    clearArea(x0, y0, 6, 6, biome === B.snow ? T.snow : T.grass);
    addEnemy("Lobo", x0 + 1.5, y0 + 1.5);
    addEnemy("Lobo", x0 + 4.5, y0 + 2.5);
    addEnemy("Lobo", x0 + 2.5, y0 + 4.5);
  }

  // Wanderers by biome
  const kindForBiome = (biome: number, r: number): EnemyKind | null => {
    switch (biome) {
      case B.plains:
        return r < 0.6 ? "Goblin" : "Lobo";
      case B.forest:
        return r < 0.7 ? "Lobo" : "Goblin";
      case B.desert:
        return r < 0.8 ? "Esqueleto" : "Goblin";
      case B.snow:
        return r < 0.8 ? "Lobo" : "Esqueleto";
      case B.swamp:
        return r < 0.5 ? "Goblin" : "Esqueleto";
      case B.mountain:
        return r < 0.6 ? "Esqueleto" : "Goblin";
      default:
        return null;
    }
  };

  let wanderers = 0;
  for (let attempt = 0; attempt < 4000 && wanderers < 110; attempt += 1) {
    const x = 6 + Math.floor(rng() * (W - 12)) + 0.5;
    const y = 6 + Math.floor(rng() * (H - 12)) + 0.5;
    if (!standable(x, y)) continue;
    if (nearTown(x, y, 8)) continue;
    const kind = kindForBiome(biomes[idx(Math.floor(x), Math.floor(y))]!, rng());
    if (!kind) continue;
    if (enemies.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) continue;
    addEnemy(kind, x, y);
    wanderers += 1;
  }

  // Keep only enemies the player can actually walk to from the spawn point
  const reach = new Uint8Array(W * H);
  const queue = [idx(Math.floor(spawn.x), Math.floor(spawn.y))];
  reach[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head]!;
    const x = cur % W;
    const y = Math.floor(cur / W);
    for (const [ddx, ddy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + ddx;
      const ny = y + ddy;
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (reach[ni] || BLOCKING.has(tiles[ni]!)) continue;
      reach[ni] = 1;
      queue.push(ni);
    }
  }
  const safeEnemies = enemies.filter(
    (e) => standable(e.x, e.y) && reach[idx(Math.floor(e.x), Math.floor(e.y))] === 1,
  );

  return {
    width: W,
    height: H,
    tiles,
    biomes,
    towns,
    npcs: npcs.filter((n) => standable(n.x, n.y)),
    enemies: safeEnemies,
    lamps,
    spawn,
    capitalOrigin: { x: ox, y: oy },
  };
}

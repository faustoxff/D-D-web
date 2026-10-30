import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  RESOURCES,
  WORLD_LAMPS,
  WORLD_SPAWN,
  emptySkills,
  levelForXp,
  oreAt,
  resourceAt,
  tileAt,
  xpForLevel,
  type SkillId,
  type SkillSet,
  type ToolType,
} from "@dnd/shared";
import { GatheringSystem, gatherChance, type GatherHost } from "./gathering";

// ── A tiny in-memory world ────────────────────────────────────────────

function findTile(pred: (x: number, y: number) => boolean) {
  for (let y = 5; y < 250; y += 1) for (let x = 5; x < 250; x += 1) if (pred(x, y)) return { x, y };
  throw new Error("tile not found");
}

const treeTile = findTile((x, y) => resourceAt(x, y)?.id === "tree_normal");
const pineTile = findTile((x, y) => resourceAt(x, y)?.id === "tree_pine");
const copperTile = findTile((x, y) => resourceAt(x, y)?.id === "ore_copper");
const goldTile = findTile((x, y) => resourceAt(x, y)?.id === "ore_gold");
const fishTile = findTile((x, y) => resourceAt(x, y)?.id === "fish_shrimp");

interface Fake {
  host: GatherHost;
  inv: Map<string, number>;
  skills: SkillSet;
  messages: Array<{ type: string; payload: Record<string, unknown> }>;
  actions: string[];
  depleted: string[];
  restored: string[];
  setNow(t: number): void;
  pos: { x: number; y: number };
  combat: boolean;
  rngValue: number;
  tools: Set<ToolType>;
  slots: number;
}

function fake(near: { x: number; y: number }): Fake {
  let now = 0;
  const f: Fake = {
    inv: new Map(),
    skills: emptySkills(),
    messages: [],
    actions: [],
    depleted: [],
    restored: [],
    pos: { x: near.x + 0.5, y: near.y + 1.5 },
    combat: false,
    rngValue: 0, // always succeeds, always depletes (rng < chance)
    tools: new Set<ToolType>(["axe", "pickaxe", "rod"]),
    slots: 28,
    setNow: (t) => {
      now = t;
    },
    host: undefined as unknown as GatherHost,
  };
  f.host = {
    now: () => now,
    rng: () => f.rngValue,
    position: () => f.pos,
    inCombat: () => f.combat,
    skills: async () => f.skills,
    hasTool: async (_s, tool) => f.tools.has(tool),
    canAdd: async (_s, item) => f.inv.has(item) || f.inv.size < f.slots,
    addItem: async (_s, item, qty) => {
      if (!f.inv.has(item) && f.inv.size >= f.slots) return false;
      f.inv.set(item, (f.inv.get(item) ?? 0) + qty);
      return true;
    },
    removeItem: async (_s, item, qty) => {
      const have = f.inv.get(item) ?? 0;
      if (have < qty) return false;
      if (have === qty) f.inv.delete(item);
      else f.inv.set(item, have - qty);
      return true;
    },
    countItem: async (_s, item) => f.inv.get(item) ?? 0,
    addXp: async (_s, skill: SkillId, amount) => {
      const before = f.skills[skill].xp;
      const xp = before + amount;
      const previousLevel = levelForXp(before);
      const level = levelForXp(xp);
      f.skills[skill] = { xp, level };
      return { xp, level, previousLevel, leveledUp: level > previousLevel };
    },
    setAction: (_s, action) => f.actions.push(action),
    send: (_s, type, payload) => f.messages.push({ type, payload: payload as Record<string, unknown> }),
    nodeDepleted: (key) => f.depleted.push(key),
    nodeRestored: (key) => f.restored.push(key),
    inventoryChanged: () => undefined,
  };
  return f;
}

const lastOf = (f: Fake, type: string) => [...f.messages].reverse().find((m) => m.type === type);

describe("resource rules", () => {
  it("xp curve matches RuneScape", () => {
    assert.equal(xpForLevel(2), 83);
    assert.equal(xpForLevel(10), 1154);
    assert.equal(xpForLevel(99), 13_034_431);
    assert.equal(levelForXp(82), 1);
    assert.equal(levelForXp(83), 2);
  });

  it("every tile type resolves consistently", () => {
    assert.equal(tileAt(treeTile.x, treeTile.y), "tree");
    assert.equal(RESOURCES["tree_normal"]!.level, 1);
    assert.ok(oreAt(copperTile.x, copperTile.y));
  });

  it("chance rises with level and stays within bounds", () => {
    assert.equal(gatherChance(1, 1), 0.4);
    assert.ok(gatherChance(20, 1) > gatherChance(5, 1));
    assert.equal(gatherChance(99, 1), 0.92);
  });

  it("starter resources exist near the tavern", () => {
    const d = (t: { x: number; y: number }) => Math.hypot(t.x - WORLD_SPAWN.x, t.y - WORLD_SPAWN.y);
    assert.ok(findTile((x, y) => resourceAt(x, y)?.id === "ore_copper" && Math.hypot(x - WORLD_SPAWN.x, y - WORLD_SPAWN.y) < 30));
    assert.ok(d(treeTile) >= 0);
  });
});

describe("gathering", () => {
  it("chops a tree: item, xp, depletion and respawn", async () => {
    const f = fake(treeTile);
    const g = new GatheringSystem(f.host, { intervalMs: 100 });
    assert.equal(await g.startGather("p", treeTile.x, treeTile.y), null);
    assert.deepEqual(f.actions, ["chop"]);
    assert.equal(lastOf(f, "gather_started")!.payload["action"], "chop");

    f.setNow(150);
    await g.tick();
    assert.equal(f.inv.get("Troncos"), 1);
    assert.equal(f.skills.woodcutting.xp, 25);
    const xp = lastOf(f, "skill_xp")!.payload;
    assert.equal(xp["gained"], 25);
    assert.equal(xp["item"], "Troncos");

    // rngValue 0 => depletes; the action stops and the node is marked
    assert.equal(f.depleted.length, 1);
    assert.equal(g.isDepleted(treeTile.x, treeTile.y), true);
    assert.equal(g.isActive("p"), false);
    assert.equal(lastOf(f, "gather_stopped")!.payload["reason"], "depleted");
    assert.equal(f.actions.at(-1), "");

    // cannot chop it again until it respawns
    assert.match((await g.startGather("p", treeTile.x, treeTile.y))!, /agotado/);
    f.setNow(150 + RESOURCES["tree_normal"]!.respawnMs + 1);
    await g.tick();
    assert.equal(f.restored.length, 1);
    assert.equal(await g.startGather("p", treeTile.x, treeTile.y), null);
  });

  it("levels up and reports it", async () => {
    const f = fake(treeTile);
    f.skills.woodcutting = { xp: 70, level: 1 };
    const g = new GatheringSystem(f.host, { intervalMs: 50 });
    await g.startGather("p", treeTile.x, treeTile.y);
    f.setNow(60);
    await g.tick();
    const xp = lastOf(f, "skill_xp")!.payload;
    assert.equal(xp["leveledUp"], true);
    assert.equal(xp["level"], 2);
  });

  it("enforces level, tool, reach, combat and a full backpack", async () => {
    let f = fake(pineTile);
    let g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", pineTile.x, pineTile.y))!, /nivel 15/);

    f = fake(treeTile);
    f.tools.delete("axe");
    g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", treeTile.x, treeTile.y))!, /hacha/);

    f = fake(treeTile);
    f.pos = { x: treeTile.x + 12, y: treeTile.y };
    g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", treeTile.x, treeTile.y))!, /lejos/);

    f = fake(treeTile);
    f.combat = true;
    g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", treeTile.x, treeTile.y))!, /combate/);

    f = fake(treeTile);
    for (let i = 0; i < 28; i += 1) f.inv.set(`Objeto ${i}`, 1);
    g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", treeTile.x, treeTile.y))!, /llena/);

    f = fake({ x: 100, y: 100 });
    f.pos = { x: 100.5, y: 100.5 };
    g = new GatheringSystem(f.host);
    assert.match((await g.startGather("p", 100, 100))!, /nada que recolectar|demasiado|Necesitas/);
  });

  it("a full pack stops the action, and a tool loss too", async () => {
    const f = fake(copperTile);
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    await g.startGather("p", copperTile.x, copperTile.y);
    for (let i = 0; i < 27; i += 1) f.inv.set(`Objeto ${i}`, 1); // 27 stacks + new ore would be the 28th: fits
    f.setNow(20);
    await g.tick();
    assert.equal(f.inv.get("Mineral de cobre"), 1);

    const f2 = fake(treeTile);
    const g2 = new GatheringSystem(f2.host, { intervalMs: 10 });
    await g2.startGather("p", treeTile.x, treeTile.y);
    f2.tools.delete("axe");
    f2.setNow(20);
    await g2.tick();
    assert.equal(lastOf(f2, "gather_stopped")!.payload["reason"], "no_tool");
  });

  it("walking away or entering combat cancels", async () => {
    const f = fake(treeTile);
    const g = new GatheringSystem(f.host, { intervalMs: 100 });
    await g.startGather("p", treeTile.x, treeTile.y);
    f.pos = { x: f.pos.x + 0.3, y: f.pos.y };
    g.onMoved("p");
    assert.equal(g.isActive("p"), true, "small shuffles are tolerated");
    f.pos = { x: f.pos.x + 2, y: f.pos.y };
    g.onMoved("p");
    assert.equal(g.isActive("p"), false);
    assert.equal(lastOf(f, "gather_stopped")!.payload["reason"], "moved");

    const f2 = fake(treeTile);
    const g2 = new GatheringSystem(f2.host, { intervalMs: 50 });
    await g2.startGather("p", treeTile.x, treeTile.y);
    f2.combat = true;
    f2.setNow(60);
    await g2.tick();
    assert.equal(lastOf(f2, "gather_stopped")!.payload["reason"], "combat");
  });

  it("misses when the roll is above the success chance", async () => {
    const f = fake(copperTile);
    f.rngValue = 0.99;
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    await g.startGather("p", copperTile.x, copperTile.y);
    f.setNow(20);
    await g.tick();
    assert.equal(f.inv.size, 0);
    assert.equal(g.isActive("p"), true, "keeps swinging");
  });

  it("fishing never depletes the spot", async () => {
    const f = fake(fishTile);
    f.pos = { x: fishTile.x + 0.5, y: fishTile.y + 1.4 };
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    assert.equal(await g.startGather("p", fishTile.x, fishTile.y), null);
    f.setNow(20);
    await g.tick();
    f.setNow(40);
    await g.tick();
    assert.equal(f.inv.get("Camarones crudos"), 2);
    assert.equal(f.depleted.length, 0);
    assert.equal(g.isActive("p"), true);
  });

  it("two players on one rock: the second is stopped when it is mined out", async () => {
    const f = fake(goldTile);
    f.skills.mining = { xp: xpForLevel(40), level: 40 };
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    await g.startGather("a", goldTile.x, goldTile.y);
    await g.startGather("b", goldTile.x, goldTile.y);
    f.setNow(20);
    await g.tick();
    assert.equal(g.isActive("a"), false);
    assert.equal(g.isActive("b"), false);
  });
});

describe("cooking", () => {
  const fire = WORLD_LAMPS.find((l) => l.kind === "fire")!;

  it("needs a fire nearby and something to cook", async () => {
    const f = fake({ x: 100, y: 100 });
    f.pos = { x: 100.5, y: 100.5 };
    const g = new GatheringSystem(f.host);
    assert.match((await g.startCook("p"))!, /fogata/);

    const f2 = fake({ x: 0, y: 0 });
    f2.pos = { x: fire.x + 0.5, y: fire.y };
    const g2 = new GatheringSystem(f2.host);
    assert.match((await g2.startCook("p"))!, /nada que puedas cocinar/);
  });

  it("cooks the whole stack, one per attempt, then stops", async () => {
    const f = fake({ x: 0, y: 0 });
    f.pos = { x: fire.x + 0.5, y: fire.y };
    f.rngValue = 0.99; // never burns
    f.inv.set("Camarones crudos", 2);
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    assert.equal(await g.startCook("p"), null);
    assert.equal(f.actions.at(-1), "cook");

    f.setNow(20);
    await g.tick();
    assert.equal(f.inv.get("Camarones crudos"), 1);
    assert.equal(f.inv.get("Camarones cocidos"), 1);
    assert.equal(f.skills.cooking.xp, 30);

    f.setNow(40);
    await g.tick();
    assert.equal(f.inv.get("Camarones cocidos"), 2);
    assert.equal(f.inv.has("Camarones crudos"), false);

    f.setNow(60);
    await g.tick();
    assert.equal(g.isActive("p"), false);
    assert.equal(lastOf(f, "gather_stopped")!.payload["reason"], "done");
  });

  it("burnt food gives no xp", async () => {
    const f = fake({ x: 0, y: 0 });
    f.pos = { x: fire.x + 0.5, y: fire.y };
    f.rngValue = 0; // always burns
    f.inv.set("Camarones crudos", 1);
    const g = new GatheringSystem(f.host, { intervalMs: 10 });
    await g.startCook("p");
    f.setNow(20);
    await g.tick();
    assert.equal(f.inv.get("Pescado quemado"), 1);
    assert.equal(f.skills.cooking.xp, 0);
    assert.equal(lastOf(f, "skill_xp")!.payload["burnt"], true);
  });

  it("will not cook what the level does not allow", async () => {
    const f = fake({ x: 0, y: 0 });
    f.pos = { x: fire.x + 0.5, y: fire.y };
    f.inv.set("Trucha cruda", 3); // needs cooking 15
    const g = new GatheringSystem(f.host);
    assert.match((await g.startCook("p"))!, /nada que puedas cocinar/);
  });
});

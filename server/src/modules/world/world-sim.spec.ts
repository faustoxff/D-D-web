import "reflect-metadata";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MapSchema } from "@colyseus/schema";
import { WORLD_ENEMIES, hitsBlockedTile } from "@dnd/shared";
import { EnemySchema } from "../../colyseus/schemas/EnemySchema";
import { SIM_CONFIG, WorldSim, type SimPlayer } from "./world-sim";
import { scaleTemplate } from "../encounters/engine/scaling";

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

/** An enemy with a clear straight line to a point 3 tiles west of it. */
function openFieldEnemy() {
  const found = WORLD_ENEMIES.find((e) => {
    for (let d = 0; d <= 3.5; d += 0.5) {
      if (hitsBlockedTile(e.x - d, e.y, 0.35)) return false;
    }
    return true;
  });
  assert.ok(found, "world has at least one enemy with open ground to its west");
  return found;
}

function setup() {
  const enemies = new MapSchema<EnemySchema>();
  const contacts: Array<{ enemyId: string; sessionId: string }> = [];
  const sim = new WorldSim(enemies, (enemyId, sessionId) => contacts.push({ enemyId, sessionId }), seeded(7));
  sim.init();
  return { enemies, contacts, sim };
}

const player = (x: number, y: number, extra: Partial<SimPlayer> = {}): SimPlayer => ({
  sessionId: "p1",
  x,
  y,
  busy: false,
  alive: true,
  ...extra,
});

function run(sim: WorldSim, seconds: number, players: SimPlayer[], startMs = 0) {
  let now = startMs;
  for (let i = 0; i < seconds * 20; i += 1) {
    now += 50;
    sim.tick(0.05, now, players);
  }
  return now;
}

describe("WorldSim", () => {
  it("creates one schema per world enemy", () => {
    const { enemies, sim } = setup();
    assert.equal(sim.size, WORLD_ENEMIES.length);
    assert.equal(enemies.size, WORLD_ENEMIES.length);
  });

  it("keeps enemies asleep when no player is near", () => {
    const { enemies, sim } = setup();
    const first = WORLD_ENEMIES[0]!;
    run(sim, 10, [player(first.x + 200, first.y + 200)]);
    const e = enemies.get(first.id)!;
    assert.equal(e.x, first.x);
    assert.equal(e.y, first.y);
  });

  it("wanders near home while a distant player is awake", () => {
    const { enemies, sim } = setup();
    const first = WORLD_ENEMIES[0]!;
    // 20 tiles away: within SIM_RADIUS, outside aggro
    run(sim, 20, [player(first.x + 20, first.y)]);
    const e = enemies.get(first.id)!;
    assert.ok(Math.hypot(e.x - first.x, e.y - first.y) <= SIM_CONFIG.WANDER_RADIUS + 0.5);
  });

  it("chases a nearby player and reports contact", () => {
    const { enemies, contacts, sim } = setup();
    const first = openFieldEnemy();
    const near = player(first.x - 3, first.y);
    run(sim, 6, [near]);
    const e = enemies.get(first.id)!;
    assert.ok(["chase", "idle"].includes(e.state));
    assert.ok(contacts.some((c) => c.enemyId === first.id && c.sessionId === "p1"));
  });

  it("freezes in combat, dies on win and respawns at home", () => {
    const { enemies, sim } = setup();
    const first = WORLD_ENEMIES[0]!;
    assert.equal(sim.engage(first.id, "p1"), true);
    assert.equal(sim.engage(first.id, "p2"), false, "cannot be claimed twice");
    assert.equal(enemies.get(first.id)!.state, "combat");

    let now = run(sim, 2, [player(first.x + 1, first.y, { busy: true })]);
    sim.release(first.id, "won", now);
    assert.equal(enemies.get(first.id)!.state, "dead");

    now = run(sim, 10, [player(first.x + 10, first.y)], now);
    assert.equal(enemies.get(first.id)!.state, "dead", "still dead before respawn timer");

    run(sim, SIM_CONFIG.RESPAWN_MS / 1000, [player(first.x + 10, first.y)], now);
    const e = enemies.get(first.id)!;
    assert.notEqual(e.state, "dead");
    assert.ok(Math.hypot(e.x - first.x, e.y - first.y) < SIM_CONFIG.WANDER_RADIUS + 0.5);
  });

  it("does not re-engage immediately after a player flees", () => {
    const { contacts, sim } = setup();
    const first = WORLD_ENEMIES[0]!;
    sim.engage(first.id, "p1");
    sim.release(first.id, "fled", 1000);
    // player stands right next to the enemy for 3s (< cooldown)
    run(sim, 3, [player(first.x + 1, first.y)], 1000);
    assert.equal(contacts.length, 0);
  });

  it("ignores busy and dead players", () => {
    const { contacts, sim } = setup();
    const first = WORLD_ENEMIES[0]!;
    run(sim, 5, [player(first.x + 2, first.y, { busy: true })]);
    run(sim, 5, [player(first.x + 2, first.y, { alive: false })]);
    assert.equal(contacts.length, 0);
  });

  it("never walks into blocked tiles", () => {
    const { enemies, sim } = setup();
    const players = [player(WORLD_ENEMIES[0]!.x + 2, WORLD_ENEMIES[0]!.y)];
    let now = 0;
    for (let i = 0; i < 400; i += 1) {
      now += 50;
      sim.tick(0.05, now, players);
      for (const e of enemies.values()) {
        assert.equal(hitsBlockedTile(e.x, e.y, 0.3), false, `${e.id} inside a wall at ${e.x},${e.y}`);
      }
    }
  });
});

describe("scaleTemplate", () => {
  const base = {
    id: "t",
    name: "Goblin",
    hp: 12,
    str: 8,
    dex: 14,
    con: 10,
    ac: 11,
    attack_damage: "1d4+1",
    xp_reward: 30,
    currency_min: 20,
    currency_max: 35,
  };

  it("keeps level 1 unchanged", () => {
    assert.deepEqual(scaleTemplate(base, 1), base);
  });

  it("scales stats and keeps a valid dice expression", () => {
    const s = scaleTemplate(base, 5);
    assert.ok(s.hp > base.hp && s.ac > base.ac && s.xp_reward > base.xp_reward);
    assert.match(s.attack_damage, /^\d+d\d+[+-]\d+$/);
    assert.equal(s.attack_damage, "1d4+3");
  });

  it("adds a modifier to a flat dice expression", () => {
    assert.equal(scaleTemplate({ ...base, attack_damage: "1d6" }, 3).attack_damage, "1d6+1");
  });
});

import type { MapSchema } from "@colyseus/schema";
import { WORLD_ENEMIES, hitsBlockedTile, type EnemyKind } from "@dnd/shared";
import { EnemySchema } from "../../colyseus/schemas/EnemySchema";

export interface SimPlayer {
  sessionId: string;
  x: number;
  y: number;
  /** In a fight already: enemies ignore them. */
  busy: boolean;
  alive: boolean;
}

export type ReleaseOutcome = "won" | "lost" | "fled";

interface Behaviour {
  aggro: number; // tiles
  chase: number; // tiles / second
  wander: number;
}

const BEHAVIOUR: Record<EnemyKind, Behaviour> = {
  Goblin: { aggro: 5.5, chase: 2.8, wander: 0.9 },
  Esqueleto: { aggro: 6, chase: 2.4, wander: 0.7 },
  Lobo: { aggro: 8, chase: 3.6, wander: 1.3 },
};

export const SIM_CONFIG = {
  /** Enemies only think while a player is this close; the rest sleep. */
  SIM_RADIUS: 60,
  LEASH: 15,
  CONTACT: 0.85,
  WANDER_RADIUS: 3.5,
  RESPAWN_MS: 45_000,
  COOLDOWN_MS: 4_000,
  BODY_RADIUS: 0.3,
} as const;

type Mode = "idle" | "chase" | "return";

interface Unit {
  s: EnemySchema;
  behaviour: Behaviour;
  homeX: number;
  homeY: number;
  mode: Mode;
  targetId: string | null;
  wanderX: number;
  wanderY: number;
  wait: number;
  respawnAt: number;
  cooldownUntil: number;
  engagedBy: string | null;
}

function isKind(name: string): name is EnemyKind {
  return name === "Goblin" || name === "Esqueleto" || name === "Lobo";
}

/**
 * Server-side simulation of every world enemy: wander near home, chase players
 * that come too close, give up past a leash, respawn after death. It only mutates
 * the shared schema; starting a fight is delegated through `onContact`.
 */
export class WorldSim {
  private units = new Map<string, Unit>();

  constructor(
    private readonly enemies: MapSchema<EnemySchema>,
    private readonly onContact: (enemyId: string, sessionId: string) => void,
    private readonly rng: () => number = Math.random,
  ) {}

  init() {
    for (const def of WORLD_ENEMIES) {
      const s = new EnemySchema();
      s.id = def.id;
      s.kind = def.name;
      s.level = def.level;
      s.x = def.x;
      s.y = def.y;
      s.state = "idle";
      this.enemies.set(def.id, s);
      this.units.set(def.id, {
        s,
        behaviour: BEHAVIOUR[def.name],
        homeX: def.x,
        homeY: def.y,
        mode: "idle",
        targetId: null,
        wanderX: def.x,
        wanderY: def.y,
        wait: this.rng() * 3,
        respawnAt: 0,
        cooldownUntil: 0,
        engagedBy: null,
      });
    }
  }

  get size(): number {
    return this.units.size;
  }

  kindOf(enemyId: string): EnemyKind | null {
    const kind = this.units.get(enemyId)?.s.kind;
    return kind && isKind(kind) ? kind : null;
  }

  positionOf(enemyId: string): { x: number; y: number } | null {
    const s = this.units.get(enemyId)?.s;
    return s ? { x: s.x, y: s.y } : null;
  }

  levelOf(enemyId: string): number {
    return this.units.get(enemyId)?.s.level ?? 1;
  }

  /** Claim an enemy for a fight. Returns false if it is not available. */
  engage(enemyId: string, sessionId: string): boolean {
    const u = this.units.get(enemyId);
    if (!u || u.s.state === "dead" || u.s.state === "combat") return false;
    u.s.state = "combat";
    u.engagedBy = sessionId;
    u.mode = "idle";
    u.targetId = null;
    return true;
  }

  /** The fight ended (or the player left): update the enemy accordingly. */
  release(enemyId: string, outcome: ReleaseOutcome, now: number) {
    const u = this.units.get(enemyId);
    if (!u) return;
    u.engagedBy = null;
    u.targetId = null;
    if (outcome === "won") {
      u.s.state = "dead";
      u.respawnAt = now + SIM_CONFIG.RESPAWN_MS;
      return;
    }
    u.s.state = "idle";
    u.mode = "return";
    u.cooldownUntil = now + SIM_CONFIG.COOLDOWN_MS;
  }

  tick(dt: number, now: number, players: SimPlayer[]) {
    for (const u of this.units.values()) {
      if (u.s.state === "dead") {
        if (now >= u.respawnAt) this.respawn(u);
        continue;
      }
      if (u.s.state === "combat") continue;

      let nearest: SimPlayer | null = null;
      let nearestD = Infinity;
      let anyNear = false;
      for (const p of players) {
        const d = Math.hypot(p.x - u.s.x, p.y - u.s.y);
        if (d < SIM_CONFIG.SIM_RADIUS) anyNear = true;
        if (p.busy || !p.alive) continue;
        if (d < nearestD) {
          nearestD = d;
          nearest = p;
        }
      }
      if (!anyNear) continue;

      this.think(u, dt, now, players, nearest, nearestD);
    }
  }

  private think(
    u: Unit,
    dt: number,
    now: number,
    players: SimPlayer[],
    nearest: SimPlayer | null,
    nearestD: number,
  ) {
    const b = u.behaviour;

    if (u.mode === "chase") {
      const target = players.find((p) => p.sessionId === u.targetId);
      const dHome = Math.hypot(u.s.x - u.homeX, u.s.y - u.homeY);
      if (!target || target.busy || !target.alive || dHome > SIM_CONFIG.LEASH) {
        u.mode = "return";
        u.targetId = null;
        u.s.state = "idle";
        u.cooldownUntil = now + SIM_CONFIG.COOLDOWN_MS;
        return;
      }
      const d = Math.hypot(target.x - u.s.x, target.y - u.s.y);
      if (d < SIM_CONFIG.CONTACT) {
        this.onContact(u.s.id, target.sessionId);
        return;
      }
      this.step(u, target.x, target.y, b.chase, dt);
      return;
    }

    if (u.mode === "return") {
      const arrived = !this.step(u, u.homeX, u.homeY, b.chase * 0.8, dt);
      if (arrived || Math.hypot(u.s.x - u.homeX, u.s.y - u.homeY) < 0.5) {
        u.mode = "idle";
        u.wait = 1 + this.rng() * 2;
      }
      return;
    }

    // idle: look for prey, otherwise wander around home
    if (nearest && nearestD < b.aggro && now >= u.cooldownUntil) {
      u.mode = "chase";
      u.targetId = nearest.sessionId;
      u.s.state = "chase";
      return;
    }

    if (u.wait > 0) {
      u.wait -= dt;
      if (u.wait <= 0) this.pickWanderPoint(u);
      return;
    }
    const moving = this.step(u, u.wanderX, u.wanderY, b.wander, dt);
    if (!moving) u.wait = 1.5 + this.rng() * 3;
  }

  private pickWanderPoint(u: Unit) {
    for (let i = 0; i < 6; i += 1) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * SIM_CONFIG.WANDER_RADIUS;
      const x = u.homeX + Math.cos(a) * r;
      const y = u.homeY + Math.sin(a) * r;
      if (!hitsBlockedTile(x, y, SIM_CONFIG.BODY_RADIUS)) {
        u.wanderX = x;
        u.wanderY = y;
        return;
      }
    }
    u.wanderX = u.homeX;
    u.wanderY = u.homeY;
  }

  /** Moves toward a point with axis-separated collision. Returns true if it moved. */
  private step(u: Unit, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - u.s.x;
    const dy = ty - u.s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.08) return false;

    const m = Math.min(dist, speed * dt);
    const mx = (dx / dist) * m;
    const my = (dy / dist) * m;
    let moved = false;

    if (!hitsBlockedTile(u.s.x + mx, u.s.y, SIM_CONFIG.BODY_RADIUS)) {
      u.s.x += mx;
      moved = true;
    }
    if (!hitsBlockedTile(u.s.x, u.s.y + my, SIM_CONFIG.BODY_RADIUS)) {
      u.s.y += my;
      moved = true;
    }
    if (moved) u.s.yaw = Math.atan2(mx, my);
    return moved;
  }

  private respawn(u: Unit) {
    u.s.x = u.homeX;
    u.s.y = u.homeY;
    u.s.state = "idle";
    u.mode = "idle";
    u.targetId = null;
    u.wait = 1 + this.rng() * 2;
  }
}

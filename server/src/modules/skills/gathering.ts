import {
  GATHER_REACH,
  RECIPES,
  RESOURCES,
  SKILLS,
  burnChance,
  findNearbyFire,
  resourceAt,
  type GatherAction,
  type ResourceDef,
  type SkillId,
  type SkillSet,
  type ToolType,
} from "@dnd/shared";

export interface XpResult {
  xp: number;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
}

/** Everything the gathering rules need from the outside world (room, database, clock). */
export interface GatherHost {
  now(): number;
  rng(): number;
  position(sessionId: string): { x: number; y: number } | null;
  inCombat(sessionId: string): boolean;
  skills(sessionId: string): Promise<SkillSet>;
  hasTool(sessionId: string, tool: ToolType): Promise<boolean>;
  canAdd(sessionId: string, item: string): Promise<boolean>;
  addItem(sessionId: string, item: string, qty: number): Promise<boolean>;
  removeItem(sessionId: string, item: string, qty: number): Promise<boolean>;
  countItem(sessionId: string, item: string): Promise<number>;
  addXp(sessionId: string, skill: SkillId, amount: number): Promise<XpResult>;
  setAction(sessionId: string, action: string): void;
  send(sessionId: string, type: string, payload: unknown): void;
  nodeDepleted(key: string, kind: string, tx: number, ty: number): void;
  nodeRestored(key: string): void;
  inventoryChanged(sessionId: string): void;
  /** Unexpected failures (database, etc.); the action is stopped but the cause must not vanish. */
  error?(sessionId: string, err: unknown): void;
}

export type StopReason = "user" | "moved" | "combat" | "full" | "depleted" | "done" | "no_tool" | "level";

interface Gather {
  kind: "gather";
  def: ResourceDef;
  tx: number;
  ty: number;
  start: { x: number; y: number };
  nextAt: number;
  working: boolean;
}

interface Cook {
  kind: "cook";
  start: { x: number; y: number };
  nextAt: number;
  working: boolean;
}

type Active = Gather | Cook;

export interface GatherOptions {
  intervalMs?: number;
  /** How far from where you started you may drift before the action stops. */
  moveTolerance?: number;
}

/** Chance that one attempt yields something: better with a higher level than the node needs. */
export function gatherChance(level: number, required: number): number {
  return Math.max(0.4, Math.min(0.92, 0.4 + 0.03 * (level - required)));
}

const nodeKey = (tx: number, ty: number) => `${tx},${ty}`;

/** Rules for chopping, mining, fishing and cooking. One action per player at a time. */
export class GatheringSystem {
  private active = new Map<string, Active>();
  private depleted = new Map<string, { until: number }>();
  private readonly interval: number;
  private readonly tolerance: number;

  constructor(
    private readonly host: GatherHost,
    options: GatherOptions = {},
  ) {
    this.interval = options.intervalMs ?? 2400;
    this.tolerance = options.moveTolerance ?? 0.7;
  }

  isActive(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  isDepleted(tx: number, ty: number): boolean {
    return this.depleted.has(nodeKey(tx, ty));
  }

  /** Begin harvesting the resource on a tile. Returns an error message, or null when started. */
  async startGather(sessionId: string, tx: number, ty: number): Promise<string | null> {
    const def = resourceAt(tx, ty);
    if (!def) return "No hay nada que recolectar ahí.";
    if (this.isDepleted(tx, ty)) return `${def.name} está agotado; vuelve en un rato.`;

    const pos = this.host.position(sessionId);
    if (!pos) return "No estás en el mundo.";
    if (Math.hypot(tx + 0.5 - pos.x, ty + 0.5 - pos.y) > GATHER_REACH + 0.4) return "Estás demasiado lejos.";
    if (this.host.inCombat(sessionId)) return "No puedes hacerlo en combate.";

    const skills = await this.host.skills(sessionId);
    if (skills[def.skill].level < def.level) {
      return `Necesitas nivel ${def.level} de ${SKILLS[def.skill].label} para ${def.name.toLowerCase()}.`;
    }
    if (!(await this.host.hasTool(sessionId, def.tool))) {
      const toolName = def.tool === "axe" ? "un hacha" : def.tool === "pickaxe" ? "un pico" : "una caña de pescar";
      return `Necesitas ${toolName}.`;
    }
    if (!(await this.host.canAdd(sessionId, def.item))) return "Tu mochila está llena.";

    this.active.set(sessionId, {
      kind: "gather",
      def,
      tx,
      ty,
      start: pos,
      nextAt: this.host.now() + this.interval,
      working: false,
    });
    this.host.setAction(sessionId, def.action);
    this.host.send(sessionId, "gather_started", {
      action: def.action satisfies GatherAction,
      name: def.name,
      verb: SKILLS[def.skill].verb,
      tx,
      ty,
    });
    return null;
  }

  async startCook(sessionId: string): Promise<string | null> {
    const pos = this.host.position(sessionId);
    if (!pos) return "No estás en el mundo.";
    if (!findNearbyFire(pos.x, pos.y)) return "Necesitas acercarte a una fogata.";
    if (this.host.inCombat(sessionId)) return "No puedes hacerlo en combate.";

    const skills = await this.host.skills(sessionId);
    let anything = false;
    for (const r of RECIPES) {
      if (skills.cooking.level >= r.level && (await this.host.countItem(sessionId, r.raw)) > 0) anything = true;
    }
    if (!anything) return "No tienes nada que puedas cocinar.";

    this.active.set(sessionId, {
      kind: "cook",
      start: pos,
      nextAt: this.host.now() + this.interval * 0.8,
      working: false,
    });
    this.host.setAction(sessionId, "cook");
    this.host.send(sessionId, "gather_started", { action: "cook", name: "Fogata", verb: "Cocinar", tx: 0, ty: 0 });
    return null;
  }

  stop(sessionId: string, reason: StopReason = "user") {
    if (!this.active.delete(sessionId)) return;
    this.host.setAction(sessionId, "");
    this.host.send(sessionId, "gather_stopped", { reason });
  }

  /** Call when a player's position changes: drifting away ends the action immediately. */
  onMoved(sessionId: string) {
    const a = this.active.get(sessionId);
    const pos = this.host.position(sessionId);
    if (!a || !pos) return;
    if (Math.hypot(pos.x - a.start.x, pos.y - a.start.y) > this.tolerance) this.stop(sessionId, "moved");
  }

  /** Advance respawns and run any attempt that is due. Safe to call often. */
  async tick(): Promise<void> {
    const now = this.host.now();
    for (const [key, node] of this.depleted) {
      if (node.until <= now) {
        this.depleted.delete(key);
        this.host.nodeRestored(key);
      }
    }

    const due: Array<Promise<void>> = [];
    for (const [sessionId, a] of this.active) {
      if (a.working || a.nextAt > now) continue;
      if (this.host.inCombat(sessionId)) {
        this.stop(sessionId, "combat");
        continue;
      }
      a.working = true;
      due.push(
        this.attempt(sessionId, a)
          .catch((err: unknown) => {
            this.host.error?.(sessionId, err);
            this.stop(sessionId, "done");
          })
          .finally(() => {
            a.working = false;
            a.nextAt = this.host.now() + this.interval;
          }),
      );
    }
    await Promise.all(due);
  }

  private async attempt(sessionId: string, a: Active): Promise<void> {
    if (a.kind === "gather") await this.attemptGather(sessionId, a);
    else await this.attemptCook(sessionId, a);
  }

  private async attemptGather(sessionId: string, a: Gather): Promise<void> {
    if (this.isDepleted(a.tx, a.ty)) return this.stop(sessionId, "depleted");
    const skills = await this.host.skills(sessionId);
    const level = skills[a.def.skill].level;
    if (!(await this.host.hasTool(sessionId, a.def.tool))) return this.stop(sessionId, "no_tool");

    if (this.host.rng() >= gatherChance(level, a.def.level)) return; // nothing this swing

    if (!(await this.host.addItem(sessionId, a.def.item, 1))) return this.stop(sessionId, "full");
    const xp = await this.host.addXp(sessionId, a.def.skill, a.def.xp);
    this.host.inventoryChanged(sessionId);
    this.host.send(sessionId, "skill_xp", {
      skill: a.def.skill,
      gained: a.def.xp,
      xp: xp.xp,
      level: xp.level,
      leveledUp: xp.leveledUp,
      item: a.def.item,
    });

    if (a.def.depleteChance > 0 && this.host.rng() < a.def.depleteChance) {
      const key = nodeKey(a.tx, a.ty);
      this.depleted.set(key, { until: this.host.now() + a.def.respawnMs });
      this.host.nodeDepleted(key, a.def.kind, a.tx, a.ty);
      for (const [other, act] of [...this.active]) {
        if (act.kind === "gather" && act.tx === a.tx && act.ty === a.ty) this.stop(other, "depleted");
      }
    } else if (!(await this.host.canAdd(sessionId, a.def.item))) {
      this.stop(sessionId, "full");
    }
  }

  private async attemptCook(sessionId: string, _a: Cook): Promise<void> {
    const skills = await this.host.skills(sessionId);
    const level = skills.cooking.level;
    // Cook the best thing we can, highest recipe first
    let chosen: (typeof RECIPES)[number] | null = null;
    for (const r of [...RECIPES].reverse()) {
      if (level >= r.level && (await this.host.countItem(sessionId, r.raw)) > 0) {
        chosen = r;
        break;
      }
    }
    if (!chosen) return this.stop(sessionId, "done");

    if (!(await this.host.removeItem(sessionId, chosen.raw, 1))) return this.stop(sessionId, "done");
    const burnt = this.host.rng() < burnChance(chosen, level);
    const product = burnt ? "Pescado quemado" : chosen.cooked;

    if (!(await this.host.addItem(sessionId, product, 1))) {
      await this.host.addItem(sessionId, chosen.raw, 1); // give the fish back
      this.host.inventoryChanged(sessionId);
      return this.stop(sessionId, "full");
    }
    this.host.inventoryChanged(sessionId);

    if (burnt) {
      this.host.send(sessionId, "skill_xp", { skill: "cooking", gained: 0, xp: skills.cooking.xp, level, leveledUp: false, item: product, burnt: true });
    } else {
      const xp = await this.host.addXp(sessionId, "cooking", chosen.xp);
      this.host.send(sessionId, "skill_xp", { skill: "cooking", gained: chosen.xp, xp: xp.xp, level: xp.level, leveledUp: xp.leveledUp, item: product });
    }
  }
}

export { RESOURCES };

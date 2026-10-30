import { Room, Client } from "colyseus";
import { ZoneState } from "../schemas/ZoneState";
import { PlayerSchema } from "../schemas/PlayerSchema";
import {
  processTurn,
  isInMeleeRange,
  playerAttackExpr,
} from "../../modules/encounters/engine/combat.engine";
import { abilityModifier } from "../../modules/encounters/engine/stats";
import { scaleTemplate } from "../../modules/encounters/engine/scaling";
import { WorldSim, type ReleaseOutcome, type SimPlayer } from "../../modules/world/world-sim";
import { GatheringSystem, type GatherHost } from "../../modules/skills/gathering";
import { NodeSchema } from "../schemas/NodeSchema";
import type { SkillsService } from "../../modules/skills/skills.service";
import { GAME_CONFIG } from "../../config/game.config";
import type { CharactersService } from "../../modules/characters/characters.service";
import type { EncountersService } from "../../modules/encounters/encounters.service";
import type { QuestsService } from "../../modules/quests/quests.service";
import type { EconomyService } from "../../modules/economy/economy.service";
import type { DmService } from "../../modules/dm/dm.service";
import type { DbService } from "../../db/db.service";
import type { AuthService } from "../../modules/auth/auth.service";
import type { Character, CombatEvent, EnemyTemplate, SkillSet } from "@dnd/shared";
import { MOVE_SPEED, WORLD_SPAWN, regionAt, validateMove } from "@dnd/shared";

interface RoomServices {
  characters: CharactersService;
  encounters: EncountersService;
  quests: QuestsService;
  economy: EconomyService;
  skills: SkillsService;
  dm: DmService;
  db: DbService;
  auth: AuthService;
}

interface SessionState {
  character: Character;
  encounterId: string | null;
  combatLog: CombatEvent[];
  enemyTemplate: EnemyTemplate | null;
  /** World enemy this fight belongs to, so it can be released afterwards. */
  worldEnemyId: string | null;
}

const FALLBACK_ENEMIES: Record<string, EnemyTemplate> = {
  goblin: {
    id: "fallback-goblin",
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
  },
  esqueleto: {
    id: "fallback-esqueleto",
    name: "Esqueleto",
    hp: 14,
    str: 10,
    dex: 10,
    con: 12,
    ac: 12,
    attack_damage: "1d6",
    xp_reward: 35,
    currency_min: 18,
    currency_max: 32,
  },
  lobo: {
    id: "fallback-lobo",
    name: "Lobo",
    hp: 10,
    str: 11,
    dex: 15,
    con: 11,
    ac: 12,
    attack_damage: "1d4+2",
    xp_reward: 32,
    currency_min: 16,
    currency_max: 30,
  },
};

function normalizeEnemyKey(enemyName?: string): string {
  const key = enemyName?.trim().toLowerCase() ?? "goblin";
  if (key.includes("esqueleto") || key.includes("skeleton")) return "esqueleto";
  if (key.includes("lobo") || key.includes("wolf")) return "lobo";
  return "goblin";
}

function isFacing(value?: string): value is "north" | "south" | "east" | "west" {
  return value === "north" || value === "south" || value === "east" || value === "west";
}

export class ZoneRoom extends Room<ZoneState> {
  private svc!: RoomServices;
  private zoneId!: string;
  private sessions = new Map<string, SessionState>();
  private lastMoveAt = new Map<string, number>();
  /**
   * Distance (tiles) a player may still cover "in credit". It refills with real time at
   * slightly above walking speed, so network hitches that bunch several position updates
   * together don't look like speed hacks, while sustained cheating still gets rejected.
   */
  private moveBudget = new Map<string, number>();
  /** After a fight ends, enemies leave the player alone for a few seconds. */
  private combatGraceUntil = new Map<string, number>();
  private sim!: WorldSim;
  private gathering!: GatheringSystem;
  private skillCache = new Map<string, SkillSet>();

  override async onCreate(options: { zoneId: string; services: RoomServices }) {
    this.svc = options.services;
    this.zoneId = options.zoneId ?? "a1000000-0000-0000-0000-000000000001";

    this.setState(new ZoneState());

    const zone = await this.svc.db
      .maybeOne<{ id: string; name: string }>("select id, name from zones where id = $1", [this.zoneId])
      .catch(() => null);

    if (zone) {
      this.state.zoneId = zone.id;
      this.state.zoneName = zone.name;
    }

    this.onMessage("attack", this.handleAttack.bind(this));
    this.onMessage("flee", this.handleFlee.bind(this));
    this.onMessage("move", this.handleMove.bind(this));
    this.onMessage("use_item", this.handleUseItem.bind(this));
    this.onMessage("gather", (client, msg: { tx?: number; ty?: number }) => this.handleGather(client, msg));
    this.onMessage("cook", (client) => this.handleCook(client));
    this.onMessage("challenge", (client, msg: { enemyId?: string }) => this.handleChallenge(client, msg));
    this.onMessage("stop_gather", (client) => this.gathering.stop(client.sessionId, "user"));

    this.gathering = new GatheringSystem(this.gatherHost());

    // World enemies are owned by the server: they patrol, chase and start fights.
    this.sim = new WorldSim(this.state.enemies, (enemyId, sessionId) =>
      this.onEnemyContact(enemyId, sessionId),
    );
    this.sim.init();
    this.setSimulationInterval((deltaMs) => this.tickWorld(deltaMs), 50);
  }

  private tickWorld(deltaMs: number) {
    const players: SimPlayer[] = [];
    const now = Date.now();
    this.state.players.forEach((p, sessionId) => {
      players.push({
        sessionId,
        x: p.worldX,
        y: p.worldY,
        // Towns are safe: enemies leave you alone there (you can still challenge them)
        busy:
          p.encounter.status === "active" ||
          (this.combatGraceUntil.get(sessionId) ?? 0) > now ||
          regionAt(p.worldX, p.worldY).town !== null,
        alive: p.hp > 0,
      });
    });
    this.sim.tick(deltaMs / 1000, Date.now(), players);
    this.gathering.tick().catch(() => undefined);
  }

  // ─── Professions ──────────────────────────────────────────────────

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  private characterIdOf(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("no session");
    return session.character.id;
  }

  private async skillsOf(sessionId: string): Promise<SkillSet> {
    let skills = this.skillCache.get(sessionId);
    if (!skills) {
      skills = await this.svc.skills.getAll(this.characterIdOf(sessionId));
      this.skillCache.set(sessionId, skills);
    }
    return skills;
  }

  private async sendInventory(sessionId: string) {
    const client = this.clientOf(sessionId);
    if (!client) return;
    const items = await this.svc.economy.getInventory(this.characterIdOf(sessionId)).catch(() => []);
    client.send("inventory", { items });
  }

  private gatherHost(): GatherHost {
    const eco = this.svc.economy;
    const cid = (id: string) => this.characterIdOf(id);
    return {
      now: () => Date.now(),
      rng: () => Math.random(),
      position: (id) => {
        const p = this.state.players.get(id);
        return p ? { x: p.worldX, y: p.worldY } : null;
      },
      inCombat: (id) => this.state.players.get(id)?.encounter.status === "active",
      skills: (id) => this.skillsOf(id),
      hasTool: (id, tool) => eco.hasTool(cid(id), tool),
      canAdd: (id, item) => eco.canAdd(cid(id), item),
      addItem: (id, item, qty) => eco.addItem(cid(id), item, qty),
      removeItem: (id, item, qty) => eco.removeItem(cid(id), item, qty),
      countItem: (id, item) => eco.countItem(cid(id), item),
      addXp: async (id, skill, amount) => {
        const result = await this.svc.skills.addXp(cid(id), skill, amount);
        const cached = this.skillCache.get(id);
        if (cached) cached[skill] = { xp: result.xp, level: result.level };
        return result;
      },
      setAction: (id, action) => {
        const p = this.state.players.get(id);
        if (p) p.action = action;
      },
      send: (id, type, payload) => this.clientOf(id)?.send(type, payload),
      nodeDepleted: (key, kind, tx, ty) => {
        const node = new NodeSchema();
        node.key = key;
        node.kind = kind;
        node.x = tx;
        node.y = ty;
        this.state.nodes.set(key, node);
      },
      nodeRestored: (key) => {
        this.state.nodes.delete(key);
      },
      inventoryChanged: (id) => {
        void this.sendInventory(id);
      },
      error: (id, err) => console.error(`[gathering] ${id}:`, err instanceof Error ? err.message : err),
    };
  }

  private async handleGather(client: Client, msg: { tx?: number; ty?: number }) {
    if (!this.sessions.has(client.sessionId)) return;
    if (!Number.isInteger(msg.tx) || !Number.isInteger(msg.ty)) return;
    const error = await this.gathering.startGather(client.sessionId, msg.tx as number, msg.ty as number);
    if (error) client.send("error", { type: "error", message: error });
  }

  /** The player walks up to an enemy and chooses to fight it. */
  private handleChallenge(client: Client, msg: { enemyId?: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof msg.enemyId !== "string") return;
    if (player.encounter.status === "active" || player.hp <= 0) return;
    const pos = this.sim.positionOf(msg.enemyId);
    if (!pos) return;
    if (Math.hypot(pos.x - player.worldX, pos.y - player.worldY) > 2.6) {
      client.send("error", { type: "error", message: "Está demasiado lejos." });
      return;
    }
    this.onEnemyContact(msg.enemyId, client.sessionId);
  }

  private async handleCook(client: Client) {
    if (!this.sessions.has(client.sessionId)) return;
    const error = await this.gathering.startCook(client.sessionId);
    if (error) client.send("error", { type: "error", message: error });
  }

  private onEnemyContact(enemyId: string, sessionId: string) {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    const session = this.sessions.get(sessionId);
    const player = this.state.players.get(sessionId);
    const kind = this.sim.kindOf(enemyId);
    if (!client || !session || !player || !kind) return;
    if (player.encounter.status === "active" || player.hp <= 0) return;
    if (!this.sim.engage(enemyId, sessionId)) return;
    this.gathering.stop(sessionId, "combat");

    this.startEncounter(client, session, player, kind, enemyId).catch(() => {
      session.worldEnemyId = null;
      this.sim.release(enemyId, "fled", Date.now());
    });
  }

  override async onAuth(client: Client, options: { token?: string }) {
    const user = await this.svc.auth.verify(options.token ?? "");
    if (!user) throw new Error("unauthorized");
    return user;
  }

  override async onJoin(client: Client, _options: unknown, auth?: { id: string }) {
    const character = await this.svc.characters.findByUserId(auth!.id);
    if (!character) {
      client.leave(4002, "no_character");
      return;
    }

    // One live session per character: a second login replaces the first.
    for (const [otherId, other] of this.sessions) {
      if (otherId !== client.sessionId && other.character.id === character.id) {
        this.clients.find((c) => c.sessionId === otherId)?.leave(4001, "logged_in_elsewhere");
      }
    }

    const player = new PlayerSchema();
    player.characterId = character.id;
    player.name = character.name;
    player.race = character.race;
    player.charClass = character.class;
    player.level = character.level;
    player.hp = character.hp;
    player.maxHp = character.max_hp;
    player.posX = 1;
    player.posY = 3;
    player.worldX = WORLD_SPAWN.x;
    player.worldY = WORLD_SPAWN.y;
    player.facing = "south";
    this.state.players.set(client.sessionId, player);

    const session: SessionState = {
      character,
      encounterId: null,
      combatLog: [],
      enemyTemplate: null,
      worldEnemyId: null,
    };

    // Restore active encounter
    const active = await this.svc.encounters
      .findActiveByCharacter(character.id)
      .catch(() => null);
    if (active) {
      const et = await this.svc.encounters
        .getEnemyTemplate(active.enemy_type)
        .catch(() => null);
      if (et) {
        session.encounterId = active.id;
        session.combatLog = active.combat_log;
        session.enemyTemplate = et;

        player.posX = active.grid_state.player[0];
        player.posY = active.grid_state.player[1];
        player.encounter.encounterId = active.id;
        player.encounter.enemyName = active.enemy_type;
        player.encounter.enemyHp = active.enemy_hp;
        player.encounter.enemyMaxHp = active.enemy_max_hp;
        player.encounter.enemyPosX = active.grid_state.enemy[0];
        player.encounter.enemyPosY = active.grid_state.enemy[1];
        player.encounter.turn = active.turn;
        player.encounter.round = active.round;
        player.encounter.status = "active";
      }
    }

    this.sessions.set(client.sessionId, session);

    await this.svc.quests.getOrCreateDailyQuest(character.id).catch(() => {});

    // Hand the client its skills and backpack right away
    const skills = await this.skillsOf(client.sessionId).catch(() => null);
    if (skills) client.send("skills", skills);
    await this.sendInventory(client.sessionId);

    client.send("narrative", {
      type: "narrative",
      text: `Llegas a ${this.state.zoneName}. HP: ${character.hp}/${character.max_hp}.`,
    });
  }

  override async onLeave(client: Client, _consented: boolean) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);

    if (session?.encounterId && player) {
      await this.svc.encounters
        .persist(session.encounterId, {
          enemy_hp: player.encounter.enemyHp,
          turn: player.encounter.turn as "player" | "enemy",
          round: player.encounter.round,
          combat_log: session.combatLog,
          grid_state: {
            player: [player.posX, player.posY],
            enemy: [player.encounter.enemyPosX, player.encounter.enemyPosY],
          },
        })
        .catch(() => {});
    }

    if (session?.worldEnemyId) {
      this.sim.release(session.worldEnemyId, "fled", Date.now());
    }

    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    this.combatGraceUntil.delete(client.sessionId);
    this.moveBudget.delete(client.sessionId);
    this.gathering.stop(client.sessionId, "user");
    this.skillCache.delete(client.sessionId);
    // TODO: phase2 — party support (broadcast departure)
  }

  // ─── Message handlers ────────────────────────────────────────────

  private async handleAttack(client: Client) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    if (player.encounter.status !== "active") {
      client.send("error", { type: "error", message: "No estás en combate." });
      return;
    }

    if (player.encounter.turn !== "player") {
      client.send("error", { type: "error", message: "No es tu turno." });
      return;
    }

    const playerPos: [number, number] = [player.posX, player.posY];
    const enemyPos: [number, number] = [
      player.encounter.enemyPosX,
      player.encounter.enemyPosY,
    ];

    if (!isInMeleeRange(playerPos, enemyPos)) {
      client.send("error", {
        type: "error",
        message: "Fuera de rango de melé. Muévete hacia el enemigo.",
      });
      return;
    }

    const { character } = session;
    const et = session.enemyTemplate!;
    const playerAc = 10 + abilityModifier(character.dex);

    // Player attacks
    const playerTurn = processTurn({
      round: player.encounter.round,
      actor: "player",
      attacker: {
        hp: player.hp,
        maxHp: player.maxHp,
        str: character.str,
        dex: character.dex,
        ac: playerAc,
        attackDamageExpr: playerAttackExpr(character.str, character.level),
        level: character.level,
        pos: playerPos,
      },
      defender: {
        hp: player.encounter.enemyHp,
        maxHp: player.encounter.enemyMaxHp,
        str: et.str,
        dex: et.dex,
        ac: et.ac,
        attackDamageExpr: et.attack_damage,
        pos: enemyPos,
      },
    });

    session.combatLog.push(playerTurn.event);
    player.encounter.enemyHp = playerTurn.defenderNewHp;

    client.send("combat_event", { events: [playerTurn.event] });

    if (playerTurn.defenderNewHp <= 0) {
      await this.endCombat(client, session, player, "won");
      return;
    }

    // Enemy attacks back
    const enemyTurn = processTurn({
      round: player.encounter.round,
      actor: "enemy",
      attacker: {
        hp: player.encounter.enemyHp,
        maxHp: player.encounter.enemyMaxHp,
        str: et.str,
        dex: et.dex,
        ac: et.ac,
        attackDamageExpr: et.attack_damage,
        pos: enemyPos,
      },
      defender: {
        hp: player.hp,
        maxHp: player.maxHp,
        str: character.str,
        dex: character.dex,
        ac: playerAc,
        attackDamageExpr: playerAttackExpr(character.str, character.level),
        level: character.level,
        pos: playerPos,
      },
    });

    session.combatLog.push(enemyTurn.event);

    const newPlayerHp = Math.max(0, player.hp - (enemyTurn.event.damage ?? 0));
    player.hp = newPlayerHp;
    player.encounter.round += 1;
    player.encounter.turn = "player";

    await this.svc.characters.updateHp(character.id, newPlayerHp).catch(() => {});

    client.send("combat_event", { events: [enemyTurn.event] });

    if (newPlayerHp <= 0) {
      await this.endCombat(client, session, player, "lost");
    }
  }

  private async handleFlee(client: Client) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    if (player.encounter.status !== "active") {
      client.send("error", { type: "error", message: "No estás en combate." });
      return;
    }

    const escaped = Math.random() * 100 < GAME_CONFIG.FLEE_CHANCE;
    if (escaped) {
      await this.endCombat(client, session, player, "fled");
    } else {
      client.send("narrative", {
        type: "narrative",
        text: "¡Intentas escapar pero el camino está bloqueado! El enemigo te impide huir.",
      });
    }
  }

  private handleMove(
    client: Client,
    message: { direction?: string; x?: number; y?: number; facing?: string; yaw?: number },
  ) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (player.encounter.status === "active") {
      client.send("error", {
        type: "error",
        message: "No puedes moverte durante el combate.",
      });
      return;
    }

    if (isFacing(message.facing)) player.facing = message.facing;
    if (typeof message.yaw === "number" && Number.isFinite(message.yaw)) player.yaw = message.yaw;

    if (
      typeof message.x === "number" &&
      Number.isFinite(message.x) &&
      typeof message.y === "number" &&
      Number.isFinite(message.y)
    ) {
      const now = Date.now();
      const id = client.sessionId;
      const elapsed = Math.min(1, (now - (this.lastMoveAt.get(id) ?? now - 100)) / 1000);
      this.lastMoveAt.set(id, now);

      const cap = 2.5;
      const budget = Math.min(cap, (this.moveBudget.get(id) ?? cap) + elapsed * MOVE_SPEED * 1.35);
      const dist = Math.hypot(message.x - player.worldX, message.y - player.worldY);

      // Walls and world bounds are checked by validateMove; speed by the budget above.
      const result = dist <= budget + 0.05 ? validateMove(player.worldX, player.worldY, message.x, message.y, 1) : null;
      if (result?.ok) {
        const moved = Math.hypot(result.x - player.worldX, result.y - player.worldY);
        player.worldX = result.x;
        player.worldY = result.y;
        this.moveBudget.set(id, Math.max(0, budget - moved));
        this.gathering.onMoved(id);
      } else {
        // Snap the client back to the authoritative position.
        this.moveBudget.set(id, budget);
        client.send("position_corrected", { x: player.worldX, y: player.worldY });
      }
      return;
    }

    const deltas: Record<string, [number, number]> = {
      north: [0, -1],
      south: [0, 1],
      east: [1, 0],
      west: [-1, 0],
    };

    const delta = deltas[message.direction ?? ""];
    if (!delta) return;

    if (isFacing(message.direction)) player.facing = message.direction;
    const stepped = validateMove(
      player.worldX,
      player.worldY,
      player.worldX + delta[0] * 0.5,
      player.worldY + delta[1] * 0.5,
      0.5,
    );
    if (stepped.ok) {
      player.worldX = stepped.x;
      player.worldY = stepped.y;
    }
  }

  private async handleUseItem(client: Client, message: { item_id?: string }) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player || !message.item_id) return;

    const result = await this.svc.economy
      .useItem(session.character.id, message.item_id)
      .catch((e: Error) => {
        client.send("error", { type: "error", message: e.message });
        return null;
      });

    if (result) {
      const updated = await this.svc.characters
        .findById(session.character.id)
        .catch(() => null);
      if (updated) {
        session.character = updated;
        player.hp = updated.hp;
      }
      client.send("narrative", { type: "narrative", text: result.message });
      void this.sendInventory(client.sessionId);
    }
  }

  // ─── Combat lifecycle ─────────────────────────────────────────────

  private async startEncounter(
    client: Client,
    session: SessionState,
    player: PlayerSchema,
    enemyName: string,
    worldEnemyId: string,
  ) {
    const base = await this.resolveEnemyTemplate(enemyName);
    const et = base ? scaleTemplate(base, this.sim.levelOf(worldEnemyId)) : null;
    if (!et) {
      client.send("error", {
        type: "error",
        message: "No hay enemigos disponibles en esta zona.",
      });
      return;
    }

    const encounter = await this.svc.encounters.create(
      this.zoneId,
      session.character.id,
      et,
    );

    session.encounterId = encounter.id;
    session.combatLog = [];
    session.enemyTemplate = et;
    session.worldEnemyId = worldEnemyId;

    player.posX = encounter.grid_state.player[0];
    player.posY = encounter.grid_state.player[1];
    player.encounter.encounterId = encounter.id;
    player.encounter.enemyName = et.name;
    player.encounter.enemyLevel = this.sim.levelOf(worldEnemyId);
    player.encounter.enemyHp = et.hp;
    player.encounter.enemyMaxHp = et.hp;
    player.encounter.enemyPosX = encounter.grid_state.enemy[0];
    player.encounter.enemyPosY = encounter.grid_state.enemy[1];
    player.encounter.turn = "player";
    player.encounter.round = 1;
    player.encounter.status = "active";

    client.send("narrative", {
      type: "narrative",
      text: `¡Un ${et.name} (nv. ${this.sim.levelOf(worldEnemyId)}) se abalanza sobre ti! HP: ${et.hp} | CA: ${et.ac}.`,
    });
  }

  private async resolveEnemyTemplate(enemyName: string): Promise<EnemyTemplate | null> {
    const key = normalizeEnemyKey(enemyName);
    const fallback = FALLBACK_ENEMIES[key] ?? FALLBACK_ENEMIES.goblin;
    const requestedName = fallback?.name ?? "Goblin";

    const fromDb = await this.svc.encounters
      .getEnemyTemplate(requestedName)
      .catch(() => null);

    return fromDb ?? fallback ?? null;
  }

  private async endCombat(
    client: Client,
    session: SessionState,
    player: PlayerSchema,
    outcome: "won" | "lost" | "fled",
  ) {
    const { character } = session;
    const et = session.enemyTemplate;

    if (session.worldEnemyId) {
      this.sim.release(session.worldEnemyId, outcome as ReleaseOutcome, Date.now());
      session.worldEnemyId = null;
    }
    this.combatGraceUntil.set(client.sessionId, Date.now() + GAME_CONFIG.POST_COMBAT_GRACE_MS);

    if (session.encounterId) {
      await this.svc.encounters
        .close(session.encounterId, outcome, session.combatLog)
        .catch(() => {});
    }

    let xpGained = 0;
    let currencyGained = 0;

    if (outcome === "won" && et) {
      const { leveledUp, character: updated } = await this.svc.characters
        .addXp(character.id, et.xp_reward)
        .catch(() => ({ leveledUp: false, character }));
      xpGained = et.xp_reward;

      currencyGained = await this.svc.economy
        .rewardCombat(character.id, et.name)
        .catch(() => 0);

      await this.svc.quests
        .incrementProgress(character.id, et.name)
        .catch(() => {});

      session.character = updated;
      player.hp = updated.hp;
      player.maxHp = updated.max_hp;
      player.level = updated.level;

      if (leveledUp) {
        client.send("narrative", {
          type: "narrative",
          text: `¡Subiste al nivel ${updated.level}! Tu salud máxima aumentó a ${updated.max_hp}.`,
        });
      }
    }

    if (outcome === "lost") {
      const respawnHp = Math.max(1, Math.floor(character.max_hp / 2));
      await this.svc.characters.updateHp(character.id, respawnHp).catch(() => {});
      player.hp = respawnHp;
      session.character = { ...character, hp: respawnHp };
      // Defeated heroes wake up at the capital instead of being camped in place.
      player.worldX = WORLD_SPAWN.x;
      player.worldY = WORLD_SPAWN.y;
      client.send("position_corrected", { x: WORLD_SPAWN.x, y: WORLD_SPAWN.y });
    }

    const narrative = await this.svc.dm
      .narrateCombat({
        combatLog: session.combatLog,
        zoneName: this.state.zoneName,
        characterName: character.name,
        characterRace: character.race,
        characterClass: character.class,
        enemyName: et?.name ?? "enemigo",
        outcome,
      })
      .catch(() => "El combate ha terminado.");

    player.encounter.status = outcome;
    session.encounterId = null;
    session.combatLog = [];
    session.enemyTemplate = null;

    client.send("combat_ended", {
      type: "combat_ended",
      status: outcome,
      xp_gained: xpGained,
      currency_gained: currencyGained,
      narrative,
    });
  }
}

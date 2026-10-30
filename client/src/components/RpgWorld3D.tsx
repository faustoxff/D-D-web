import React, { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { Character } from "@dnd/shared";
import type { EncounterState } from "../store/game.store.ts";
import {
  MOVE_SPEED,
  WORLD_ENEMIES,
  WORLD_SPAWN,
  canStandAt,
  clampToWorld,
  findNearbyFire,
  findNearbyNpc,
  findNearbyResource,
  findTouchedEnemy,
  SKILLS,
  regionAt,
  type Direction,
  type EnemyKind,
} from "../game/world.ts";
import {
  WorldScene,
  type SceneAvatar,
  type SceneRemote,
  type ServerEnemy,
} from "../game3d/WorldScene.ts";
import MiniMap from "./MiniMap.tsx";
import { useGameStore } from "../store/game.store.ts";

interface Props {
  room: Room | null;
  character: Character;
  encounter: EncounterState;
  onEnemyTouch: (enemyName: EnemyKind, enemyId: string) => void;
}

interface PlayerSchemaLike {
  name?: unknown;
  worldX?: unknown;
  worldY?: unknown;
  posX?: unknown;
  posY?: unknown;
  facing?: unknown;
  race?: unknown;
  charClass?: unknown;
  yaw?: unknown;
  action?: unknown;
  onChange?: (callback: () => void) => void;
}

interface PlayerCollectionLike {
  forEach?: (callback: (player: PlayerSchemaLike, sessionId: string) => void) => void;
  onAdd?: (callback: (player: PlayerSchemaLike, sessionId: string) => void) => void;
  onRemove?: (callback: (player: PlayerSchemaLike, sessionId: string) => void) => void;
}

interface EnemySchemaLike {
  id?: unknown;
  kind?: unknown;
  level?: unknown;
  x?: unknown;
  y?: unknown;
  yaw?: unknown;
  state?: unknown;
  onChange?: (callback: () => void) => void;
}

interface EnemyCollectionLike {
  forEach?: (callback: (enemy: EnemySchemaLike, id: string) => void) => void;
  onAdd?: (callback: (enemy: EnemySchemaLike, id: string) => void) => void;
  onRemove?: (callback: (enemy: EnemySchemaLike, id: string) => void) => void;
}

function readEnemy(e: EnemySchemaLike, id: string): ServerEnemy | null {
  const kind = e.kind;
  if (kind !== "Goblin" && kind !== "Esqueleto" && kind !== "Lobo") return null;
  return {
    id,
    name: kind,
    level: finiteNumber(e.level, 1),
    x: finiteNumber(e.x, 0),
    y: finiteNumber(e.y, 0),
    yaw: finiteNumber(e.yaw, 0),
    state: typeof e.state === "string" ? e.state : "idle",
  };
}

interface DialogueState {
  npcName: string;
  lines: string[];
  index: number;
  shop?: boolean;
}

const SEND_INTERVAL_MS = 80;

interface Hint {
  text: string;
  warn: boolean;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDirection(value: unknown): Direction {
  if (value === "north" || value === "south" || value === "east" || value === "west") {
    return value;
  }
  return "south";
}

function readRemotePlayer(player: PlayerSchemaLike, sessionId: string): SceneRemote {
  return {
    sessionId,
    name: typeof player.name === "string" ? player.name : "Aventurero",
    x: finiteNumber(player.worldX, finiteNumber(player.posX, WORLD_SPAWN.x)),
    y: finiteNumber(player.worldY, finiteNumber(player.posY, WORLD_SPAWN.y)),
    facing: normalizeDirection(player.facing),
    race: typeof player.race === "string" ? player.race : "human",
    charClass: typeof player.charClass === "string" ? player.charClass : "fighter",
    yaw: finiteNumber(player.yaw, 0),
    action: typeof player.action === "string" ? player.action : "",
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export type MoveMode = "iso" | "screen";

/**
 * "iso": keys follow the map grid, like classic isometric games: W walks up-right on
 * screen, A up-left, S down-left, D down-right (W+D goes straight right).
 * "screen": W is always up on screen, D always right (the camera looks along (-1,-1)).
 */
function movementVector(keys: Set<string>, mode: MoveMode): { x: number; y: number } {
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");
  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  if (mode === "iso") return { x: dx, y: dy };
  const sx = dx; // screen-right
  const sy = -dy; // screen-up
  const k = Math.SQRT1_2;
  return { x: (sx - sy) * k, y: (-sy - sx) * k };
}

function readMoveMode(): MoveMode {
  try {
    return localStorage.getItem("dnd:moveMode") === "screen" ? "screen" : "iso";
  } catch {
    return "iso";
  }
}

/** The closest awake enemy within reach, so E can challenge it. */
function nearestEnemy(
  enemies: Map<string, ServerEnemy>,
  x: number,
  y: number,
): ServerEnemy | null {
  let best: ServerEnemy | null = null;
  let bestD = 2.4;
  for (const e of enemies.values()) {
    if (e.state === "dead" || e.state === "combat") continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function aimOf(avatar: SceneAvatar): { x: number; y: number } | undefined {
  return avatar.yaw === undefined ? undefined : { x: Math.sin(avatar.yaw), y: Math.cos(avatar.yaw) };
}

function facingFromVector(vector: { x: number; y: number }, current: Direction): Direction {
  if (Math.abs(vector.x) > Math.abs(vector.y)) return vector.x > 0 ? "east" : "west";
  if (vector.y !== 0) return vector.y > 0 ? "south" : "north";
  return current;
}

function roundForNetwork(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function RpgWorld3D({ room, character, encounter, onEnemyTouch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const keysRef = useRef(new Set<string>());
  const avatarRef = useRef<SceneAvatar>({
    x: WORLD_SPAWN.x,
    y: WORLD_SPAWN.y,
    facing: "south",
    moving: false,
  });
  const roomRef = useRef<Room | null>(room);
  const onEnemyTouchRef = useRef(onEnemyTouch);
  const encounterStatusRef = useRef(encounter.status);
  const remotesRef = useRef<Record<string, SceneRemote>>({});
  const serverEnemiesRef = useRef(new Map<string, ServerEnemy>());
  const defeatedRef = useRef(new Set<string>());
  const activeEnemyIdRef = useRef<string | null>(null);
  const pendingCombatRef = useRef(false);
  const pendingStartedAtRef = useRef(0);
  const combatCooldownUntilRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const lastSentPositionRef = useRef({ x: WORLD_SPAWN.x, y: WORLD_SPAWN.y });
  const dialogueRef = useRef<DialogueState | null>(null);
  const syncedInitialPositionRef = useRef(false);

  const [onlineCount, setOnlineCount] = useState(0);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const hintRef = useRef<Hint | null>(null);
  const [regionName, setRegionName] = useState(() => regionAt(WORLD_SPAWN.x, WORLD_SPAWN.y).name);
  const [banner, setBanner] = useState<string | null>(null);
  const regionRef = useRef(regionName);
  const bannerTimerRef = useRef<number | undefined>(undefined);
  const mapOpenRef = useRef(false);
  const moveModeRef = useRef<MoveMode>(readMoveMode());

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    onEnemyTouchRef.current = onEnemyTouch;
  }, [onEnemyTouch]);

  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  // Scene lifecycle + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    let scene: WorldScene;
    try {
      scene = new WorldScene(canvas, avatarRef.current);
    } catch {
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.setHero(character.name, character.race, character.class);
    window.dispatchEvent(new Event("dnd:effects-changed"));
    scene.setDefeated(defeatedRef.current);
    scene.setEnemySource(roomRef.current ? serverEnemiesRef.current : null);
    scene.setDepleted(useGameStore.getState().depleted);
    scene.syncRemotes(remotesRef.current, roomRef.current?.sessionId);

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      scene.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);

    let frameId = 0;
    let last = performance.now();
    let lastRegionCheck = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      updateAvatar(dt, now);

      const avatar = avatarRef.current;
      const npc =
        encounterStatusRef.current !== "active" && !dialogueRef.current
          ? findNearbyNpc(avatar.x, avatar.y, avatar.facing, aimOf(avatar))
          : null;
      scene.setNearbyNpc(npc?.id ?? null);

      // What would E do right now?
      let nextHint: Hint | null = null;
      if (encounterStatusRef.current !== "active" && !dialogueRef.current && !mapOpenRef.current) {
        const st = useGameStore.getState();
        if (st.gathering) {
          nextHint = { text: `${st.gathering.verb}… (E o muévete para parar)`, warn: false };
        } else if (npc) {
          nextHint = { text: `E · Hablar con ${npc.name}`, warn: false };
        } else if (roomRef.current && nearestEnemy(serverEnemiesRef.current, avatar.x, avatar.y)) {
          const foe = nearestEnemy(serverEnemiesRef.current, avatar.x, avatar.y)!;
          nextHint = { text: `E · Atacar ${foe.name} (Nv.${foe.level})`, warn: true };
        } else if (roomRef.current) {
          const res = findNearbyResource(avatar.x, avatar.y, aimOf(avatar));
          if (res) {
            const level = st.skills?.[res.def.skill].level ?? 1;
            const ok = level >= res.def.level;
            nextHint = {
              text: ok
                ? `E · ${SKILLS[res.def.skill].verb} ${res.def.name}`
                : `${res.def.name}: necesitas ${SKILLS[res.def.skill].label} nivel ${res.def.level}`,
              warn: !ok,
            };
          } else if (findNearbyFire(avatar.x, avatar.y)) {
            nextHint = { text: "E · Cocinar en la fogata", warn: false };
          }
        }
      }
      if (nextHint?.text !== hintRef.current?.text) {
        hintRef.current = nextHint;
        setHint(nextHint);
      }

      scene.update(dt, avatar);
      scene.render();

      if (now - lastRegionCheck > 250) {
        lastRegionCheck = now;
        const name = regionAt(avatar.x, avatar.y).name;
        if (name !== regionRef.current) {
          regionRef.current = name;
          setRegionName(name);
          setBanner(name);
          window.clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = window.setTimeout(() => setBanner(null), 3200);
        }
      }
      frameId = window.requestAnimationFrame(frame);
    };
    frameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(bannerTimerRef.current);
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // The loop reads mutable refs; it must only be created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.name, character.race, character.class]);

  // Room state -> scene
  useEffect(() => {
    if (!room) {
      remotesRef.current = {};
      setOnlineCount(0);
      syncedInitialPositionRef.current = false;
      sceneRef.current?.syncRemotes({}, undefined);
      sceneRef.current?.setEnemySource(null);
      return;
    }

    const collection = (room.state as { players?: PlayerCollectionLike }).players;
    if (!collection) return;

    // Server-owned enemies: mirror them into a map the scene reads every frame.
    const enemyMap = serverEnemiesRef.current;
    enemyMap.clear();
    const enemyCollection = (room.state as { enemies?: EnemyCollectionLike }).enemies;
    const attachEnemy = (enemy: EnemySchemaLike, id: string) => {
      const sync = () => {
        const next = readEnemy(enemy, id);
        if (next) enemyMap.set(id, next);
      };
      enemy.onChange?.(sync);
      sync();
    };
    enemyCollection?.forEach?.(attachEnemy);
    enemyCollection?.onAdd?.(attachEnemy);
    enemyCollection?.onRemove?.((_enemy, id) => {
      enemyMap.delete(id);
    });
    sceneRef.current?.setEnemySource(enemyMap);

    const publish = () => {
      sceneRef.current?.syncRemotes(remotesRef.current, room.sessionId);
      setOnlineCount(Object.keys(remotesRef.current).length);
    };

    const bound = new Set<string>();
    const attach = (player: PlayerSchemaLike, sessionId: string) => {
      if (bound.has(sessionId)) return;
      bound.add(sessionId);

      const sync = () => {
        const next = readRemotePlayer(player, sessionId);
        if (sessionId === room.sessionId && !syncedInitialPositionRef.current) {
          avatarRef.current = { x: next.x, y: next.y, facing: next.facing, moving: false };
          lastSentPositionRef.current = { x: next.x, y: next.y };
          syncedInitialPositionRef.current = true;
        }
        const known = remotesRef.current[sessionId];
        remotesRef.current[sessionId] = next;
        if (!known) publish();
        else sceneRef.current?.syncRemotes(remotesRef.current, room.sessionId);
      };

      player.onChange?.(sync);
      sync();
    };

    collection.forEach?.(attach);
    collection.onAdd?.(attach);
    collection.onRemove?.((_player, sessionId) => {
      delete remotesRef.current[sessionId];
      bound.delete(sessionId);
      publish();
    });

    // Server rejected our reported position (teleport / wall): snap back.
    room.onMessage("position_corrected", (msg: { x?: number; y?: number }) => {
      const x = finiteNumber(msg.x, avatarRef.current.x);
      const y = finiteNumber(msg.y, avatarRef.current.y);
      avatarRef.current = { ...avatarRef.current, x, y, moving: false };
      lastSentPositionRef.current = { x, y };
    });
  }, [room]);

  // Work animation, depleted nodes and floating text from the game store
  const gathering = useGameStore((st) => st.gathering);
  const depleted = useGameStore((st) => st.depleted);

  useEffect(() => {
    sceneRef.current?.setHeroAction(gathering?.action ?? "");
    if (gathering && gathering.action !== "cook") {
      const a = avatarRef.current;
      a.yaw = Math.atan2(gathering.tx + 0.5 - a.x, gathering.ty + 0.5 - a.y);
    }
  }, [gathering]);

  useEffect(() => {
    sceneRef.current?.setDepleted(depleted);
  }, [depleted]);

  useEffect(() => {
    const onPop = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; color?: string; dy?: number }>).detail;
      sceneRef.current?.popText(d.text, d.color, d.dy ?? 0);
    };
    window.addEventListener("dnd:pop", onPop);
    return () => window.removeEventListener("dnd:pop", onPop);
  }, []);

  // Mouse wheel zoom and the visual-effects toggle (bloom) from the HUD
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const onWheel = (e: WheelEvent) => {
      if (mapOpenRef.current) return;
      sceneRef.current?.addZoom(Math.sign(e.deltaY) * 0.1);
    };
    wrapper?.addEventListener("wheel", onWheel, { passive: true });

    const applyMoveMode = () => {
      moveModeRef.current = readMoveMode();
    };
    window.addEventListener("dnd:move-mode-changed", applyMoveMode);

    const applyEffects = () => {
      let on = true;
      try {
        on = localStorage.getItem("dnd:effects") !== "off";
      } catch {
        /* storage unavailable: keep effects on */
      }
      sceneRef.current?.setBloom(on);
    };
    applyEffects();
    window.addEventListener("dnd:effects-changed", applyEffects);
    return () => {
      wrapper?.removeEventListener("wheel", onWheel);
      window.removeEventListener("dnd:effects-changed", applyEffects);
      window.removeEventListener("dnd:move-mode-changed", applyMoveMode);
    };
  }, []);

  // Map button in the HUD
  useEffect(() => {
    const toggle = () => {
      mapOpenRef.current = !mapOpenRef.current;
      setMapOpen(mapOpenRef.current);
      keysRef.current.clear();
    };
    window.addEventListener("dnd:toggle-map", toggle);
    return () => window.removeEventListener("dnd:toggle-map", toggle);
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        keysRef.current.add(key);
        event.preventDefault();
      }

      if (key === "m" && !event.repeat) {
        mapOpenRef.current = !mapOpenRef.current;
        setMapOpen(mapOpenRef.current);
        keysRef.current.clear();
        event.preventDefault();
        return;
      }
      if (key === "escape" && mapOpenRef.current) {
        mapOpenRef.current = false;
        setMapOpen(false);
        return;
      }

      if (key === "e" && !event.repeat) {
        if (dialogueRef.current) {
          setDialogue((current) => {
            if (!current) return null;
            const nextIndex = current.index + 1;
            return nextIndex >= current.lines.length ? null : { ...current, index: nextIndex };
          });
          event.preventDefault();
          return;
        }

        const avatar = avatarRef.current;
        const npc = findNearbyNpc(avatar.x, avatar.y, avatar.facing, aimOf(avatar));
        if (npc) {
          setDialogue({ npcName: npc.name, lines: npc.dialogue, index: 0, ...(npc.shop ? { shop: true } : {}) });
          keysRef.current.clear();
          event.preventDefault();
          return;
        }

        // Nothing to talk to: fight, work the resource in front of us, or cook at a fire
        const room = roomRef.current;
        if (!room) return;
        const store = useGameStore.getState();
        const foe = nearestEnemy(serverEnemiesRef.current, avatar.x, avatar.y);
        if (foe && !store.gathering) {
          room.send("challenge", { enemyId: foe.id });
          keysRef.current.clear();
          event.preventDefault();
          return;
        }
        if (store.gathering) {
          room.send("stop_gather");
          store.setGathering(null);
          event.preventDefault();
          return;
        }
        const resource = findNearbyResource(avatar.x, avatar.y, aimOf(avatar));
        if (resource) {
          avatar.yaw = Math.atan2(resource.tx + 0.5 - avatar.x, resource.ty + 0.5 - avatar.y);
          room.send("gather", { tx: resource.tx, ty: resource.ty });
          keysRef.current.clear();
          event.preventDefault();
          return;
        }
        const fire = findNearbyFire(avatar.x, avatar.y);
        if (fire) {
          avatar.yaw = Math.atan2(fire.x - avatar.x, fire.y - avatar.y);
          room.send("cook");
          keysRef.current.clear();
          event.preventDefault();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Combat end: hide defeated enemy, or push the hero back
  useEffect(() => {
    const previousStatus = encounterStatusRef.current;
    encounterStatusRef.current = encounter.status;

    if (encounter.status === "active") {
      pendingCombatRef.current = false;
      return;
    }

    if (previousStatus === "active") {
      const activeEnemyId = activeEnemyIdRef.current;

      if (activeEnemyId && encounter.status === "won") {
        defeatedRef.current = new Set(defeatedRef.current).add(activeEnemyId);
        sceneRef.current?.setDefeated(defeatedRef.current);
      }

      if (activeEnemyId && encounter.status !== "won") {
        const enemy = WORLD_ENEMIES.find((item) => item.id === activeEnemyId);
        if (enemy) {
          const avatar = avatarRef.current;
          const dx = avatar.x - enemy.x;
          const dy = avatar.y - enemy.y;
          const length = Math.max(0.001, Math.hypot(dx, dy));
          const nextX = clampToWorld(avatar.x + (dx / length) * 0.8, "x");
          const nextY = clampToWorld(avatar.y + (dy / length) * 0.8, "y");
          if (canStandAt(nextX, nextY)) {
            avatarRef.current = { ...avatar, x: nextX, y: nextY };
          }
        }
      }

      activeEnemyIdRef.current = null;
      pendingCombatRef.current = false;
      combatCooldownUntilRef.current = performance.now() + 1200;
    }
  }, [encounter.status]);

  const updateAvatar = (dt: number, now: number) => {
    const avatar = avatarRef.current;

    if (pendingCombatRef.current && now - pendingStartedAtRef.current > 2500) {
      pendingCombatRef.current = false;
      activeEnemyIdRef.current = null;
      combatCooldownUntilRef.current = now + 700;
    }

    const controlsLocked =
      encounterStatusRef.current === "active" ||
      pendingCombatRef.current ||
      mapOpenRef.current ||
      dialogueRef.current !== null;

    if (controlsLocked) {
      avatar.moving = false;
      keysRef.current.clear();
      return;
    }

    const vector = movementVector(keysRef.current, moveModeRef.current);
    const length = Math.hypot(vector.x, vector.y);
    let moved = false;

    if (length > 0) {
      const nx = vector.x / length;
      const ny = vector.y / length;
      const distance = MOVE_SPEED * dt;
      const nextX = clampToWorld(avatar.x + nx * distance, "x");
      const nextY = clampToWorld(avatar.y + ny * distance, "y");

      if (canStandAt(nextX, avatar.y)) {
        avatar.x = nextX;
        moved = true;
      }
      if (canStandAt(avatar.x, nextY)) {
        avatar.y = nextY;
        moved = true;
      }

      if (moved && useGameStore.getState().gathering) {
        roomRef.current?.send("stop_gather");
        useGameStore.getState().setGathering(null);
      }
      avatar.facing = facingFromVector(vector, avatar.facing);
      avatar.yaw = Math.atan2(nx, ny);
      avatar.moving = moved;
    } else {
      avatar.moving = false;
    }

    // Offline preview only: with a server, enemies start the fight themselves.
    const touched = roomRef.current
      ? null
      : findTouchedEnemy(avatar.x, avatar.y, defeatedRef.current);
    if (
      touched &&
      now > combatCooldownUntilRef.current &&
      encounterStatusRef.current !== "active"
    ) {
      pendingCombatRef.current = true;
      pendingStartedAtRef.current = now;
      activeEnemyIdRef.current = touched.id;
      avatar.moving = false;
      keysRef.current.clear();
      onEnemyTouchRef.current(touched.name, touched.id);
    }

    if (!roomRef.current || now - lastSentAtRef.current < SEND_INTERVAL_MS) return;

    const last = lastSentPositionRef.current;
    if (Math.hypot(avatar.x - last.x, avatar.y - last.y) > 0.02 || moved) {
      roomRef.current.send("move", {
        x: roundForNetwork(avatar.x),
        y: roundForNetwork(avatar.y),
        facing: avatar.facing,
        yaw: avatar.yaw !== undefined ? roundForNetwork(avatar.yaw) : undefined,
      });
      lastSentAtRef.current = now;
      lastSentPositionRef.current = { x: avatar.x, y: avatar.y };
    }
  };

  const currentLine = dialogue?.lines[dialogue.index] ?? "";

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 overflow-hidden bg-dungeon-900"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full bg-dungeon-900"
      />

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-parchment-300">
          Tu navegador no pudo iniciar WebGL. Activa la aceleración por hardware e intenta de nuevo.
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded bg-dungeon-900/80 px-3 py-1.5 text-xs text-parchment-300 ring-1 ring-dungeon-600">
        <span className="font-semibold text-parchment-200">{regionName}</span>
        <span className="ml-2 text-parchment-500">
          {room ? `${onlineCount} online` : "offline"}
        </span>
      </div>

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center">
          <div className="rounded border border-parchment-300/60 bg-dungeon-900/85 px-6 py-2 text-center shadow-xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-parchment-500">Entras a</div>
            <div className="font-serif text-xl text-parchment-200">{banner}</div>
          </div>
        </div>
      )}

      {hint && !dialogue && !mapOpen && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2">
          <div
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold shadow-lg backdrop-blur ${
              hint.warn
                ? "border-red-400/50 bg-red-950/70 text-red-200"
                : "border-parchment-300/50 bg-dungeon-900/80 text-parchment-100"
            }`}
          >
            {hint.text}
          </div>
        </div>
      )}

      <MiniMap
        avatarRef={avatarRef}
        remotesRef={remotesRef}
        localSessionId={room?.sessionId}
        expanded={mapOpen}
        onClose={() => {
          mapOpenRef.current = false;
          setMapOpen(false);
        }}
      />

      {dialogue && (
        <div className="absolute bottom-10 left-1/2 z-20 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 rounded border-2 border-parchment-200 bg-parchment-50 p-4 text-dungeon-900 shadow-xl">
          <div className="mb-2 text-sm font-bold text-dungeon-700">{dialogue.npcName}</div>
          <p className="min-h-[3rem] text-base leading-relaxed">{currentLine}</p>
          <div className="mt-2 flex items-center justify-between">
            {dialogue.shop && dialogue.index === dialogue.lines.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  setDialogue(null);
                  useGameStore.getState().setShopOpen(true);
                }}
                className="rounded bg-dungeon-700 px-3 py-1 text-sm font-bold text-parchment-100 hover:bg-dungeon-600"
              >
                🛒 Comerciar
              </button>
            ) : (
              <span />
            )}
            <span className="text-xs font-bold text-dungeon-600">E</span>
          </div>
        </div>
      )}
    </div>
  );
}

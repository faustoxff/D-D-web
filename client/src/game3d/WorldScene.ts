import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  CAPITAL_ORIGIN,
  CHUNK_SIZE,
  CLASS_IDS,
  NPCS,
  RACE_IDS,
  WORLD_ENEMIES,
  WORLD_HEIGHT,
  WORLD_LAMPS,
  WORLD_WIDTH,
  biomeAt,
  hash2,
  type Direction,
  type WorldEnemy,
  type WorldLamp,
  type WorldNpc,
} from "../game/world.ts";
import {
  animateRig,
  buildGoblin,
  buildNpc,
  buildPlayer,
  buildSkeleton,
  buildWolf,
  makeNameplate,
  mat,
  setRigAction,
  type Rig,
} from "./models.ts";
import { buildChunk, disposeChunk, setDepletedNodes, waterMaterial, windUniform } from "./terrainKit.ts";
import { Ambience } from "./ambience.ts";
import { Fx } from "./fx.ts";

export interface SceneAvatar {
  x: number;
  y: number;
  facing: Direction;
  moving: boolean;
  /** Exact heading in radians (atan2(dx, dy)); smoother than the 4-way `facing`. */
  yaw?: number;
}

/** An enemy as simulated by the server (position is authoritative). */
export interface ServerEnemy extends WorldEnemy {
  yaw: number;
  state: string;
}

export interface SceneRemote {
  sessionId: string;
  name: string;
  x: number;
  y: number;
  facing: Direction;
  race?: string;
  charClass?: string;
  yaw?: number;
  action?: string;
}

interface Entity {
  rig: Rig;
  plate: THREE.Sprite;
  targetX: number;
  targetY: number;
  speed: number;
  seed: number;
  /** Heading reported by the other player; used while they stand still or work. */
  yawHint?: number | undefined;
}

const CAMERA_OFFSET = new THREE.Vector3(9.5, 11.5, 9.5);
const DAY_LENGTH_SECONDS = 300;
const CHUNK_RADIUS = 3; // chunks kept loaded around the camera
const STREAM_IN = 40; // tiles
const STREAM_OUT = 48;
const LIGHT_POOL = 8;
const CHUNKS_X = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
const CHUNKS_Y = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);

function yawFor(facing: Direction): number {
  switch (facing) {
    case "south":
      return 0;
    case "east":
      return Math.PI / 2;
    case "north":
      return Math.PI;
    case "west":
      return -Math.PI / 2;
  }
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
    // Geometries are per-mesh; shared materials from `mat()` are cached and kept.
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

function buildEnemyRig(enemy: WorldEnemy): Rig {
  if (enemy.name === "Goblin") return buildGoblin();
  if (enemy.name === "Esqueleto") return buildSkeleton();
  return buildWolf();
}

export class WorldScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 120);
  private cameraTarget = new THREE.Vector3();

  private sun = new THREE.DirectionalLight("#ffffff", 1);
  private hemi = new THREE.HemisphereLight("#bcd6ff", "#3b4a2a", 0.6);
  private lightPool: THREE.PointLight[] = [];
  private lightLamps: Array<WorldLamp | null> = [];
  private nightFactor = 0;

  private chunks = new Map<string, THREE.Group>();
  private lastChunkKey = "";

  private hero: Entity;
  private ring: THREE.Mesh;
  private npcs = new Map<string, Entity>();
  private enemies = new Map<string, Entity>();
  /** When set, enemies come from the server instead of the static world list. */
  private enemySource: Map<string, ServerEnemy> | null = null;
  private remotes = new Map<string, Entity>();
  private defeated = new Set<string>();
  private markerE: THREE.Sprite;
  private markerNpcId: string | null = null;

  private ambience = new Ambience();
  private fx = new Fx();
  private depletedKeys = new Set<string>();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private bloomEnabled = true;
  private cinematic: boolean;
  private orbitAngle = 0.6;
  private zoom = 1;
  private zoomTarget = 1;

  private elapsed = 0;
  private streamTimer = 0;
  private lightTimer = 0;
  private dayClock = DAY_LENGTH_SECONDS * 0.25; // start in the morning
  private daySpeed = 1;
  private skyColor = new THREE.Color();
  private lastDt = 0.016;
  private footstep: { x: number; z: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    start: { x: number; y: number },
    opts: { cinematic?: boolean } = {},
  ) {
    this.cinematic = opts.cinematic === true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene.fog = new THREE.Fog("#20364f", 30, 58);
    this.scene.add(this.ambience.group, this.fx.group);

    if (this.cinematic) {
      // Title screen: hold the golden hour with the lamps just lit
      this.dayClock = DAY_LENGTH_SECONDS * 0.485;
      this.daySpeed = 0.1;
    }

    try {
      const size = this.renderer.getSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6, 0.55, 1.0);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null; // post-processing unavailable: render directly
    }
    this.cameraTarget.set(start.x, 0, start.y);

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -18;
    cam.right = 18;
    cam.top = 18;
    cam.bottom = -18;
    cam.near = 1;
    cam.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    for (let i = 0; i < LIGHT_POOL; i += 1) {
      const light = new THREE.PointLight("#ffcf7a", 0, 9, 1.8);
      this.scene.add(light);
      this.lightPool.push(light);
      this.lightLamps.push(null);
    }

    this.buildTavernSign();

    // Hero
    const heroRig = buildPlayer("human", "fighter", "hero");
    this.scene.add(heroRig.root);
    this.hero = {
      rig: heroRig,
      plate: makeNameplate("", "#f5deb3"),
      targetX: start.x,
      targetY: start.y,
      speed: 0,
      seed: 0,
    };
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 24),
      new THREE.MeshBasicMaterial({ color: "#f5deb3", transparent: true, opacity: 0.7 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.scene.add(this.ring);

    this.markerE = makeNameplate("E", "#ffe9a8");
    this.markerE.visible = false;
    this.scene.add(this.markerE);

    if (this.cinematic) {
      heroRig.root.visible = false;
      this.ring.visible = false;
      this.hero.plate.visible = false;
      this.spawnCrowd(start);
    }

    // Load everything around the start synchronously so the first frame is complete
    this.updateChunks(start.x, start.y, Infinity);
    this.streamEntities(start.x, start.y);
    this.updateLights(start.x, start.y);
  }

  private buildTavernSign() {
    const { x: ox, y: oy } = CAPITAL_ORIGIN;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.08), mat("#6b3f1f"));
    sign.position.set(ox + 6.5, 1.7, oy + 9.15);
    sign.castShadow = true;
    const text = makeNameplate("La Taberna del Grifo", "#f5deb3");
    text.position.set(ox + 6.5, 1.7, oy + 9.25);
    text.scale.multiplyScalar(0.9);
    this.scene.add(sign, text);
  }

  // ─── Chunk + entity streaming ──────────────────────────────────

  private updateChunks(px: number, py: number, budget: number) {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccy = Math.floor(py / CHUNK_SIZE);
    const key = `${ccx},${ccy}`;
    const missing: Array<{ cx: number; cy: number; d: number }> = [];

    for (let cy = ccy - CHUNK_RADIUS; cy <= ccy + CHUNK_RADIUS; cy += 1) {
      for (let cx = ccx - CHUNK_RADIUS; cx <= ccx + CHUNK_RADIUS; cx += 1) {
        if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) continue;
        if (!this.chunks.has(`${cx},${cy}`)) {
          missing.push({ cx, cy, d: Math.abs(cx - ccx) + Math.abs(cy - ccy) });
        }
      }
    }

    missing.sort((a, b) => a.d - b.d);
    for (const m of missing.slice(0, budget)) {
      const group = buildChunk(m.cx, m.cy);
      this.scene.add(group);
      this.chunks.set(`${m.cx},${m.cy}`, group);
    }

    if (key !== this.lastChunkKey) {
      this.lastChunkKey = key;
      for (const [k, group] of this.chunks) {
        const [cx, cy] = k.split(",").map(Number) as [number, number];
        if (Math.abs(cx - ccx) > CHUNK_RADIUS + 1 || Math.abs(cy - ccy) > CHUNK_RADIUS + 1) {
          this.scene.remove(group);
          disposeChunk(group);
          this.chunks.delete(k);
        }
      }
    }
  }

  private spawnNpc(npc: WorldNpc) {
    const rig = buildNpc(npc.color);
    rig.root.position.set(npc.x, 0, npc.y);
    rig.root.rotation.y = yawFor(npc.facing);
    const plate = makeNameplate(npc.name, "#f5deb3");
    plate.visible = !this.cinematic;
    plate.position.set(npc.x, rig.tagHeight + 0.3, npc.y);
    this.scene.add(rig.root, plate);
    this.npcs.set(npc.id, {
      rig,
      plate,
      targetX: npc.x,
      targetY: npc.y,
      speed: 0,
      seed: hash2(Math.floor(npc.x * 10), Math.floor(npc.y * 10), 1) * 6,
    });
  }

  private spawnEnemy(enemy: WorldEnemy) {
    const rig = buildEnemyRig(enemy);
    rig.root.position.set(enemy.x, 0, enemy.y);
    rig.root.rotation.y = hash2(Math.floor(enemy.x * 10), Math.floor(enemy.y * 10), 5) * Math.PI * 2;
    const plate = makeNameplate(`Nv.${enemy.level} ${enemy.name}`, "#ffd8a8");
    plate.position.set(enemy.x, rig.tagHeight + 0.3, enemy.y);
    this.scene.add(rig.root, plate);
    this.enemies.set(enemy.id, {
      rig,
      plate,
      targetX: enemy.x,
      targetY: enemy.y,
      speed: 0,
      seed: hash2(Math.floor(enemy.x * 10), Math.floor(enemy.y * 10), 9) * 6,
    });
  }

  private removeEntity(map: Map<string, Entity>, id: string) {
    const entity = map.get(id);
    if (!entity) return;
    this.scene.remove(entity.rig.root, entity.plate);
    disposeObject(entity.rig.root);
    disposeObject(entity.plate);
    map.delete(id);
  }

  private streamEntities(px: number, py: number) {
    for (const npc of NPCS) {
      const d = Math.hypot(npc.x - px, npc.y - py);
      const present = this.npcs.has(npc.id);
      if (!present && d < STREAM_IN) this.spawnNpc(npc);
      else if (present && d > STREAM_OUT) this.removeEntity(this.npcs, npc.id);
    }
    const source: Iterable<WorldEnemy> = this.cinematic
      ? []
      : this.enemySource
        ? this.enemySource.values()
        : WORLD_ENEMIES;
    const seen = new Set<string>();
    for (const enemy of source) {
      seen.add(enemy.id);
      const present = this.enemies.has(enemy.id);
      const dead = this.enemySource?.get(enemy.id)?.state === "dead";
      if (dead) {
        if (present) this.removeEntity(this.enemies, enemy.id);
        continue;
      }
      if (this.defeated.has(enemy.id)) {
        if (present) this.removeEntity(this.enemies, enemy.id);
        continue;
      }
      const d = Math.hypot(enemy.x - px, enemy.y - py);
      if (!present && d < STREAM_IN) this.spawnEnemy(enemy);
      else if (present && d > STREAM_OUT) this.removeEntity(this.enemies, enemy.id);
    }
    // Drop rigs whose enemy no longer exists on the server
    for (const id of [...this.enemies.keys()]) {
      if (!seen.has(id)) this.removeEntity(this.enemies, id);
    }
    if (this.markerNpcId && !this.npcs.has(this.markerNpcId)) this.markerE.visible = false;
  }

  /** Assign the point-light pool to the lamps nearest the player. */
  private updateLights(px: number, py: number) {
    const near = WORLD_LAMPS.map((lamp) => ({ lamp, d: Math.hypot(lamp.x - px, lamp.y - py) }))
      .filter((item) => item.d < 26)
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_POOL);

    this.lightPool.forEach((light, i) => {
      const item = near[i];
      this.lightLamps[i] = item?.lamp ?? null;
      if (!item) {
        light.intensity = 0;
        return;
      }
      const { lamp } = item;
      light.position.set(lamp.x, lamp.kind === "hearth" ? 1.2 : 1.4, lamp.y);
      if (lamp.kind === "hearth") {
        light.color.set("#ff9b4a");
        light.distance = 7;
      } else if (lamp.kind === "fire") {
        light.color.set("#ff8a3a");
        light.distance = 9;
      } else {
        light.color.set("#ffcf7a");
        light.distance = 9;
      }
    });
  }

  private applyLightIntensity() {
    this.lightPool.forEach((light, i) => {
      const lamp = this.lightLamps[i];
      if (!lamp) return;
      const flicker = 1 + Math.sin(this.elapsed * 13 + i * 3) * 0.08;
      if (lamp.kind === "hearth") light.intensity = 8 * flicker;
      else if (lamp.kind === "fire") light.intensity = (3 + this.nightFactor * 12) * flicker;
      else light.intensity = this.nightFactor * 14;
    });
  }

  // ─── Public API ────────────────────────────────────────────────

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = width / Math.max(1, height) < 1 ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  setHero(name: string, race: string, charClass: string) {
    const old = this.hero.plate;
    this.scene.remove(old, this.hero.rig.root);
    disposeObject(old);
    disposeObject(this.hero.rig.root);

    const rig = buildPlayer(race, charClass, name);
    this.scene.add(rig.root);
    this.hero.rig = rig;
    this.hero.plate = makeNameplate(name, "#f5deb3");
    this.scene.add(this.hero.plate);
  }

  /** Switch between server-driven enemies (map) and the static offline list (null). */
  setEnemySource(source: Map<string, ServerEnemy> | null) {
    for (const id of [...this.enemies.keys()]) this.removeEntity(this.enemies, id);
    this.enemySource = source;
    this.streamTimer = 0;
  }

  /** Show used-up trees and veins as stumps/rubble; rebuilds only the chunks that changed. */
  setDepleted(keys: Set<string>) {
    const changed = new Set<string>();
    for (const k of keys) if (!this.depletedKeys.has(k)) changed.add(k);
    for (const k of this.depletedKeys) if (!keys.has(k)) changed.add(k);
    this.depletedKeys = new Set(keys);
    setDepletedNodes(this.depletedKeys);
    for (const k of changed) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      const ck = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
      const old = this.chunks.get(ck);
      if (!old) continue;
      this.scene.remove(old);
      disposeChunk(old);
      const [cx, cy] = ck.split(",").map(Number) as [number, number];
      const group = buildChunk(cx, cy);
      this.scene.add(group);
      this.chunks.set(ck, group);
    }
  }

  /** Work pose for the local hero ("" | "chop" | "mine" | "fish" | "cook"). */
  setHeroAction(action: string) {
    setRigAction(this.hero.rig, action);
  }

  /** A rising label above the hero's head (+25 Tala, item names, level ups). */
  popText(text: string, color?: string, dy = 0) {
    const p = this.hero.rig.root.position;
    this.fx.floatText(p.x, this.hero.rig.tagHeight + 0.7 + dy, p.z, text, color);
  }

  setDefeated(defeated: Set<string>) {
    this.defeated = new Set(defeated);
    for (const id of defeated) this.removeEntity(this.enemies, id);
  }

  syncRemotes(remotes: Record<string, SceneRemote>, localSessionId?: string) {
    for (const [id] of this.remotes) {
      if (!remotes[id] || id === localSessionId) this.removeEntity(this.remotes, id);
    }

    for (const remote of Object.values(remotes)) {
      if (remote.sessionId === localSessionId) continue;
      let entity = this.remotes.get(remote.sessionId);
      if (!entity) {
        const rig = buildPlayer(remote.race ?? "human", remote.charClass ?? "fighter", remote.name);
        rig.root.position.set(remote.x, 0, remote.y);
        const plate = makeNameplate(remote.name, "#a7d8ff");
        this.scene.add(rig.root, plate);
        entity = {
          rig,
          plate,
          targetX: remote.x,
          targetY: remote.y,
          speed: 0,
          seed: hash2(Math.floor(remote.x * 10), Math.floor(remote.y * 10), 3) * 6,
        };
        this.remotes.set(remote.sessionId, entity);
      }
      entity.targetX = remote.x;
      entity.targetY = remote.y;
      setRigAction(entity.rig, remote.action ?? "");
      entity.yawHint = remote.yaw;
    }
  }

  setNearbyNpc(npcId: string | null) {
    this.markerNpcId = npcId;
    this.markerE.visible = npcId !== null && this.npcs.has(npcId);
  }

  setBloom(enabled: boolean) {
    this.bloomEnabled = enabled;
  }

  /** Mouse-wheel zoom: positive = zoom out. */
  addZoom(delta: number) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + delta, 0.55, 1.7);
  }

  /** Decorative people strolling around the tavern for the title screen. */
  private spawnCrowd(center: { x: number; y: number }) {
    const roles = 7;
    for (let i = 0; i < roles; i += 1) {
      const race = RACE_IDS[(i * 2 + 1) % RACE_IDS.length]!;
      const cls = CLASS_IDS[i % CLASS_IDS.length]!;
      const rig = buildPlayer(race, cls, `crowd-${i}`);
      rig.root.position.set(center.x, 0, center.y);
      this.scene.add(rig.root);
      this.remotes.set(`crowd-${i}`, {
        rig,
        plate: new THREE.Sprite(new THREE.SpriteMaterial({ visible: false })),
        targetX: center.x,
        targetY: center.y,
        speed: 0,
        seed: i * 1.7,
      });
    }
  }

  private updateCrowd(center: { x: number; y: number }) {
    let i = 0;
    for (const [id, entity] of this.remotes) {
      if (!id.startsWith("crowd-")) continue;
      const dir = i % 2 === 0 ? 1 : -1;
      const lane = (i % 3) * 0.7 - 0.7;
      const speed = 0.16 + (i % 4) * 0.035;
      entity.targetX = center.x + Math.sin(this.elapsed * speed * dir + i * 1.9) * (4 + (i % 3) * 1.5);
      entity.targetY = center.y + lane + Math.cos(this.elapsed * speed * 0.7 + i) * 0.5;
      i += 1;
    }
  }

  update(dt: number, avatar: SceneAvatar) {
    this.elapsed += dt;
    this.lastDt = dt;
    windUniform.value = this.elapsed;
    this.dayClock = (this.dayClock + dt * this.daySpeed) % DAY_LENGTH_SECONDS;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 8);
    if (this.cinematic) this.updateCrowd(avatar);

    this.updateChunks(avatar.x, avatar.y, 2);

    this.streamTimer -= dt;
    if (this.streamTimer <= 0) {
      this.streamTimer = 0.3;
      this.streamEntities(avatar.x, avatar.y);
    }
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.5;
      this.updateLights(avatar.x, avatar.y);
    }

    this.updateHero(dt, avatar);
    this.updateRemotes(dt);

    for (const entity of this.npcs.values()) {
      animateRig(entity.rig, this.elapsed, 0, entity.seed);
    }
    this.updateEnemies(dt);
    this.fx.update(dt);
    this.workHits();

    this.updateMarker();
    this.updateCamera(dt, avatar);
    this.updateDayNight();
    this.applyLightIntensity();

    const wave = 0.5 + Math.sin(this.elapsed * 1.4) * 0.5;
    waterMaterial.opacity = 0.86 + wave * 0.07;
  }

  render() {
    if (this.composer && this.bloomEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    for (const group of this.chunks.values()) disposeChunk(group);
    this.chunks.clear();
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
    this.ambience.dispose();
    this.fx.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  // ─── Per-frame updates ─────────────────────────────────────────

  private updateHero(dt: number, avatar: SceneAvatar) {
    const { rig, plate } = this.hero;
    rig.root.position.set(avatar.x, 0, avatar.y);
    rig.root.rotation.y = lerpAngle(rig.root.rotation.y, avatar.yaw ?? yawFor(avatar.facing), Math.min(1, dt * 14));
    this.hero.speed += ((avatar.moving ? 1 : 0) - this.hero.speed) * Math.min(1, dt * 12);
    this.footstep = avatar.moving && !this.cinematic ? { x: avatar.x, z: avatar.y } : null;
    animateRig(rig, this.elapsed, this.hero.speed);
    plate.position.set(avatar.x, rig.tagHeight + 0.3, avatar.y);

    this.ring.position.x = avatar.x;
    this.ring.position.z = avatar.y;
    (this.ring.material as THREE.MeshBasicMaterial).opacity =
      0.55 + Math.sin(this.elapsed * 3.5) * 0.15;
  }

  private updateRemotes(dt: number) {
    for (const entity of this.remotes.values()) {
      const pos = entity.rig.root.position;
      const dx = entity.targetX - pos.x;
      const dz = entity.targetY - pos.z;
      const dist = Math.hypot(dx, dz);
      const blend = Math.min(1, dt * 10);

      if (dist > 4) {
        pos.x = entity.targetX;
        pos.z = entity.targetY;
      } else {
        pos.x += dx * blend;
        pos.z += dz * blend;
      }

      const moving = dist > 0.06;
      entity.speed += ((moving ? 1 : 0) - entity.speed) * Math.min(1, dt * 10);
      if (!moving && entity.yawHint !== undefined) {
        entity.rig.root.rotation.y = lerpAngle(entity.rig.root.rotation.y, entity.yawHint, Math.min(1, dt * 10));
      }
      if (moving) {
        entity.rig.root.rotation.y = lerpAngle(
          entity.rig.root.rotation.y,
          Math.atan2(dx, dz),
          Math.min(1, dt * 12),
        );
      }
      animateRig(entity.rig, this.elapsed, entity.speed, entity.seed);
      entity.plate.position.set(pos.x, entity.rig.tagHeight + 0.3, pos.z);
    }
  }

  /** Chips fly when an axe bites, sparks when a pick strikes. */
  private workHits() {
    const rigs: Rig[] = [this.hero.rig, ...[...this.remotes.values()].map((e) => e.rig)];
    for (const rig of rigs) {
      if (!rig.hit) continue;
      rig.hit = false;
      const yaw = rig.root.rotation.y;
      const x = rig.root.position.x + Math.sin(yaw) * 0.95;
      const z = rig.root.position.z + Math.cos(yaw) * 0.95;
      if (rig.action === "chop") this.fx.burst(x, 1.0, z, "#c99a5a", 6, 2.4);
      else if (rig.action === "mine") {
        this.fx.burst(x, 0.9, z, "#ffe6b0", 7, 3.2, 10);
        this.fx.burst(x, 0.9, z, "#9a9aa6", 4, 2, 9);
      }
    }
  }

  private updateEnemies(dt: number) {
    const source = this.enemySource;
    for (const [id, entity] of this.enemies) {
      const rec = source?.get(id);
      if (!rec) {
        animateRig(entity.rig, this.elapsed, 0.08, entity.seed);
        continue;
      }

      const pos = entity.rig.root.position;
      const dx = rec.x - pos.x;
      const dz = rec.y - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 4) {
        pos.x = rec.x;
        pos.z = rec.y;
      } else {
        const blend = Math.min(1, dt * 9);
        pos.x += dx * blend;
        pos.z += dz * blend;
      }

      const moving = dist > 0.03 && rec.state !== "combat";
      const target = rec.state === "chase" ? 1 : 0.55;
      entity.speed += ((moving ? target : 0) - entity.speed) * Math.min(1, dt * 8);
      entity.rig.root.rotation.y = lerpAngle(entity.rig.root.rotation.y, rec.yaw, Math.min(1, dt * 10));
      animateRig(entity.rig, this.elapsed, entity.speed, entity.seed);
      entity.plate.position.set(pos.x, entity.rig.tagHeight + 0.3, pos.z);
    }
  }

  private updateMarker() {
    if (!this.markerNpcId) return;
    const npc = this.npcs.get(this.markerNpcId);
    if (!npc) return;
    this.markerE.position.set(
      npc.rig.root.position.x,
      npc.rig.tagHeight + 0.85 + Math.sin(this.elapsed * 4) * 0.08,
      npc.rig.root.position.z,
    );
  }

  private updateCamera(dt: number, avatar: SceneAvatar) {
    if (this.cinematic) {
      // Slow orbit around the tavern with a gentle breathing motion
      this.orbitAngle += dt * 0.045;
      this.cameraTarget.set(avatar.x, 1.3, avatar.y);
      const radius = 15 + Math.sin(this.elapsed * 0.11) * 2;
      const height = 6.2 + Math.sin(this.elapsed * 0.17) * 1.1;
      this.camera.position.set(
        avatar.x + Math.cos(this.orbitAngle) * radius,
        height,
        avatar.y + Math.sin(this.orbitAngle) * radius,
      );
      this.camera.lookAt(this.cameraTarget);
      this.sun.target.position.copy(this.cameraTarget);
      return;
    }

    const follow = Math.min(1, dt * 9);
    this.cameraTarget.x += (avatar.x - this.cameraTarget.x) * follow;
    this.cameraTarget.z += (avatar.y - this.cameraTarget.z) * follow;
    this.camera.position.copy(this.cameraTarget).addScaledVector(CAMERA_OFFSET, this.zoom);
    this.camera.lookAt(this.cameraTarget);
    this.sun.target.position.copy(this.cameraTarget);
  }

  private updateDayNight() {
    const phase = this.dayClock / DAY_LENGTH_SECONDS;
    const angle = phase * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const daylight = THREE.MathUtils.clamp(sunHeight * 1.6 + 0.35, 0, 1);
    this.nightFactor = 1 - daylight;

    this.sun.position
      .copy(this.cameraTarget)
      .add(new THREE.Vector3(Math.cos(angle) * 22, 10 + Math.abs(sunHeight) * 16, 12));
    this.sun.intensity = 0.15 + daylight * 1.15;
    this.sun.color.set(sunHeight < 0.25 ? "#ffb46b" : "#fff4dd");
    this.hemi.intensity = 0.28 + daylight * 0.45;

    // Sky gradient: night -> dusk -> day
    const skyDay = { top: new THREE.Color("#2f6fc0"), horizon: new THREE.Color("#a9d6f5") };
    const skyDusk = { top: new THREE.Color("#3a3466"), horizon: new THREE.Color("#f09a5c") };
    const skyNight = { top: new THREE.Color("#04081a"), horizon: new THREE.Color("#141f3d") };
    const top = new THREE.Color();
    const horizon = new THREE.Color();
    if (daylight > 0.5) {
      const k = (daylight - 0.5) * 2;
      top.copy(skyDusk.top).lerp(skyDay.top, k);
      horizon.copy(skyDusk.horizon).lerp(skyDay.horizon, k);
    } else {
      const k = daylight * 2;
      top.copy(skyNight.top).lerp(skyDusk.top, k);
      horizon.copy(skyNight.horizon).lerp(skyDusk.horizon, k);
    }
    this.skyColor.copy(horizon);
    this.renderer.setClearColor(horizon);
    (this.scene.fog as THREE.Fog).color.copy(horizon);

    // Bloom is stronger at night, when the lamps carry the scene
    if (this.bloom) this.bloom.strength = 0.35 + this.nightFactor * 0.55;

    this.ambience.update({
      dt: this.lastDt,
      time: this.elapsed,
      center: this.cinematic ? this.cameraTarget : this.cameraTarget,
      cameraPos: this.camera.position,
      sunDir: new THREE.Vector3(Math.cos(angle) * 22, sunHeight * 22, 12),
      nightFactor: this.nightFactor,
      daylight,
      sky: { top, horizon },
      snowing: !this.cinematic && biomeAt(Math.floor(this.cameraTarget.x), Math.floor(this.cameraTarget.z)) === "snow",
      walking: this.footstep,
    });
  }
}

import * as THREE from "three";
import { CLASSES, RACES, isClassId, isRaceId, type ClassDef, type RaceDef } from "@dnd/shared";

// Low-poly procedural models. Everything is built from flat-shaded primitives so
// no external assets are needed. Each model faces +Z in local space.

const materialCache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: string, emissive?: string): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive ?? ""}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (emissive) m.emissive = new THREE.Color(emissive);
    materialCache.set(key, m);
  }
  return m;
}

function box(
  w: number,
  h: number,
  d: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cone(r: number, h: number, seg: number, color: string, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

function ico(r: number, color: string, detail = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color));
  mesh.castShadow = true;
  return mesh;
}

/** Pivot group so a limb rotates from its top (shoulder / hip). */
function limb(
  w: number,
  h: number,
  d: number,
  color: string,
  x: number,
  y: number,
  z = 0,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(box(w, h, d, color, 0, -h / 2, 0));
  return pivot;
}

/**
 * Anchors a weapon in the hand (the hand sits at the end of the arm pivot) and tilts it
 * forward. Parts are modelled with the grip at the origin and the business end along +Y.
 */
function hold(arm: THREE.Object3D, tilt: number, parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, -0.52, 0.07);
  g.rotation.x = tilt;
  for (const part of parts) g.add(part);
  arm.add(g);
  return g;
}

function swordParts(): THREE.Object3D[] {
  return [
    box(0.05, 0.15, 0.05, "#5a3a22", 0, 0, 0), // grip
    box(0.075, 0.05, 0.075, "#d4a843", 0, -0.09, 0), // pommel
    box(0.26, 0.045, 0.09, "#d4a843", 0, 0.1, 0), // crossguard
    box(0.07, 0.68, 0.03, "#d8dee6", 0, 0.46, 0), // blade
    box(0.04, 0.1, 0.025, "#eef2f7", 0, 0.85, 0), // tip
  ];
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Height above the ground where the nameplate should float. */
  tagHeight: number;
  kind: "humanoid" | "quadruped";
  /** Held weapon, hidden while a work tool is in hand. */
  weapon?: THREE.Object3D;
  /** Work tools keyed by action ("chop" | "mine" | "fish"). */
  tools?: Record<string, THREE.Object3D>;
  /** Current work pose: "" | "chop" | "mine" | "fish" | "cook". */
  action?: string;
  /** Set when a swing connects; the scene reads it to spawn chips and sparks, then clears it. */
  hit?: boolean;
  cycle?: number;
}

interface HumanoidStyle {
  skin: string;
  tunic: string;
  trim: string;
  legs: string;
  hair?: string;
  scale?: number;
}

function buildHumanoid(style: HumanoidStyle): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  body.add(box(0.5, 0.55, 0.3, style.tunic, 0, 0.95, 0));
  body.add(box(0.52, 0.1, 0.32, style.trim, 0, 0.7, 0)); // belt

  const head = new THREE.Group();
  head.position.y = 1.4;
  head.add(box(0.34, 0.34, 0.34, style.skin, 0, 0, 0));
  head.add(box(0.07, 0.07, 0.02, "#1a1210", -0.08, 0.02, 0.175));
  head.add(box(0.07, 0.07, 0.02, "#1a1210", 0.08, 0.02, 0.175));
  if (style.hair) {
    head.add(box(0.38, 0.14, 0.38, style.hair, 0, 0.18, -0.01));
    head.add(box(0.38, 0.3, 0.1, style.hair, 0, 0.02, -0.16));
  }
  body.add(head);

  const armL = limb(0.14, 0.5, 0.14, style.tunic, -0.34, 1.18);
  const armR = limb(0.14, 0.5, 0.14, style.tunic, 0.34, 1.18);
  armL.add(box(0.13, 0.12, 0.13, style.skin, 0, -0.52, 0));
  armR.add(box(0.13, 0.12, 0.13, style.skin, 0, -0.52, 0));
  const legL = limb(0.18, 0.55, 0.2, style.legs, -0.13, 0.68);
  const legR = limb(0.18, 0.55, 0.2, style.legs, 0.13, 0.68);
  legL.add(box(0.2, 0.1, 0.26, "#1c130c", 0, -0.55, 0.03));
  legR.add(box(0.2, 0.1, 0.26, "#1c130c", 0, -0.55, 0.03));
  body.add(armL, armR, legL, legR);

  root.scale.setScalar(style.scale ?? 1);
  return {
    root,
    body,
    armL,
    armR,
    legL,
    legR,
    tagHeight: 1.95 * (style.scale ?? 1),
    kind: "humanoid",
  };
}

export function buildHero(): Rig {
  const rig = buildHumanoid({
    skin: "#d8aa72",
    tunic: "#6f4cc3",
    trim: "#d4a843",
    legs: "#3f2a18",
    hair: "#2b1b0f",
  });
  // cape
  rig.body.add(box(0.46, 0.7, 0.05, "#4b347d", 0, 0.95, -0.19));
  hold(rig.armR, 1.2, swordParts());
  return rig;
}

export function buildNpc(color: string): Rig {
  const rig = buildHumanoid({
    skin: "#d8aa72",
    tunic: color,
    trim: "#4a3320",
    legs: "#2e2418",
    hair: "#5a3a22",
  });
  return rig;
}

export function buildGoblin(): Rig {
  const rig = buildHumanoid({
    skin: "#5a9e45",
    tunic: "#7f3f2b",
    trim: "#3a2a1a",
    legs: "#4a3a22",
    scale: 0.78,
  });
  const head = rig.body.children.find(
    (c) => c instanceof THREE.Group && c.position.y > 1.3,
  );
  if (head) {
    const earL = cone(0.08, 0.3, 4, "#5a9e45", 0);
    earL.position.set(-0.26, 0.05, 0);
    earL.rotation.z = Math.PI / 2 + 0.2;
    const earR = earL.clone();
    earR.position.x = 0.26;
    earR.rotation.z = -(Math.PI / 2 + 0.2);
    head.add(earL, earR);
  }
  hold(rig.armR, 1.3, [
    box(0.045, 0.1, 0.045, "#4a3320", 0, 0, 0),
    box(0.14, 0.035, 0.07, "#8a6a2c", 0, 0.07, 0),
    box(0.05, 0.3, 0.025, "#aab2ba", 0, 0.24, 0),
  ]);
  return rig;
}

export function buildSkeleton(): Rig {
  const rig = buildHumanoid({
    skin: "#ece4cf",
    tunic: "#d8d0b8",
    trim: "#b8ad92",
    legs: "#d8d0b8",
  });
  // make ribs/limbs thinner for a bony look
  rig.armL.scale.set(0.7, 1, 0.7);
  rig.armR.scale.set(0.7, 1, 0.7);
  rig.legL.scale.set(0.7, 1, 0.7);
  rig.legR.scale.set(0.7, 1, 0.7);
  rig.body.add(box(0.1, 0.1, 0.02, "#2c2720", -0.08, 1.42, 0.18));
  hold(rig.armR, 1.15, [
    box(0.06, 0.12, 0.06, "#6b5a3a", 0, 0, 0),
    box(0.2, 0.04, 0.08, "#7a6a4a", 0, 0.08, 0),
    box(0.07, 0.55, 0.03, "#9a9a9a", 0, 0.38, 0),
  ]);
  return rig;
}

export function buildWolf(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const fur = "#5e6470";
  const dark = "#3f434c";
  body.add(box(0.5, 0.45, 1.0, fur, 0, 0.6, 0));
  body.add(box(0.46, 0.2, 0.5, dark, 0, 0.78, 0.15));

  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.62);
  head.add(box(0.36, 0.34, 0.38, fur, 0, 0, 0));
  head.add(box(0.2, 0.18, 0.28, dark, 0, -0.06, 0.28));
  head.add(box(0.05, 0.05, 0.02, "#e8f2ff", -0.1, 0.06, 0.2));
  head.add(box(0.05, 0.05, 0.02, "#e8f2ff", 0.1, 0.06, 0.2));
  const earL = cone(0.07, 0.2, 4, dark, 0.22);
  earL.position.x = -0.12;
  const earR = cone(0.07, 0.2, 4, dark, 0.22);
  earR.position.x = 0.12;
  head.add(earL, earR);
  body.add(head);

  const tail = limb(0.1, 0.5, 0.1, fur, 0, 0.8, -0.5);
  tail.rotation.x = -0.9;
  body.add(tail);

  const legFL = limb(0.12, 0.45, 0.12, dark, -0.17, 0.42, 0.35);
  const legFR = limb(0.12, 0.45, 0.12, dark, 0.17, 0.42, 0.35);
  const legBL = limb(0.12, 0.45, 0.12, dark, -0.17, 0.42, -0.35);
  const legBR = limb(0.12, 0.45, 0.12, dark, 0.17, 0.42, -0.35);
  body.add(legFL, legFR, legBL, legBR);

  // reuse humanoid slots: arms = front legs, legs = back legs
  return {
    root,
    body,
    armL: legFL,
    armR: legFR,
    legL: legBL,
    legR: legBR,
    tail,
    tagHeight: 1.35,
    kind: "quadruped",
  };
}

/** Walk / idle animation. `t` in seconds, `speed` 0..1 blends idle -> walk. */
function workPose(rig: Rig, t: number, seed: number) {
  const action = rig.action ?? "";
  rig.legL.rotation.x = 0;
  rig.legR.rotation.x = 0;

  if (action === "chop" || action === "mine") {
    const rate = action === "chop" ? 4.4 : 5.2;
    const phase = t * rate + seed;
    const cycle = Math.floor(phase / (Math.PI * 2));
    const swing = Math.pow(0.5 + 0.5 * Math.sin(phase), 2); // quick down-stroke, slower wind-up
    rig.armR.rotation.x = -2.55 + swing * 2.4;
    rig.armL.rotation.x = -2.1 + swing * 1.9;
    rig.body.rotation.x = 0.06 + swing * 0.22;
    rig.body.position.y = 0;
    if (cycle !== (rig.cycle ?? 0)) {
      rig.cycle = cycle;
      rig.hit = true;
    }
    return;
  }
  if (action === "fish") {
    rig.armR.rotation.x = -1.05 + Math.sin(t * 1.3 + seed) * 0.05;
    rig.armL.rotation.x = -0.35;
    rig.body.rotation.x = -0.04 + Math.sin(t * 0.7) * 0.02;
    rig.body.position.y = 0;
    return;
  }
  // cook: stir over the fire
  rig.armR.rotation.x = -0.9 + Math.sin(t * 5 + seed) * 0.28;
  rig.armL.rotation.x = -0.7 + Math.cos(t * 5 + seed) * 0.22;
  rig.body.rotation.x = 0.12;
  rig.body.position.y = 0;
}

export function animateRig(rig: Rig, t: number, speed: number, seed = 0) {
  if (rig.kind === "humanoid" && rig.action) {
    workPose(rig, t, seed);
    return;
  }
  rig.body.rotation.x = 0;
  const swing = Math.sin(t * 9 + seed) * 0.7 * speed;
  const idle = Math.sin(t * 2 + seed) * 0.03;

  if (rig.kind === "humanoid") {
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    rig.armL.rotation.x = -swing * 0.8;
    rig.armR.rotation.x = swing * 0.8;
    rig.body.position.y = Math.abs(Math.sin(t * 9 + seed)) * 0.05 * speed + idle;
    if (rig.tail) rig.tail.rotation.z = Math.sin(t * 5 + seed) * (0.12 + 0.2 * speed);
  } else {
    rig.armL.rotation.x = swing;
    rig.legR.rotation.x = swing;
    rig.armR.rotation.x = -swing;
    rig.legL.rotation.x = -swing;
    rig.body.position.y = Math.abs(Math.sin(t * 9 + seed)) * 0.04 * speed + idle;
    if (rig.tail) rig.tail.rotation.z = Math.sin(t * 6 + seed) * 0.3;
  }
}

/** Quick lunge toward the facing direction, used when an attack lands. */
export function lungeRig(rig: Rig, progress: number) {
  const p = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
  rig.armR.rotation.x = -1.6 * p;
  rig.body.position.z = 0.25 * p;
}


// ─── Playable characters (race + class) ─────────────────────────────

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function pick<T>(list: T[], r: number, fallback: T): T {
  return list.length ? (list[Math.floor(r * list.length) % list.length] ?? fallback) : fallback;
}

function addRaceFeatures(head: THREE.Group, race: RaceDef, skin: string, hair: string | undefined) {
  const v = race.visual;
  if (v.ears) {
    const long = v.ears === "long";
    for (const side of [-1, 1]) {
      const ear = box(0.05, long ? 0.26 : 0.17, 0.08, skin, side * 0.21, 0.04, 0);
      ear.rotation.z = side * (long ? -0.75 : -0.55);
      head.add(ear);
    }
  }
  if (v.horns) {
    for (const side of [-1, 1]) {
      const horn = cone(0.045, 0.3, 4, "#2a1c1c", 0);
      horn.position.set(side * 0.1, 0.3, -0.02);
      horn.rotation.z = side * -0.35;
      head.add(horn);
    }
  }
  if (v.tusks) {
    for (const side of [-1, 1]) head.add(box(0.04, 0.09, 0.04, "#f2ead8", side * 0.09, -0.1, 0.18));
  }
  if (v.beard && hair) {
    head.add(box(0.32, 0.22, 0.1, hair, 0, -0.17, 0.15));
    head.add(box(0.2, 0.1, 0.06, hair, 0, -0.03, 0.18));
  }
  if (v.snout) {
    head.add(box(0.2, 0.13, 0.18, skin, 0, -0.06, 0.24));
    for (const side of [-1, 1]) {
      const spike = cone(0.03, 0.16, 4, skin, 0);
      spike.position.set(side * 0.1, 0.2, -0.1);
      spike.rotation.x = -0.6;
      head.add(spike);
    }
  }
}

function addHat(head: THREE.Group, hat: NonNullable<ClassDef["outfit"]["hat"]>, outfit: ClassDef["outfit"]) {
  switch (hat) {
    case "helmet":
      head.add(box(0.4, 0.14, 0.4, "#9aa3ad", 0, 0.2, -0.01));
      head.add(box(0.06, 0.2, 0.04, "#9aa3ad", 0, 0.05, 0.2));
      head.add(box(0.06, 0.08, 0.1, "#c0392b", 0, 0.3, -0.05));
      break;
    case "hood":
      head.add(box(0.42, 0.18, 0.42, outfit.tunic, 0, 0.18, -0.02));
      head.add(box(0.42, 0.36, 0.1, outfit.tunic, 0, 0, -0.18));
      head.add(box(0.1, 0.34, 0.3, outfit.tunic, -0.2, 0, -0.05));
      head.add(box(0.1, 0.34, 0.3, outfit.tunic, 0.2, 0, -0.05));
      break;
    case "wizard":
      head.add(box(0.62, 0.05, 0.62, outfit.tunic, 0, 0.19, 0));
      head.add(cone(0.26, 0.7, 6, outfit.tunic, 0.57));
      head.add(box(0.28, 0.05, 0.28, outfit.trim, 0, 0.24, 0));
      break;
    case "mitre":
      head.add(box(0.3, 0.26, 0.22, outfit.tunic, 0, 0.3, 0));
      head.add(box(0.08, 0.2, 0.24, outfit.trim, 0, 0.3, 0));
      break;
  }
}

function addWeapon(arm: THREE.Object3D, weapon: ClassDef["outfit"]["weapon"]): THREE.Object3D {
  switch (weapon) {
    case "sword":
      return hold(arm, 1.2, swordParts());
    case "dagger":
      return hold(arm, 1.3, [
        box(0.045, 0.1, 0.045, "#4a3320", 0, 0, 0),
        box(0.14, 0.035, 0.07, "#8a6a2c", 0, 0.07, 0),
        box(0.05, 0.3, 0.025, "#cfd6de", 0, 0.24, 0),
      ]);
    case "staff": {
      // Held upright with a slight lean; the hand grips it low-middle
      const orb = ico(0.11, "#7fd0ff");
      orb.position.set(0, 1.02, 0);
      return hold(arm, 0.22, [box(0.05, 1.5, 0.05, "#6b4424", 0, 0.2, 0), box(0.1, 0.06, 0.1, "#d4a843", 0, 0.92, 0), orb]);
    }
    case "mace": {
      const head = ico(0.12, "#d4a843");
      head.position.set(0, 0.52, 0);
      return hold(arm, 1.0, [box(0.05, 0.46, 0.05, "#6b4424", 0, 0.18, 0), head]);
    }
  }
}

/** Work tools live in the hand too, hidden until the character starts working. */
function addWorkTools(arm: THREE.Object3D): Record<string, THREE.Object3D> {
  const axe = hold(arm, 0.5, [
    box(0.05, 0.62, 0.05, "#6b4424", 0, 0.22, 0),
    box(0.22, 0.15, 0.05, "#aab2ba", 0.1, 0.5, 0),
  ]);
  const pick = hold(arm, 0.5, [
    box(0.05, 0.62, 0.05, "#6b4424", 0, 0.22, 0),
    box(0.5, 0.07, 0.06, "#9aa3ad", 0, 0.54, 0),
    box(0.06, 0.12, 0.06, "#7a838d", -0.26, 0.5, 0),
    box(0.06, 0.12, 0.06, "#7a838d", 0.26, 0.5, 0),
  ]);
  const rod = hold(arm, 1.0, [
    box(0.03, 1.15, 0.03, "#8a6a3a", 0, 0.4, 0),
    box(0.015, 0.5, 0.015, "#dfe6ee", 0, 1.2, 0.06),
    box(0.07, 0.07, 0.07, "#d94a3a", 0, 1.5, 0.06),
  ]);
  for (const t of [axe, pick, rod]) t.visible = false;
  return { chop: axe, mine: pick, fish: rod };
}

/** Switches the pose and which item is in hand (weapon or work tool). */
export function setRigAction(rig: Rig, action: string) {
  if ((rig.action ?? "") === action) return;
  rig.action = action;
  rig.cycle = 0;
  if (rig.weapon) rig.weapon.visible = action === "" || action === "cook";
  for (const [key, tool] of Object.entries(rig.tools ?? {})) tool.visible = key === action;
}

/** Builds a playable character: body proportions from race, outfit from class. */
export function buildPlayer(raceId: string, classId: string, key: string): Rig {
  const race = RACES[isRaceId(raceId) ? raceId : "human"];
  const cls = CLASSES[isClassId(classId) ? classId : "fighter"];
  const v = race.visual;
  const outfit = cls.outfit;
  const r1 = hashString(`${key}:skin`);
  const r2 = hashString(`${key}:hair`);
  const skin = pick(v.skin, r1, "#d8aa72");
  const hair = v.bald || v.hair.length === 0 ? undefined : pick(v.hair, r2, "#2b1b0f");
  const W = v.width;
  const robed = cls.id === "wizard" || cls.id === "cleric";

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  body.add(box(0.5 * W, 0.55, 0.3 * W, outfit.tunic, 0, 0.95, 0));
  body.add(box(0.52 * W, 0.1, 0.32 * W, outfit.trim, 0, 0.7, 0));
  if (robed) body.add(box(0.54 * W, 0.42, 0.34 * W, outfit.tunic, 0, 0.5, 0));
  if (cls.id === "fighter") {
    body.add(box(0.56 * W, 0.16, 0.34 * W, "#9aa3ad", 0, 1.2, 0)); // pauldrons / gorget
  }
  if (outfit.cape) body.add(box(0.46 * W, 0.72, 0.05, outfit.cape, 0, 0.92, -0.19 * W));

  const head = new THREE.Group();
  head.position.y = 1.4;
  head.add(box(0.34, 0.34, 0.34, skin, 0, 0, 0));
  const eye = v.eyes ?? "#1a1210";
  head.add(box(0.07, 0.07, 0.02, eye, -0.08, 0.02, 0.175));
  head.add(box(0.07, 0.07, 0.02, eye, 0.08, 0.02, 0.175));
  if (hair) {
    head.add(box(0.38, 0.14, 0.38, hair, 0, 0.18, -0.01));
    head.add(box(0.38, 0.3, 0.1, hair, 0, 0.02, -0.16));
  }
  addRaceFeatures(head, race, skin, hair);
  if (outfit.hat) addHat(head, outfit.hat, outfit);
  body.add(head);

  const armL = limb(0.14, 0.5, 0.14, outfit.tunic, -0.34 * W, 1.18);
  const armR = limb(0.14, 0.5, 0.14, outfit.tunic, 0.34 * W, 1.18);
  armL.add(box(0.13, 0.12, 0.13, skin, 0, -0.52, 0));
  armR.add(box(0.13, 0.12, 0.13, skin, 0, -0.52, 0));
  const legL = limb(0.18, 0.55, 0.2, outfit.legs, -0.13 * W, 0.68);
  const legR = limb(0.18, 0.55, 0.2, outfit.legs, 0.13 * W, 0.68);
  legL.add(box(0.2, 0.1, 0.26, "#1c130c", 0, -0.55, 0.03));
  legR.add(box(0.2, 0.1, 0.26, "#1c130c", 0, -0.55, 0.03));
  body.add(armL, armR, legL, legR);
  const weapon = addWeapon(armR, outfit.weapon);
  const tools = addWorkTools(armR);

  let tail: THREE.Object3D | undefined;
  if (v.tail) {
    const t = limb(0.09, 0.6, 0.09, v.snout ? skin : skin, 0, 0.75, -0.17 * W);
    t.rotation.x = 1.9;
    body.add(t);
    tail = t;
  }

  root.scale.setScalar(v.height);
  const hatExtra = outfit.hat === "wizard" ? 0.45 : outfit.hat === "mitre" ? 0.15 : 0;
  const rig: Rig = {
    root,
    body,
    armL,
    armR,
    legL,
    legR,
    tagHeight: (1.95 + hatExtra) * v.height,
    kind: "humanoid",
  };
  if (tail) rig.tail = tail;
  rig.weapon = weapon;
  rig.tools = tools;
  return rig;
}

// ─── Environment ─────────────────────────────────────────────────────

export function buildTree(variant: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = box(0.28, 1.0, 0.28, "#6b3f1f", 0, 0.5, 0);
  g.add(trunk);
  const greens = ["#1f5f34", "#2f7a3d", "#3d9348"];
  const tiers = 3;
  for (let i = 0; i < tiers; i += 1) {
    const c = cone(0.85 - i * 0.2, 0.9, 6, greens[(i + variant) % 3] ?? "#2f7a3d", 1.25 + i * 0.6);
    g.add(c);
  }
  g.rotation.y = variant * 1.3;
  const s = 0.9 + (variant % 3) * 0.15;
  g.scale.setScalar(s);
  return g;
}

export function buildRock(variant: number): THREE.Mesh {
  const rock = ico(0.35, variant % 2 ? "#7d776c" : "#6c675d", 0);
  rock.scale.set(1, 0.7, 1.1);
  rock.position.y = 0.2;
  rock.rotation.y = variant;
  return rock;
}

export function buildFlowers(variant: number): THREE.Group {
  const g = new THREE.Group();
  const colors = ["#f8d3f0", "#ffd176", "#ff9aa8", "#b9d7ff"];
  for (let i = 0; i < 4; i += 1) {
    const x = Math.sin(variant * 7 + i * 2.1) * 0.3;
    const z = Math.cos(variant * 5 + i * 1.7) * 0.3;
    g.add(box(0.03, 0.2, 0.03, "#3f7a34", x, 0.1, z));
    g.add(box(0.1, 0.07, 0.1, colors[(variant + i) % colors.length] ?? "#f8d3f0", x, 0.22, z));
  }
  return g;
}

export function buildWallBlock(): THREE.Mesh {
  const m = box(1, 1.1, 1, "#74685b", 0, 0.55, 0);
  return m;
}

export function buildWaterTile(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.2, 1),
    new THREE.MeshLambertMaterial({
      color: "#2d7fa0",
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    }),
  );
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildRoof(width: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.78, 1.4, 4),
    mat("#8a3b2c"),
  );
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
  roof.position.y = 0.7;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

export function buildLantern(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.08, 1.2, 0.08, "#3a2a1a", 0, 0.6, 0));
  const lamp = box(0.2, 0.2, 0.2, "#ffd68a", 0, 1.3, 0);
  lamp.material = new THREE.MeshBasicMaterial({ color: "#ffd68a" });
  g.add(lamp);
  return g;
}

// ─── Nameplates ──────────────────────────────────────────────────────

export function makeNameplate(text: string, color = "#f5deb3"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = "bold 28px Georgia, serif";
  if (ctx) {
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 28;
    canvas.height = 48;
    ctx.font = font;
    ctx.fillStyle = "rgba(20, 12, 7, 0.78)";
    ctx.fillRect(0, 4, canvas.width, 40);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, 25);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(0.42 * aspect, 0.42, 1);
  sprite.renderOrder = 10;
  return sprite;
}

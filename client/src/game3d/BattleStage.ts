import * as THREE from "three";
import type { EnemyKind } from "@dnd/shared";
import { animateRig, buildGoblin, buildPlayer, buildRock, buildSkeleton, buildTree, buildWolf, type Rig } from "./models.ts";

export interface FxEvent {
  actor: "player" | "enemy";
  hit: boolean;
  damage: number | null;
  roll: number;
}

export type PopupKind = "damage" | "crit" | "miss" | "player-damage";

export interface Popup {
  text: string;
  kind: PopupKind;
  x: number;
  y: number;
}

interface Tween {
  t: number;
  duration: number;
  update: (k: number) => void;
  done?: () => void;
}

interface Spark {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
}

const ease = {
  out: (k: number) => 1 - Math.pow(1 - k, 3),
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  in: (k: number) => k * k,
};

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(c);
}

/** Give every mesh of a rig its own materials so it can flash without affecting others. */
function isolateMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const m = child.material as THREE.MeshLambertMaterial;
      child.material = m.clone();
    }
  });
}

function flash(root: THREE.Object3D, color: string, k: number) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const m = child.material as THREE.MeshLambertMaterial;
      if (m.emissive) {
        m.emissive.set(color);
        m.emissiveIntensity = k;
      }
    }
  });
}

const ENEMY_RIM: Record<EnemyKind, string> = {
  Goblin: "#7dff8a",
  Esqueleto: "#8fd8ff",
  Lobo: "#a9b8ff",
};

/** 3D arena for a fight: hero from behind vs the enemy, with attack/hit animations. */
export class BattleStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  private hero: Rig;
  private enemy: Rig;
  private heroHome = new THREE.Vector3(-2.3, 0, 1.9);
  private enemyHome = new THREE.Vector3(2.6, 0, -2.3);
  private tweens: Tween[] = [];
  private sparks: Spark[] = [];
  private dot = dotTexture();
  private elapsed = 0;
  private intro = 0;
  private shake = 0;
  private dead: "hero" | "enemy" | null = null;
  private victory = false;
  private heroOffset = new THREE.Vector3();
  private enemyOffset = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, hero: { race: string; cls: string; name: string }, enemyKind: EnemyKind) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Late-afternoon sky
    const sky = document.createElement("canvas");
    sky.width = 4;
    sky.height = 256;
    const sctx = sky.getContext("2d");
    if (sctx) {
      const g = sctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#3d6fb8");
      g.addColorStop(0.55, "#f0a56a");
      g.addColorStop(1, "#ffd9a0");
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 4, 256);
    }
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog("#f0b27a", 16, 36);

    this.scene.add(new THREE.HemisphereLight("#ffe2c0", "#3a4a2a", 0.85));
    const sun = new THREE.DirectionalLight("#ffd9a8", 1.5);
    sun.position.set(-6, 9, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const rim = new THREE.PointLight(ENEMY_RIM[enemyKind], 5, 12, 1.6);
    rim.position.set(3, 2.5, -3.5);
    this.scene.add(rim);

    // Arena
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8.4, 0.5, 40),
      new THREE.MeshLambertMaterial({ color: "#5b9b40", flatShading: true }),
    );
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.4, 5.7, 48),
      new THREE.MeshBasicMaterial({ color: "#f5deb3", transparent: true, opacity: 0.25 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
    for (const [pos, color] of [[this.heroHome, "#f5deb3"], [this.enemyHome, "#ff8a6a"]] as const) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.3, 0.08, 28),
        new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 0.55 }),
      );
      disc.position.set(pos.x, 0.03, pos.z);
      disc.receiveShadow = true;
      this.scene.add(disc);
    }

    // Surrounding trees and rocks
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.1;
      const r = 8.8 + (i % 4) * 1.5;
      const prop = i % 5 === 0 ? buildRock(i) : buildTree(i);
      prop.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.scene.add(prop);
    }

    // Fighters
    this.hero = buildPlayer(hero.race, hero.cls, hero.name);
    this.enemy = enemyKind === "Goblin" ? buildGoblin() : enemyKind === "Esqueleto" ? buildSkeleton() : buildWolf();
    isolateMaterials(this.hero.root);
    isolateMaterials(this.enemy.root);
    const enemyScale = enemyKind === "Lobo" ? 1.45 : 1.35;
    this.enemy.root.scale.multiplyScalar(enemyScale);
    this.enemy.root.userData["baseScale"] = this.enemy.root.scale.x;
    this.hero.root.scale.multiplyScalar(1.05);
    this.hero.root.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.castShadow = true) : undefined));
    this.enemy.root.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.castShadow = true) : undefined));
    this.scene.add(this.hero.root, this.enemy.root);
    this.faceEachOther();
    this.place();
  }

  private faceEachOther() {
    const d = this.enemyHome.clone().sub(this.heroHome);
    this.hero.root.rotation.y = Math.atan2(d.x, d.z);
    this.enemy.root.rotation.y = Math.atan2(-d.x, -d.z);
  }

  private place() {
    this.hero.root.position.copy(this.heroHome).add(this.heroOffset);
    this.enemy.root.position.copy(this.enemyHome).add(this.enemyOffset);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = this.camera.aspect < 1.2 ? 48 : 34;
    this.camera.updateProjectionMatrix();
  }

  /** Screen position (px, relative to the canvas) above a fighter's head. */
  private project(rig: Rig, extra = 0.4): { x: number; y: number } {
    const v = rig.root.position.clone();
    v.y += rig.tagHeight * rig.root.scale.y + extra;
    v.project(this.camera);
    const size = this.renderer.getSize(new THREE.Vector2());
    return { x: ((v.x + 1) / 2) * size.x, y: ((1 - v.y) / 2) * size.y };
  }

  private tween(duration: number, update: (k: number) => void, done?: () => void) {
    this.tweens.push({ t: 0, duration, update, ...(done ? { done } : {}) });
  }

  private burst(at: THREE.Vector3, color: string, count: number, speed = 4, gravity = 9) {
    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.dot,
          color,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      sprite.position.copy(at);
      sprite.scale.setScalar(0.25 + Math.random() * 0.25);
      this.scene.add(sprite);
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      this.sparks.push({
        sprite,
        vel: new THREE.Vector3(Math.cos(a) * speed * Math.random(), up * speed, Math.sin(a) * speed * Math.random()),
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        gravity,
      });
    }
  }

  /** Animates one combat event and returns what the UI should pop up. */
  playEvent(ev: FxEvent, onPopup: (p: Popup) => void): number {
    const attacker = ev.actor === "player" ? this.hero : this.enemy;
    const defender = ev.actor === "player" ? this.enemy : this.hero;
    const aHome = ev.actor === "player" ? this.heroHome : this.enemyHome;
    const dHome = ev.actor === "player" ? this.enemyHome : this.heroHome;
    const aOff = ev.actor === "player" ? this.heroOffset : this.enemyOffset;
    const dOff = ev.actor === "player" ? this.enemyOffset : this.heroOffset;
    const dir = dHome.clone().sub(aHome).setY(0).normalize();
    const crit = ev.hit && ev.roll === 20;

    const windup = 0.22; // pull back and raise the weapon
    const strike = 0.16; // dash forward and swing
    const back = 0.3; // return to position
    const LUNGE = 3.4; // world units covered at the peak of the dash

    this.tween(windup + strike, (k) => {
      const t = k * (windup + strike);
      let reach: number;
      let arm: number;
      if (t < windup) {
        const p = ease.out(t / windup);
        reach = -0.12 * p;
        arm = -2.7 * p;
      } else {
        const p = ease.out((t - windup) / strike);
        reach = -0.12 + 1.12 * p;
        arm = -2.7 + 2.5 * p;
      }
      aOff.copy(dir).multiplyScalar(reach * LUNGE);
      attacker.armR.rotation.x = arm;
    }, () => {
      // Impact
      const impact = defender.root.position.clone().add(new THREE.Vector3(0, defender.tagHeight * 0.5, 0));
      if (ev.hit) {
        this.burst(impact, crit ? "#ffd84a" : "#ffb070", crit ? 26 : 14, crit ? 6 : 4);
        flash(defender.root, "#ff3030", 1.4);
        this.tween(0.32, (k) => {
          flash(defender.root, "#ff3030", 1.4 * (1 - k));
          dOff.copy(dir).multiplyScalar((1 - k) * (crit ? 1.3 : 0.7) * ease.out(Math.min(1, k * 3)));
        }, () => flash(defender.root, "#000000", 0));
        this.shake = crit ? 0.5 : Math.max(this.shake, 0.18);
        const pos = this.project(defender);
        onPopup({
          text: crit ? `¡CRÍTICO! -${ev.damage ?? 0}` : `-${ev.damage ?? 0}`,
          kind: crit ? "crit" : ev.actor === "enemy" ? "player-damage" : "damage",
          ...pos,
        });
      } else {
        this.burst(impact.clone().add(new THREE.Vector3(0, 0.3, 0)), "#e8f2ff", 7, 2.2, 3);
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        this.tween(0.45, (k) => {
          dOff.copy(side).multiplyScalar(Math.sin(k * Math.PI) * 1.2);
        });
        const pos = this.project(defender);
        onPopup({ text: "¡Falla!", kind: "miss", ...pos });
      }
      // Return to position
      this.tween(back, (k) => {
        aOff.copy(dir).multiplyScalar(LUNGE * (1 - ease.inOut(k)));
        attacker.armR.rotation.x = -0.2 * (1 - k);
      });
    });

    return (windup + strike + back) * 1000;
  }

  /** Final animation once the fight is decided. */
  playOutcome(outcome: "won" | "lost" | "fled"): number {
    if (outcome === "won") {
      this.dead = "enemy";
      this.victory = true;
      const at = this.enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0));
      this.burst(at, "#cfcfcf", 24, 3, 1);
      this.tween(0.9, (k) => {
        this.enemy.root.rotation.z = (Math.PI / 2) * ease.in(Math.min(1, k * 1.6));
        this.enemy.root.position.y = -0.35 * ease.in(k);
        const s = 1 - Math.max(0, k - 0.6) / 0.4;
        this.enemy.root.scale.setScalar(Math.max(0.01, s) * ((this.enemy.root.userData["baseScale"] as number | undefined) ?? 1.45));
      });
      return 1500;
    }
    if (outcome === "lost") {
      this.dead = "hero";
      this.tween(0.9, (k) => {
        this.hero.root.rotation.z = (-Math.PI / 2) * ease.in(Math.min(1, k * 1.5));
        this.hero.root.position.y = -0.1 * k;
      });
      return 1400;
    }
    // fled: run away from the enemy
    const away = this.heroHome.clone().sub(this.enemyHome).setY(0).normalize();
    this.tween(0.7, (k) => {
      this.heroOffset.copy(away).multiplyScalar(ease.in(k) * 9);
      this.hero.root.rotation.y = Math.atan2(away.x, away.z);
    });
    return 800;
  }

  update(dt: number) {
    this.elapsed += dt;
    this.intro = Math.min(1, this.intro + dt / 1.3);

    for (const tw of this.tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.update(k);
      if (k >= 1) tw.done?.();
    }
    this.tweens = this.tweens.filter((tw) => tw.t < tw.duration);

    // Idle breathing; the fallen stay still
    animateRig(this.hero, this.elapsed, this.dead === "hero" ? 0 : 0.05, 0);
    animateRig(this.enemy, this.elapsed, this.dead === "enemy" ? 0 : 0.08, 2);
    if (this.victory) {
      const hop = Math.abs(Math.sin(this.elapsed * 7));
      this.hero.body.position.y = hop * 0.35;
      this.hero.armL.rotation.x = -2.8;
      this.hero.armR.rotation.x = -2.8;
    }
    this.place();

    // Sparks
    for (const sp of this.sparks) {
      sp.life += dt;
      sp.vel.y -= sp.gravity * dt;
      sp.sprite.position.addScaledVector(sp.vel, dt);
      const k = sp.life / sp.max;
      (sp.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      sp.sprite.scale.multiplyScalar(1 - dt * 1.2);
    }
    for (const sp of this.sparks.filter((s) => s.life >= s.max)) {
      this.scene.remove(sp.sprite);
      sp.sprite.material.dispose();
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);

    // Camera: swoops in at the start, then breathes; shakes on impact
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const k = ease.out(this.intro);
    const from = new THREE.Vector3(-11, 7.5, 11.5);
    const to = new THREE.Vector3(-6.7, 3.7, 7.6);
    this.camera.position.lerpVectors(from, to, k);
    this.camera.position.x += Math.sin(this.elapsed * 0.4) * 0.12 + (Math.random() - 0.5) * this.shake;
    this.camera.position.y += Math.sin(this.elapsed * 0.55) * 0.06 + (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(0.5, 0.9, -0.6);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose();
      if (c instanceof THREE.Sprite) c.material.dispose();
    });
    this.dot.dispose();
    this.renderer.dispose();
  }
}

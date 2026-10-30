import * as THREE from "three";

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  size: number;
}

interface FloatText {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  baseY: number;
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(c);
}

/** One-shot particle bursts and rising text labels (+XP, item names). */
export class Fx {
  readonly group = new THREE.Group();
  private dot = dotTexture();
  private particles: Particle[] = [];
  private texts: FloatText[] = [];

  burst(x: number, y: number, z: number, color: string, count = 8, speed = 2.6, gravity = 8) {
    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.dot, color, transparent: true, depthWrite: false }),
      );
      const size = 0.12 + Math.random() * 0.12;
      sprite.scale.setScalar(size);
      sprite.position.set(x, y, z);
      this.group.add(sprite);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      this.particles.push({
        sprite,
        vel: new THREE.Vector3(Math.cos(a) * speed * r, speed * (0.5 + Math.random() * 0.8), Math.sin(a) * speed * r),
        life: 0,
        max: 0.45 + Math.random() * 0.35,
        gravity,
        size,
      });
    }
  }

  /** A short label that floats up from a point and fades. */
  floatText(x: number, y: number, z: number, text: string, color = "#ffe9a8") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = "bold 34px Georgia, serif";
    if (ctx) {
      ctx.font = font;
      canvas.width = Math.ceil(ctx.measureText(text).width) + 20;
      canvas.height = 52;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(10,5,2,0.9)";
      ctx.strokeText(text, canvas.width / 2, 27);
      ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, 27);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(0.5 * aspect, 0.5, 1);
    sprite.renderOrder = 20;
    sprite.position.set(x, y, z);
    this.group.add(sprite);
    this.texts.push({ sprite, life: 0, max: 1.5, baseY: y });
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - p.life / p.max);
      p.sprite.scale.setScalar(p.size * (1 - 0.4 * (p.life / p.max)));
    }
    for (const p of this.particles.filter((q) => q.life >= q.max)) {
      this.group.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    for (const t of this.texts) {
      t.life += dt;
      const k = t.life / t.max;
      t.sprite.position.y = t.baseY + k * 1.1;
      (t.sprite.material as THREE.SpriteMaterial).opacity = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.55) / 0.45);
    }
    for (const t of this.texts.filter((q) => q.life >= q.max)) {
      this.group.remove(t.sprite);
      t.sprite.material.map?.dispose();
      t.sprite.material.dispose();
    }
    this.texts = this.texts.filter((t) => t.life < t.max);
  }

  dispose() {
    for (const p of this.particles) p.sprite.material.dispose();
    for (const t of this.texts) {
      t.sprite.material.map?.dispose();
      t.sprite.material.dispose();
    }
    this.dot.dispose();
  }
}

import * as THREE from "three";

// Sky dome, stars, sun/moon, fireflies, dust motes, snow and footstep puffs.
// Everything is cheap (a few hundred points) and follows the camera target.

function softDot(inner: string, outer = "rgba(255,255,255,0)"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, inner.replace(/[\d.]+\)$/, "0.45)"));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pointCloud(count: number, material: THREE.PointsMaterial): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function wrap(v: number, center: number, half: number): number {
  const size = half * 2;
  return center + ((((v - center + half) % size) + size) % size) - half;
}

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    float k = pow(h, 0.55);
    gl_FragColor = vec4(mix(horizonColor, topColor, k), 1.0);
  }`;

interface Puff {
  sprite: THREE.Sprite;
  life: number;
}

export class Ambience {
  readonly group = new THREE.Group();
  readonly horizonColor = new THREE.Color("#7fb6e8");

  private sky: THREE.Mesh;
  private skyUniforms = {
    topColor: { value: new THREE.Color("#3a78c4") },
    horizonColor: { value: new THREE.Color("#a9d2f2") },
  };
  private stars: THREE.Points;
  private sun: THREE.Sprite;
  private moon: THREE.Sprite;
  private fireflies: THREE.Points;
  private fireflyPhase: Float32Array;
  private fireflyBase: Float32Array;
  private motes: THREE.Points;
  private moteBase: Float32Array;
  private snow: THREE.Points;
  private snowBase: Float32Array;
  private puffs: Puff[] = [];
  private puffTimer = 0;
  private snowAmount = 0;

  constructor() {
    // Sky dome (follows the camera, never occluded)
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(110, 24, 14),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Stars on the dome
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i += 1) {
      const u = Math.random();
      const v = Math.random() * 0.9 + 0.08; // upper hemisphere
      const theta = u * Math.PI * 2;
      const r = Math.sqrt(1 - v * v);
      sp[i * 3] = Math.cos(theta) * r * 105;
      sp[i * 3 + 1] = v * 105;
      sp[i * 3 + 2] = Math.sin(theta) * r * 105;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    const spriteMat = (tex: THREE.Texture, color: string, opacity = 1) =>
      new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      });
    this.sun = new THREE.Sprite(spriteMat(softDot("rgba(255,244,214,1)"), "#fff1c8"));
    this.sun.scale.set(34, 34, 1);
    this.sun.renderOrder = -8;
    this.moon = new THREE.Sprite(spriteMat(softDot("rgba(214,226,255,1)"), "#cfe0ff"));
    this.moon.scale.set(18, 18, 1);
    this.moon.renderOrder = -8;
    this.group.add(this.sun, this.moon);

    // Fireflies (night)
    const fireflyTex = softDot("rgba(255,236,150,1)");
    this.fireflies = pointCloud(
      70,
      new THREE.PointsMaterial({
        map: fireflyTex,
        size: 0.55,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.fireflyBase = new Float32Array(70 * 3);
    this.fireflyPhase = new Float32Array(70);
    for (let i = 0; i < 70; i += 1) {
      this.fireflyBase[i * 3] = (Math.random() - 0.5) * 36;
      this.fireflyBase[i * 3 + 1] = 0.4 + Math.random() * 2.6;
      this.fireflyBase[i * 3 + 2] = (Math.random() - 0.5) * 36;
      this.fireflyPhase[i] = Math.random() * 10;
    }
    this.group.add(this.fireflies);

    // Dust / pollen motes (day)
    this.motes = pointCloud(
      90,
      new THREE.PointsMaterial({
        map: softDot("rgba(255,250,225,1)"),
        size: 0.22,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.moteBase = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i += 1) {
      this.moteBase[i * 3] = (Math.random() - 0.5) * 40;
      this.moteBase[i * 3 + 1] = 0.3 + Math.random() * 5;
      this.moteBase[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    this.group.add(this.motes);

    // Snow (tundra)
    this.snow = pointCloud(
      420,
      new THREE.PointsMaterial({
        map: softDot("rgba(255,255,255,1)"),
        size: 0.2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.snowBase = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i += 1) {
      this.snowBase[i * 3] = (Math.random() - 0.5) * 40;
      this.snowBase[i * 3 + 1] = Math.random() * 14;
      this.snowBase[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    this.group.add(this.snow);

    // Footstep puffs
    const puffTex = softDot("rgba(220,205,170,1)");
    for (let i = 0; i < 14; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0 });
    }
  }

  /** Spawns a small dust puff at a point on the ground. */
  puff(x: number, z: number) {
    const p = this.puffs.find((item) => item.life <= 0);
    if (!p) return;
    p.life = 0.55;
    p.sprite.visible = true;
    p.sprite.position.set(x + (Math.random() - 0.5) * 0.25, 0.12, z + (Math.random() - 0.5) * 0.25);
    p.sprite.scale.setScalar(0.25);
  }

  update(args: {
    dt: number;
    time: number;
    center: THREE.Vector3;
    cameraPos: THREE.Vector3;
    sunDir: THREE.Vector3;
    nightFactor: number;
    daylight: number;
    sky: { top: THREE.Color; horizon: THREE.Color };
    snowing: boolean;
    walking: { x: number; z: number } | null;
  }) {
    const { dt, time, center, cameraPos, sunDir, nightFactor, daylight, sky } = args;

    // Sky colours + dome follows the camera
    this.skyUniforms.topColor.value.copy(sky.top);
    this.skyUniforms.horizonColor.value.copy(sky.horizon);
    this.horizonColor.copy(sky.horizon);
    this.sky.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, nightFactor - 0.35) * 1.4;

    // Sun and moon on opposite sides of the sky
    const sunUp = sunDir.clone().normalize();
    this.sun.position.copy(cameraPos).addScaledVector(sunUp, 95);
    (this.sun.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(sunUp.y * 3 + 0.4, 0, 1);
    this.moon.position.copy(cameraPos).addScaledVector(sunUp, -95);
    (this.moon.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(-sunUp.y * 3 + 0.2, 0, 0.9);

    // Fireflies drift around the player
    const ffMat = this.fireflies.material as THREE.PointsMaterial;
    ffMat.opacity = Math.min(1, nightFactor * 1.6) * 0.95;
    ffMat.size = 0.45 + Math.sin(time * 2) * 0.06;
    this.fireflies.visible = ffMat.opacity > 0.02;
    if (this.fireflies.visible) {
      const pos = this.fireflies.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        const ph = this.fireflyPhase[i]!;
        const bx = this.fireflyBase[i * 3]! + Math.sin(time * 0.5 + ph) * 1.4;
        const bz = this.fireflyBase[i * 3 + 2]! + Math.cos(time * 0.4 + ph * 1.3) * 1.4;
        pos.setXYZ(
          i,
          wrap(bx + center.x, center.x, 18),
          this.fireflyBase[i * 3 + 1]! + Math.sin(time * 0.9 + ph * 2) * 0.35,
          wrap(bz + center.z, center.z, 18),
        );
      }
      pos.needsUpdate = true;
    }

    // Daytime motes
    const moteMat = this.motes.material as THREE.PointsMaterial;
    moteMat.opacity = daylight * 0.55;
    this.motes.visible = moteMat.opacity > 0.02;
    if (this.motes.visible) {
      const pos = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        pos.setXYZ(
          i,
          wrap(this.moteBase[i * 3]! + center.x + time * 0.35, center.x, 20),
          this.moteBase[i * 3 + 1]! + Math.sin(time * 0.6 + i) * 0.25,
          wrap(this.moteBase[i * 3 + 2]! + center.z + time * 0.12, center.z, 20),
        );
      }
      pos.needsUpdate = true;
    }

    // Snow fades in over the tundra
    this.snowAmount += ((args.snowing ? 1 : 0) - this.snowAmount) * Math.min(1, dt * 1.5);
    const snowMat = this.snow.material as THREE.PointsMaterial;
    snowMat.opacity = this.snowAmount * 0.9;
    this.snow.visible = this.snowAmount > 0.02;
    if (this.snow.visible) {
      const pos = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        const fall = (time * (1.1 + (i % 5) * 0.25) + this.snowBase[i * 3 + 1]!) % 14;
        pos.setXYZ(
          i,
          wrap(this.snowBase[i * 3]! + center.x + Math.sin(time * 0.7 + i) * 0.6, center.x, 20),
          14 - fall,
          wrap(this.snowBase[i * 3 + 2]! + center.z + time * 0.3, center.z, 20),
        );
      }
      pos.needsUpdate = true;
    }

    // Footstep dust
    this.puffTimer -= dt;
    if (args.walking && this.puffTimer <= 0) {
      this.puffTimer = 0.2;
      this.puff(args.walking.x, args.walking.z);
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - Math.max(0, p.life) / 0.55;
      p.sprite.scale.setScalar(0.25 + k * 0.7);
      p.sprite.position.y = 0.12 + k * 0.25;
      (p.sprite.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.5 * (0.4 + daylight * 0.6);
      if (p.life <= 0) p.sprite.visible = false;
    }
  }

  dispose() {
    this.group.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.Points) {
        c.geometry.dispose();
        const m = c.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
      }
      if (c instanceof THREE.Sprite) {
        c.material.map?.dispose();
        c.material.dispose();
      }
    });
  }
}

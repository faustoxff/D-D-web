import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildPlayer, type Rig, animateRig } from "../game3d/models.ts";

interface Props {
  race: string;
  charClass: string;
  name: string;
  className?: string;
}

/** Small rotating 3D preview of a race/class combination. */
export default function CharacterPreview({ race, charClass, name, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef({ race, charClass, name });
  const dirtyRef = useRef(true);

  useEffect(() => {
    specRef.current = { race, charClass, name: name || "Aventurero" };
    dirtyRef.current = true;
  }, [race, charClass, name]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 1.35, 5.2);
    camera.lookAt(0, 1.05, 0);

    scene.add(new THREE.HemisphereLight("#cfe0ff", "#3a3020", 0.9));
    const key = new THREE.DirectionalLight("#fff1d6", 1.3);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#7fa8ff", 0.5);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.2, 0.12, 24),
      new THREE.MeshLambertMaterial({ color: "#3a2a1a", flatShading: true }),
    );
    disc.position.y = -0.06;
    disc.receiveShadow = true;
    scene.add(disc);

    let rig: Rig | null = null;
    const pivot = new THREE.Group();
    scene.add(pivot);

    const rebuild = () => {
      if (rig) {
        pivot.remove(rig.root);
        rig.root.traverse((c) => {
          if (c instanceof THREE.Mesh) c.geometry.dispose();
        });
      }
      const spec = specRef.current;
      rig = buildPlayer(spec.race, spec.charClass, spec.name);
      pivot.add(rig.root);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        rebuild();
      }
      const t = (now - start) / 1000;
      pivot.rotation.y = t * 0.7;
      if (rig) animateRig(rig, t, 0);
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((c) => {
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className ?? "h-full w-full"} />;
}

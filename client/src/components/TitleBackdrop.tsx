import React, { useEffect, useRef } from "react";
import { CAPITAL_ORIGIN } from "@dnd/shared";
import { WorldScene } from "../game3d/WorldScene.ts";

/** The live 3D world as a cinematic background: orbiting camera, people strolling, lamps lit. */
export default function TitleBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const center = { x: CAPITAL_ORIGIN.x + 9, y: CAPITAL_ORIGIN.y + 11.5 };
    let scene: WorldScene;
    try {
      scene = new WorldScene(canvas, center, { cinematic: true });
    } catch {
      return; // no WebGL: the CSS background behind the canvas still works
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      scene.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      scene.update(dt, { x: center.x, y: center.y, facing: "south", moving: false });
      scene.render();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      scene.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className ?? "absolute inset-0 h-full w-full"} />;
}

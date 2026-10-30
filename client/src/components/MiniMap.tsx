import React, { useEffect, useRef } from "react";
import {
  TILE_IDS,
  WORLD_BIOMES,
  WORLD_HEIGHT,
  WORLD_TILES,
  WORLD_TOWNS,
  WORLD_WIDTH,
  type TileId,
} from "../game/world.ts";
import type { SceneAvatar, SceneRemote } from "../game3d/WorldScene.ts";

interface Props {
  avatarRef: React.MutableRefObject<SceneAvatar>;
  remotesRef: React.MutableRefObject<Record<string, SceneRemote>>;
  localSessionId?: string | undefined;
  expanded: boolean;
  onClose: () => void;
}

const TILE_COLORS: Record<TileId, [number, number, number]> = {
  grass: [84, 146, 62],
  stone: [133, 128, 112],
  water: [47, 134, 168],
  deepwater: [28, 86, 131],
  wall: [100, 90, 80],
  wood: [154, 98, 49],
  tree: [34, 98, 52],
  dirt: [140, 98, 57],
  flower: [90, 150, 70],
  sand: [220, 200, 140],
  snow: [238, 243, 250],
  rock: [108, 108, 118],
  swamp: [79, 99, 50],
  house: [176, 80, 56],
};

let baseMap: HTMLCanvasElement | null = null;

/** One pixel per tile, rendered once and reused by both map views. */
function getBaseMap(): HTMLCanvasElement {
  if (baseMap) return baseMap;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(WORLD_WIDTH, WORLD_HEIGHT);
    for (let i = 0; i < WORLD_WIDTH * WORLD_HEIGHT; i += 1) {
      const tile = TILE_IDS[WORLD_TILES[i] ?? 0] ?? "grass";
      let [r, g, b] = TILE_COLORS[tile];
      // Forest floor reads darker than open plains
      if (tile === "grass" && WORLD_BIOMES[i] === 3) {
        r *= 0.72;
        g *= 0.78;
        b *= 0.72;
      }
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  baseMap = canvas;
  return canvas;
}

export default function MiniMap({ avatarRef, remotesRef, localSessionId, expanded, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const base = getBaseMap();
    let frame = 0;

    const draw = () => {
      const size = canvas.width;
      const avatar = avatarRef.current;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);

      // Visible window in tiles
      const span = expanded ? WORLD_WIDTH : 56;
      let sx = expanded ? 0 : avatar.x - span / 2;
      let sy = expanded ? 0 : avatar.y - span / 2;
      sx = Math.max(0, Math.min(WORLD_WIDTH - span, sx));
      sy = Math.max(0, Math.min(WORLD_HEIGHT - span, sy));
      const scale = size / span;

      ctx.drawImage(base, sx, sy, span, span, 0, 0, size, size);

      const toX = (x: number) => (x - sx) * scale;
      const toY = (y: number) => (y - sy) * scale;

      for (const town of WORLD_TOWNS) {
        const x = toX(town.x);
        const y = toY(town.y);
        if (x < 0 || y < 0 || x > size || y > size) continue;
        ctx.fillStyle = "#ffd76a";
        ctx.strokeStyle = "#2a1a08";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x - 4, y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
        if (expanded) {
          ctx.font = "bold 13px Georgia, serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(20,12,6,0.9)";
          ctx.strokeText(town.name, x, y - 9);
          ctx.fillStyle = "#fff0c4";
          ctx.fillText(town.name, x, y - 9);
        }
      }

      for (const remote of Object.values(remotesRef.current)) {
        if (remote.sessionId === localSessionId) continue;
        ctx.fillStyle = "#7fc4ff";
        ctx.beginPath();
        ctx.arc(toX(remote.x), toY(remote.y), expanded ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const px = toX(avatar.x);
      const py = toY(avatar.y);
      ctx.fillStyle = "#ff4d4d";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, expanded ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [avatarRef, remotesRef, localSessionId, expanded]);

  if (expanded) {
    return (
      <div
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="relative rounded-lg border-2 border-parchment-300 bg-dungeon-900 p-3 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between text-sm text-parchment-200">
            <span className="font-bold">Mapa del mundo</span>
            <span className="text-xs text-parchment-500">M o Esc para cerrar</span>
          </div>
          <canvas
            ref={canvasRef}
            width={640}
            height={640}
            className="block max-h-[70vh] max-w-full rounded"
            style={{ aspectRatio: "1 / 1", width: "min(640px, 100%)" }}
          />
          <div className="mt-2 flex gap-4 text-xs text-parchment-400">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Tú
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 bg-yellow-300" />Pueblo
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-300" />Aliado
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={168}
      height={168}
      className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full border-2 border-parchment-300/80 shadow-lg"
      style={{ width: 168, height: 168, clipPath: "circle(50%)" }}
    />
  );
}

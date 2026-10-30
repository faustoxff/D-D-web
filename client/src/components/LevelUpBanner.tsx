import React, { useEffect } from "react";
import { useGameStore } from "../store/game.store.ts";

const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  angle: (i / 22) * Math.PI * 2,
  dist: 120 + ((i * 37) % 90),
  delay: (i % 6) * 0.04,
}));

/** Big "NIVEL N" celebration with a burst of sparks. */
export default function LevelUpBanner() {
  const level = useGameStore((s) => s.levelUp);
  const label = useGameStore((s) => s.levelUpLabel);
  const setLevelUp = useGameStore((s) => s.setLevelUp);

  useEffect(() => {
    if (level === null) return;
    const t = window.setTimeout(() => setLevelUp(null), 3200);
    return () => window.clearTimeout(t);
  }, [level, setLevelUp]);

  if (level === null) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(250,204,21,0.22),transparent_60%)]" style={{ animation: "lvl-flash 3.2s ease-out both" }} />
      <div className="relative text-center" style={{ animation: "lvl-pop 3.2s cubic-bezier(0.2,0.9,0.2,1.2) both" }}>
        {SPARKS.map((sp, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-yellow-300 shadow-[0_0_12px_#facc15]"
            style={{
              ["--dx" as string]: `${Math.cos(sp.angle) * sp.dist}px`,
              ["--dy" as string]: `${Math.sin(sp.angle) * sp.dist}px`,
              animation: `spark 1.4s ${0.15 + sp.delay}s ease-out both`,
            }}
          />
        ))}
        <div className="font-title text-sm uppercase tracking-[0.6em] text-yellow-200/90">
          {label ? `¡${label}!` : "¡Subiste de nivel!"}
        </div>
        <div className="title-logo font-title text-8xl font-black leading-none">{level}</div>
        <div className="mt-1 text-sm text-parchment-200">{label ? "Nivel alcanzado" : "Tu leyenda crece"}</div>
      </div>
    </div>
  );
}

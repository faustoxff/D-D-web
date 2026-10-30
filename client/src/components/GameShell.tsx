import React, { useCallback, useEffect, useState } from "react";
import ToastHost from "./ToastHost.tsx";
import LevelUpBanner from "./LevelUpBanner.tsx";
import { useGameStore } from "../store/game.store.ts";

interface Props {
  /** The 3D world; fills the whole viewport. */
  world: React.ReactNode;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  /** Centered modal on top of the world (e.g. the battle screen). */
  modal?: React.ReactNode;
  onSignOut?: () => void;
  /** Pulses a red vignette when health is critical. */
  lowHp?: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

/** Full-viewport game layout: the world behind, HUD panels floating on top. */
export default function GameShell({ world, topLeft, topRight, bottomLeft, modal, onSignOut, lowHp }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [effects, setEffects] = useState(() => {
    try {
      return localStorage.getItem("dnd:effects") !== "off";
    } catch {
      return true;
    }
  });

  const [moveMode, setMoveMode] = useState<"iso" | "screen">(() => {
    try {
      return localStorage.getItem("dnd:moveMode") === "screen" ? "screen" : "iso";
    } catch {
      return "iso";
    }
  });

  const toggleMoveMode = useCallback(() => {
    setMoveMode((mode) => {
      const next = mode === "iso" ? "screen" : "iso";
      try {
        localStorage.setItem("dnd:moveMode", next);
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event("dnd:move-mode-changed"));
      return next;
    });
  }, []);

  const toggleEffects = useCallback(() => {
    setEffects((on) => {
      try {
        localStorage.setItem("dnd:effects", on ? "off" : "on");
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event("dnd:effects-changed"));
      return !on;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "f") toggleFullscreen();
      else if (key === "i") useGameStore.getState().togglePanel("inventory");
      else if (key === "k") useGameStore.getState().togglePanel("skills");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const button =
    "rounded border border-parchment-500/40 bg-dungeon-900/80 px-2.5 py-1 text-xs text-parchment-300 shadow backdrop-blur-sm hover:bg-dungeon-700/90";

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-parchment-200">
      <div className="absolute inset-0">{world}</div>

      {lowHp && (
        <div
          className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(180,10,10,0.55)_100%)]"
          style={{ animation: "low-hp 1.4s ease-in-out infinite" }}
        />
      )}

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-3 top-3 space-y-2">{topLeft}</div>

        <div className="pointer-events-auto absolute right-3 top-3 flex w-64 flex-col items-end gap-2">
          <div className="flex gap-1.5">
            <button type="button" className={button} onClick={() => useGameStore.getState().togglePanel("inventory")} title="Mochila (I)">
              🎒
            </button>
            <button type="button" className={button} onClick={() => useGameStore.getState().togglePanel("skills")} title="Habilidades (K)">
              📈
            </button>
            <button
              type="button"
              className={button}
              onClick={() => window.dispatchEvent(new Event("dnd:toggle-map"))}
              title="Mapa del mundo (M)"
            >
              🗺 Mapa
            </button>
            <button
              type="button"
              className={button}
              onClick={toggleMoveMode}
              title={
                moveMode === "iso"
                  ? "Isométrico: W/A/S/D siguen los ejes del mapa (en diagonal). Clic para moverte relativo a la pantalla."
                  : "Pantalla: W sube, D va a la derecha. Clic para volver al isométrico clásico."
              }
            >
              {moveMode === "iso" ? "🧭 Isométrico" : "🧭 Pantalla"}
            </button>
            <button
              type="button"
              className={button}
              onClick={toggleEffects}
              title="Efectos visuales (resplandor). Apágalos si el juego va lento."
            >
              {effects ? "✨ Efectos" : "◻ Efectos"}
            </button>
            <button type="button" className={button} onClick={toggleFullscreen} title="Pantalla completa (F)">
              {fullscreen ? "⤡ Salir" : "⤢ Pantalla completa"}
            </button>
            {onSignOut && (
              <button type="button" className={button} onClick={onSignOut}>
                Salir
              </button>
            )}
          </div>
          {topRight}
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-3 w-[min(380px,calc(100vw-1.5rem))]">
          {bottomLeft}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-2 hidden justify-center text-[11px] text-parchment-300/70 md:flex">
          <span className="rounded bg-black/40 px-2 py-0.5">
            WASD mover · E interactuar · I mochila · K habilidades · M mapa · F pantalla completa
          </span>
        </div>
      </div>

      <ToastHost />
      <LevelUpBanner />

      {modal && (
        <div className="absolute inset-0 z-30">{modal}</div>
      )}

      {/* Fade in from black when the game screen opens */}
      <div
        className="pointer-events-none absolute inset-0 z-50 bg-black"
        style={{ animation: "intro-fade 1.4s 0.15s ease-out both" }}
      />
    </div>
  );
}

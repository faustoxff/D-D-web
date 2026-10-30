import React, { useEffect, useMemo, useRef, useState } from "react";
import { CLASSES, RACES, type Character, type EnemyKind } from "@dnd/shared";
import { BattleStage, type Popup } from "../game3d/BattleStage.ts";
import { useGameStore, type BattleResult, type EncounterState } from "../store/game.store.ts";

interface Props {
  encounter: EncounterState;
  character: Character;
  onAttack: () => void;
  onFlee: () => void;
  battleText: string;
  /** Called once the end-of-fight animation and result banner are done. */
  onClose: (result: BattleResult | null) => void;
}

interface LivePopup extends Popup {
  id: number;
}

interface DiceState {
  key: number;
  roll: number;
  total: number;
  hit: boolean;
  actor: "player" | "enemy";
}

function enemyKindOf(name: string): EnemyKind {
  const n = name.toLowerCase();
  if (n.includes("esqueleto")) return "Esqueleto";
  if (n.includes("lobo")) return "Lobo";
  return "Goblin";
}

function pct(current: number, max: number): number {
  return max <= 0 ? 0 : Math.max(0, Math.min(100, (current / max) * 100));
}

function HpPanel({
  name,
  sub,
  hp,
  maxHp,
  accent,
  align,
}: {
  name: string;
  sub: string;
  hp: number;
  maxHp: number;
  accent: string;
  align: "left" | "right";
}) {
  const p = pct(hp, maxHp);
  const color = p > 50 ? "bg-green-500" : p > 25 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div
      className={`w-[min(320px,44vw)] rounded-xl border bg-dungeon-900/75 p-3 shadow-2xl backdrop-blur-md ${accent}`}
      style={{ animation: `${align === "left" ? "slide-in-left" : "slide-in-right"} 0.7s 0.5s cubic-bezier(0.2,0.8,0.2,1) both` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-title text-lg font-bold text-parchment-100">{name}</span>
        <span className="text-xs text-parchment-400">{sub}</span>
      </div>
      <div className="relative mt-2 h-4 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10">
        {/* Trail: lingers where the health used to be */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/70"
          style={{ width: `${p}%`, transition: "width 1.1s 0.45s ease-out" }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} shadow-[0_0_12px_currentColor]`}
          style={{ width: `${p}%`, transition: "width 0.35s ease-out" }}
        />
      </div>
      <div className="mt-1 text-right text-xs font-semibold tabular-nums text-parchment-200">
        {hp} / {maxHp}
      </div>
    </div>
  );
}

function DiceRoll({ dice }: { dice: DiceState }) {
  const [shown, setShown] = useState(1);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const tick = window.setInterval(() => setShown(1 + Math.floor(Math.random() * 20)), 55);
    const stop = window.setTimeout(() => {
      window.clearInterval(tick);
      setShown(dice.roll);
      setSettled(true);
    }, 650);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [dice.key, dice.roll]);

  const nat20 = settled && dice.roll === 20;
  const nat1 = settled && dice.roll === 1;
  const tone = !settled
    ? "from-slate-500 to-slate-700 text-white"
    : nat20
      ? "from-yellow-300 to-amber-500 text-dungeon-900 shadow-[0_0_40px_rgba(250,204,21,0.9)]"
      : nat1
        ? "from-red-500 to-red-800 text-white shadow-[0_0_30px_rgba(239,68,68,0.8)]"
        : dice.hit
          ? "from-emerald-400 to-emerald-700 text-white shadow-[0_0_26px_rgba(52,211,153,0.6)]"
          : "from-slate-400 to-slate-600 text-white";

  return (
    <div className="pointer-events-none absolute left-1/2 top-[18%] z-20 -translate-x-1/2 text-center">
      <div className="mb-1 text-xs uppercase tracking-[0.3em] text-white/80 drop-shadow">
        {dice.actor === "player" ? "Tu tirada" : "Tirada enemiga"}
      </div>
      <div
        key={dice.key}
        className={`mx-auto flex h-24 w-24 items-center justify-center bg-gradient-to-b font-title text-4xl font-black ${tone}`}
        style={{
          clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
          animation: settled ? "dice-land 0.35s ease-out" : "dice-spin 0.65s linear",
        }}
      >
        {shown}
      </div>
      <div className="mt-1 h-6 text-sm font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {settled ? `${dice.total} · ${nat20 ? "¡CRÍTICO!" : nat1 ? "¡Pifia!" : dice.hit ? "Impacta" : "Falla"}` : ""}
      </div>
    </div>
  );
}

export default function BattleScene({ encounter, character, onAttack, onFlee, battleText, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<BattleStage | null>(null);
  const processing = useRef(false);
  const endingRef = useRef(false);
  const popupId = useRef(0);
  // Every pending timer, so they are cancelled only when the screen goes away
  // (not whenever the queue changes, which would strand `processing` as true).
  const timers = useRef(new Set<number>());
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);

  const fxQueue = useGameStore((s) => s.fxQueue);
  const shiftFx = useGameStore((s) => s.shiftFx);
  const result = useGameStore((s) => s.battleResult);
  const setBattleResult = useGameStore((s) => s.setBattleResult);

  const [popups, setPopups] = useState<LivePopup[]>([]);
  const [dice, setDice] = useState<DiceState | null>(null);
  const [phase, setPhase] = useState<"fight" | "result">("fight");

  const kind = useMemo(() => enemyKindOf(encounter.enemyName), [encounter.enemyName]);
  const isPlayerTurn = encounter.turn === "player" && encounter.status === "active";
  const busy = fxQueue.length > 0 || processing.current;
  const canAct = isPlayerTurn && fxQueue.length === 0;

  // 3D stage lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: BattleStage;
    try {
      stage = new BattleStage(canvas, { race: character.race, cls: character.class, name: character.name }, kind);
    } catch {
      return;
    }
    stageRef.current = stage;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      stage.resize(Math.max(1, r.width), Math.max(1, r.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      stage.update(Math.min(0.05, (now - last) / 1000));
      last = now;
      stage.render();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      stage.dispose();
      stageRef.current = null;
    };
  }, [character.race, character.class, character.name, kind]);

  const addPopup = (p: Popup) => {
    const id = ++popupId.current;
    setPopups((list) => [...list, { ...p, id }]);
    later(() => setPopups((list) => list.filter((x) => x.id !== id)), 1300);
  };

  // Play combat events one at a time: dice roll first, then the animation
  useEffect(() => {
    const stage = stageRef.current;
    const ev = fxQueue[0];
    if (!stage || !ev || processing.current) return;
    processing.current = true;
    setDice({ key: Date.now(), roll: ev.roll, total: ev.total, hit: ev.hit, actor: ev.actor });

    later(() => {
      const dur = stage.playEvent(
        { actor: ev.actor, hit: ev.hit, damage: ev.damage, roll: ev.roll },
        addPopup,
      );
      later(() => {
        processing.current = false;
        shiftFx();
      }, dur + 450);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  // Fight is over: finish animating, then show the result
  useEffect(() => {
    if (encounter.status === "active" || fxQueue.length > 0 || processing.current) return;
    if (endingRef.current) return;
    const stage = stageRef.current;
    const status = (result?.status ?? encounter.status) as "won" | "lost" | "fled";
    if (!["won", "lost", "fled"].includes(status)) return;
    endingRef.current = true;
    setDice(null);
    const dur = stage?.playOutcome(status) ?? 0;
    later(() => {
      if (status === "fled") {
        finish();
      } else {
        setPhase("result");
      }
    }, dur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.status, fxQueue.length, result]);

  const finish = () => {
    setBattleResult(null);
    onClose(result);
  };

  // Keyboard shortcuts: A / Space = attack, H / Esc = flee
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "result") {
        if (e.key === "Enter" || e.key === " ") finish();
        return;
      }
      if (!canAct) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === " ") {
        e.preventDefault();
        onAttack();
      } else if (k === "h") onFlee();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct, phase, onAttack, onFlee]);

  const enemyLabel = `Nv.${encounter.enemyLevel}`;
  const heroLabel = `Nv.${character.level} ${RACES[character.race]?.label ?? ""} ${CLASSES[character.class]?.label ?? ""}`;
  const won = result?.status === "won";
  const lost = result?.status === "lost";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Cinematic grading */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(10,4,2,0.7)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-white" style={{ animation: "battle-flash 0.9s ease-out both" }} />

      {/* Entry banner */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ animation: "battle-title 1.7s ease-out both" }}>
        <div className="-skew-x-12 bg-gradient-to-r from-transparent via-red-700/90 to-transparent px-24 py-3">
          <div className="skew-x-12 font-title text-6xl font-black tracking-[0.25em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]">
            ¡COMBATE!
          </div>
        </div>
      </div>

      {/* HP panels */}
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <HpPanel
          name={encounter.enemyName || "Enemigo"}
          sub={enemyLabel}
          hp={encounter.enemyHp}
          maxHp={encounter.enemyMaxHp}
          accent="border-red-400/50"
          align="left"
        />
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10">
        <HpPanel
          name={character.name}
          sub={heroLabel}
          hp={character.hp}
          maxHp={character.max_hp}
          accent="border-parchment-400/50"
          align="right"
        />
      </div>

      {dice && phase === "fight" && <DiceRoll dice={dice} />}

      {/* Floating numbers */}
      {popups.map((p) => (
        <div
          key={p.id}
          className={`pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap font-title font-black drop-shadow-[0_3px_6px_rgba(0,0,0,0.95)] ${
            p.kind === "crit"
              ? "text-5xl text-yellow-300"
              : p.kind === "miss"
                ? "text-3xl text-slate-200"
                : p.kind === "player-damage"
                  ? "text-4xl text-red-400"
                  : "text-4xl text-orange-300"
          }`}
          style={{ left: p.x, top: p.y, animation: "dmg-float 1.2s ease-out both" }}
        >
          {p.text}
        </div>
      ))}

      {/* Action bar */}
      {phase === "fight" && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-6 pt-16"
          style={{ animation: "fade-up 0.8s 0.9s both" }}
        >
          <p className="max-w-2xl text-center text-base font-semibold italic text-parchment-100 drop-shadow">
            {busy ? "…" : battleText || (isPlayerTurn ? "Es tu turno." : `${encounter.enemyName} prepara su ataque.`)}
          </p>
          <div className="flex gap-4">
            <button
              onClick={onAttack}
              disabled={!canAct}
              className="btn-shine relative overflow-hidden rounded-lg border border-red-300/40 bg-gradient-to-b from-red-600 to-red-800 px-10 py-3 font-title text-xl font-bold tracking-wide text-white shadow-[0_6px_26px_rgba(220,38,38,0.5)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              ⚔ Atacar <span className="ml-1 text-xs opacity-60">[A]</span>
            </button>
            <button
              onClick={onFlee}
              disabled={!canAct}
              className="rounded-lg border border-parchment-400/40 bg-gradient-to-b from-dungeon-600 to-dungeon-800 px-8 py-3 font-title text-xl font-bold tracking-wide text-parchment-100 shadow-xl transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
            >
              🏃 Huir <span className="ml-1 text-xs opacity-60">[H]</span>
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {phase === "result" && result && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" style={{ animation: "fade-up 0.5s both" }}>
          <div className="text-center">
            <div
              className={`font-title text-7xl font-black tracking-[0.2em] ${
                won ? "title-logo" : "text-red-400 drop-shadow-[0_0_30px_rgba(239,68,68,0.7)]"
              }`}
            >
              {won ? "¡VICTORIA!" : lost ? "DERROTA" : "HUISTE"}
            </div>
            {won && (
              <div className="mt-5 flex justify-center gap-4">
                <div className="rounded-full border border-sky-400/60 bg-sky-950/70 px-5 py-2 text-lg font-bold text-sky-200" style={{ animation: "toast-pop 0.6s 0.3s both" }}>
                  ✦ +{result.xp} XP
                </div>
                <div className="rounded-full border border-yellow-400/60 bg-yellow-950/70 px-5 py-2 text-lg font-bold text-yellow-200" style={{ animation: "toast-pop 0.6s 0.55s both" }}>
                  💰 +{result.gold}
                </div>
              </div>
            )}
            <p className="mx-auto mt-5 max-w-xl text-base italic text-parchment-200">{result.narrative}</p>
            {lost && <p className="mt-2 text-sm text-parchment-400">Despiertas en la taberna con la mitad de tus PV.</p>}
            <button
              onClick={finish}
              className="btn-shine relative mt-7 overflow-hidden rounded-lg bg-gradient-to-b from-parchment-400 to-parchment-500 px-10 py-3 font-title text-lg font-bold text-dungeon-900 shadow-[0_6px_24px_rgba(212,168,67,0.4)]"
            >
              Continuar <span className="ml-1 text-xs opacity-60">[Enter]</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

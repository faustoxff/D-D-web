import React, { useEffect } from "react";
import { useGameStore, type Toast } from "../store/game.store.ts";

const STYLE: Record<Toast["kind"], { icon: string; cls: string }> = {
  xp: { icon: "✦", cls: "border-sky-400/60 text-sky-200 shadow-[0_0_22px_rgba(56,189,248,0.35)]" },
  gold: { icon: "💰", cls: "border-yellow-400/60 text-yellow-200 shadow-[0_0_22px_rgba(250,204,21,0.35)]" },
  level: { icon: "⬆", cls: "border-fuchsia-400/60 text-fuchsia-200 shadow-[0_0_26px_rgba(232,121,249,0.45)]" },
  loot: { icon: "🎁", cls: "border-emerald-400/60 text-emerald-200 shadow-[0_0_22px_rgba(52,211,153,0.35)]" },
  info: { icon: "▸", cls: "border-parchment-400/50 text-parchment-200" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useGameStore((s) => s.removeToast);
  useEffect(() => {
    const t = window.setTimeout(() => remove(toast.id), 3600);
    return () => window.clearTimeout(t);
  }, [toast.id, remove]);
  const st = STYLE[toast.kind];
  return (
    <div
      className={`rounded-full border bg-dungeon-900/85 px-4 py-1.5 text-sm font-semibold backdrop-blur ${st.cls}`}
      style={{ animation: "toast-in 3.6s cubic-bezier(0.2,0.8,0.2,1) both" }}
    >
      <span className="mr-2">{st.icon}</span>
      {toast.text}
    </div>
  );
}

/** Stacked pop-ups (+XP, +oro, ...) that float in and fade out. */
export default function ToastHost() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

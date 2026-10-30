import React, { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../store/game.store.ts";

interface Props {
  log: LogEntry[];
}

const typeStyles: Record<LogEntry["type"], string> = {
  narrative: "text-parchment-200 italic",
  combat: "text-orange-300 font-mono text-xs",
  system: "text-parchment-500 text-xs",
  reward: "text-yellow-400 font-semibold",
};

const typePrefix: Record<LogEntry["type"], string> = {
  narrative: "",
  combat: "⚔ ",
  system: "▸ ",
  reward: "✦ ",
};

export default function NarrativeLog({ log }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length, open]);

  return (
    <div className="rounded-lg border border-parchment-500/30 bg-dungeon-900/75 shadow-xl backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-parchment-400"
      >
        <span>📜 Registro</span>
        <span>{open ? "▼" : "▲"}</span>
      </button>
      {open && (
        <div className="h-40 space-y-1.5 overflow-y-auto px-3 pb-3">
          {log.length === 0 && (
            <p className="mt-6 text-center text-sm italic text-parchment-500">
              Tu aventura comienza aquí...
            </p>
          )}
          {log.map((entry) => (
            <p key={entry.id} className={`text-[13px] leading-snug ${typeStyles[entry.type]}`}>
              {typePrefix[entry.type]}
              {entry.text}
            </p>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { useAuthStore } from "../store/auth.store.ts";
import { authFetch } from "../lib/auth.ts";
import { useGameStore } from "../store/game.store.ts";
import {
  CLASS_LIST,
  RACE_LIST,
  RACES,
  CLASSES,
  buildStartingStats,
  formatBonus,
  abilityModifier,
  type CharacterClass,
  type Race,
} from "@dnd/shared";
import CharacterPreview from "../components/CharacterPreview.tsx";
import TitleBackdrop from "../components/TitleBackdrop.tsx";

interface Props {
  /** Offline preview: skip the API and hand the choice back to the caller. */
  previewMode?: boolean;
  onPreviewDone?: (choice: { name: string; race: Race; class: CharacterClass }) => void;
}

const STAT_LABELS: Array<[keyof ReturnType<typeof buildStartingStats>, string]> = [
  ["str", "FUE"],
  ["dex", "DES"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "SAB"],
  ["cha", "CAR"],
];

export default function CharacterPage({ previewMode = false, onPreviewDone }: Props) {
  const { user } = useAuthStore();
  const { setCharacter } = useGameStore();
  const [name, setName] = useState("");
  const [race, setRace] = useState<Race>("human");
  const [charClass, setCharClass] = useState<CharacterClass>("fighter");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const raceDef = RACES[race];
  const classDef = CLASSES[charClass];
  const stats = useMemo(() => buildStartingStats(charClass, race), [charClass, race]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (previewMode) {
      onPreviewDone?.({ name: name.trim(), race, class: charClass });
      return;
    }
    if (!user) return;
    setLoading(true);

    const res = await authFetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, race, class: charClass }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.message ?? "Error al crear personaje");
      return;
    }

    setCharacter(data);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0614] p-4">
      <div className="fixed inset-0">
        <TitleBackdrop />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,4,16,0.35)_0%,rgba(8,4,16,0.88)_100%)]" />
      </div>
      <div className="relative mx-auto max-w-5xl py-4">
        <div className="mb-6 text-center" style={{ animation: "fade-down 0.9s ease-out both" }}>
          <h1 className="title-logo font-title text-5xl font-black">Crea tu Héroe</h1>
          <p className="mt-1 text-sm tracking-widest text-parchment-300/80">Elige tu raza y tu camino</p>
        </div>

        <form
          onSubmit={handleCreate}
          className="grid gap-4 rounded-xl border border-parchment-400/30 bg-dungeon-900/65 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.65)] backdrop-blur-md lg:grid-cols-[minmax(0,1fr)_320px]"
          style={{ animation: "fade-up 0.9s 0.25s cubic-bezier(0.2,0.8,0.2,1) both" }}
        >
          <div className="space-y-5">
            <div>
              <label className="mb-1 block text-sm text-parchment-400">Nombre del personaje</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={30}
                className="w-full rounded border border-dungeon-600 bg-dungeon-900 px-3 py-2 text-parchment-200 focus:border-parchment-400 focus:outline-none"
                placeholder="Thorin Barbaférreo"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-parchment-400">Raza</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {RACE_LIST.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRace(r.id)}
                    className={`rounded border p-2.5 text-left transition-colors ${
                      race === r.id
                        ? "border-parchment-400 bg-dungeon-700"
                        : "border-dungeon-600 bg-dungeon-900 hover:border-dungeon-500"
                    }`}
                  >
                    <div className="text-sm font-semibold text-parchment-200">{r.label}</div>
                    <div className="mt-0.5 text-xs text-parchment-500">{formatBonus(r.bonus)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-parchment-400">Clase</label>
              <div className="grid grid-cols-2 gap-2">
                {CLASS_LIST.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharClass(c.id)}
                    className={`rounded border p-2.5 text-left transition-colors ${
                      charClass === c.id
                        ? "border-parchment-400 bg-dungeon-700"
                        : "border-dungeon-600 bg-dungeon-900 hover:border-dungeon-500"
                    }`}
                  >
                    <div className="text-sm font-semibold text-parchment-200">{c.label}</div>
                    <div className="mt-0.5 text-xs text-parchment-500">{c.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="h-72 overflow-hidden rounded border border-dungeon-600 bg-gradient-to-b from-dungeon-700 to-dungeon-900">
              <CharacterPreview race={race} charClass={charClass} name={name} />
            </div>

            <div>
              <div className="font-bold text-parchment-200">
                {raceDef.label} · {classDef.label}
              </div>
              <p className="mt-1 text-xs text-parchment-400">{raceDef.description}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-parchment-500">
                {raceDef.traits.map((t) => (
                  <li key={t}>◆ {t}</li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {STAT_LABELS.map(([key, label]) => {
                const value = stats[key];
                const bonus = raceDef.bonus[key as keyof typeof raceDef.bonus] ?? 0;
                const mod = abilityModifier(value);
                return (
                  <div key={key} className="rounded bg-dungeon-900 p-1.5 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-parchment-500">{label}</div>
                    <div className="font-bold text-parchment-200">{value}</div>
                    <div className="text-[10px] text-parchment-400">
                      {mod >= 0 ? `+${mod}` : mod}
                      {bonus > 0 && <span className="ml-1 text-green-500">(+{bonus})</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-center text-xs text-parchment-400">
              Puntos de vida iniciales: <span className="font-bold text-parchment-200">{stats.max_hp}</span>
            </div>

            {error && (
              <div className="rounded border border-red-700 bg-red-900/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || name.trim().length < 2}
              className="w-full rounded bg-parchment-500 py-2 font-bold text-dungeon-900 transition-colors hover:bg-parchment-400 disabled:opacity-50"
            >
              {loading ? "Forjando héroe..." : "¡Comenzar Aventura!"}
            </button>
          </aside>
        </form>
      </div>
    </div>
  );
}

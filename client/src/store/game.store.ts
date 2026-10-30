import { create } from "zustand";
import type { Room } from "colyseus.js";
import type { Character, Quest, CombatEvent, InventoryItem, SkillId, SkillSet } from "@dnd/shared";

export interface LogEntry {
  id: number;
  type: "narrative" | "combat" | "system" | "reward";
  text: string;
}

export interface Toast {
  id: number;
  kind: "xp" | "gold" | "level" | "info" | "loot";
  text: string;
}

export interface Gathering {
  action: string;
  name: string;
  verb: string;
  tx: number;
  ty: number;
}

export type SidePanel = "inventory" | "skills" | null;

export interface BattleResult {
  status: "won" | "lost" | "fled";
  xp: number;
  gold: number;
  narrative: string;
}

export interface EncounterState {
  status: "idle" | "active" | "won" | "lost" | "fled";
  enemyName: string;
  enemyLevel: number;
  enemyHp: number;
  enemyMaxHp: number;
  round: number;
  turn: string;
}

interface GameState {
  character: Character | null;
  characterLoaded: boolean;
  quest: Quest | null;
  room: Room | null;
  encounter: EncounterState;
  log: LogEntry[];
  logIdCounter: number;
  isConnecting: boolean;

  /** Combat events waiting to be animated by the battle stage, in order. */
  fxQueue: CombatEvent[];
  battleResult: BattleResult | null;
  toasts: Toast[];
  /** Level just reached, shown as a big banner until dismissed. */
  levelUp: number | null;
  levelUpLabel: string;

  inventory: InventoryItem[];
  skills: SkillSet | null;
  gathering: Gathering | null;
  /** Resource nodes that are used up right now ("x,y"). */
  depleted: Set<string>;
  panel: SidePanel;
  shopOpen: boolean;

  setInventory: (items: InventoryItem[]) => void;
  setSkills: (skills: SkillSet) => void;
  setSkill: (skill: SkillId, xp: number, level: number) => void;
  setGathering: (g: Gathering | null) => void;
  setDepletedKeys: (keys: Set<string>) => void;
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  setShopOpen: (open: boolean) => void;

  pushFx: (events: CombatEvent[]) => void;
  shiftFx: () => void;
  setBattleResult: (r: BattleResult | null) => void;
  addToast: (kind: Toast["kind"], text: string) => void;
  removeToast: (id: number) => void;
  setLevelUp: (level: number | null, label?: string) => void;

  setCharacter: (c: Character | null) => void;
  setCharacterLoaded: (v: boolean) => void;
  setQuest: (q: Quest | null) => void;
  setRoom: (r: Room | null) => void;
  updateEncounter: (patch: Partial<EncounterState>) => void;
  addLog: (type: LogEntry["type"], text: string) => void;
  addCombatEvents: (events: CombatEvent[], characterName: string, enemyName: string) => void;
  setIsConnecting: (v: boolean) => void;
  reset: () => void;
}

const defaultEncounter: EncounterState = {
  status: "idle",
  enemyName: "",
  enemyLevel: 1,
  enemyHp: 0,
  enemyMaxHp: 0,
  round: 1,
  turn: "player",
};

let logId = 0;
let toastId = 0;

export const useGameStore = create<GameState>((set) => ({
  character: null,
  characterLoaded: false,
  quest: null,
  room: null,
  encounter: { ...defaultEncounter },
  log: [],
  logIdCounter: 0,
  isConnecting: false,

  fxQueue: [],
  battleResult: null,
  toasts: [],
  levelUp: null,
  levelUpLabel: "",

  inventory: [],
  skills: null,
  gathering: null,
  depleted: new Set<string>(),
  panel: null,
  shopOpen: false,

  setInventory: (items) => set({ inventory: items }),
  setSkills: (skills) => set({ skills }),
  setSkill: (skill, xp, level) =>
    set((s) => (s.skills ? { skills: { ...s.skills, [skill]: { xp, level } } } : {})),
  setGathering: (g) => set({ gathering: g }),
  setDepletedKeys: (keys) => set({ depleted: keys }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  setShopOpen: (open) => set({ shopOpen: open }),

  pushFx: (events) => set((s) => ({ fxQueue: [...s.fxQueue, ...events] })),
  shiftFx: () => set((s) => ({ fxQueue: s.fxQueue.slice(1) })),
  setBattleResult: (r) => set({ battleResult: r }),
  addToast: (kind, text) =>
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id: ++toastId, kind, text }] })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLevelUp: (level, label = "") => set({ levelUp: level, levelUpLabel: label }),

  setCharacter: (c) => set({ character: c, characterLoaded: true }),
  setCharacterLoaded: (v) => set({ characterLoaded: v }),
  setQuest: (q) => set({ quest: q }),
  setRoom: (r) => set({ room: r }),

  updateEncounter: (patch) =>
    set((s) => ({ encounter: { ...s.encounter, ...patch } })),

  addLog: (type, text) =>
    set((s) => ({
      log: [...s.log.slice(-99), { id: ++logId, type, text }],
    })),

  addCombatEvents: (events, characterName, enemyName) => {
    const entries: LogEntry[] = events.map((e) => {
      const actor = e.actor === "player" ? characterName : enemyName;
      const hitText = e.hit
        ? `impacta causando ${e.damage ?? 0} de daño`
        : "falla el ataque";
      const text = `[R${e.round}] ${actor} tira d20: ${e.roll}+${e.modifier}=${e.total} — ${hitText}`;
      return { id: ++logId, type: "combat" as const, text };
    });
    const keep = Math.max(0, 99 - entries.length);
    set((s) => ({ log: [...s.log.slice(-keep), ...entries] }));
  },

  setIsConnecting: (v) => set({ isConnecting: v }),

  reset: () =>
    set({
      character: null,
      characterLoaded: false,
      room: null,
      encounter: { ...defaultEncounter },
      log: [],
      isConnecting: false,
      fxQueue: [],
      battleResult: null,
      toasts: [],
      levelUp: null,
      levelUpLabel: "",
      inventory: [],
      skills: null,
      gathering: null,
      depleted: new Set<string>(),
      panel: null,
      shopOpen: false,
    }),
}));

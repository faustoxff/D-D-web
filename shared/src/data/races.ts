export const RACE_IDS = [
  "human",
  "elf",
  "dwarf",
  "halfling",
  "half_elf",
  "gnome",
  "orc",
  "tiefling",
  "dragonborn",
] as const;
export type RaceId = (typeof RACE_IDS)[number];

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface RaceVisual {
  /** Skin tones; the character picks one by hashing its name so peers look varied. */
  skin: string[];
  hair: string[];
  /** Overall height multiplier. */
  height: number;
  /** Body width multiplier. */
  width: number;
  ears?: "pointy" | "long" | "small";
  horns?: boolean;
  tusks?: boolean;
  tail?: boolean;
  beard?: boolean;
  snout?: boolean;
  bald?: boolean;
  eyes?: string;
}

export interface RaceDef {
  id: RaceId;
  label: string;
  description: string;
  bonus: Partial<Record<AbilityKey, number>>;
  /** Extra HP at level 1 (racial toughness). */
  bonusHp: number;
  traits: string[];
  visual: RaceVisual;
}

export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: "human",
    label: "Humano",
    description: "Versátiles y ambiciosos, se adaptan a cualquier camino.",
    bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    bonusHp: 0,
    traits: ["Versátil: +1 a todos los atributos"],
    visual: {
      skin: ["#d8aa72", "#c68b59", "#e8c39a", "#8d5a3b", "#a8714a"],
      hair: ["#2b1b0f", "#5a3a22", "#8a5a2a", "#c9a14a", "#1a1210"],
      height: 1,
      width: 1,
    },
  },
  elf: {
    id: "elf",
    label: "Elfo",
    description: "Esbeltos y longevos, de sentidos agudos y paso ligero.",
    bonus: { dex: 2, int: 1 },
    bonusHp: 0,
    traits: ["Sentidos agudos", "Gracia élfica"],
    visual: {
      skin: ["#ecd0b0", "#e0c29e", "#f1dcc4"],
      hair: ["#e8e0c8", "#c9a14a", "#3a2a1a", "#9fb8d8"],
      height: 1.06,
      width: 0.88,
      ears: "long",
    },
  },
  dwarf: {
    id: "dwarf",
    label: "Enano",
    description: "Robustos como la roca de sus montañas, orgullosos y tenaces.",
    bonus: { con: 2, wis: 1 },
    bonusHp: 2,
    traits: ["Dureza enana: +2 PV", "Resistente"],
    visual: {
      skin: ["#d8a67a", "#c48f66", "#b87f58"],
      hair: ["#8a3b1a", "#5a3a22", "#2b1b0f", "#9a9a9a"],
      height: 0.82,
      width: 1.22,
      beard: true,
    },
  },
  halfling: {
    id: "halfling",
    label: "Mediano",
    description: "Pequeños, afortunados y de buen corazón.",
    bonus: { dex: 2, cha: 1 },
    bonusHp: 0,
    traits: ["Afortunado", "Ágil"],
    visual: {
      skin: ["#e0b088", "#d4a070", "#c89464"],
      hair: ["#5a3a22", "#8a5a2a", "#2b1b0f"],
      height: 0.68,
      width: 0.95,
    },
  },
  half_elf: {
    id: "half_elf",
    label: "Semielfo",
    description: "Entre dos mundos: carismáticos y adaptables.",
    bonus: { cha: 2, dex: 1, con: 1 },
    bonusHp: 0,
    traits: ["Carismático", "Ascendencia feérica"],
    visual: {
      skin: ["#e2bd94", "#d4a579", "#ecd0b0"],
      hair: ["#5a3a22", "#c9a14a", "#2b1b0f", "#8a3b1a"],
      height: 1.02,
      width: 0.95,
      ears: "pointy",
    },
  },
  gnome: {
    id: "gnome",
    label: "Gnomo",
    description: "Diminutos inventores, curiosos y llenos de ingenio.",
    bonus: { int: 2, con: 1 },
    bonusHp: 0,
    traits: ["Astucia gnómica", "Curioso"],
    visual: {
      skin: ["#e8b890", "#d8a47a", "#f0c8a0"],
      hair: ["#c0392b", "#e8e0c8", "#4a6fa5", "#5a3a22"],
      height: 0.64,
      width: 0.9,
      ears: "pointy",
    },
  },
  orc: {
    id: "orc",
    label: "Orco",
    description: "Imponentes guerreros de gran fuerza y voluntad de hierro.",
    bonus: { str: 2, con: 1 },
    bonusHp: 2,
    traits: ["Furia orca: +2 PV", "Imponente"],
    visual: {
      skin: ["#6f9a4a", "#5e8a3e", "#7aa356", "#8a9a6a"],
      hair: ["#1a1210", "#2b1b0f", "#4a3a2a"],
      height: 1.14,
      width: 1.22,
      tusks: true,
      ears: "pointy",
      eyes: "#f2c14a",
    },
  },
  tiefling: {
    id: "tiefling",
    label: "Tiefling",
    description: "Marcados por un linaje infernal, astutos y seductores.",
    bonus: { cha: 2, int: 1 },
    bonusHp: 0,
    traits: ["Linaje infernal", "Visión en la oscuridad"],
    visual: {
      skin: ["#a8403a", "#8a4a8a", "#c2564a", "#6a4a9a"],
      hair: ["#1a1210", "#2a1a3a", "#5a1a2a"],
      height: 1.02,
      width: 0.95,
      horns: true,
      tail: true,
      eyes: "#ffd24a",
    },
  },
  dragonborn: {
    id: "dragonborn",
    label: "Dracónido",
    description: "Descendientes de dragones, orgullosos y de aliento ardiente.",
    bonus: { str: 2, cha: 1 },
    bonusHp: 1,
    traits: ["Escamas: +1 PV", "Aliento ancestral"],
    visual: {
      skin: ["#b8442a", "#2f7a5a", "#3a5fa0", "#c9a14a", "#8a8a96"],
      hair: [],
      height: 1.16,
      width: 1.12,
      snout: true,
      tail: true,
      bald: true,
      eyes: "#ffe08a",
    },
  },
};

export const RACE_LIST: RaceDef[] = RACE_IDS.map((id) => RACES[id]);

export function isRaceId(value: unknown): value is RaceId {
  return typeof value === "string" && (RACE_IDS as readonly string[]).includes(value);
}

export function formatBonus(bonus: RaceDef["bonus"]): string {
  const names: Record<AbilityKey, string> = {
    str: "FUE",
    dex: "DES",
    con: "CON",
    int: "INT",
    wis: "SAB",
    cha: "CAR",
  };
  const entries = Object.entries(bonus) as Array<[AbilityKey, number]>;
  if (entries.length === 6 && entries.every(([, v]) => v === 1)) return "+1 a todos los atributos";
  return entries.map(([k, v]) => `+${v} ${names[k]}`).join(", ");
}

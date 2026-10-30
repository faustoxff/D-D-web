import type { AbilityKey } from "./races.js";

export const CLASS_IDS = ["fighter", "rogue", "wizard", "cleric"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface ClassDef {
  id: ClassId;
  label: string;
  description: string;
  hitDie: number;
  /** Starting ability scores in STR, DEX, CON, INT, WIS, CHA order. */
  stats: [number, number, number, number, number, number];
  primary: AbilityKey[];
  /** Outfit colours used by the 3D character model. */
  outfit: {
    tunic: string;
    trim: string;
    legs: string;
    weapon: "sword" | "dagger" | "staff" | "mace";
    hat?: "hood" | "wizard" | "helmet" | "mitre";
    cape?: string;
  };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: "fighter",
    label: "Guerrero",
    description: "Experto en combate cuerpo a cuerpo. Alta FUE y CON.",
    hitDie: 10,
    stats: [15, 13, 14, 10, 12, 8],
    primary: ["str", "con"],
    outfit: { tunic: "#7a7f8a", trim: "#d4a843", legs: "#3f3a35", weapon: "sword", hat: "helmet", cape: "#8a2b2b" },
  },
  rogue: {
    id: "rogue",
    label: "Pícaro",
    description: "Ágil y sigiloso. Alta DES.",
    hitDie: 8,
    stats: [14, 15, 8, 12, 10, 13],
    primary: ["dex"],
    outfit: { tunic: "#3b3f4a", trim: "#8a6a2c", legs: "#26262e", weapon: "dagger", hat: "hood", cape: "#2a2a34" },
  },
  wizard: {
    id: "wizard",
    label: "Mago",
    description: "Domina la magia arcana. Alta INT.",
    hitDie: 6,
    stats: [8, 12, 13, 15, 14, 10],
    primary: ["int"],
    outfit: { tunic: "#3a4fa8", trim: "#e8d27a", legs: "#2c3a7a", weapon: "staff", hat: "wizard" },
  },
  cleric: {
    id: "cleric",
    label: "Clérigo",
    description: "Guardián divino. Alta SAB y CON.",
    hitDie: 8,
    stats: [13, 10, 14, 8, 15, 12],
    primary: ["wis", "con"],
    outfit: { tunic: "#e8e4d8", trim: "#d4a843", legs: "#8a7a5a", weapon: "mace", hat: "mitre" },
  },
};

export const CLASS_LIST: ClassDef[] = CLASS_IDS.map((id) => CLASSES[id]);

export function isClassId(value: unknown): value is ClassId {
  return typeof value === "string" && (CLASS_IDS as readonly string[]).includes(value);
}

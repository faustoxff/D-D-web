import type { RaceId } from "../data/races.js";
import type { ClassId } from "../data/classes.js";

export type Race = RaceId;
export type CharacterClass = ClassId;

export interface Character {
  id: string;
  user_id: string;
  name: string;
  race: Race;
  class: CharacterClass;
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  currency: number;
  zone_id: string;
  created_at: string;
}

export interface CharacterStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

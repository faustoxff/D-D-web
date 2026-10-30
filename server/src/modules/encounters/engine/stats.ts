export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export { buildStartingStats } from "@dnd/shared";
export type { StartingStats } from "@dnd/shared";

// Proficiency bonus by level (standard 5e-ish)
export function proficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2;
}

// Attack bonus = STR mod + proficiency
export function meleeAttackBonus(str: number, level: number): number {
  return abilityModifier(str) + proficiencyBonus(level);
}

// AC = 10 + DEX mod (unarmored baseline)
export function unarmedAC(dex: number): number {
  return 10 + abilityModifier(dex);
}

export function manhattanDistance(
  a: [number, number],
  b: [number, number],
): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

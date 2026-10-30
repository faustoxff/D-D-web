import type { CombatEvent, TurnActor } from "@dnd/shared";
import { roll, rollD20 } from "./dice";
import { abilityModifier, manhattanDistance, proficiencyBonus } from "./stats";
import { GAME_CONFIG } from "../../../config/game.config";

export interface CombatantState {
  hp: number;
  maxHp: number;
  str: number;
  dex: number;
  ac: number;
  attackDamageExpr: string;
  level?: number; // only player has level
  pos: [number, number];
}

export interface TurnInput {
  round: number;
  actor: TurnActor;
  attacker: CombatantState;
  defender: CombatantState;
}

export interface TurnOutput {
  event: CombatEvent;
  defenderNewHp: number;
}

export function processTurn(input: TurnInput, rng?: () => number): TurnOutput {
  const { round, actor, attacker, defender } = input;

  const strMod = abilityModifier(attacker.str);
  const profBonus = attacker.level ? proficiencyBonus(attacker.level) : 0;
  const attackBonus = strMod + profBonus;

  const d20Roll = rollD20(rng);
  const total = d20Roll + attackBonus;
  const hit = total >= defender.ac;

  let damage: number | null = null;
  if (hit) {
    const dmgRoll = roll(attacker.attackDamageExpr, rng);
    damage = Math.max(1, dmgRoll.total);
  }

  const defenderNewHp = Math.max(0, defender.hp - (damage ?? 0));

  const event: CombatEvent = {
    round,
    actor,
    roll: d20Roll,
    modifier: attackBonus,
    total,
    hit,
    damage,
  };

  return { event, defenderNewHp };
}

export function isInMeleeRange(
  attackerPos: [number, number],
  defenderPos: [number, number],
): boolean {
  return manhattanDistance(attackerPos, defenderPos) <= GAME_CONFIG.MELEE_RANGE;
}

export function startingGridState(): {
  playerPos: [number, number];
  enemyPos: [number, number];
} {
  return { playerPos: [1, 3], enemyPos: [3, 3] };
}

// Builds the player's attack damage expression (1d6 base + STR mod for all classes, MVP)
export function playerAttackExpr(str: number, level: number): string {
  const strMod = abilityModifier(str);
  const mod = strMod + (level > 1 ? 1 : 0); // small damage bonus past lv1
  const sign = mod >= 0 ? `+${mod}` : `${mod}`;
  return `1d6${sign}`;
}

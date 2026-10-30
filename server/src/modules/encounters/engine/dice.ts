export type DiceExpression = string; // "1d6", "2d6+2", "1d20"

export interface RollResult {
  rolls: number[];
  modifier: number;
  total: number;
}

// Accepts optional rng for deterministic testing
export function roll(
  expr: DiceExpression,
  rng: () => number = Math.random,
): RollResult {
  const m = expr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) throw new Error(`Invalid dice expression: "${expr}"`);

  const count = parseInt(m[1]!, 10);
  const sides = parseInt(m[2]!, 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;

  const rolls = Array.from(
    { length: count },
    () => Math.floor(rng() * sides) + 1,
  );
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;

  return { rolls, modifier, total: Math.max(0, total) };
}

export function rollD20(rng?: () => number): number {
  return roll("1d20", rng).total;
}

export function rollInRange(
  min: number,
  max: number,
  rng: () => number = Math.random,
): number {
  return min + Math.floor(rng() * (max - min + 1));
}

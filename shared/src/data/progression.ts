/** XP needed to leave `level`. Mirrors server/src/config/game.config.ts (XP_BASE=150, XP_EXPONENT=1.8). */
export function xpToNextLevel(level: number): number {
  return Math.floor(150 * Math.pow(level, 1.8));
}

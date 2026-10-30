export const GAME_CONFIG = {
  // XP curve — tweak here, never hardcode elsewhere
  XP_BASE: 150,
  XP_EXPONENT: 1.8,

  // Economy
  COMBAT_REWARD_MIN: 15,
  COMBAT_REWARD_MAX: 40,
  QUEST_REWARD_XP_MIN: 50,
  QUEST_REWARD_XP_MAX: 100,
  QUEST_REWARD_CURRENCY_MIN: 25,
  QUEST_REWARD_CURRENCY_MAX: 50,

  // Grid
  COMBAT_GRID_SIZE: 6,
  MELEE_RANGE: 2, // Manhattan distance

  // Items
  POTION_HEAL_DICE: "2d6" as const,
  POTION_COST: 25,

  // Zone log
  MAX_ZONE_LOG: 50,

  // Breathing room after a fight during which enemies won't start another one
  POST_COMBAT_GRACE_MS: 5000,

  // Flee chance (%)
  FLEE_CHANCE: 50,
} as const;

export function xpToNextLevel(level: number): number {
  return Math.floor(
    GAME_CONFIG.XP_BASE * Math.pow(level, GAME_CONFIG.XP_EXPONENT),
  );
}

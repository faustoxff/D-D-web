import type { EnemyTemplate } from "@dnd/shared";

/**
 * Scales a base enemy template to a world-enemy level. Pure and deterministic so
 * it can be unit-tested; combat itself still goes through the rules engine.
 */
export function scaleTemplate(base: EnemyTemplate, level: number): EnemyTemplate {
  const k = Math.max(0, Math.floor(level) - 1);
  if (k === 0) return base;

  const dmgBonus = Math.floor(k / 2);
  const m = base.attack_damage.match(/^(\d+d\d+)([+-]\d+)?$/);
  let attack = base.attack_damage;
  if (m && dmgBonus > 0) {
    const mod = (m[2] ? parseInt(m[2], 10) : 0) + dmgBonus;
    attack = `${m[1]}${mod >= 0 ? "+" : ""}${mod}`;
  }

  return {
    ...base,
    hp: Math.round(base.hp * (1 + 0.3 * k)),
    ac: base.ac + Math.floor(k / 3),
    attack_damage: attack,
    xp_reward: Math.round(base.xp_reward * (1 + 0.5 * k)),
    currency_min: Math.round(base.currency_min * (1 + 0.4 * k)),
    currency_max: Math.round(base.currency_max * (1 + 0.4 * k)),
  };
}

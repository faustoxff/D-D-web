export const SKILL_IDS = ["woodcutting", "mining", "fishing", "cooking"] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const MAX_SKILL_LEVEL = 99;

export interface SkillDef {
  id: SkillId;
  label: string;
  icon: string;
  verb: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  woodcutting: { id: "woodcutting", label: "Tala", icon: "🪓", verb: "Talar" },
  mining: { id: "mining", label: "Minería", icon: "⛏️", verb: "Minar" },
  fishing: { id: "fishing", label: "Pesca", icon: "🎣", verb: "Pescar" },
  cooking: { id: "cooking", label: "Cocina", icon: "🍳", verb: "Cocinar" },
};

export interface SkillState {
  xp: number;
  level: number;
}

export type SkillSet = Record<SkillId, SkillState>;

const XP_TABLE: number[] = (() => {
  // RuneScape's curve: level N needs floor(sum_{i<N} floor(i + 300 * 2^(i/7)) / 4) xp.
  const table = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < MAX_SKILL_LEVEL; lvl += 1) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

/** Total xp needed to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
  return XP_TABLE[l] ?? 0;
}

export function levelForXp(xp: number): number {
  for (let level = MAX_SKILL_LEVEL; level >= 1; level -= 1) {
    if (xp >= xpForLevel(level)) return level;
  }
  return 1;
}

export function emptySkills(): SkillSet {
  return Object.fromEntries(SKILL_IDS.map((id) => [id, { xp: 0, level: 1 }])) as SkillSet;
}

export function totalLevel(skills: SkillSet): number {
  return SKILL_IDS.reduce((sum, id) => sum + skills[id].level, 0);
}

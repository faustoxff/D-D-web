import { Injectable } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { SKILL_IDS, emptySkills, levelForXp, type SkillId, type SkillSet } from "@dnd/shared";

export interface XpResult {
  skill: SkillId;
  xp: number;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
}

@Injectable()
export class SkillsService {
  constructor(private readonly db: DbService) {}

  async getAll(characterId: string): Promise<SkillSet> {
    const rows = await this.db.many<{ skill: string; xp: number }>(
      "select skill, xp from character_skills where character_id = $1",
      [characterId],
    );
    const skills = emptySkills();
    for (const row of rows) {
      if ((SKILL_IDS as readonly string[]).includes(row.skill)) {
        skills[row.skill as SkillId] = { xp: row.xp, level: levelForXp(row.xp) };
      }
    }
    return skills;
  }

  /** Adds xp atomically (no read-modify-write) and reports any level gained. */
  async addXp(characterId: string, skill: SkillId, amount: number): Promise<XpResult> {
    const gained = Math.max(0, Math.round(amount));
    const row = await this.db.one<{ xp: number }>(
      `insert into character_skills (character_id, skill, xp) values ($1, $2, $3)
       on conflict (character_id, skill) do update set xp = character_skills.xp + excluded.xp
       returning xp`,
      [characterId, skill, gained],
    );
    const level = levelForXp(row.xp);
    const previousLevel = levelForXp(row.xp - gained);
    return { skill, xp: row.xp, level, previousLevel, leveledUp: level > previousLevel };
  }
}

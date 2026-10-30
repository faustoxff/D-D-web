import { Injectable } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { GAME_CONFIG } from "../../config/game.config";
import { rollInRange } from "../encounters/engine/dice";
import type { Quest } from "@dnd/shared";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function tomorrowUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

@Injectable()
export class QuestsService {
  constructor(private readonly db: DbService) {}

  async getOrCreateDailyQuest(characterId: string): Promise<Quest> {
    const today = todayUTC();

    // Return existing non-expired quest for today
    const existing = await this.db.maybeOne<Quest>(
      `select * from quests
       where character_id = $1 and quest_date = $2 and status in ('active','completed','claimed')`,
      [characterId, today],
    );
    if (existing) return existing;

    // Expire any lingering quests from previous days
    await this.db.exec(
      "update quests set status = 'expired' where character_id = $1 and status = 'active' and quest_date <> $2",
      [characterId, today],
    );

    // Generate new daily quest (MVP: always kill_N goblins)
    const targetCount = rollInRange(2, 4);
    const rewardXp = rollInRange(GAME_CONFIG.QUEST_REWARD_XP_MIN, GAME_CONFIG.QUEST_REWARD_XP_MAX);
    const rewardCurrency = rollInRange(
      GAME_CONFIG.QUEST_REWARD_CURRENCY_MIN,
      GAME_CONFIG.QUEST_REWARD_CURRENCY_MAX,
    );

    // The partial unique index makes concurrent creation safe: loser re-reads.
    const created = await this.db.maybeOne<Quest>(
      `insert into quests
         (character_id, type, description, target_count, progress, reward_xp, reward_currency, status, quest_date, expires_at)
       values ($1,'kill_N',$2,$3,0,$4,$5,'active',$6,$7)
       on conflict do nothing
       returning *`,
      [
        characterId,
        `Elimina ${targetCount} Goblin${targetCount > 1 ? "s" : ""} en el Callejón Oscuro.`,
        targetCount,
        rewardXp,
        rewardCurrency,
        today,
        tomorrowUTC(),
      ],
    );
    if (created) return created;

    const raced = await this.db.maybeOne<Quest>(
      "select * from quests where character_id = $1 and quest_date = $2 and status in ('active','completed','claimed')",
      [characterId, today],
    );
    if (!raced) throw new Error("Failed to create daily quest");
    return raced;
  }

  async incrementProgress(characterId: string, enemyType: string): Promise<Quest | null> {
    const today = todayUTC();
    const quest = await this.db.maybeOne<Quest>(
      "select * from quests where character_id = $1 and quest_date = $2 and status = 'active'",
      [characterId, today],
    );

    if (!quest || quest.type !== "kill_N") return null;

    // Goblins count toward kill_N quest (MVP: only enemy type)
    if (!enemyType.toLowerCase().includes("goblin")) return null;

    return this.db.maybeOne<Quest>(
      `update quests
         set progress = progress + 1,
             status = case when progress + 1 >= target_count then 'completed'::quest_status else status end
       where id = $1
       returning *`,
      [quest.id],
    );
  }

  async claimQuest(characterId: string, questId: string): Promise<Quest | null> {
    return this.db.maybeOne<Quest>(
      `update quests set status = 'claimed'
       where id = $1 and character_id = $2 and status = 'completed'
       returning *`,
      [questId, characterId],
    );
  }

  async getActiveQuest(characterId: string): Promise<Quest | null> {
    return this.db.maybeOne<Quest>(
      `select * from quests
       where character_id = $1 and quest_date = $2 and status in ('active','completed')`,
      [characterId, todayUTC()],
    );
  }
}

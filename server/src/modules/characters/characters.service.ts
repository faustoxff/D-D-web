import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { buildStartingStats } from "../encounters/engine/stats";
import { xpToNextLevel } from "../../config/game.config";
import { STARTER_KIT, type Character, type CharacterClass, type Race } from "@dnd/shared";

const STARTING_ZONE_ID = "a1000000-0000-0000-0000-000000000001";

@Injectable()
export class CharactersService {
  constructor(private readonly db: DbService) {}

  async findByUserId(userId: string): Promise<Character | null> {
    return this.db.maybeOne<Character>("select * from characters where user_id = $1", [userId]);
  }

  async findById(id: string): Promise<Character> {
    const row = await this.db.maybeOne<Character>("select * from characters where id = $1", [id]);
    if (!row) throw new NotFoundException("Character not found");
    return row;
  }

  async create(
    userId: string,
    name: string,
    race: Race,
    characterClass: CharacterClass,
  ): Promise<Character> {
    const existing = await this.findByUserId(userId);
    if (existing) throw new BadRequestException("Character already exists");

    const stats = buildStartingStats(characterClass, race);

    try {
      const created = await this.db.one<Character>(
        `insert into characters
           (user_id, name, race, class, zone_id, str, dex, con, int, wis, cha, hp, max_hp)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          userId, name, race, characterClass, STARTING_ZONE_ID,
          stats.str, stats.dex, stats.con, stats.int, stats.wis, stats.cha, stats.hp, stats.max_hp,
        ],
      );

      // Every adventurer starts with the three gathering tools
      await this.db.exec(
        `insert into inventory_items (character_id, item_id, quantity)
         select $1::uuid, id, 1 from items where name = any($2::text[])
         on conflict do nothing`,
        [created.id, [...STARTER_KIT]],
      );
      return created;
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Could not create character");
    }
  }

  async addXp(
    characterId: string,
    xpGained: number,
  ): Promise<{ character: Character; leveledUp: boolean }> {
    const character = await this.findById(characterId);
    const newXp = character.xp + xpGained;
    const xpNeeded = xpToNextLevel(character.level);

    const leveledUp = newXp >= xpNeeded;
    const newLevel = leveledUp ? character.level + 1 : character.level;

    // On level up, increase max HP by CON mod + hit die average
    const newMaxHp = leveledUp
      ? character.max_hp + 5 + Math.floor((character.con - 10) / 2)
      : character.max_hp;

    const updated = await this.db.one<Character>(
      "update characters set xp = $2, level = $3, max_hp = $4 where id = $1 returning *",
      [characterId, newXp, newLevel, newMaxHp],
    );

    return { character: updated, leveledUp };
  }

  async updateHp(characterId: string, hp: number): Promise<void> {
    await this.db.exec("update characters set hp = $2 where id = $1", [characterId, Math.max(0, hp)]);
  }

  async updateZone(characterId: string, zoneId: string): Promise<void> {
    await this.db.exec("update characters set zone_id = $2 where id = $1", [characterId, zoneId]);
  }

  async addCurrency(characterId: string, amount: number): Promise<number> {
    // Atomic: never read-modify-write the balance in application code.
    const row = await this.db.one<{ currency: number }>(
      "update characters set currency = greatest(0, currency + $2) where id = $1 returning currency",
      [characterId, amount],
    );
    return row.currency;
  }
}

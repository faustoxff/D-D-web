import { Injectable } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { startingGridState } from "./engine/combat.engine";
import type {
  CombatEvent,
  Encounter,
  EncounterStatus,
  EnemyTemplate,
} from "@dnd/shared";

@Injectable()
export class EncountersService {
  constructor(private readonly db: DbService) {}

  async getEnemyTemplate(name: string): Promise<EnemyTemplate> {
    const row = await this.db.maybeOne<EnemyTemplate>(
      "select * from enemy_templates where lower(name) = lower($1)",
      [name],
    );
    if (!row) throw new Error(`Enemy template not found: ${name}`);
    return row;
  }

  async create(
    zoneId: string,
    characterId: string,
    enemy: EnemyTemplate,
  ): Promise<Encounter> {
    const { playerPos, enemyPos } = startingGridState();
    return this.db.one<Encounter>(
      `insert into encounters
         (zone_id, character_id, enemy_type, enemy_hp, enemy_max_hp, grid_state, turn, round, status, combat_log)
       values ($1,$2,$3,$4,$4,$5::jsonb,'player',1,'active','[]'::jsonb)
       returning *`,
      [zoneId, characterId, enemy.name, enemy.hp, JSON.stringify({ player: playerPos, enemy: enemyPos })],
    );
  }

  async findActiveByCharacter(characterId: string): Promise<Encounter | null> {
    return this.db.maybeOne<Encounter>(
      "select * from encounters where character_id = $1 and status = 'active' limit 1",
      [characterId],
    );
  }

  async persist(
    encounterId: string,
    patch: {
      enemy_hp?: number;
      turn?: "player" | "enemy";
      round?: number;
      status?: EncounterStatus;
      combat_log?: CombatEvent[];
      ended_at?: string;
      grid_state?: { player: [number, number]; enemy: [number, number] };
    },
  ): Promise<Encounter> {
    // Column names come from this whitelist, never from caller input.
    const columns: Array<[keyof typeof patch, string]> = [
      ["enemy_hp", ""],
      ["turn", ""],
      ["round", ""],
      ["status", ""],
      ["combat_log", "::jsonb"],
      ["ended_at", ""],
      ["grid_state", "::jsonb"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [encounterId];
    for (const [key, cast] of columns) {
      const value = patch[key];
      if (value === undefined) continue;
      values.push(cast ? JSON.stringify(value) : value);
      sets.push(`${key} = $${values.length}${cast}`);
    }
    if (sets.length === 0) return this.db.one<Encounter>("select * from encounters where id = $1", [encounterId]);

    const row = await this.db.maybeOne<Encounter>(
      `update encounters set ${sets.join(", ")} where id = $1 returning *`,
      values,
    );
    if (!row) throw new Error("Failed to persist encounter");
    return row;
  }

  async close(
    encounterId: string,
    status: "won" | "lost" | "fled",
    combatLog: CombatEvent[],
  ): Promise<Encounter> {
    return this.persist(encounterId, {
      status,
      combat_log: combatLog,
      ended_at: new Date().toISOString(),
    });
  }
}

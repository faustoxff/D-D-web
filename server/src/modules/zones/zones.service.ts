import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import type { Zone, ZoneEvent, ZoneEventType } from "@dnd/shared";
import { GAME_CONFIG } from "../../config/game.config";

@Injectable()
export class ZonesService {
  constructor(private readonly db: DbService) {}

  async findById(zoneId: string): Promise<Zone> {
    const row = await this.db.maybeOne<Zone>("select * from zones where id = $1", [zoneId]);
    if (!row) throw new NotFoundException("Zone not found");
    return row;
  }

  async getRecentEvents(zoneId: string): Promise<ZoneEvent[]> {
    return this.db.many<ZoneEvent>(
      "select * from zone_events where zone_id = $1 order by created_at desc limit $2",
      [zoneId, GAME_CONFIG.MAX_ZONE_LOG],
    );
  }

  async logEvent(
    zoneId: string,
    type: ZoneEventType,
    payload: Record<string, unknown>,
    characterId?: string,
  ): Promise<ZoneEvent> {
    return this.db.one<ZoneEvent>(
      `insert into zone_events (zone_id, character_id, type, payload)
       values ($1, $2, $3, $4::jsonb) returning *`,
      [zoneId, characterId ?? null, type, JSON.stringify(payload)],
    );
  }
}

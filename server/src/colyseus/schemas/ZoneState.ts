import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema";
import { EnemySchema } from "./EnemySchema";
import { NodeSchema } from "./NodeSchema";

export class ZoneState extends Schema {
  @type("string") zoneId: string = "";
  @type("string") zoneName: string = "";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: EnemySchema }) enemies = new MapSchema<EnemySchema>();
  @type({ map: NodeSchema }) nodes = new MapSchema<NodeSchema>();
}

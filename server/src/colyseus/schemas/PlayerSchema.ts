import { Schema, type } from "@colyseus/schema";
import { EncounterSchema } from "./EncounterSchema";

export class PlayerSchema extends Schema {
  @type("string") characterId: string = "";
  @type("string") name: string = "";
  @type("string") race: string = "human";
  @type("string") charClass: string = "fighter";
  @type("number") level: number = 1;
  @type("number") hp: number = 0;
  @type("number") maxHp: number = 0;
  @type("number") posX: number = 1;
  @type("number") posY: number = 3;
  @type("number") worldX: number = 6;
  @type("number") worldY: number = 12;
  @type("string") facing: string = "south";
  /** Exact heading in radians, so other players see where you really face. */
  @type("float32") yaw: number = 0;
  /** "" | "chop" | "mine" | "fish" | "cook": drives the work animation for everyone. */
  @type("string") action: string = "";
  @type(EncounterSchema) encounter = new EncounterSchema();
}

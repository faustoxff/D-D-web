import { Schema, type } from "@colyseus/schema";

export class EncounterSchema extends Schema {
  @type("string") encounterId: string = "";
  @type("string") enemyName: string = "";
  @type("number") enemyLevel: number = 1;
  @type("number") enemyHp: number = 0;
  @type("number") enemyMaxHp: number = 0;
  @type("number") enemyPosX: number = 3;
  @type("number") enemyPosY: number = 3;
  @type("string") turn: string = "player";
  @type("number") round: number = 1;
  // "idle" | "active" | "won" | "lost" | "fled"
  @type("string") status: string = "idle";
}

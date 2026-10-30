import { Schema, type } from "@colyseus/schema";

/** A world enemy, simulated by the server and mirrored to every client. */
export class EnemySchema extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "Goblin";
  @type("number") level: number = 1;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  /** Facing angle in radians, atan2(dx, dy) in tile space. */
  @type("float32") yaw: number = 0;
  // "idle" | "chase" | "combat" | "dead"
  @type("string") state: string = "idle";
}

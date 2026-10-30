import { Schema, type } from "@colyseus/schema";

/** A resource node (tree, ore vein) that is currently used up. Only depleted ones are synced. */
export class NodeSchema extends Schema {
  @type("string") key: string = "";
  @type("string") kind: string = "tree";
  @type("int16") x: number = 0;
  @type("int16") y: number = 0;
}

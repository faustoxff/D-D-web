// Colyseus room message types (client → server)
export type ClientMessageType =
  | "attack"
  | "flee"
  | "move"
  | "use_item"
  | "enter_zone";

export interface AttackMessage {
  type: "attack";
}

export interface FleeMessage {
  type: "flee";
}

export interface MoveMessage {
  type: "move";
  direction: "north" | "south" | "east" | "west";
}

export interface UseItemMessage {
  type: "use_item";
  item_id: string;
}

export type ClientMessage =
  | AttackMessage
  | FleeMessage
  | MoveMessage
  | UseItemMessage;

// Colyseus room message types (server → client)
export type ServerEventType =
  | "combat_started"
  | "combat_ended"
  | "narrative"
  | "zone_event"
  | "error";

export interface NarrativeEvent {
  type: "narrative";
  text: string;
}

export interface CombatEndedEvent {
  type: "combat_ended";
  status: "won" | "lost" | "fled";
  xp_gained?: number;
  currency_gained?: number;
  narrative: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ServerEvent = NarrativeEvent | CombatEndedEvent | ErrorEvent;

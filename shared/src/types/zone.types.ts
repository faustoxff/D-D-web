export interface Zone {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>; // { "north": zone_id }
  is_combat_zone: boolean;
}

export type ZoneEventType =
  | "entered_zone"
  | "leveled_up"
  | "won_combat"
  | "found_item"
  | "quest_completed"
  | "purchased";

export interface ZoneEvent {
  id: string;
  zone_id: string;
  character_id: string | null;
  type: ZoneEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

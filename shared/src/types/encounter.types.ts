export type TurnActor = "player" | "enemy";
export type EncounterStatus = "active" | "won" | "lost" | "fled";

export interface CombatEvent {
  round: number;
  actor: TurnActor;
  roll: number;
  modifier: number;
  total: number;
  hit: boolean;
  damage: number | null;
}

export interface GridState {
  player: [number, number];
  enemy: [number, number];
}

export interface Encounter {
  id: string;
  zone_id: string;
  character_id: string;
  enemy_type: string;
  enemy_hp: number;
  enemy_max_hp: number;
  grid_state: GridState;
  turn: TurnActor;
  round: number;
  status: EncounterStatus;
  combat_log: CombatEvent[];
  created_at: string;
  ended_at: string | null;
}

export interface EnemyTemplate {
  id: string;
  name: string;
  hp: number;
  str: number;
  dex: number;
  con: number;
  ac: number;
  attack_damage: string; // e.g. "1d6+2"
  xp_reward: number;
  currency_min: number;
  currency_max: number;
}

// Ephemeral Colyseus state (not persisted as-is)
export interface EncounterSchemaData {
  characterId: string;
  playerPos: [number, number];
  enemy: {
    name: string;
    hp: number;
    maxHp: number;
    pos: [number, number];
  };
  turn: TurnActor;
  round: number;
  status: EncounterStatus;
  combatLog: CombatEvent[];
}

export type QuestType = "kill_N" | "explore" | "survive";
export type QuestStatus = "active" | "completed" | "claimed" | "expired";

export interface Quest {
  id: string;
  character_id: string;
  type: QuestType;
  description: string;
  target_count: number;
  progress: number;
  reward_xp: number;
  reward_currency: number;
  status: QuestStatus;
  quest_date: string;     // UTC date string "YYYY-MM-DD"
  expires_at: string;     // quest_date + 24h UTC
}

export type ItemType = "weapon" | "armor" | "consumable";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  stats: Record<string, unknown>;
  cost: number;
  single_use: boolean;
}

export interface InventoryItem {
  id: string;
  character_id: string;
  item_id: string;
  quantity: number;
  equipped: boolean;
  item?: Item;
}

export type TransactionType = "combat_reward" | "quest_reward" | "purchase" | "repair";

export interface Transaction {
  id: string;
  character_id: string;
  type: TransactionType;
  amount: number;        // positive = gain, negative = spend
  description: string;
  created_at: string;
}

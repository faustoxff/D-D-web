import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { CharactersService } from "../characters/characters.service";
import { roll } from "../encounters/engine/dice";
import { GAME_CONFIG } from "../../config/game.config";
import { INVENTORY_SLOTS, ITEM_LIST, type InventoryItem, type Item, type ToolType, type TransactionType } from "@dnd/shared";

@Injectable()
export class EconomyService {
  constructor(
    private readonly db: DbService,
    private readonly characters: CharactersService,
  ) {}

  private readonly INVENTORY_SELECT = `
    select ii.*, row_to_json(i) as item
    from inventory_items ii join items i on i.id = ii.item_id`;

  async getInventory(characterId: string): Promise<InventoryItem[]> {
    return this.db.many<InventoryItem>(`${this.INVENTORY_SELECT} where ii.character_id = $1`, [characterId]);
  }

  /** Makes the items table match shared/src/data/items.ts (runs at server start; idempotent). */
  async syncCatalog(): Promise<void> {
    for (const item of ITEM_LIST) {
      const type = item.kind === "tool" ? "tool" : item.kind === "resource" || item.kind === "junk" ? "resource" : "consumable";
      const stats = { ...(item.heal ? { heal: item.heal } : {}), ...(item.tool ? { tool: item.tool } : {}) };
      await this.db.exec(
        `insert into items (name, type, description, stats, cost, single_use, sell_value)
         values ($1, $2::item_type, $3, $4::jsonb, $5, $6, $7)
         on conflict (name) do update set
           type = excluded.type, description = excluded.description, stats = excluded.stats,
           cost = excluded.cost, single_use = excluded.single_use, sell_value = excluded.sell_value`,
        [item.name, type, item.description, JSON.stringify(stats), item.cost, item.kind === "food" || item.kind === "potion", item.sellValue],
      );
    }
  }

  async getShopItems(): Promise<Item[]> {
    return this.db.many<Item>("select * from items where cost > 0 order by type, cost, name");
  }

  /** Stacks currently used (each distinct item is one slot, like a bank of stacks). */
  async usedSlots(characterId: string): Promise<number> {
    const row = await this.db.one<{ n: string }>(
      "select count(*)::text as n from inventory_items where character_id = $1",
      [characterId],
    );
    return Number(row.n);
  }

  /** True when `itemName` fits: it already has a stack, or there is a free slot. */
  async canAdd(characterId: string, itemName: string): Promise<boolean> {
    const has = await this.db.maybeOne(
      `select 1 from inventory_items ii join items i on i.id = ii.item_id
       where ii.character_id = $1 and i.name = $2`,
      [characterId, itemName],
    );
    return has !== null || (await this.usedSlots(characterId)) < INVENTORY_SLOTS;
  }

  /** Adds items by name. Returns false when the backpack is full. */
  async addItem(characterId: string, itemName: string, quantity = 1): Promise<boolean> {
    if (!(await this.canAdd(characterId, itemName))) return false;
    const row = await this.db.maybeOne(
      `insert into inventory_items (character_id, item_id, quantity)
       select $1::uuid, id, $3::int from items where name = $2::text
       on conflict (character_id, item_id) do update set quantity = inventory_items.quantity + excluded.quantity
       returning id`,
      [characterId, itemName, quantity],
    );
    return row !== null;
  }

  /** Removes `quantity` of an item if the character has that many (emptying a stack deletes it). */
  async removeItem(characterId: string, itemName: string, quantity = 1): Promise<boolean> {
    return this.db.tx(async (q) => {
      const row = await q.maybeOne<{ id: string; quantity: number }>(
        `select ii.id, ii.quantity
         from inventory_items ii join items i on i.id = ii.item_id
         where ii.character_id = $1 and i.name = $2 for update of ii`,
        [characterId, itemName],
      );
      if (!row || row.quantity < quantity) return false;
      // inventory_items.quantity must stay > 0, so a fully used stack is deleted instead
      if (row.quantity === quantity) await q.exec("delete from inventory_items where id = $1", [row.id]);
      else await q.exec("update inventory_items set quantity = quantity - $2 where id = $1", [row.id, quantity]);
      return true;
    });
  }

  async countItem(characterId: string, itemName: string): Promise<number> {
    const row = await this.db.maybeOne<{ quantity: number }>(
      `select ii.quantity from inventory_items ii join items i on i.id = ii.item_id
       where ii.character_id = $1 and i.name = $2`,
      [characterId, itemName],
    );
    return row?.quantity ?? 0;
  }

  async hasTool(characterId: string, tool: ToolType): Promise<boolean> {
    const row = await this.db.maybeOne(
      `select 1 from inventory_items ii join items i on i.id = ii.item_id
       where ii.character_id = $1 and i.stats->>'tool' = $2`,
      [characterId, tool],
    );
    return row !== null;
  }

  /** Sells part or all of a stack to a shop at the item's sell value. */
  async sell(
    characterId: string,
    inventoryItemId: string,
    quantity: number,
  ): Promise<{ gold: number; sold: number; name: string }> {
    const wanted = Math.max(1, Math.floor(quantity));
    const result = await this.db.tx(async (q) => {
      const row = await q.maybeOne<{ id: string; quantity: number; name: string; sell_value: number }>(
        `select ii.id, ii.quantity, i.name, i.sell_value
         from inventory_items ii join items i on i.id = ii.item_id
         where ii.id = $1 and ii.character_id = $2 for update of ii`,
        [inventoryItemId, characterId],
      );
      if (!row) throw new NotFoundException("Inventory item not found");
      const sold = Math.min(wanted, row.quantity);
      if (row.quantity - sold <= 0) await q.exec("delete from inventory_items where id = $1", [row.id]);
      else await q.exec("update inventory_items set quantity = quantity - $2 where id = $1", [row.id, sold]);
      const gold = sold * row.sell_value;
      if (gold > 0) {
        await q.exec("update characters set currency = currency + $2 where id = $1", [characterId, gold]);
        await q.exec(
          "insert into transactions (character_id, type, amount, description) values ($1,'sale',$2,$3)",
          [characterId, gold, `Venta: ${sold} × ${row.name}`],
        );
      }
      return { gold, sold, name: row.name };
    });
    return result;
  }

  async purchase(characterId: string, itemId: string): Promise<InventoryItem> {
    const item = await this.db.maybeOne<Item>("select * from items where id = $1", [itemId]);
    if (!item || item.cost <= 0) throw new NotFoundException("Item not found");
    if (!(await this.canAdd(characterId, item.name))) throw new BadRequestException("Inventory full");

    // Atomic spend: the balance check and the deduction are one statement, so two
    // simultaneous purchases can never overdraw.
    const spent = await this.db.maybeOne<{ currency: number }>(
      "update characters set currency = currency - $2 where id = $1 and currency >= $2 returning currency",
      [characterId, item.cost],
    );
    if (!spent) throw new BadRequestException("Not enough currency");

    // Single-use items still stack in the inventory; the unique index (character, item)
    // makes the upsert safe.
    const row = await this.db.one<{ id: string }>(
      `insert into inventory_items (character_id, item_id, quantity)
       values ($1, $2, 1)
       on conflict (character_id, item_id) do update set quantity = inventory_items.quantity + 1
       returning id`,
      [characterId, itemId],
    );

    await this.recordTransaction(characterId, "purchase", -item.cost, `Compra: ${item.name}`);

    return this.db.one<InventoryItem>(`${this.INVENTORY_SELECT} where ii.id = $1`, [row.id]);
  }

  async useItem(
    characterId: string,
    inventoryItemId: string,
  ): Promise<{ hpRestored?: number; message: string }> {
    const inv = await this.db.maybeOne<InventoryItem & { item: Item }>(
      `${this.INVENTORY_SELECT} where ii.id = $1 and ii.character_id = $2`,
      [inventoryItemId, characterId],
    );

    if (!inv) throw new NotFoundException("Inventory item not found");
    const item = inv.item as Item;

    if (item.type !== "consumable") {
      throw new BadRequestException("Item is not usable");
    }

    // Handle healing potion
    const healDice = (item.stats as Record<string, string>)["heal"];
    if (healDice) {
      const character = await this.characters.findById(characterId);
      const healed = roll(healDice).total;
      const newHp = Math.min(character.max_hp, character.hp + healed);
      await this.characters.updateHp(characterId, newHp);

      if (item.single_use) await this.consumeItem(inv.id, inv.quantity);

      return { hpRestored: healed, message: `Recuperaste ${healed} HP.` };
    }

    return { message: "Item usado." };
  }

  private async consumeItem(invId: string, qty: number): Promise<void> {
    if (qty <= 1) {
      await this.db.exec("delete from inventory_items where id = $1", [invId]);
    } else {
      await this.db.exec("update inventory_items set quantity = quantity - 1 where id = $1", [invId]);
    }
  }

  async recordTransaction(
    characterId: string,
    type: TransactionType,
    amount: number,
    description: string,
  ): Promise<void> {
    await this.db.exec(
      "insert into transactions (character_id, type, amount, description) values ($1,$2,$3,$4)",
      [characterId, type, amount, description],
    );
  }

  async rewardCombat(
    characterId: string,
    enemyName: string,
  ): Promise<number> {
    const amount = Math.floor(
      GAME_CONFIG.COMBAT_REWARD_MIN +
        Math.random() *
          (GAME_CONFIG.COMBAT_REWARD_MAX - GAME_CONFIG.COMBAT_REWARD_MIN),
    );
    await this.characters.addCurrency(characterId, amount);
    await this.recordTransaction(
      characterId,
      "combat_reward",
      amount,
      `Recompensa de combate: ${enemyName}`,
    );
    return amount;
  }

  async rewardQuest(
    characterId: string,
    currency: number,
    questDescription: string,
  ): Promise<void> {
    await this.characters.addCurrency(characterId, currency);
    await this.recordTransaction(
      characterId,
      "quest_reward",
      currency,
      `Quest completada: ${questDescription}`,
    );
  }
}

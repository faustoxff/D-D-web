/**
 * Live smoke test of the data layer against the real database.
 * Usage:  SMOKE_USER_ID=<uuid of a *@dnd.example account> npm run smoke:db -w server
 * It creates and then deletes that account's character, so it refuses real accounts.
 */
import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();
import { strict as assert } from "node:assert";
import { DbService } from "../src/db/db.service";
import { CharactersService } from "../src/modules/characters/characters.service";
import { QuestsService } from "../src/modules/quests/quests.service";
import { EconomyService } from "../src/modules/economy/economy.service";
import { EncountersService } from "../src/modules/encounters/encounters.service";
import { ZonesService } from "../src/modules/zones/zones.service";
import { SkillsService } from "../src/modules/skills/skills.service";

const ZONE = "a1000000-0000-0000-0000-000000000001";
const ok = (m: string) => console.log("  ✔", m);

async function main() {
  const USER = process.env["SMOKE_USER_ID"];
  if (!USER) throw new Error("Set SMOKE_USER_ID to the id of a test account (email ending in @dnd.example)");

  const db = new DbService();
  const owner = await db.maybeOne<{ email: string }>('select email from neon_auth."user" where id = $1', [USER]);
  if (!owner?.email.endsWith("@dnd.example")) {
    throw new Error("Refusing to run: SMOKE_USER_ID must belong to an @dnd.example test account");
  }

  const chars = new CharactersService(db);
  const quests = new QuestsService(db);
  const economy = new EconomyService(db, chars);
  const encounters = new EncountersService(db);
  const zones = new ZonesService(db);
  const skills = new SkillsService(db);
  await economy.syncCatalog();

  await db.exec("delete from characters where user_id = $1", [USER]);
  try {
    const c = await chars.create(USER, "Testor", "orc", "wizard");
    assert.equal(c.race, "orc");
    assert.equal(c.int, 15);
    assert.equal(c.str, 10);
    assert.equal(c.max_hp, 6 + 2 + 2);
    ok(`personaje: orco mago, INT ${c.int}, PV ${c.max_hp} (dado 6 + mod CON 2 + racial 2)`);
    assert.equal((await chars.findByUserId(USER))?.id, c.id);
    await assert.rejects(chars.create(USER, "Otro", "elf", "rogue"), /already exists/);
    ok("segundo personaje en la misma cuenta rechazado");
    await assert.rejects(chars.findById("00000000-0000-0000-0000-000000000000"), /not found/i);
    ok("personaje inexistente -> NotFound");

    const lvl = await chars.addXp(c.id, 400);
    assert.equal(lvl.leveledUp, true);
    assert.equal(lvl.character.level, 2);
    ok(`subida de nivel: nv ${lvl.character.level}, PV máx ${lvl.character.max_hp}`);

    assert.equal(await chars.addCurrency(c.id, 30), 30);
    assert.equal(await chars.addCurrency(c.id, -100), 0);
    ok("moneda: +30 -> 30; -100 -> piso en 0");

    const potion = (await economy.getShopItems())[0]!;
    await chars.addCurrency(c.id, 30);
    const results = await Promise.allSettled([economy.purchase(c.id, potion.id), economy.purchase(c.id, potion.id)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await chars.findById(c.id)).currency, 5);
    ok("2 compras simultáneas con saldo para 1: solo 1 exitosa, saldo 5 (sin sobregiro)");

    const inv = await economy.getInventory(c.id);
    const names = inv.map((i) => i.item!.name).sort();
    assert.deepEqual(names, ["Caña de pescar", "Hacha de bronce", "Pico de bronce", "Poción de Curación"]);
    ok("mochila: kit inicial (hacha, pico, caña) + la poción comprada");
    const owned = inv.find((i) => i.item!.name === "Poción de Curación")!;
    await chars.updateHp(c.id, 1);
    const used = await economy.useItem(c.id, owned.id);
    assert.ok((used.hpRestored ?? 0) >= 2);
    assert.equal(await economy.countItem(c.id, "Poción de Curación"), 0);
    ok(`poción usada: +${used.hpRestored} PV y consumida`);
    assert.equal((await db.many("select 1 from transactions where character_id = $1", [c.id])).length, 1);
    ok("transacción registrada");

    // Professions
    assert.equal(await economy.hasTool(c.id, "axe"), true);
    const lvl1 = await skills.getAll(c.id);
    assert.equal(lvl1.woodcutting.level, 1);
    const gained = await skills.addXp(c.id, "woodcutting", 100);
    assert.equal(gained.level, 2);
    assert.equal(gained.leveledUp, true);
    assert.equal((await skills.getAll(c.id)).woodcutting.xp, 100);
    ok("habilidades: Tala 100 XP -> nivel 2 (curva de RuneScape), persistido");

    assert.equal(await economy.addItem(c.id, "Troncos", 5), true);
    assert.equal(await economy.addItem(c.id, "Troncos", 2), true);
    assert.equal(await economy.countItem(c.id, "Troncos"), 7);
    assert.equal(await economy.removeItem(c.id, "Troncos", 2), true);
    assert.equal(await economy.removeItem(c.id, "Troncos", 99), false);
    assert.equal(await economy.countItem(c.id, "Troncos"), 5);
    assert.equal(await economy.addItem(c.id, "Camarones crudos", 1), true);
    assert.equal(await economy.removeItem(c.id, "Camarones crudos", 1), true, "using the last unit deletes the stack");
    assert.equal(await economy.countItem(c.id, "Camarones crudos"), 0);
    ok("mochila: agregar/quitar por nombre; agotar un montón lo elimina; sin quitar más de lo que hay");

    const logs = (await economy.getInventory(c.id)).find((i) => i.item!.name === "Troncos")!;
    const before = (await chars.findById(c.id)).currency;
    const sold = await economy.sell(c.id, logs.id, 3);
    assert.equal(sold.sold, 3);
    assert.equal(sold.gold, 12);
    assert.equal((await chars.findById(c.id)).currency, before + 12);
    assert.equal(await economy.countItem(c.id, "Troncos"), 2);
    ok("venta: 3 troncos = 12 de oro, quedan 2");

    const rest = (await economy.getInventory(c.id)).find((i) => i.item!.name === "Troncos")!;
    const both = await Promise.allSettled([economy.sell(c.id, rest.id, 2), economy.sell(c.id, rest.id, 2)]);
    const goldFromBoth = both.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.gold : 0), 0);
    assert.equal(goldFromBoth, 8, "two simultaneous sells of the same stack pay only once");
    assert.equal(await economy.countItem(c.id, "Troncos"), 0);
    ok("2 ventas simultáneas del mismo montón: se paga una sola vez");
    assert.equal((await economy.getShopItems()).every((i) => i.cost > 0), true);
    ok("tienda: solo lista objetos con precio");

    const q1 = await quests.getOrCreateDailyQuest(c.id);
    const many = await Promise.all(Array.from({ length: 5 }, () => quests.getOrCreateDailyQuest(c.id)));
    assert.ok(many.every((q) => q.id === q1.id));
    assert.match(String(q1.quest_date), /^\d{4}-\d{2}-\d{2}$/);
    ok(`misión diaria: 5 llamadas simultáneas -> una sola (${q1.target_count} goblins)`);
    let q = q1;
    for (let i = 0; i < q1.target_count; i += 1) q = (await quests.incrementProgress(c.id, "Goblin"))!;
    assert.equal(q.status, "completed");
    assert.equal(await quests.incrementProgress(c.id, "Lobo"), null);
    assert.equal((await quests.claimQuest(c.id, q.id))?.status, "claimed");
    assert.equal(await quests.claimQuest(c.id, q.id), null);
    ok("misión: progreso -> completada -> reclamada; no se reclama dos veces");

    const tpl = await encounters.getEnemyTemplate("goblin");
    const enc = await encounters.create(ZONE, c.id, tpl);
    assert.equal(enc.enemy_hp, 12);
    assert.deepEqual(enc.grid_state, { player: [1, 3], enemy: [3, 3] });
    assert.equal((await encounters.findActiveByCharacter(c.id))?.id, enc.id);
    const upd = await encounters.persist(enc.id, {
      enemy_hp: 5,
      round: 3,
      turn: "enemy",
      combat_log: [{ round: 1, actor: "player", roll: 10, modifier: 2, total: 12, hit: true, damage: 7 }],
    });
    assert.equal(upd.enemy_hp, 5);
    assert.equal(upd.round, 3);
    assert.equal(upd.combat_log.length, 1);
    assert.equal((await encounters.close(enc.id, "won", upd.combat_log)).status, "won");
    assert.equal(await encounters.findActiveByCharacter(c.id), null);
    ok("combate: crear, restaurar activo, persistir (jsonb), cerrar");

    await zones.logEvent(ZONE, "won_combat", { enemy: "Goblin" }, c.id);
    assert.equal((await zones.getRecentEvents(ZONE))[0]!.payload["enemy"], "Goblin");
    assert.equal((await zones.findById(ZONE)).name, "La Taberna del Grifo");
    ok("zona: evento registrado y leído");
    console.log("\nTODO OK");
  } finally {
    await db.exec("delete from characters where user_id = $1", [USER]);
    await db.onModuleDestroy();
  }
}

main().catch((e: Error) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});

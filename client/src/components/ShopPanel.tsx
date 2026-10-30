import React, { useEffect, useState } from "react";
import { ITEM_CATALOG, iconFor, type Item } from "@dnd/shared";
import { buyItem, fetchShop, sellItem } from "../lib/api.ts";
import { useGameStore } from "../store/game.store.ts";

/** A merchant's counter: buy tools and potions, sell what you gathered. */
export default function ShopPanel() {
  const open = useGameStore((s) => s.shopOpen);
  const setOpen = useGameStore((s) => s.setShopOpen);
  const inventory = useGameStore((s) => s.inventory);
  const gold = useGameStore((s) => s.character?.currency ?? 0);
  const addToast = useGameStore((s) => s.addToast);
  const [tab, setTab] = useState<"buy" | "sell">("sell");
  const [stock, setStock] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) void fetchShop().then(setStock);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  // Tools are never offered for sale: losing your axe by accident is no fun.
  const sellable = inventory.filter((i) => {
    const def = ITEM_CATALOG[i.item?.name ?? ""];
    return def && def.sellValue > 0 && def.kind !== "tool";
  });
  // "Sell all" only moves raw materials and junk; food and potions you keep unless sold one by one.
  const bulk = sellable.filter((i) => {
    const kind = ITEM_CATALOG[i.item?.name ?? ""]?.kind;
    return kind === "resource" || kind === "junk";
  });
  const total = bulk.reduce((sum, i) => sum + (ITEM_CATALOG[i.item?.name ?? ""]?.sellValue ?? 0) * i.quantity, 0);

  const sell = async (id: string, qty: number) => {
    setBusy(true);
    const result = await sellItem(id, qty);
    setBusy(false);
    if (result?.gold) addToast("gold", `+${result.gold} oro (${result.sold} × ${result.name})`);
  };
  const sellAll = async () => {
    setBusy(true);
    let gold = 0;
    for (const entry of bulk) {
      const r = await sellItem(entry.id, entry.quantity);
      gold += r?.gold ?? 0;
    }
    setBusy(false);
    if (gold) addToast("gold", `+${gold} oro`);
  };
  const buy = async (item: Item) => {
    setBusy(true);
    const error = await buyItem(item.id);
    setBusy(false);
    addToast(error ? "info" : "loot", error ?? `Compraste ${item.name}`);
  };

  const tabClass = (active: boolean) =>
    `flex-1 py-2 text-sm font-semibold ${active ? "bg-parchment-500 text-dungeon-900" : "text-parchment-300 hover:bg-white/10"}`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md rounded-xl border border-parchment-400/40 bg-dungeon-900/95 p-4 shadow-2xl"
        style={{ animation: "fade-up 0.35s both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-title text-xl font-bold text-parchment-100">🛒 Mercader</h2>
          <div className="text-sm text-yellow-200">💰 {gold}</div>
        </div>
        <div className="mb-3 flex overflow-hidden rounded-lg border border-parchment-400/30">
          <button type="button" className={tabClass(tab === "sell")} onClick={() => setTab("sell")}>
            Vender
          </button>
          <button type="button" className={tabClass(tab === "buy")} onClick={() => setTab("buy")}>
            Comprar
          </button>
        </div>

        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {tab === "sell" &&
            (sellable.length === 0 ? (
              <p className="py-6 text-center text-sm italic text-parchment-500">No tienes nada que vender todavía.</p>
            ) : (
              sellable.map((entry) => {
                const name = entry.item?.name ?? "";
                const value = ITEM_CATALOG[name]?.sellValue ?? 0;
                return (
                  <div key={entry.id} className="flex items-center gap-2 rounded bg-black/35 px-2 py-1.5">
                    <span className="text-2xl">{iconFor(name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-parchment-100">{name}</div>
                      <div className="text-[11px] text-parchment-500">
                        x{entry.quantity} · {value} c/u
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => sell(entry.id, 1)} className="rounded border border-parchment-400/40 px-2 py-1 text-xs text-parchment-200 hover:bg-white/10 disabled:opacity-40">
                      1
                    </button>
                    <button disabled={busy} onClick={() => sell(entry.id, entry.quantity)} className="rounded bg-parchment-500 px-2 py-1 text-xs font-bold text-dungeon-900 hover:bg-parchment-400 disabled:opacity-40">
                      Todo ({value * entry.quantity})
                    </button>
                  </div>
                );
              })
            ))}

          {tab === "buy" &&
            stock.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded bg-black/35 px-2 py-1.5">
                <span className="text-2xl">{iconFor(item.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-parchment-100">{item.name}</div>
                  <div className="truncate text-[11px] text-parchment-500">{item.description}</div>
                </div>
                <button
                  disabled={busy || gold < item.cost}
                  onClick={() => buy(item)}
                  className="rounded bg-parchment-500 px-3 py-1 text-xs font-bold text-dungeon-900 hover:bg-parchment-400 disabled:opacity-40"
                >
                  💰 {item.cost}
                </button>
              </div>
            ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          {tab === "sell" && bulk.length > 0 ? (
            <button disabled={busy} onClick={sellAll} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
              Vender materiales ({total} 💰)
            </button>
          ) : (
            <span />
          )}
          <button onClick={() => setOpen(false)} className="text-sm text-parchment-400 hover:text-parchment-200">
            Cerrar [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}

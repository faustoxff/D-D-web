import type { Character, InventoryItem, Item, SkillSet } from "@dnd/shared";
import { authFetch } from "./auth.ts";
import { useGameStore } from "../store/game.store.ts";

async function json<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function refreshInventory(): Promise<void> {
  const items = await json<InventoryItem[]>(await authFetch("/api/economy/inventory"));
  if (items) useGameStore.getState().setInventory(items);
}

export async function refreshCharacter(): Promise<void> {
  const c = await json<Character>(await authFetch("/api/characters/me"));
  if (c?.id) useGameStore.getState().setCharacter(c);
}

export async function refreshSkills(): Promise<void> {
  const skills = await json<SkillSet>(await authFetch("/api/skills/me"));
  if (skills) useGameStore.getState().setSkills(skills);
}

export async function fetchShop(): Promise<Item[]> {
  return (await json<Item[]>(await authFetch("/api/economy/shop"))) ?? [];
}

export async function buyItem(itemId: string): Promise<string | null> {
  const res = await authFetch(`/api/economy/buy/${itemId}`, { method: "POST" });
  if (res.ok) {
    await Promise.all([refreshInventory(), refreshCharacter()]);
    return null;
  }
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message === "Not enough currency"
    ? "No tienes suficiente oro."
    : body?.message === "Inventory full"
      ? "Tu mochila está llena."
      : "No se pudo comprar.";
}

export async function sellItem(inventoryItemId: string, quantity: number): Promise<{ gold: number; sold: number; name: string } | null> {
  const res = await authFetch("/api/economy/sell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inventoryItemId, quantity }),
  });
  const result = await json<{ gold: number; sold: number; name: string }>(res);
  if (result) await Promise.all([refreshInventory(), refreshCharacter()]);
  return result;
}

import React, { useEffect, useCallback, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { useAuthStore } from "../store/auth.store.ts";
import { authFetch, getAccessToken } from "../lib/auth.ts";
import { useGameStore } from "../store/game.store.ts";
import { colyseusClient } from "../lib/colyseus.ts";
import PlayerHud from "../components/PlayerHud.tsx";
import GameShell from "../components/GameShell.tsx";
import BattleScene from "../components/BattleScene.tsx";
import { useBattleFlow } from "../hooks/useBattleFlow.ts";
import type { BattleResult } from "../store/game.store.ts";
import NarrativeLog from "../components/NarrativeLog.tsx";
import QuestPanel from "../components/QuestPanel.tsx";
import RpgWorld3D from "../components/RpgWorld3D.tsx";
import { RECIPES, SKILLS, findNearbyFire, type CombatEvent, type InventoryItem, type SkillId, type SkillSet } from "@dnd/shared";
import SidePanels from "../components/SidePanels.tsx";
import ShopPanel from "../components/ShopPanel.tsx";
import type { EncounterState } from "../store/game.store.ts";
import type { EnemyKind } from "../game/world.ts";

interface CombatEndedMsg {
  type: string;
  status: "won" | "lost" | "fled";
  xp_gained?: number;
  currency_gained?: number;
  narrative: string;
}

interface NarrativeMsg {
  type: string;
  text: string;
}

interface ErrorMsg {
  type: string;
  message: string;
}

interface SkillXpMsg {
  skill: SkillId;
  gained: number;
  xp: number;
  level: number;
  leveledUp: boolean;
  item: string;
  burnt?: boolean;
}

interface GatherStartedMsg {
  action: string;
  name: string;
  verb: string;
  tx: number;
  ty: number;
}

function pop(text: string, color: string, dy = 0) {
  window.dispatchEvent(new CustomEvent("dnd:pop", { detail: { text, color, dy } }));
}

interface CombatEventMsg {
  events: CombatEvent[];
}

function describeCombatEvent(
  event: CombatEvent,
  characterName: string,
  enemyName: string,
): string {
  const actorName = event.actor === "player" ? characterName : enemyName;
  const targetName = event.actor === "player" ? enemyName : characterName;

  if (!event.hit) {
    return `${actorName} ataca a ${targetName}, pero falla.`;
  }

  return `${actorName} ataca a ${targetName} por ${event.damage ?? 0} de daño.`;
}

export default function ZonePage() {
  const { user, signOut } = useAuthStore();
  const store = useGameStore();
  const {
    character,
    quest,
    encounter,
    log,
    room,
    isConnecting,
    setCharacter,
    setRoom,
    setQuest,
    addLog,
    addCombatEvents,
    setIsConnecting,
    reset,
  } = store;

  const roomRef = useRef<Room | null>(null);
  const battle = useBattleFlow(encounter.status);
  const levelRef = useRef<number | null>(null);
  const pendingLevelRef = useRef<number | null>(null);
  if (import.meta.env.DEV) {
    // Dev-only handle for debugging / end-to-end tests.
    (window as unknown as Record<string, unknown>)["__dnd"] = { getRoom: () => roomRef.current, store: useGameStore };
  }
  // Synchronous guards: React runs effects twice in dev, and state updates are async.
  const connectingRef = useRef(false);
  const unmountedRef = useRef(false);
  const [battleText, setBattleText] = useState("El aire se tensa a tu alrededor.");

  const refreshCharacter = useCallback(async () => {
    if (!user) return;
    const res = await authFetch("/api/characters/me").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json() as Record<string, unknown>;
    if (typeof data["id"] === "string") setCharacter(data as never);
  }, [user, setCharacter]);

  const fetchQuest = useCallback(async () => {
    if (!user) return;
    const res = await authFetch("/api/quests/daily").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json() as Record<string, unknown>;
    if (typeof data["id"] === "string") setQuest(data as never);
  }, [user, setQuest]);

  useEffect(() => {
    fetchQuest();
  }, [fetchQuest]);

  const connectRoom = useCallback(async () => {
    if (!user || roomRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setIsConnecting(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not signed in");
      const r = await colyseusClient.joinOrCreate("zone_room", { token });

      if (unmountedRef.current) {
        r.leave(); // the page went away while we were connecting
        return;
      }

      roomRef.current = r;
      setRoom(r);

      r.onMessage("narrative", (msg: NarrativeMsg) => {
        const state = useGameStore.getState();
        state.addLog("narrative", msg.text);
        if (state.encounter.status === "active") setBattleText(msg.text);
      });

      r.onMessage("combat_event", (msg: CombatEventMsg) => {
        const state = useGameStore.getState();
        const charName = state.character?.name ?? "Tú";
        const enemyName = state.encounter.enemyName || "Enemigo";
        state.addCombatEvents(msg.events, charName, enemyName);
        state.pushFx(msg.events);

        const latest = msg.events.at(-1);
        if (latest) {
          setBattleText(describeCombatEvent(latest, charName, enemyName));
        }
      });

      r.onMessage("combat_ended", (msg: CombatEndedMsg) => {
        const state = useGameStore.getState();
        state.updateEncounter({ status: msg.status });
        state.setBattleResult({
          status: msg.status,
          xp: msg.xp_gained ?? 0,
          gold: msg.currency_gained ?? 0,
          narrative: msg.narrative,
        });
        state.addLog("narrative", msg.narrative);
        setBattleText(msg.narrative);

        if (msg.status === "won") {
          if (msg.xp_gained) state.addLog("reward", `+${msg.xp_gained} XP ganados`);
          if (msg.currency_gained) {
            state.addLog("reward", `+${msg.currency_gained} monedas de oro`);
          }
          refreshCharacter();
          fetchQuest();
        }

        if (msg.status === "lost") {
          state.addLog("system", "Has sido revivido con la mitad de tus PV.");
          refreshCharacter();
        }
      });

      r.onMessage("error", (msg: ErrorMsg) => {
        useGameStore.getState().addLog("system", `⚠ ${msg.message}`);
        setBattleText(msg.message);
      });

      // Professions: backpack, skills and the work loop
      r.onMessage("skills", (m: SkillSet) => useGameStore.getState().setSkills(m));
      r.onMessage("inventory", (m: { items: InventoryItem[] }) => useGameStore.getState().setInventory(m.items));
      r.onMessage("gather_started", (m: GatherStartedMsg) =>
        useGameStore.getState().setGathering({ action: m.action, name: m.name, verb: m.verb, tx: m.tx, ty: m.ty }),
      );
      r.onMessage("gather_stopped", (m: { reason: string }) => {
        const st = useGameStore.getState();
        st.setGathering(null);
        const text =
          m.reason === "full"
            ? "Tu mochila está llena."
            : m.reason === "depleted"
              ? "El recurso se agotó."
              : m.reason === "no_tool"
                ? "Perdiste tu herramienta."
                : m.reason === "done"
                  ? "Ya no te queda nada por cocinar."
                  : "";
        if (text) st.addToast("info", text);
      });
      r.onMessage("skill_xp", (m: SkillXpMsg) => {
        const st = useGameStore.getState();
        st.setSkill(m.skill, m.xp, m.level);
        const label = SKILLS[m.skill].label;
        if (m.burnt) {
          pop("¡Se quemó!", "#ff8a6a");
        } else {
          if (m.gained) pop(`+${m.gained} XP ${label}`, "#9fe8ff");
          pop(`+1 ${m.item}`, "#ffe9a8", 0.5);
        }
        if (m.leveledUp) {
          st.setLevelUp(m.level, `${label} nivel ${m.level}`);
          st.addToast("level", `${label}: nivel ${m.level}`);
          st.addLog("reward", `¡${label} subió al nivel ${m.level}!`);
        }
      });

      // Used-up trees and veins come from the shared room state
      const depletedKeys = new Set<string>();
      const nodeCollection = (r.state as {
        nodes?: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          forEach: (cb: (node: any, key: string) => void) => void;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onAdd: (cb: (node: any, key: string) => void) => void;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onRemove: (cb: (node: any, key: string) => void) => void;
        };
      }).nodes;
      const publishNodes = () => useGameStore.getState().setDepletedKeys(new Set(depletedKeys));
      nodeCollection?.forEach((_n, key) => depletedKeys.add(key));
      nodeCollection?.onAdd((_n, key) => {
        depletedKeys.add(key);
        publishNodes();
      });
      nodeCollection?.onRemove((_n, key) => {
        depletedKeys.delete(key);
        publishNodes();
      });
      publishNodes();

      // Sync schema state
      const boundPlayers = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindLocalPlayer = (player: any, sessionId: string) => {
        if (sessionId !== r.sessionId || boundPlayers.has(sessionId)) return;
        boundPlayers.add(sessionId);

        const syncPlayer = () => {
          const s = useGameStore.getState();
          const char = s.character;
          if (char) {
            s.setCharacter({ ...char, hp: player.hp as number, max_hp: player.maxHp as number });
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const enc = player.encounter;
          s.updateEncounter({
            status: enc.status as EncounterState["status"],
            enemyName: enc.enemyName as string,
            enemyLevel: (enc.enemyLevel as number) || 1,
            enemyHp: enc.enemyHp as number,
            enemyMaxHp: enc.enemyMaxHp as number,
            round: enc.round as number,
            turn: enc.turn as string,
          });
        };

        player.onChange(syncPlayer);
        // The encounter is a nested schema: its changes don't bubble up to the player.
        player.encounter?.onChange?.(syncPlayer);
        syncPlayer();
      };

      const players = (
        r.state as {
          players: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onAdd: (cb: (player: any, sessionId: string) => void) => void;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            forEach: (cb: (player: any, sessionId: string) => void) => void;
          };
        }
      ).players;
      players.onAdd(bindLocalPlayer);
      players.forEach(bindLocalPlayer);

      r.onLeave(() => {
        roomRef.current = null;
        setRoom(null);
        useGameStore.getState().addLog("system", "Desconectado del servidor.");
      });

      addLog("system", "Conectado a La Taberna del Grifo.");
    } catch (_err) {
      addLog("system", "Error al conectar con el servidor. Recarga la página.");
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
  }, [user, isConnecting, setRoom, setIsConnecting, addLog, refreshCharacter, fetchQuest]);

  useEffect(() => {
    unmountedRef.current = false;
    if (character && user && !roomRef.current) {
      connectRoom();
    }
    return () => {
      unmountedRef.current = true;
      if (roomRef.current) {
        roomRef.current.leave();
        roomRef.current = null;
      }
    };
    // Only re-run when character/session ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id, user?.id]);

  // Clicking raw fish near a fire cooks it (RuneScape's "use item on fire"); anything else is eaten/drunk.
  const handleUseItem = (inventoryItemId: string) => {
    const room = roomRef.current;
    if (!room) return;
    const store = useGameStore.getState();
    const entry = store.inventory.find((i) => i.id === inventoryItemId);
    const name = entry?.item?.name ?? "";
    if (RECIPES.some((r) => r.raw === name)) {
      const me = room.state && (room.state as { players?: { get: (id: string) => { worldX: number; worldY: number } | undefined } }).players?.get(room.sessionId);
      if (me && findNearbyFire(me.worldX, me.worldY)) room.send("cook");
      else store.addToast("info", "Necesitas acercarte a una fogata para cocinar.");
      return;
    }
    room.send("use_item", { item_id: inventoryItemId });
  };

  const handleAttack = () => roomRef.current?.send("attack");
  const handleFlee = () => roomRef.current?.send("flee");

  // Enemies start fights themselves on the server; this only fires in offline preview.
  const handleEnemyTouch = useCallback((_enemyName: EnemyKind, _enemyId: string) => undefined, []);

  const handleSignOut = async () => {
    if (roomRef.current) {
      roomRef.current.leave();
      roomRef.current = null;
    }
    reset();
    await signOut();
  };

  // Level-ups are celebrated once the battle screen is gone
  useEffect(() => {
    const level = character?.level;
    if (level === undefined) return;
    if (levelRef.current !== null && level > levelRef.current) {
      if (battle.open) pendingLevelRef.current = level;
      else {
        useGameStore.getState().setLevelUp(level);
        useGameStore.getState().addToast("level", `¡Nivel ${level}!`);
      }
    }
    levelRef.current = level;
  }, [character?.level, battle.open]);

  const handleBattleClose = useCallback(
    (result: BattleResult | null) => {
      battle.close();
      const s = useGameStore.getState();
      if (result?.status === "won") {
        if (result.xp) s.addToast("xp", `+${result.xp} XP`);
        if (result.gold) s.addToast("gold", `+${result.gold} oro`);
      }
      if (pendingLevelRef.current !== null) {
        s.setLevelUp(pendingLevelRef.current);
        s.addToast("level", `¡Nivel ${pendingLevelRef.current}!`);
        pendingLevelRef.current = null;
      }
    },
    [battle],
  );

  if (!character) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-parchment-400 animate-pulse">Cargando personaje...</div>
      </div>
    );
  }

  return (
    <GameShell
      onSignOut={handleSignOut}
      lowHp={character.hp > 0 && character.hp / character.max_hp < 0.3 && !battle.open}
      world={
        <>
          <RpgWorld3D
            room={room}
            character={character}
            encounter={encounter}
            onEnemyTouch={handleEnemyTouch}
          />
          <ShopPanel />
        </>
      }
      topLeft={
        <>
          <PlayerHud character={character} />
          <SidePanels onUseItem={handleUseItem} />
        </>
      }
      topRight={
        <QuestPanel quest={quest} onQuestClaimed={fetchQuest} />
      }
      bottomLeft={<NarrativeLog log={log} />}
      modal={
        battle.open ? (
          <BattleScene
            key={battle.fightKey}
            encounter={encounter}
            character={character}
            onAttack={handleAttack}
            onFlee={handleFlee}
            battleText={battleText}
            onClose={handleBattleClose}
          />
        ) : undefined
      }
    />
  );
}

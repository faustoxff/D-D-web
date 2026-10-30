import React, { useCallback, useEffect, useRef, useState } from "react";
import { CLASS_LIST, RACE_LIST, buildStartingStats, xpToNextLevel, type Character, type CharacterClass, type CombatEvent, type Race } from "@dnd/shared";
import CharacterPage from "./CharacterPage.tsx";
import PlayerHud from "../components/PlayerHud.tsx";
import GameShell from "../components/GameShell.tsx";
import BattleScene from "../components/BattleScene.tsx";
import NarrativeLog from "../components/NarrativeLog.tsx";
import RpgWorld3D from "../components/RpgWorld3D.tsx";
import { useGameStore, type BattleResult, type EncounterState } from "../store/game.store.ts";
import { useBattleFlow } from "../hooks/useBattleFlow.ts";
import type { EnemyKind } from "../game/world.ts";

// Offline preview: no auth service, no Colyseus. Combat is a tiny local stand-in
// so the world can be explored while the real backend is being rebuilt.

const PREVIEW_CHARACTER: Character = {
  id: "preview",
  user_id: "preview",
  name: "Fausto",
  race: "human",
  class: "fighter",
  level: 1,
  xp: 0,
  hp: 20,
  max_hp: 20,
  str: 15,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 10,
  currency: 0,
  zone_id: "preview",
  created_at: new Date().toISOString(),
};

const ENEMIES: Record<EnemyKind, { hp: number; dmg: number }> = {
  Goblin: { hp: 12, dmg: 4 },
  Esqueleto: { hp: 14, dmg: 6 },
  Lobo: { hp: 10, dmg: 4 },
};

const d = (n: number) => 1 + Math.floor(Math.random() * n);

export default function DevPreviewPage() {
  const { log, addLog, encounter, updateEncounter } = useGameStore();
  const [character, setCharacter] = useState<Character>(PREVIEW_CHARACTER);
  const [battleText, setBattleText] = useState("");
  const [creating, setCreating] = useState(false);

  const applyBuild = (race: Race, charClass: CharacterClass, name?: string) => {
    const stats = buildStartingStats(charClass, race);
    setCharacter((c) => ({ ...c, ...stats, name: name || c.name, race, class: charClass }));
  };
  const enemyRef = useRef<EnemyKind>("Goblin");

  useEffect(() => {
    if (!useGameStore.getState().log.some((l) => l.text.startsWith("Modo preview"))) {
      addLog("system", "Modo preview: sin servidor ni login. El combate es simulado.");
    }
  }, [addLog]);

  const battle = useBattleFlow(encounter.status);

  const endCombat = useCallback(
    (status: EncounterState["status"], text: string, xp = 0, gold = 0) => {
      addLog("narrative", text);
      setBattleText(text);
      useGameStore.getState().setBattleResult({
        status: status as "won" | "lost" | "fled",
        xp,
        gold,
        narrative: text,
      });
      updateEncounter({ status });
    },
    [addLog, updateEncounter],
  );

  const handleEnemyTouch = useCallback(
    (enemyName: EnemyKind) => {
      if (useGameStore.getState().encounter.status === "active") return;
      enemyRef.current = enemyName;
      const { hp } = ENEMIES[enemyName];
      updateEncounter({
        status: "active",
        enemyName,
        enemyLevel: 1,
        enemyHp: hp,
        enemyMaxHp: hp,
        round: 1,
        turn: "player",
      });
      const line = `${enemyName} te corta el paso.`;
      setBattleText(line);
      addLog("narrative", line);
    },
    [addLog, updateEncounter],
  );

  const handleAttack = () => {
    const store = useGameStore.getState();
    const enc = store.encounter;
    if (enc.status !== "active" || store.fxQueue.length > 0) return;
    const enemy = ENEMIES[enemyRef.current];

    const roll = d(20);
    const hit = roll + 4 >= 11 || roll === 20;
    const dmg = hit ? d(6) + 2 + (roll === 20 ? d(6) : 0) : 0;
    const enemyHp = Math.max(0, enc.enemyHp - dmg);
    const events: CombatEvent[] = [
      { round: enc.round, actor: "player", roll, modifier: 4, total: roll + 4, hit, damage: hit ? dmg : null },
    ];
    addLog("combat", hit ? `Golpeas por ${dmg} de daño.` : "Fallas el ataque.");
    updateEncounter({ enemyHp });

    if (enemyHp <= 0) {
      store.pushFx(events);
      const xp = 40;
      setCharacter((c) => {
        const total = c.xp + xp;
        const level = total >= xpToNextLevel(c.level) ? c.level + 1 : c.level;
        return { ...c, xp: total, level, currency: c.currency + 25 };
      });
      endCombat("won", `Derrotas al ${enc.enemyName}.`, xp, 25);
      return;
    }

    const eRoll = d(20);
    const enemyHit = eRoll + 2 >= 12;
    const taken = enemyHit ? Math.min(enemy.dmg, d(enemy.dmg)) : 0;
    events.push({ round: enc.round, actor: "enemy", roll: eRoll, modifier: 2, total: eRoll + 2, hit: enemyHit, damage: enemyHit ? taken : null });
    store.pushFx(events);
    addLog("combat", enemyHit ? `${enc.enemyName} te hiere por ${taken}.` : `${enc.enemyName} falla.`);
    updateEncounter({ round: enc.round + 1 });
    setCharacter((c) => {
      const hp = Math.max(0, c.hp - taken);
      if (hp === 0) {
        endCombat("lost", "Caes derrotado... y despiertas con media vida.");
        return { ...c, hp: Math.floor(c.max_hp / 2) };
      }
      return { ...c, hp };
    });
  };

  const handleFlee = () => {
    if (Math.random() < 0.5) endCombat("fled", "Logras escapar.");
    else addLog("narrative", "¡El camino está bloqueado!");
  };

  const handleBattleClose = useCallback(
    (result: BattleResult | null) => {
      battle.close();
      const s = useGameStore.getState();
      if (result?.status === "won") {
        s.addToast("xp", `+${result.xp} XP`);
        s.addToast("gold", `+${result.gold} oro`);
      }
    },
    [battle],
  );

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__dnd"] = {
      touch: handleEnemyTouch,
      attack: handleAttack,
      store: useGameStore,
      setHp: (hp: number) => setCharacter((c) => ({ ...c, hp })),
    };
  }

  const prevLevel = useRef(character.level);
  useEffect(() => {
    if (character.level > prevLevel.current && !battle.open) {
      useGameStore.getState().setLevelUp(character.level);
      useGameStore.getState().addToast("level", `¡Nivel ${character.level}!`);
    }
    if (!battle.open) prevLevel.current = character.level;
  }, [character.level, battle.open]);

  if (creating) {
    return (
      <CharacterPage
        previewMode
        onPreviewDone={(choice) => {
          applyBuild(choice.race, choice.class, choice.name);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <GameShell
      lowHp={character.hp > 0 && character.hp / character.max_hp < 0.3 && !battle.open}
      world={
        <RpgWorld3D
          room={null}
          character={character}
          encounter={encounter}
          onEnemyTouch={handleEnemyTouch}
        />
      }
      topLeft={<PlayerHud character={character} />}
      topRight={
        <div className="w-64 space-y-2 rounded-lg border border-parchment-500/40 bg-dungeon-900/80 p-3 text-xs text-parchment-400 shadow-xl backdrop-blur-sm">
          <div className="font-bold text-parchment-300">Probar personaje</div>
          <select
            value={character.race}
            onChange={(e) => applyBuild(e.target.value as Race, character.class)}
            className="w-full rounded border border-dungeon-600 bg-dungeon-900 px-2 py-1 text-parchment-200"
          >
            {RACE_LIST.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={character.class}
            onChange={(e) => applyBuild(character.race, e.target.value as CharacterClass)}
            className="w-full rounded border border-dungeon-600 bg-dungeon-900 px-2 py-1 text-parchment-200"
          >
            {CLASS_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full rounded bg-parchment-500 py-1 font-bold text-dungeon-900 hover:bg-parchment-400"
          >
            Ver pantalla de creación
          </button>
        </div>
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

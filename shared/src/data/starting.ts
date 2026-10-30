import { CLASSES, type ClassId } from "./classes.js";
import { RACES, type RaceId } from "./races.js";

export interface StartingStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  hp: number;
  max_hp: number;
}

/** Final level-1 stats for a race/class combination. Shared so the UI can preview it. */
export function buildStartingStats(classId: ClassId, raceId: RaceId): StartingStats {
  const cls = CLASSES[classId];
  const race = RACES[raceId];
  const [s, d, c, i, w, a] = cls.stats;
  const b = race.bonus;

  const str = s + (b.str ?? 0);
  const dex = d + (b.dex ?? 0);
  const con = c + (b.con ?? 0);
  const int = i + (b.int ?? 0);
  const wis = w + (b.wis ?? 0);
  const cha = a + (b.cha ?? 0);

  const maxHp = Math.max(1, cls.hitDie + Math.floor((con - 10) / 2) + race.bonusHp);
  return { str, dex, con, int, wis, cha, hp: maxHp, max_hp: maxHp };
}

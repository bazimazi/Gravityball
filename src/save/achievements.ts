import { CHALLENGE_LEVELS } from '../level/campaign';
import { WORLDS } from '../level/types';
import { worldsCleared, countPerfects, type SaveData } from '../save/save';
import {
  anyClearIn,
  challengesCleared,
  claimRewards,
  fragmentTotal,
  insight,
  rankOf,
  sealLevel,
  secretsCleared,
  worldSeal,
} from './progress';

export interface Achievement {
  id: string;
  name: string;
  text: string;
  /** Checked whenever progress settles. Marks earned in the moment omit it and are granted directly. */
  done?: (s: SaveData) => boolean;
  /** Shown while the mark is still ahead. */
  progress?: (s: SaveData) => [number, number];
}

function counted(id: string, name: string, text: string, target: number, get: (s: SaveData) => number): Achievement {
  return {
    id,
    name,
    text,
    done: (s) => get(s) >= target,
    progress: (s) => [Math.min(target, get(s)), target],
  };
}

function when(id: string, name: string, text: string, done: (s: SaveData) => boolean): Achievement {
  return { id, name, text, done };
}

const bestSeal = (s: SaveData) => Math.max(0, ...WORLDS.map((w) => sealLevel(worldSeal(s, w.id))));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-shift', name: 'First Gravity Shift', text: 'You turned the pull.' },
  when('first-clear', 'First Clear', 'A chamber, understood.', (s) => s.stats.clears >= 1),
  counted('ten-clears', 'Ten Chambers', 'Ten rooms that now make sense.', 10, (s) => s.stats.clears),
  when('first-perfect', 'Perfect Rotation', 'A line with nothing wasted.', (s) => countPerfects(s) >= 1),
  counted('ten-perfects', 'Ten Perfects', 'Precision, repeated.', 10, countPerfects),
  counted('century', 'Fifty Perfects', 'Half a hundred lines with nothing wasted.', 50, countPerfects),
  { id: 'no-rotation', name: 'No-Rotation Finish', text: 'The room was already aimed.' },
  when('world-1', 'Awakening', 'The first world is yours.', (s) => worldsCleared(s).includes(1)),
  when('zero-g', 'Zero-G Master', 'You crossed a room that did not pull.', (s) => anyClearIn(s, 5)),
  when('orbital', 'Orbital Master', 'A world bent your line.', (s) => anyClearIn(s, 6)),
  when('world-6', 'Orbits', 'You met a center.', (s) => worldsCleared(s).includes(6)),
  when('escape', 'Black Hole Escape', 'You refused the shortest path.', (s) => anyClearIn(s, 7)),
  when('world-10', 'The Core', 'You finished the hand-built sky.', (s) => worldsCleared(s).includes(10)),
  counted('every-pull', 'Every Pull', 'Every chamber of all ten worlds.', 10, (s) => worldsCleared(s).length),
  when('gold-world', 'Golden World', 'Every chamber in a world, at gold.', (s) => bestSeal(s) >= 1),
  when('perfect-world', 'Perfect World', 'Every chamber in a world, perfected.', (s) => bestSeal(s) >= 2),
  when('secret-door', 'Hidden Door', 'A chamber that was never on the map.', (s) => secretsCleared(s) >= 1),
  counted('challenges', 'Six Weights', 'Every challenge ball, carried home.', CHALLENGE_LEVELS.length, challengesCleared),
  counted('collected', 'Collected Sky', 'Every fragment of the same quiet.', fragmentTotal(), (s) => s.found.length),
  when('daily', 'Daily Chamber', 'Today’s room, done.', (s) => Object.keys(s.daily).length >= 1),
  counted('streak-3', 'Three Mornings', 'Three daily chambers in a row.', 3, (s) => s.streak.best),
  counted('streak-7', 'A Week of Skies', 'Seven daily chambers in a row.', 7, (s) => s.streak.best),
  counted('endless-10', 'Endless Line', 'Ten rooms without a floor to call home.', 10, (s) => s.stats.bestEndlessRooms),
  counted('endless-25', 'Long Fall', 'Twenty-five rooms in one endless line.', 25, (s) => s.stats.bestEndlessRooms),
  counted('run-5', 'Gravity Run', 'Five rooms, and a build of your own.', 5, (s) => s.stats.bestRunRooms),
  counted('run-10', 'Deep Run', 'Ten rooms in one Gravity Run.', 10, (s) => s.stats.bestRunRooms),
  counted('rank-5', 'Instinct', 'Reach rank 5.', 5, (s) => rankOf(insight(s)).rank),
  counted('rank-10', 'Second Nature', 'Reach rank 10.', 10, (s) => rankOf(insight(s)).rank),
  counted('looks', 'Eight Lights', 'Own eight looks.', 8, (s) => s.unlockedCosmetics.length),
  counted('stubborn', 'Hundred Breaks', 'And you kept turning.', 100, (s) => s.stats.deaths),
];

export function grant(save: SaveData, id: string): Achievement | null {
  if (save.achievements.includes(id)) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  save.achievements.push(id);
  return def;
}

export interface Settled {
  marks: Achievement[];
  rewards: string[];
  gems: number;
}

/**
 * Grants every mark whose condition now holds and claims every reward now due.
 * Marks feed insight and insight feeds rank marks, so repeat until nothing moves.
 */
export function settle(save: SaveData): Settled {
  const out: Settled = { marks: [], rewards: [], gems: 0 };
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const a of ACHIEVEMENTS) {
      if (!a.done || save.achievements.includes(a.id) || !a.done(save)) continue;
      save.achievements.push(a.id);
      out.marks.push(a);
      moved = true;
    }
    const claimed = claimRewards(save);
    if (claimed.lines.length) moved = true;
    out.rewards.push(...claimed.lines);
    out.gems += claimed.gems;
    if (!moved) break;
  }
  return out;
}

import type { MedalTier } from '../core/types';
import { worldsCleared, countPerfects, type SaveData } from '../save/save';

export interface Achievement {
  id: string;
  name: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-shift', name: 'First Gravity Shift', text: 'You turned the pull.' },
  { id: 'first-clear', name: 'First Clear', text: 'A chamber, understood.' },
  { id: 'ten-clears', name: 'Ten Chambers', text: 'Ten rooms that now make sense.' },
  { id: 'first-perfect', name: 'Perfect Rotation', text: 'A line with nothing wasted.' },
  { id: 'ten-perfects', name: 'Ten Perfects', text: 'Precision, repeated.' },
  { id: 'century', name: 'Century', text: 'One hundred perfect chambers.' },
  { id: 'no-rotation', name: 'No-Rotation Finish', text: 'The room was already aimed.' },
  { id: 'zero-g', name: 'Zero-G Master', text: 'You crossed a room that did not pull.' },
  { id: 'orbital', name: 'Orbital Master', text: 'A world bent your line.' },
  { id: 'escape', name: 'Black Hole Escape', text: 'You refused the shortest path.' },
  { id: 'perfect-world', name: 'Perfect World', text: 'Every chamber in a world, perfected.' },
  { id: 'every-pull', name: 'Every Pull', text: 'A clear in each of the ten worlds.' },
  { id: 'daily', name: 'Daily Chamber', text: 'Today’s room, done.' },
  { id: 'endless-10', name: 'Endless Line', text: 'Ten rooms without a floor to call home.' },
  { id: 'run-5', name: 'Gravity Run', text: 'Five rooms, and a build of your own.' },
  { id: 'collected', name: 'Collected Sky', text: 'Six fragments of the same quiet.' },
  { id: 'world-1', name: 'Awakening', text: 'The first world is yours.' },
  { id: 'world-6', name: 'Orbits', text: 'You met a center.' },
  { id: 'world-10', name: 'The Core', text: 'You finished the hand-built sky.' },
];

export function grant(save: SaveData, id: string): Achievement | null {
  if (save.achievements.includes(id)) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  save.achievements.push(id);
  return def;
}

export function grantsForClear(save: SaveData, info: {
  world: number;
  rotations: number;
  medal: MedalTier;
  firstClear: boolean;
}): Achievement[] {
  const out: Achievement[] = [];
  const push = (id: string) => {
    const g = grant(save, id);
    if (g) out.push(g);
  };
  if (info.firstClear) push('first-clear');
  if (save.stats.clears >= 10) push('ten-clears');
  if (info.rotations === 0) push('no-rotation');
  if (info.medal === 'perfect') push('first-perfect');
  if (countPerfects(save) >= 10) push('ten-perfects');
  if (countPerfects(save) >= 100) push('century');
  if (info.world === 5) push('zero-g');
  if (info.world === 6) push('orbital');
  if (info.world === 7) push('escape');
  const cleared = worldsCleared(save);
  if (cleared.includes(1)) push('world-1');
  if (cleared.includes(6)) push('world-6');
  if (cleared.includes(10)) push('world-10');
  if (cleared.length >= 10) push('every-pull');
  if (cleared.some((w) => {
    const mates = Object.entries(save.levels).filter(([id]) => id.startsWith(`${w}-`));
    const campaignCount = [8, 6, 6, 6, 5, 5, 4, 4, 4, 3][w - 1] ?? 0;
    return mates.filter(([, rec]) => rec.medal === 'perfect').length >= campaignCount && campaignCount > 0;
  })) push('perfect-world');
  if (save.found.length >= 6) push('collected');
  return out;
}

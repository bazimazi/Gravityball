import type { BallId, InputEvent, MedalTier } from '../core/types';
import { CAMPAIGN, getLevel, worldLevels } from '../level/campaign';

export interface LevelRecord {
  medal: MedalTier | null;
  bestTime: number | null;
  bestRot: number | null;
  ghost: InputEvent[] | null;
  clears: number;
}

export interface Settings {
  music: number;
  sfx: number;
  haptics: number;
  reducedMotion: boolean;
  reducedVfx: boolean;
  trajectory: 'auto' | 'on' | 'off';
  ghosts: boolean;
  swapControls: boolean;
  strongPatterns: boolean;
}

export interface Cosmetic {
  id: string;
  slot: 'ball' | 'trail' | 'impact' | 'gravity';
  name: string;
  cost: number;
  note: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'ball-glass', slot: 'ball', name: 'Glass', cost: 0, note: 'Clear, weighted, quiet.' },
  { id: 'ball-metal', slot: 'ball', name: 'Metal', cost: 2, note: 'A machined weight.' },
  { id: 'ball-crystal', slot: 'ball', name: 'Crystal', cost: 3, note: 'Faceted light.' },
  { id: 'ball-planet', slot: 'ball', name: 'Planet', cost: 4, note: 'A world, simplified.' },
  { id: 'ball-void', slot: 'ball', name: 'Void', cost: 4, note: 'A rim, and darkness.' },
  { id: 'ball-plasma', slot: 'ball', name: 'Plasma', cost: 5, note: 'Soft fire, no heat.' },
  { id: 'ball-ancient', slot: 'ball', name: 'Ancient', cost: 3, note: 'Stone that remembers.' },
  { id: 'ball-geo', slot: 'ball', name: 'Geometric', cost: 2, note: 'A perfect disagreement with curves.' },
  { id: 'trail-thread', slot: 'trail', name: 'Thread', cost: 0, note: 'A thin memory of the line.' },
  { id: 'trail-dust', slot: 'trail', name: 'Dust', cost: 2, note: 'What the air keeps.' },
  { id: 'trail-ribbon', slot: 'trail', name: 'Ribbon', cost: 3, note: 'A wider path.' },
  { id: 'trail-ember', slot: 'trail', name: 'Ember', cost: 3, note: 'Warm, brief.' },
  { id: 'trail-ion', slot: 'trail', name: 'Ion', cost: 4, note: 'Broken light.' },
  { id: 'impact-mote', slot: 'impact', name: 'Mote', cost: 0, note: 'A small answer.' },
  { id: 'impact-ring', slot: 'impact', name: 'Ring', cost: 2, note: 'A circle left behind.' },
  { id: 'impact-prism', slot: 'impact', name: 'Prism', cost: 3, note: 'The hit splits.' },
  { id: 'grav-drift', slot: 'gravity', name: 'Drift', cost: 0, note: 'Dust follows the pull.' },
  { id: 'grav-filament', slot: 'gravity', name: 'Filaments', cost: 3, note: 'Long strokes.' },
  { id: 'grav-spore', slot: 'gravity', name: 'Spores', cost: 2, note: 'Slow seeds.' },
  { id: 'grav-ember', slot: 'gravity', name: 'Embers', cost: 3, note: 'The pull runs warm.' },
];

export interface SaveData {
  v: 1;
  levels: Record<string, LevelRecord>;
  found: string[];
  currency: number;
  achievements: string[];
  settings: Settings;
  ball: string;
  trail: string;
  impact: string;
  gravityFx: string;
  unlockedCosmetics: string[];
  seenThoughts: string[];
  lastLevel: string;
  awardedPerfect: string[];
  stats: {
    clears: number;
    deaths: number;
    rotations: number;
    perfects: number;
    bestEndless: number;
    bestRun: number;
  };
  daily: Record<string, { time: number; medal: MedalTier }>;
}

const KEY = 'gravityball-save-v1';

export function defaultSettings(): Settings {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    music: 0.65,
    sfx: 0.85,
    haptics: 0.55,
    reducedMotion: reduce,
    reducedVfx: false,
    trajectory: 'auto',
    ghosts: true,
    swapControls: false,
    strongPatterns: false,
  };
}

export function defaultSave(): SaveData {
  return {
    v: 1,
    levels: {},
    found: [],
    currency: 0,
    achievements: [],
    settings: defaultSettings(),
    ball: 'ball-glass',
    trail: 'trail-thread',
    impact: 'impact-mote',
    gravityFx: 'grav-drift',
    unlockedCosmetics: ['ball-glass', 'trail-thread', 'impact-mote', 'grav-drift'],
    seenThoughts: [],
    lastLevel: '1-1',
    awardedPerfect: [],
    stats: { clears: 0, deaths: 0, rotations: 0, perfects: 0, bestEndless: 0, bestRun: 0 },
    daily: {},
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.v !== 1) return defaultSave();
    return { ...defaultSave(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode */
  }
}

export function levelRecord(save: SaveData, id: string): LevelRecord {
  return save.levels[id] ?? { medal: null, bestTime: null, bestRot: null, ghost: null, clears: 0 };
}

export function worldUnlocked(save: SaveData, world: number): boolean {
  if (world <= 1) return true;
  const prev = CAMPAIGN.filter((l) => l.world === world - 1);
  const last = prev[prev.length - 1];
  if (!last) return false;
  return !!save.levels[last.id]?.medal;
}

export function levelUnlocked(save: SaveData, id: string): boolean {
  const level = getLevel(id);
  if (!level) return false;
  if (level.secret) return !!level.unlockFragment && save.found.includes(level.unlockFragment);
  if (level.challenge) return worldUnlocked(save, level.world);
  if (!worldUnlocked(save, level.world)) return false;
  const mates = CAMPAIGN.filter((l) => l.world === level.world);
  const i = mates.findIndex((l) => l.id === id);
  if (i <= 0) return true;
  return !!save.levels[mates[i - 1].id]?.medal;
}

export function highestWorld(save: SaveData): number {
  let w = 1;
  for (let i = 2; i <= 10; i++) if (worldUnlocked(save, i)) w = i;
  return w;
}

export function unlockedBalls(save: SaveData): BallId[] {
  const w = highestWorld(save);
  const ids: BallId[] = ['standard'];
  if (w >= 2) ids.push('heavy', 'light');
  if (w >= 3) ids.push('elastic');
  if (w >= 4) ids.push('magnetic');
  if (w >= 5) ids.push('phase');
  if (w >= 6) ids.push('orbit');
  return ids;
}

export function modeUnlocked(save: SaveData, mode: 'daily' | 'endless' | 'run' | 'sandbox'): boolean {
  if (mode === 'daily') return save.stats.clears >= 1;
  if (mode === 'endless') return worldUnlocked(save, 2);
  if (mode === 'run') return worldUnlocked(save, 3);
  return worldUnlocked(save, 4);
}

export function medalRank(m: MedalTier | null): number {
  if (m === 'perfect') return 4;
  if (m === 'gold') return 3;
  if (m === 'silver') return 2;
  if (m === 'bronze') return 1;
  return 0;
}

export function betterMedal(a: MedalTier | null, b: MedalTier | null): MedalTier | null {
  return medalRank(a) >= medalRank(b) ? a : b;
}

export function encodeGhost(levelId: string, time: number, inputs: InputEvent[]): string {
  const body = inputs.map((e) => `${e.tick}${e.kind === 'cw' ? 'R' : 'L'}`).join('.');
  return `GB1-${levelId}-${time.toFixed(2)}-${body}`;
}

export function decodeGhost(code: string): { levelId: string; time: number; inputs: InputEvent[] } | null {
  const m = /^GB1-([^-]+)-(\d+(?:\.\d+)?)-(.*)$/.exec(code.trim());
  if (!m) return null;
  const inputs: InputEvent[] = [];
  if (m[3]) {
    for (const part of m[3].split('.')) {
      const mm = /^(\d+)([RL])$/.exec(part);
      if (!mm) return null;
      inputs.push({ tick: Number(mm[1]), kind: mm[2] === 'R' ? 'cw' : 'ccw' });
    }
  }
  return { levelId: m[1], time: Number(m[2]), inputs };
}

export function countPerfects(save: SaveData): number {
  return Object.values(save.levels).filter((l) => l.medal === 'perfect').length;
}

export function worldsCleared(save: SaveData): number[] {
  const done: number[] = [];
  for (let w = 1; w <= 10; w++) {
    const mates = worldLevels(w).filter((l) => !l.secret);
    if (mates.length && mates.every((l) => save.levels[l.id]?.medal)) done.push(w);
  }
  return done;
}

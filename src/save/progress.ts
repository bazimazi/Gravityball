import type { MedalTier } from '../core/types';
import { CAMPAIGN, CHALLENGE_LEVELS, FRAGMENTS, SECRET_LEVELS } from '../level/campaign';
import { WORLDS } from '../level/types';
import { COSMETICS, medalRank, type SaveData } from './save';

/**
 * Insight is derived from the save, never stored. Old saves earn their rank on load,
 * and nothing can be counted twice.
 */
const MEDAL_INSIGHT: Record<MedalTier, number> = { bronze: 20, silver: 35, gold: 55, perfect: 80 };
const PRACTICE_CAP = 5;

export interface InsightSource {
  label: string;
  value: number;
}

export function insightSources(save: SaveData): InsightSource[] {
  let medals = 0;
  let practice = 0;
  for (const rec of Object.values(save.levels)) {
    if (rec.medal) medals += MEDAL_INSIGHT[rec.medal];
    // Replays count, but only the first few: practice, not grinding.
    practice += Math.min(PRACTICE_CAP, rec.clears) * 2;
  }
  return [
    { label: 'Medals', value: medals },
    { label: 'Marks', value: save.achievements.length * 30 },
    { label: 'Fragments', value: save.found.length * 25 },
    { label: 'Daily chambers', value: Object.keys(save.daily).length * 30 + save.streak.best * 10 },
    { label: 'Endless & runs', value: save.stats.rooms * 4 },
    { label: 'Practice', value: practice },
  ];
}

export function insight(save: SaveData): number {
  return insightSources(save).reduce((n, s) => n + s.value, 0);
}

const TITLES = ['Drifter', 'Observer', 'Tilter', 'Navigator', 'Pilot', 'Orbiter', 'Cartographer', 'Architect', 'Gravitist', 'Axis'];

/** Total insight needed to reach a rank. Rank 1 is free. */
export function rankFloor(rank: number): number {
  const n = Math.max(0, rank - 1);
  return 50 * n + 25 * n * n;
}

export function rankTitle(rank: number): string {
  return TITLES[Math.min(TITLES.length - 1, Math.floor((rank - 1) / 2))];
}

export interface RankInfo {
  rank: number;
  title: string;
  xp: number;
  floor: number;
  next: number;
  /** 0..1 through the current rank. */
  frac: number;
}

export function rankOf(xp: number): RankInfo {
  let rank = 1;
  while (rankFloor(rank + 1) <= xp) rank++;
  const floor = rankFloor(rank);
  const next = rankFloor(rank + 1);
  return { rank, title: rankTitle(rank), xp, floor, next, frac: (xp - floor) / (next - floor) };
}

export interface RankReward {
  gems: number;
  look: string | null;
}

export function rankReward(rank: number): RankReward {
  const look = COSMETICS.find((c) => c.unlock?.rank === rank)?.id ?? null;
  return { gems: rank % 5 === 0 ? 3 : 1, look };
}

export function describeReward(rank: number): string {
  const r = rankReward(rank);
  const look = r.look ? COSMETICS.find((c) => c.id === r.look) : undefined;
  const parts = [`+${r.gems} ${r.gems === 1 ? 'fragment' : 'fragments'}`];
  if (look) parts.unshift(`${look.name} ${slotWord(look.slot)}`);
  return parts.join(' · ');
}

function slotWord(slot: string): string {
  return slot === 'gravity' ? 'pull' : slot;
}

export interface WorldSeal {
  world: number;
  total: number;
  cleared: number;
  gold: number;
  perfect: number;
}

/** Seals count the hand-built chambers of a world, not its secrets or challenges. */
export function worldSeal(save: SaveData, world: number): WorldSeal {
  const mains = CAMPAIGN.filter((l) => l.world === world);
  let cleared = 0;
  let gold = 0;
  let perfect = 0;
  for (const l of mains) {
    const r = medalRank(save.levels[l.id]?.medal ?? null);
    if (r >= 1) cleared++;
    if (r >= 3) gold++;
    if (r >= 4) perfect++;
  }
  return { world, total: mains.length, cleared, gold, perfect };
}

export const SEAL_GEMS = { gold: 2, perfect: 3 } as const;

export function sealLevel(s: WorldSeal): 0 | 1 | 2 {
  if (s.total && s.perfect === s.total) return 2;
  if (s.total && s.gold === s.total) return 1;
  return 0;
}

export function anyClearIn(save: SaveData, world: number): boolean {
  return [...CAMPAIGN, ...SECRET_LEVELS, ...CHALLENGE_LEVELS].some((l) => l.world === world && !!save.levels[l.id]?.medal);
}

export function secretsCleared(save: SaveData): number {
  return SECRET_LEVELS.filter((l) => save.levels[l.id]?.medal).length;
}

export function challengesCleared(save: SaveData): number {
  return CHALLENGE_LEVELS.filter((l) => save.levels[l.id]?.medal).length;
}

export function fragmentTotal(): number {
  return FRAGMENTS.length;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/** Call once per day, on that day's first daily clear. */
export function bumpStreak(save: SaveData, today: string): void {
  const s = save.streak;
  if (s.last === today) return;
  s.count = s.last === shiftDay(today, -1) ? s.count + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best, s.count);
}

/** A streak survives until the end of the day after its last clear. */
export function liveStreak(save: SaveData, today: string): number {
  const s = save.streak;
  return s.last === today || s.last === shiftDay(today, -1) ? s.count : 0;
}

export interface Claimed {
  lines: string[];
  gems: number;
}

/** One-time rewards: rank-ups, world seals, and looks bound to marks. */
export function claimRewards(save: SaveData): Claimed {
  const out: Claimed = { lines: [], gems: 0 };
  const own = (id: string) => {
    if (!save.unlockedCosmetics.includes(id)) save.unlockedCosmetics.push(id);
  };
  const claim = (key: string, gems: number, line: string) => {
    if (save.claimed.includes(key)) return;
    save.claimed.push(key);
    save.currency += gems;
    out.gems += gems;
    out.lines.push(line);
  };
  const { rank } = rankOf(insight(save));
  for (let r = 2; r <= rank; r++) {
    const reward = rankReward(r);
    if (reward.look && !save.claimed.includes(`rank-${r}`)) own(reward.look);
    claim(`rank-${r}`, reward.gems, `Rank ${r} · ${rankTitle(r)} · ${describeReward(r)}`);
  }
  for (const w of WORLDS) {
    const seal = worldSeal(save, w.id);
    const lvl = sealLevel(seal);
    if (lvl >= 1) claim(`seal-${w.id}-gold`, SEAL_GEMS.gold, `${w.name} gold seal · +${SEAL_GEMS.gold}`);
    if (lvl >= 2) claim(`seal-${w.id}-perfect`, SEAL_GEMS.perfect, `${w.name} perfect seal · +${SEAL_GEMS.perfect}`);
  }
  for (const c of COSMETICS) {
    if (!c.unlock?.mark || save.unlockedCosmetics.includes(c.id)) continue;
    if (!save.achievements.includes(c.unlock.mark)) continue;
    own(c.id);
    out.lines.push(`New look · ${c.name}`);
  }
  return out;
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

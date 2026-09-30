import { describe, expect, it } from 'vitest';
import { CAMPAIGN, CHALLENGE_LEVELS, FRAGMENTS, SECRET_LEVELS } from '../level/campaign';
import { ACHIEVEMENTS, settle } from './achievements';
import { bumpStreak, insight, liveStreak, rankFloor, rankOf, worldSeal } from './progress';
import type { MedalTier } from '../core/types';
import { COSMETICS, defaultSave, loadSave, type SaveData } from './save';

function withMedal(save: SaveData, id: string, medal: MedalTier, clears = 1): void {
  save.levels[id] = { medal, bestTime: 1, bestRot: 0, ghost: null, clears };
}

describe('rank', () => {
  it('starts at rank 1 and climbs at the floors', () => {
    expect(rankOf(0).rank).toBe(1);
    expect(rankOf(rankFloor(2) - 1).rank).toBe(1);
    expect(rankOf(rankFloor(2)).rank).toBe(2);
    expect(rankOf(rankFloor(9) + 1).rank).toBe(9);
    for (let r = 1; r < 30; r++) expect(rankFloor(r + 1)).toBeGreaterThan(rankFloor(r));
  });

  it('the first clear is worth a rank', () => {
    const save = defaultSave();
    save.achievements.push('first-shift');
    save.stats.clears = 1;
    withMedal(save, '1-1', 'bronze');
    const out = settle(save);
    expect(out.marks.map((a) => a.id)).toContain('first-clear');
    expect(rankOf(insight(save)).rank).toBe(2);
    expect(save.claimed).toContain('rank-2');
    expect(save.currency).toBe(1);
  });

  it('counts practice, but not grinding', () => {
    const a = defaultSave();
    const b = defaultSave();
    withMedal(a, '1-1', 'bronze', 5);
    withMedal(b, '1-1', 'bronze', 500);
    expect(insight(a)).toBe(insight(b));
  });

  it('every earned look can be reached from the campaign alone', () => {
    const save = defaultSave();
    for (const l of [...CAMPAIGN, ...SECRET_LEVELS, ...CHALLENGE_LEVELS]) withMedal(save, l.id, 'perfect');
    save.found = FRAGMENTS.map((f) => f.id);
    save.stats.clears = CAMPAIGN.length + SECRET_LEVELS.length + CHALLENGE_LEVELS.length;
    save.achievements.push('first-shift', 'no-rotation');
    settle(save);
    for (const c of COSMETICS.filter((x) => x.unlock)) expect(save.unlockedCosmetics).toContain(c.id);
    expect(save.achievements).toContain('century');
    expect(save.achievements).toContain('every-pull');
  });
});

describe('settle', () => {
  it('is idempotent', () => {
    const save = defaultSave();
    save.stats.clears = 12;
    for (const l of CAMPAIGN.filter((x) => x.world === 1)) withMedal(save, l.id, 'gold');
    const first = settle(save);
    expect(first.marks.length).toBeGreaterThan(0);
    const currency = save.currency;
    const again = settle(save);
    expect(again.marks).toEqual([]);
    expect(again.rewards).toEqual([]);
    expect(save.currency).toBe(currency);
  });

  it('awards a gold seal and its look', () => {
    const save = defaultSave();
    for (const l of CAMPAIGN.filter((x) => x.world === 1)) withMedal(save, l.id, 'gold');
    expect(worldSeal(save, 1).gold).toBe(worldSeal(save, 1).total);
    const out = settle(save);
    expect(save.claimed).toContain('seal-1-gold');
    expect(save.claimed).not.toContain('seal-1-perfect');
    expect(save.achievements).toContain('gold-world');
    expect(save.unlockedCosmetics).toContain('ball-gilded');
    expect(out.gems).toBeGreaterThanOrEqual(2);
  });

  it('every mark has a way to be earned', () => {
    const event = new Set(['first-shift', 'no-rotation']);
    for (const a of ACHIEVEMENTS) expect(!!a.done || event.has(a.id)).toBe(true);
  });
});

describe('daily streak', () => {
  it('grows on consecutive days and resets after a gap', () => {
    const save = defaultSave();
    bumpStreak(save, '2026-02-27');
    bumpStreak(save, '2026-02-28');
    bumpStreak(save, '2026-03-01');
    bumpStreak(save, '2026-03-01');
    expect(save.streak.count).toBe(3);
    expect(liveStreak(save, '2026-03-02')).toBe(3);
    expect(liveStreak(save, '2026-03-03')).toBe(0);
    bumpStreak(save, '2026-03-05');
    expect(save.streak.count).toBe(1);
    expect(save.streak.best).toBe(3);
  });
});

describe('save migration', () => {
  it('fills fields an older save does not have', () => {
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    try {
      const old = defaultSave() as Partial<SaveData>;
      delete old.claimed;
      delete old.streak;
      old.stats = { clears: 3, deaths: 2, rotations: 9, perfects: 0, bestEndless: 400, bestRun: 0 } as SaveData['stats'];
      store.set('gravityball-save-v1', JSON.stringify(old));
      const save = loadSave();
      expect(save.claimed).toEqual([]);
      expect(save.streak).toEqual({ last: '', count: 0, best: 0 });
      expect(save.stats.clears).toBe(3);
      expect(save.stats.rooms).toBe(0);
      expect(save.stats.bestEndlessRooms).toBe(0);
    } finally {
      g.localStorage = prev;
    }
  });
});

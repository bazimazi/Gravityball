import { mulberry32, hashString } from '../core/math';
import { emptyRelics, LEFT, RIGHT, type Dir, type RelicState } from '../core/types';
import { L, ladder, pit, solid } from '../level/build';
import { dailyPool, endlessPool } from '../level/campaign';
import type { LevelDef } from '../level/types';

export interface Offer {
  id: string;
  name: string;
  text: string;
  apply: (r: RelicState) => void;
}

const OFFER_DEFS: Offer[] = [
  { id: 'momentum', name: 'Momentum Core', text: 'Keeps more of your speed through a turn.', apply: (r) => { r.momentum = true; } },
  { id: 'lens', name: 'Gravity Lens', text: 'Planets, wells, and magnets pull harder.', apply: (r) => { r.lens = true; } },
  { id: 'stabilizer', name: 'Stabilizer', text: 'Wild bounces calm down.', apply: (r) => { r.stabilizer = true; } },
  { id: 'rebound', name: 'Rebound Matrix', text: 'Surfaces give more back.', apply: (r) => { r.rebound = true; } },
  { id: 'void', name: 'Void Battery', text: 'The next chamber begins in the quiet.', apply: (r) => { r.voidTime += 1.35; } },
  { id: 'orbit', name: 'Orbit Core', text: 'Planetary curves bite deeper.', apply: (r) => { r.orbit = true; } },
  { id: 'dense', name: 'Dense Sky', text: 'The uniform pull grows heavier.', apply: (r) => { r.gravityMul = Math.min(2, r.gravityMul * 1.2); } },
  { id: 'thin', name: 'Thin Sky', text: 'The uniform pull grows lighter.', apply: (r) => { r.gravityMul = Math.max(0.55, r.gravityMul * 0.82); } },
];

function flipDir(d: Dir): Dir {
  if (d === LEFT) return RIGHT;
  if (d === RIGHT) return LEFT;
  return d;
}

export function mirrorLevel(level: LevelDef): LevelDef {
  const w = level.w;
  const Lvl = structuredClone(level);
  const fr = (x: number, width: number) => w - x - width;
  Lvl.spawn.x = w - level.spawn.x;
  Lvl.spawn.vx = -(level.spawn.vx ?? 0);
  Lvl.gravity.dir = flipDir(level.gravity.dir);
  for (const s of Lvl.solids) {
    s.x = fr(s.x, s.w);
    if (s.oneWay) s.oneWay = flipDir(s.oneWay);
    if (s.mover?.axis === 'x') s.mover.phase += Math.PI;
  }
  for (const h of Lvl.hazards) h.x = fr(h.x, h.w);
  if (Lvl.goal) Lvl.goal.x = w - Lvl.goal.x;
  for (const s of Lvl.stars) s.x = w - s.x;
  for (const s of Lvl.fragments) s.x = w - s.x;
  for (const z of Lvl.zones) {
    z.x = fr(z.x, z.w);
    if (z.dir != null) z.dir = flipDir(z.dir);
    if (z.flowX) z.flowX = -z.flowX;
  }
  for (const f of Lvl.fields) {
    f.x = w - f.x;
    if (f.mover) f.mover.cx = w - f.mover.cx;
  }
  for (const s of Lvl.switches) s.x = w - s.x;
  if (Lvl.switches) {
    for (const s of Lvl.switches) if (s.set != null) s.set = flipDir(s.set);
  }
  for (const g of Lvl.gates) {
    g.x = fr(g.x, g.w);
    g.openDir = flipDir(g.openDir);
  }
  for (const p of Lvl.portals) {
    p.x = w - p.x;
    if (p.redirect) p.redirect = flipDir(p.redirect);
  }
  for (const laser of Lvl.lasers) laser.x = fr(laser.x, laser.w);
  for (const c of Lvl.checkpoints) c.x = w - c.x;
  Lvl.id = `${level.id}-mirror`;
  return Lvl;
}

export function dailyLevel(date: string): { level: LevelDef; label: string; source: string } {
  const rng = mulberry32(hashString(`daily:${date}`));
  const pool = dailyPool();
  const base = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  const roll = rng();
  let level: LevelDef;
  let label = 'As written';
  if (roll > 0.72) {
    level = mirrorLevel(base);
    label = 'Mirrored';
  } else if (roll > 0.4) {
    level = structuredClone(base);
    level.gravity = { ...level.gravity, mag: Math.round(level.gravity.mag * 1.18) };
    label = 'Heavy sky';
  } else {
    level = structuredClone(base);
  }
  level.id = `daily-${date}`;
  level.name = base.name;
  return { level, label, source: base.name };
}

export function endlessLevel(seed: number, room: number): LevelDef {
  const pool = endlessPool();
  const rng = mulberry32((seed + room * 9973) >>> 0);
  const base = pool[Math.floor(rng() * pool.length)];
  const level = rng() > 0.5 ? mirrorLevel(base) : structuredClone(base);
  const mag = level.gravity.mag * (1 + Math.min(0.4, room * 0.035));
  level.gravity = { ...level.gravity, mag };
  level.id = `endless-${seed}-${room}`;
  level.name = room === 0 ? base.name : `${base.name}`;
  return level;
}

export function rollOffers(seed: number, room: number, current: RelicState): Offer[] {
  const rng = mulberry32((seed + 17 + room * 131) >>> 0);
  const pool = OFFER_DEFS.filter((o) => {
    if (o.id === 'momentum' && current.momentum) return false;
    if (o.id === 'lens' && current.lens) return false;
    if (o.id === 'stabilizer' && current.stabilizer) return false;
    if (o.id === 'rebound' && current.rebound) return false;
    if (o.id === 'orbit' && current.orbit) return false;
    return true;
  });
  const picks: Offer[] = [];
  const bag = pool.slice();
  while (picks.length < 3 && bag.length) {
    const i = Math.floor(rng() * bag.length);
    picks.push(bag.splice(i, 1)[0]);
  }
  return picks;
}

export function sandboxLevel(): LevelDef {
  return L({
    id: 'sandbox',
    name: 'Sandbox',
    world: 6,
    spawn: [2.2, 12.5],
    goal: [7.1, 2.3, 0.55],
    thought: 'Nothing here is a test. Turn the sky and watch.',
    hint: 'Every instrument on this floor is live.',
    medals: ladder({}, {}, {}),
    solids: [
      solid(0.46, 8.6, 2.4, 0.4),
      solid(5.4, 5.2, 2.6, 0.45, 'bounce'),
      solid(1.2, 3.4, 2.4, 0.4, 'ice'),
    ],
    hazards: [pit(3.8, 0.46, 1.5, 1.3)],
    zones: [
      { x: 3.3, y: 9.4, w: 2.6, h: 4.4, mode: 'zero' },
      { x: 6.2, y: 9.2, w: 2.2, h: 2.2, mode: 'conveyor', flowX: 8, flowY: 0 },
    ],
    fields: [
      { kind: 'planet', x: 4.6, y: 8.2, influence: 2.8, strength: 14, core: 0.55 },
      { kind: 'blackhole', x: 7.4, y: 12.6, influence: 2.2, strength: 12, horizon: 0.42 },
    ],
    switches: [{ x: 2.2, y: 1.4, r: 0.42, set: RIGHT }],
    stars: [['play', 6.6, 6.1]],
  });
}

export function freshRelics(): RelicState {
  return emptyRelics();
}

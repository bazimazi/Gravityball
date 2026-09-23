import { circleRectGap, circlesOverlap, clamp, dot, len, pointInRect } from '../core/math';
import {
  BALLS,
  MATERIALS,
  TUNING,
  dirVector,
  emptyRelics,
  emptyStats,
  rotateCCW,
  rotateCW,
  type BallId,
  type Dir,
  type InputKind,
  type RelicState,
  type RunStats,
} from '../core/types';
import type { LevelDef, SolidDef } from '../level/types';

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  gravityScale: number;
  restitution: number;
  frictionScale: number;
  maxSpeed: number;
  airDrag: number;
  mass: number;
  magnet: number;
  planetScale: number;
  breakPower: number;
  phase: boolean;
  archetype: BallId;
}

export interface SimSnap {
  ball: BallState;
  gravityDir: Dir;
  time: number;
  tick: number;
  stats: RunStats;
  broken: boolean[];
  stars: boolean[];
  fragments: boolean[];
  order: number;
  inputs: { tick: number; kind: InputKind }[];
  voidLeft: number;
}

export interface SimState {
  level: LevelDef;
  tick: number;
  time: number;
  ball: BallState;
  gravityDir: Dir;
  gravityMag: number;
  relics: RelicState;
  alive: boolean;
  won: boolean;
  broken: boolean[];
  stars: boolean[];
  fragments: boolean[];
  order: number;
  support: number;
  wallTouch: boolean;
  stats: RunStats;
  inputCd: number;
  portalCd: number;
  nearCd: number;
  voidLeft: number;
  switchInside: boolean[];
  checkpointInside: boolean[];
  anchorInside: boolean[];
  stainInside: boolean;
  inputs: { tick: number; kind: InputKind }[];
  start: SimSnap;
  snap: SimSnap;
}

export interface Impact {
  x: number;
  y: number;
  speed: number;
  nx: number;
  ny: number;
}

export interface StepEvents {
  impacts: Impact[];
  collects: { x: number; y: number; kind: 'star' | 'fragment'; id: string }[];
  died: boolean;
  won: boolean;
  nearMiss: boolean;
  switched: boolean;
  portaled: boolean;
  broke: boolean;
  checkpoint: boolean;
  stained: boolean;
}

export function fieldCenter(f: LevelDef['fields'][number], time: number): [number, number] {
  if (!f.mover) return [f.x, f.y];
  const a = (time * Math.PI * 2) / f.mover.period + f.mover.phase;
  return [f.mover.cx + Math.cos(a) * f.mover.amp, f.mover.cy + Math.sin(a) * f.mover.amp];
}

export function solidAt(s: SolidDef, time: number): { x: number; y: number; w: number; h: number } {
  if (!s.mover) return s;
  const o = Math.sin((time * Math.PI * 2) / s.mover.period + s.mover.phase) * s.mover.amp;
  if (s.mover.axis === 'x') return { x: s.x + o, y: s.y, w: s.w, h: s.h };
  return { x: s.x, y: s.y + o, w: s.w, h: s.h };
}

function makeBall(id: BallId, relics: RelicState, x: number, y: number, vx: number, vy: number): BallState {
  const c = BALLS[id];
  let maxSpeed = c.maxSpeed;
  let airDrag = c.airDrag;
  let restitution = c.restitution;
  let planetScale = c.planetScale;
  if (relics.momentum) {
    maxSpeed += 2.5;
    airDrag *= 0.35;
  }
  if (relics.stabilizer) restitution *= 0.55;
  if (relics.rebound) restitution = Math.min(0.96, restitution + 0.28);
  restitution = Math.min(0.96, restitution + relics.bounceAdd);
  if (relics.orbit) planetScale *= 1.35;
  return {
    x,
    y,
    vx,
    vy,
    r: TUNING.ballR,
    gravityScale: c.gravityScale,
    restitution,
    frictionScale: c.frictionScale,
    maxSpeed,
    airDrag,
    mass: c.mass,
    magnet: c.magnet,
    planetScale,
    breakPower: c.breakPower,
    phase: c.phase,
    archetype: id,
  };
}

function capture(sim: SimState): SimSnap {
  return {
    ball: { ...sim.ball },
    gravityDir: sim.gravityDir,
    time: sim.time,
    tick: sim.tick,
    stats: { ...sim.stats },
    broken: sim.broken.slice(),
    stars: sim.stars.slice(),
    fragments: sim.fragments.slice(),
    order: sim.order,
    inputs: sim.inputs.map((e) => ({ ...e })),
    voidLeft: sim.voidLeft,
  };
}

function applySnap(sim: SimState, snap: SimSnap): void {
  sim.ball = { ...snap.ball };
  sim.gravityDir = snap.gravityDir;
  sim.time = snap.time;
  sim.tick = snap.tick;
  sim.stats = { ...snap.stats };
  sim.broken = snap.broken.slice();
  sim.stars = snap.stars.slice();
  sim.fragments = snap.fragments.slice();
  sim.order = snap.order;
  sim.inputs = snap.inputs.map((e) => ({ ...e }));
  sim.voidLeft = snap.voidLeft;
  sim.alive = true;
  sim.won = false;
  sim.support = -1;
  sim.wallTouch = false;
  sim.inputCd = 0;
  sim.portalCd = 0.15;
  sim.nearCd = 0;
  sim.switchInside = sim.level.switches.map(() => false);
  sim.checkpointInside = sim.level.checkpoints.map(() => false);
  sim.stainInside = false;
}

export function createSim(level: LevelDef, relics: RelicState = emptyRelics()): SimState {
  const ball = makeBall(
    level.ball,
    relics,
    level.spawn.x,
    level.spawn.y,
    level.spawn.vx ?? 0,
    level.spawn.vy ?? 0,
  );
  const sim: SimState = {
    level,
    tick: 0,
    time: 0,
    ball,
    gravityDir: level.gravity.dir,
    gravityMag: level.gravity.mag * relics.gravityMul,
    relics: { ...relics, voidTime: relics.voidTime },
    alive: true,
    won: false,
    broken: level.solids.map(() => false),
    stars: level.stars.map(() => false),
    fragments: level.fragments.map(() => false),
    order: 0,
    support: -1,
    wallTouch: false,
    stats: emptyStats(level.stars.length),
    inputCd: 0,
    portalCd: 0,
    nearCd: 0,
    voidLeft: relics.voidTime,
    switchInside: level.switches.map(() => false),
    checkpointInside: level.checkpoints.map(() => false),
    anchorInside: [],
    stainInside: false,
    inputs: [],
    start: undefined as unknown as SimSnap,
    snap: undefined as unknown as SimSnap,
  };
  sim.stats.finishDir = level.gravity.dir;
  const snap = capture(sim);
  sim.start = snap;
  sim.snap = snap;
  return sim;
}

export function restartSim(sim: SimState): void {
  applySnap(sim, sim.start);
  sim.snap = sim.start;
}

export function restoreSnap(sim: SimState): void {
  applySnap(sim, sim.snap);
}

/** Uniform field after zones. Localized fields are separate. Zero-g removes only the uniform field. */
export function sampleUniform(sim: SimState, x: number, y: number): [number, number] {
  if (sim.voidLeft > 0) return [0, 0];
  const [dx, dy] = dirVector(sim.gravityDir);
  let gx = dx * sim.gravityMag * sim.ball.gravityScale;
  let gy = dy * sim.gravityMag * sim.ball.gravityScale;
  let zero = false;
  let mul = 1;
  let mirror = false;
  let ox = 0;
  let oy = 0;
  let overridden = false;
  for (const z of sim.level.zones) {
    if (!pointInRect(x, y, z.x, z.y, z.w, z.h)) continue;
    if (z.mode === 'zero') zero = true;
    else if (z.mode === 'override' && z.dir != null) {
      // A weightless room can still contain a throw. Zero global magnitude
      // must not silently delete the zone.
      const base = sim.gravityMag > 1 ? sim.gravityMag : TUNING.gravity;
      const v = dirVector(z.dir);
      ox = v[0] * base * sim.ball.gravityScale;
      oy = v[1] * base * sim.ball.gravityScale;
      overridden = true;
    } else if (z.mode === 'mul') mul *= z.mul ?? 1;
    else if (z.mode === 'mirror') mirror = !mirror;
    else if (z.mode === 'conveyor') {
      gx += z.flowX ?? 0;
      gy += z.flowY ?? 0;
    }
  }
  if (overridden) {
    gx = ox;
    gy = oy;
  }
  if (mirror) {
    gx = -gx;
    gy = -gy;
  }
  gx *= mul;
  gy *= mul;
  if (zero) return [0, 0];
  return [gx, gy];
}

export function sampleLocal(sim: SimState, x: number, y: number): [number, number] {
  let ax = 0;
  let ay = 0;
  const lens = sim.relics.lens ? 1.25 : 1;
  for (const f of sim.level.fields) {
    if (f.kind === 'magnet' && sim.ball.magnet <= 0) continue;
    const [fx, fy] = fieldCenter(f, sim.time);
    const dx = fx - x;
    const dy = fy - y;
    const d = Math.hypot(dx, dy);
    if (d > f.influence || d < 1e-4) continue;
    let strength = f.strength * lens;
    if (f.kind === 'planet') strength *= sim.ball.planetScale;
    const falloff = (f.influence * f.influence) / (d * d + 0.28);
    const g = Math.min(strength * 3.2, strength * falloff);
    const inward = f.kind === 'repulsor' ? -1 : 1;
    ax += (inward * g * dx) / d;
    ay += (inward * g * dy) / d;
  }
  return [ax, ay];
}

export function gravityAt(sim: SimState, x: number, y: number): [number, number] {
  const [ux, uy] = sampleUniform(sim, x, y);
  const [lx, ly] = sampleLocal(sim, x, y);
  return [ux + lx, uy + ly];
}

export function inputLocked(sim: SimState): boolean {
  const b = sim.ball;
  for (const z of sim.level.zones) {
    if (z.mode === 'lock' && pointInRect(b.x, b.y, z.x, z.y, z.w, z.h)) return true;
  }
  return false;
}

export function applyInput(sim: SimState, kind: InputKind): 'ok' | 'locked' | 'cooldown' | 'idle' {
  if (!sim.alive || sim.won) return 'idle';
  if (sim.inputCd > 0) return 'cooldown';
  if (inputLocked(sim)) return 'locked';
  sim.gravityDir = kind === 'cw' ? rotateCW(sim.gravityDir) : rotateCCW(sim.gravityDir);
  sim.inputCd = TUNING.inputGap;
  sim.stats.rotations += 1;
  sim.inputs.push({ tick: sim.tick, kind });
  return 'ok';
}

function emptyEvents(): StepEvents {
  return {
    impacts: [],
    collects: [],
    died: false,
    won: false,
    nearMiss: false,
    switched: false,
    portaled: false,
    broke: false,
    checkpoint: false,
    stained: false,
  };
}

export function step(sim: SimState, dt: number): StepEvents {
  const ev = emptyEvents();
  if (!sim.alive || sim.won) return ev;
  const sub = Math.min(
    TUNING.maxSubsteps,
    Math.max(1, Math.ceil((len(sim.ball.vx, sim.ball.vy) * dt) / (sim.ball.r * 0.5))),
  );
  const h = dt / sub;
  const t0 = sim.time;
  for (let i = 0; i < sub; i++) {
    sim.time = t0 + h * (i + 1);
    substep(sim, h, ev);
    if (!sim.alive || sim.won) break;
  }
  sim.tick += 1;
  sim.stats.time += dt;
  sim.inputCd = Math.max(0, sim.inputCd - dt);
  sim.portalCd = Math.max(0, sim.portalCd - dt);
  sim.nearCd = Math.max(0, sim.nearCd - dt);
  sim.voidLeft = Math.max(0, sim.voidLeft - dt);
  const sp = len(sim.ball.vx, sim.ball.vy);
  if (sp > sim.stats.maxSpeed) sim.stats.maxSpeed = sp;
  if (sim.alive && !sim.won) triggers(sim, ev);
  return ev;
}

function substep(sim: SimState, h: number, ev: StepEvents): void {
  const b = sim.ball;
  const prevSupport = sim.support;
  if (prevSupport >= 0) {
    const s = sim.level.solids[prevSupport];
    if (s && s.mover && !sim.broken[prevSupport]) {
      const now = solidAt(s, sim.time);
      const prev = solidAt(s, sim.time - h);
      b.x += now.x - prev.x;
      b.y += now.y - prev.y;
    }
  }

  const [gx, gy] = gravityAt(sim, b.x, b.y);
  const drag = uniformIsZero(sim, b.x, b.y) ? 0 : b.airDrag;
  b.vx += (gx - drag * b.vx) * h;
  b.vy += (gy - drag * b.vy) * h;
  let cap = b.maxSpeed;
  const [lx, ly] = sampleLocal(sim, b.x, b.y);
  if (len(lx, ly) > 4) cap = Math.max(cap, TUNING.slingCap);
  const sp = len(b.vx, b.vy);
  if (sp > cap) {
    b.vx = (b.vx / sp) * cap;
    b.vy = (b.vy / sp) * cap;
  }
  b.x += b.vx * h;
  b.y += b.vy * h;
  collide(sim, h, ev);
}

function uniformIsZero(sim: SimState, x: number, y: number): boolean {
  const [ux, uy] = sampleUniform(sim, x, y);
  return Math.abs(ux) + Math.abs(uy) < 1e-3;
}

function collide(sim: SimState, h: number, ev: StepEvents): void {
  const b = sim.ball;
  const [ugx, ugy] = sampleUniform(sim, b.x, b.y);
  sim.support = -1;
  let bestFloor = -1;
  let bestFloorDot = 0;
  let touchedWall = false;

  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < sim.level.solids.length; i++) {
      if (sim.broken[i]) continue;
      const def = sim.level.solids[i];
      if (def.phase && b.phase) continue;
      const r = solidAt(def, sim.time);
      const hit = resolveCircleRect(b.x, b.y, b.r + TUNING.skin, r.x, r.y, r.w, r.h, def.oneWay, b.vx, b.vy);
      if (!hit) continue;
      const mat = MATERIALS[def.mat];
      const incoming = b.vx * hit.nx + b.vy * hit.ny;
      b.x += hit.nx * hit.pen;
      b.y += hit.ny * hit.pen;
      if (incoming < 0) {
        const e = Math.min(0.96, Math.max(b.restitution, mat.restitution));
        b.vx -= (1 + e) * incoming * hit.nx;
        b.vy -= (1 + e) * incoming * hit.ny;
        const pressing = dot(ugx, ugy, hit.nx, hit.ny) < -2;
        const vn = b.vx * hit.nx + b.vy * hit.ny;
        if (pressing && e < 0.55 && Math.abs(vn) < 1.6) {
          b.vx -= vn * hit.nx;
          b.vy -= vn * hit.ny;
        }
        if (pressing || incoming < -1) {
          const tx = -hit.ny;
          const ty = hit.nx;
          let vt = b.vx * tx + b.vy * ty;
          const mu = mat.friction * b.frictionScale;
          const gMag = Math.max(8, len(ugx, ugy));
          const decel = mu * gMag * 1.05;
          const drop = Math.min(Math.abs(vt), decel * h);
          vt -= Math.sign(vt || 1) * drop;
          if (Math.abs(vt) < 0.02) vt = 0;
          const vn2 = b.vx * hit.nx + b.vy * hit.ny;
          b.vx = hit.nx * vn2 + tx * vt;
          b.vy = hit.ny * vn2 + ty * vt;
        }
        if (incoming < -1.6) {
          ev.impacts.push({
            x: b.x - hit.nx * b.r,
            y: b.y - hit.ny * b.r,
            speed: -incoming,
            nx: hit.nx,
            ny: hit.ny,
          });
        }
        if (def.fragile && b.breakPower > 0 && -incoming > 7) {
          sim.broken[i] = true;
          ev.broke = true;
        }
      }
      const press = dot(ugx, ugy, hit.nx, hit.ny);
      const floorish = press < -4;
      if (floorish && press < bestFloorDot) {
        bestFloorDot = press;
        bestFloor = i;
      } else if (!floorish && incoming < -0.45) {
        touchedWall = true;
      }
    }
  }
  if (touchedWall && !sim.wallTouch) sim.stats.wallContacts += 1;
  sim.wallTouch = touchedWall;
  sim.support = bestFloor;
}

interface Hit {
  nx: number;
  ny: number;
  pen: number;
}

function resolveCircleRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
  oneWay: Dir | undefined,
  vx: number,
  vy: number,
): Hit | null {
  const qx = clamp(cx, x, x + w);
  const qy = clamp(cy, y, y + h);
  let dx = cx - qx;
  let dy = cy - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;

  if (oneWay != null) {
    const n = dirVector(oneWay);
    const into = vx * n[0] + vy * n[1];
    const side =
      n[0] < -0.5 ? cx < x + w * 0.5 :
      n[0] > 0.5 ? cx > x + w * 0.5 :
      n[1] > 0.5 ? cy > y + h * 0.5 :
      cy < y + h * 0.5;
    if (into > 0.2 || !side) return null;
  }

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, pen: r - d };
  }
  const left = cx - x;
  const right = x + w - cx;
  const bottom = cy - y;
  const top = y + h - cy;
  const m = Math.min(left, right, bottom, top);
  if (m === left) return { nx: -1, ny: 0, pen: r + left };
  if (m === right) return { nx: 1, ny: 0, pen: r + right };
  if (m === bottom) return { nx: 0, ny: -1, pen: r + bottom };
  return { nx: 0, ny: 1, pen: r + top };
}

function triggers(sim: SimState, ev: StepEvents): void {
  const b = sim.ball;
  const level = sim.level;

  if (b.x < -0.35 || b.y < -0.35 || b.x > level.w + 0.35 || b.y > level.h + 0.35) {
    kill(sim, ev);
    return;
  }

  if (level.goal && reachedGoal(b.x, b.y, level.goal)) {
    const orderOk = !level.orderedCheckpoints || sim.order >= level.checkpoints.length;
    if (orderOk) {
      win(sim, ev);
      return;
    }
  }

  if (level.win === 'survive' && sim.stats.time >= (level.surviveTime ?? 12)) {
    win(sim, ev);
    return;
  }

  for (const hz of level.hazards) {
    const gap = circleRectGap(b.x, b.y, b.r - TUNING.hazardShrink, hz.x, hz.y, hz.w, hz.h);
    if (gap <= 0) {
      kill(sim, ev);
      return;
    }
  }

  for (const laser of level.lasers) {
    if (!laserHot(laser, sim.time)) continue;
    const gap = circleRectGap(b.x, b.y, b.r - TUNING.hazardShrink, laser.x, laser.y, laser.w, laser.h);
    if (gap <= 0) {
      kill(sim, ev);
      return;
    }
  }

  for (const f of level.fields) {
    if (f.kind !== 'blackhole' || f.horizon == null) continue;
    const [fx, fy] = fieldCenter(f, sim.time);
    if (circlesOverlap(b.x, b.y, 0, fx, fy, f.horizon)) {
      kill(sim, ev);
      return;
    }
    if (f.core && circlesOverlap(b.x, b.y, b.r, fx, fy, f.core)) {
      resolveCore(b, fx, fy, f.core, ev);
    }
  }

  for (const f of level.fields) {
    if (f.kind === 'blackhole' || f.core == null) continue;
    const [fx, fy] = fieldCenter(f, sim.time);
    if (circlesOverlap(b.x, b.y, b.r, fx, fy, f.core)) resolveCore(b, fx, fy, f.core, ev);
  }

  for (let i = 0; i < level.stars.length; i++) {
    if (sim.stars[i]) continue;
    const s = level.stars[i];
    if (circlesOverlap(b.x, b.y, b.r, s.x, s.y, TUNING.starR)) {
      sim.stars[i] = true;
      sim.stats.collected += 1;
      ev.collects.push({ x: s.x, y: s.y, kind: 'star', id: s.id });
    }
  }
  for (let i = 0; i < level.fragments.length; i++) {
    if (sim.fragments[i]) continue;
    const s = level.fragments[i];
    if (circlesOverlap(b.x, b.y, b.r, s.x, s.y, 0.26)) {
      sim.fragments[i] = true;
      sim.stats.fragments += 1;
      ev.collects.push({ x: s.x, y: s.y, kind: 'fragment', id: s.id });
    }
  }

  for (let i = 0; i < level.switches.length; i++) {
    const sw = level.switches[i];
    const inside = circlesOverlap(b.x, b.y, b.r * 0.6, sw.x, sw.y, sw.r);
    if (inside && !sim.switchInside[i]) {
      if (sw.cycle) sim.gravityDir = rotateCW(sim.gravityDir);
      else if (sw.set != null) sim.gravityDir = sw.set;
      ev.switched = true;
    }
    sim.switchInside[i] = inside;
  }

  for (let i = 0; i < level.checkpoints.length; i++) {
    const cp = level.checkpoints[i];
    const inside = circlesOverlap(b.x, b.y, b.r, cp.x, cp.y, cp.r);
    if (inside && !sim.checkpointInside[i]) {
      const next = sim.order + 1;
      if (!level.orderedCheckpoints || cp.order === next) {
        sim.order = level.orderedCheckpoints ? next : sim.order + 1;
        sim.snap = capture(sim);
        ev.checkpoint = true;
      }
    }
    sim.checkpointInside[i] = inside;
  }

  let stain = false;
  for (const z of level.zones) {
    if (z.mode !== 'stain') continue;
    if (pointInRect(b.x, b.y, z.x, z.y, z.w, z.h)) stain = true;
  }
  if (stain && !sim.stainInside) {
    sim.stats.stainTouches += 1;
    ev.stained = true;
  }
  sim.stainInside = stain;

  if (sim.portalCd <= 0) {
    for (const p of level.portals) {
      if (!circlesOverlap(b.x, b.y, b.r * 0.5, p.x, p.y, p.r)) continue;
      const dest = level.portals.find((o) => o.id === p.to);
      if (!dest) continue;
      const dir = dest.redirect;
      const sp = len(b.vx, b.vy);
      if (dir != null) {
        const v = dirVector(dir);
        const speed = Math.max(sp, 4);
        b.vx = v[0] * speed;
        b.vy = v[1] * speed;
        b.x = dest.x + v[0] * (dest.r + b.r + 0.08);
        b.y = dest.y + v[1] * (dest.r + b.r + 0.08);
      } else {
        const speed = Math.max(sp, 0.01);
        b.x = dest.x + (b.vx / speed) * (dest.r + b.r + 0.08);
        b.y = dest.y + (b.vy / speed) * (dest.r + b.r + 0.08);
      }
      sim.portalCd = 0.25;
      ev.portaled = true;
      break;
    }
  }

  // Gates are solids that exist only while closed. Resolved here so they can appear mid-flight.
  for (const g of level.gates) {
    if (sim.gravityDir === g.openDir) continue;
    const hit = resolveCircleRect(b.x, b.y, b.r, g.x, g.y, g.w, g.h, undefined, b.vx, b.vy);
    if (!hit) continue;
    const incoming = b.vx * hit.nx + b.vy * hit.ny;
    b.x += hit.nx * (hit.pen + 0.01);
    b.y += hit.ny * (hit.pen + 0.01);
    if (incoming < 0) {
      b.vx -= (1 + 0.15) * incoming * hit.nx;
      b.vy -= (1 + 0.15) * incoming * hit.ny;
      if (!sim.wallTouch) {
        sim.stats.wallContacts += 1;
        sim.wallTouch = true;
      }
    }
  }

  if (sim.nearCd <= 0 && len(b.vx, b.vy) > 2) {
    let close = false;
    for (const hz of level.hazards) {
      const gap = circleRectGap(b.x, b.y, b.r, hz.x, hz.y, hz.w, hz.h);
      if (gap > 0 && gap < 0.2) close = true;
    }
    for (const f of level.fields) {
      if (f.kind !== 'blackhole' || f.horizon == null) continue;
      const [fx, fy] = fieldCenter(f, sim.time);
      const d = Math.hypot(b.x - fx, b.y - fy);
      if (d > f.horizon && d - f.horizon < 0.45) close = true;
    }
    if (close) {
      sim.stats.nearMisses += 1;
      sim.nearCd = 0.7;
      ev.nearMiss = true;
    }
  }
}

function resolveCore(b: BallState, fx: number, fy: number, core: number, ev: StepEvents): void {
  const dx = b.x - fx;
  const dy = b.y - fy;
  const d = Math.hypot(dx, dy) || 1e-4;
  const nx = dx / d;
  const ny = dy / d;
  const pen = b.r + core - d;
  if (pen > 0) {
    b.x += nx * pen;
    b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + b.restitution) * vn * nx;
      b.vy -= (1 + b.restitution) * vn * ny;
      ev.impacts.push({ x: fx + nx * core, y: fy + ny * core, speed: -vn, nx, ny });
    }
  }
}

function reachedGoal(x: number, y: number, goal: { x: number; y: number; r: number; h?: number }): boolean {
  const reach = goal.r + TUNING.goalExpand;
  if (goal.h && goal.h > 0) {
    return pointInRect(x, y, goal.x - reach, goal.y, reach * 2, goal.h);
  }
  return circlesOverlap(x, y, 0, goal.x, goal.y, reach);
}

function kill(sim: SimState, ev: StepEvents): void {
  sim.alive = false;
  sim.stats.hazardTouches += 1;
  ev.died = true;
}

function win(sim: SimState, ev: StepEvents): void {
  sim.won = true;
  sim.stats.finishDir = sim.gravityDir;
  ev.won = true;
}

export function laserHot(laser: LevelDef['lasers'][number], time: number): boolean {
  const t = (((time + laser.phase) % laser.period) + laser.period) % laser.period;
  return t < laser.duty;
}

export function laserWarm(laser: LevelDef['lasers'][number], time: number): boolean {
  const t = (((time + laser.phase) % laser.period) + laser.period) % laser.period;
  return !laserHot(laser, time) && t > laser.period - 0.42;
}

export function cloneSim(sim: SimState): SimState {
  const snap = capture(sim);
  const next = createSim(sim.level, sim.relics);
  applySnap(next, snap);
  next.start = sim.start;
  next.snap = capture(next);
  next.gravityMag = sim.gravityMag;
  return next;
}

/** Replay inputs from a fresh sim. Stops at `untilTick` (inclusive). */
export function replay(level: LevelDef, inputs: { tick: number; kind: InputKind }[], relics: RelicState, untilTick: number): SimState {
  const sim = createSim(level, relics);
  let i = 0;
  const sorted = inputs.slice().sort((a, b) => a.tick - b.tick);
  const max = Math.max(0, untilTick);
  for (let t = 0; t < max && sim.alive && !sim.won; t++) {
    while (i < sorted.length && sorted[i].tick === sim.tick) {
      applyInput(sim, sorted[i].kind);
      i++;
    }
    step(sim, TUNING.dt);
  }
  return sim;
}

export function predict(sim: SimState, seconds: number): { x: number; y: number }[] {
  const ghost = cloneSim(sim);
  const pts: { x: number; y: number }[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps && ghost.alive && !ghost.won; i++) {
    step(ghost, TUNING.dt);
    if (i % 5 === 0) pts.push({ x: ghost.ball.x, y: ghost.ball.y });
  }
  return pts;
}

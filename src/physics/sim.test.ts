import { describe, expect, it } from 'vitest';
import { DOWN, LEFT, RIGHT, UP, rotateCCW, rotateCW, dirVector } from '../core/types';
import { applyInput, createSim, step } from '../physics/sim';
import { getLevel } from '../level/campaign';
import { bestMedal } from '../level/build';
import { TUNING } from '../core/types';
import { hashString, mulberry32 } from '../core/math';
import { dailyLevel } from '../game/modes';

describe('gravity rotation', () => {
  it('turns like a clock facing the player', () => {
    expect(rotateCW(DOWN)).toBe(LEFT);
    expect(rotateCCW(DOWN)).toBe(RIGHT);
    expect(rotateCW(LEFT)).toBe(UP);
    expect(rotateCW(UP)).toBe(RIGHT);
    expect(rotateCW(RIGHT)).toBe(DOWN);
    expect(dirVector(RIGHT)).toEqual([1, 0]);
    expect(dirVector(DOWN)).toEqual([0, -1]);
  });
});

describe('physics', () => {
  it('settles on the floor without jitter', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const sim = createSim(level);
    for (let i = 0; i < 120 * 4; i++) step(sim, TUNING.dt);
    expect(sim.alive).toBe(true);
    expect(sim.ball.y).toBeGreaterThan(0.5);
    expect(sim.ball.y).toBeLessThan(2);
    const y = sim.ball.y;
    for (let i = 0; i < 120; i++) step(sim, TUNING.dt);
    expect(Math.abs(sim.ball.y - y)).toBeLessThan(0.02);
    expect(Math.hypot(sim.ball.vx, sim.ball.vy)).toBeLessThan(0.35);
  });

  it('keeps horizontal speed when gravity turns downward', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const sim = createSim(level);
    sim.ball.x = 4;
    sim.ball.y = 8;
    sim.ball.vx = 6;
    sim.ball.vy = 0;
    sim.gravityDir = DOWN;
    const x0 = sim.ball.x;
    for (let i = 0; i < 40; i++) step(sim, TUNING.dt);
    expect(sim.ball.x).toBeGreaterThan(x0 + 1);
    expect(sim.ball.y).toBeLessThan(8);
  });

  it('does not tunnel a fast ball through a floor', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const sim = createSim(level);
    sim.ball.x = 4;
    sim.ball.y = 6;
    sim.ball.vy = -30;
    sim.ball.maxSpeed = 40;
    for (let i = 0; i < 90; i++) step(sim, TUNING.dt);
    expect(sim.ball.y).toBeGreaterThan(0.4);
    expect(sim.alive).toBe(true);
  });

  it('is deterministic for the same inputs', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const run = () => {
      const sim = createSim(level);
      for (let i = 0; i < 200; i++) {
        if (i === 80) applyInput(sim, 'ccw');
        step(sim, TUNING.dt);
      }
      return [sim.ball.x, sim.ball.y, sim.ball.vx, sim.ball.vy, sim.won];
    };
    expect(run()).toEqual(run());
  });

  it('solves the first chamber with one counter-clockwise turn', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const sim = createSim(level);
    let turned = false;
    for (let i = 0; i < 120 * 8 && !sim.won; i++) {
      if (!turned && sim.ball.vy > -0.4 && sim.stats.time > 0.4) {
        applyInput(sim, 'ccw');
        turned = true;
      }
      step(sim, TUNING.dt);
    }
    expect(turned).toBe(true);
    expect(sim.won).toBe(true);
    expect(sim.stats.rotations).toBe(1);
  });
});

describe('medals and daily', () => {
  it('awards the strictest medal that was earned', () => {
    const level = getLevel('1-1');
    if (!level) throw new Error('missing');
    const stats = {
      time: 3,
      rotations: 1,
      collected: 0,
      totalCollectibles: 0,
      wallContacts: 0,
      stainTouches: 0,
      finishDir: 3 as const,
    };
    expect(bestMedal(stats, level.medals)).toBe('perfect');
  });

  it('builds the same daily chamber from a date', () => {
    const a = dailyLevel('2026-09-23');
    const b = dailyLevel('2026-09-23');
    expect(a.level.spawn).toEqual(b.level.spawn);
    expect(a.label).toBe(b.label);
    expect(dailyLevel('2026-01-01').level.id).not.toBe(a.level.id);
  });

  it('hashes stably', () => {
    expect(hashString('gravityball')).toBe(hashString('gravityball'));
    const rng = mulberry32(hashString('2026-09-23'));
    expect(rng()).toBeCloseTo(mulberry32(hashString('2026-09-23'))(), 12);
  });
});

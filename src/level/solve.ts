import { TUNING } from '../core/types';
import { applyInput, cloneSim, createSim, step, type SimState } from '../physics/sim';
import type { LevelDef } from '../level/types';

/** Best-first search over short waits and single turns. Used to reject unsolvable chambers. */
export function findClear(level: LevelDef, limit = 1800): boolean {
  const queue: SimState[] = [createSim(level)];
  const seen = new Set<string>();
  let n = 0;
  while (queue.length && n < limit) {
    const sim = queue.shift()!;
    n++;
    if (sim.won) return true;
    if (!sim.alive || sim.stats.rotations > 14) continue;
    const key = [
      Math.round(sim.ball.x),
      Math.round(sim.ball.y),
      Math.round(sim.ball.vx / 3),
      Math.round(sim.ball.vy / 3),
      sim.gravityDir,
      sim.stats.collected,
      sim.order,
      Math.floor(sim.time * 2),
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const options: (null | 'cw' | 'ccw')[] = [null, 'cw', 'ccw'];
    for (const kind of options) {
      const next = cloneSim(sim);
      if (kind && applyInput(next, kind) !== 'ok') continue;
      let dead = false;
      for (let i = 0; i < 30; i++) {
        step(next, TUNING.dt);
        if (next.won) return true;
        if (!next.alive) {
          dead = true;
          break;
        }
      }
      if (!dead) queue.push(next);
    }
    queue.sort((a, b) => score(a) - score(b));
  }
  return false;
}

function score(sim: SimState): number {
  const goal = sim.level.goal;
  let dist = goal
    ? Math.hypot(sim.ball.x - goal.x, sim.ball.y - (goal.h ? goal.y + goal.h * 0.5 : goal.y))
    : Math.max(0, (sim.level.surviveTime ?? 12) - sim.time) * 4;
  if (sim.level.orderedCheckpoints) {
    const next = sim.level.checkpoints.find((c) => c.order === sim.order + 1);
    if (next) dist = Math.hypot(sim.ball.x - next.x, sim.ball.y - next.y) + (sim.level.checkpoints.length - sim.order) * 6;
  }
  return dist + sim.stats.rotations * 2.2 + sim.time * 0.05;
}

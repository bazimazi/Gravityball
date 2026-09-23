import { describe, expect, it } from 'vitest';
import { CAMPAIGN, CHALLENGE_LEVELS, SECRET_LEVELS } from '../level/campaign';
import { findClear } from '../level/solve';

describe('campaign solvability', () => {
  it('every hand-built chamber has a clear', () => {
    const failed: string[] = [];
    for (const level of [...CAMPAIGN, ...SECRET_LEVELS, ...CHALLENGE_LEVELS]) {
      const limit = level.world >= 10 ? 9000 : level.world >= 7 ? 4500 : 2800;
      if (!findClear(level, limit)) failed.push(`${level.id} ${level.name}`);
    }
    expect(failed).toEqual([]);
  }, 180000);
});

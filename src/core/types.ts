/**
 * Directions are a clock facing the player.
 * Clockwise from down goes left: DOWN → LEFT → UP → RIGHT.
 * Left-side press rotates counter-clockwise (from down, toward the right).
 * Right-side press rotates clockwise (from down, toward the left).
 * Vectors are world-space, Y up.
 */
export const DOWN = 0;
export const LEFT = 1;
export const UP = 2;
export const RIGHT = 3;
export type Dir = 0 | 1 | 2 | 3;

export const DIR_NAME: Record<Dir, string> = {
  0: 'down',
  1: 'left',
  2: 'up',
  3: 'right',
};

export function dirVector(d: Dir): readonly [number, number] {
  switch (d) {
    case DOWN:
      return [0, -1];
    case LEFT:
      return [-1, 0];
    case UP:
      return [0, 1];
    case RIGHT:
      return [1, 0];
  }
}

export function rotateCW(d: Dir): Dir {
  return ((d + 1) & 3) as Dir;
}

export function rotateCCW(d: Dir): Dir {
  return ((d + 3) & 3) as Dir;
}

/** Visual angle in world space. 0 points right, counter-clockwise positive. */
export function dirAngle(d: Dir): number {
  switch (d) {
    case RIGHT:
      return 0;
    case UP:
      return Math.PI / 2;
    case LEFT:
      return Math.PI;
    case DOWN:
      return -Math.PI / 2;
  }
}

export type BallId =
  | 'standard'
  | 'heavy'
  | 'light'
  | 'elastic'
  | 'magnetic'
  | 'phase'
  | 'orbit';

export type MatId = 'stone' | 'metal' | 'bounce' | 'ice' | 'sticky';

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'perfect';

export interface MedalReq {
  maxRotations?: number;
  maxTime?: number;
  allCollectibles?: boolean;
  noWallContact?: boolean;
  finishDir?: Dir;
  noStain?: boolean;
}

export interface BallConfig {
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
}

export const BALLS: Record<BallId, BallConfig> = {
  standard: {
    gravityScale: 1,
    restitution: 0.2,
    frictionScale: 1,
    maxSpeed: 18,
    airDrag: 0.14,
    mass: 1,
    magnet: 0,
    planetScale: 1,
    breakPower: 0,
    phase: false,
  },
  heavy: {
    gravityScale: 0.58,
    restitution: 0.1,
    frictionScale: 1.25,
    maxSpeed: 13,
    airDrag: 0.035,
    mass: 2.6,
    magnet: 0,
    planetScale: 0.8,
    breakPower: 1,
    phase: false,
  },
  light: {
    gravityScale: 1.55,
    restitution: 0.28,
    frictionScale: 0.4,
    maxSpeed: 16,
    airDrag: 2.1,
    mass: 0.4,
    magnet: 0,
    planetScale: 1.2,
    breakPower: 0,
    phase: false,
  },
  elastic: {
    gravityScale: 1.05,
    restitution: 0.93,
    frictionScale: 0.32,
    maxSpeed: 21,
    airDrag: 0.06,
    mass: 0.75,
    magnet: 0,
    planetScale: 1,
    breakPower: 0,
    phase: false,
  },
  magnetic: {
    gravityScale: 1,
    restitution: 0.18,
    frictionScale: 1,
    maxSpeed: 18,
    airDrag: 0.14,
    mass: 1,
    magnet: 1,
    planetScale: 1,
    breakPower: 0,
    phase: false,
  },
  phase: {
    gravityScale: 1,
    restitution: 0.2,
    frictionScale: 0.9,
    maxSpeed: 18,
    airDrag: 0.12,
    mass: 1,
    magnet: 0,
    planetScale: 1,
    breakPower: 0,
    phase: true,
  },
  orbit: {
    gravityScale: 0.8,
    restitution: 0.24,
    frictionScale: 0.65,
    maxSpeed: 24,
    airDrag: 0.04,
    mass: 0.85,
    magnet: 0,
    planetScale: 1.9,
    breakPower: 0,
    phase: false,
  },
};

export const BALL_TEXT: Record<BallId, { name: string; strength: string; weakness: string }> = {
  standard: { name: 'Standard', strength: 'Balanced', weakness: 'No specialty' },
  heavy: { name: 'Heavy', strength: 'Keeps its line', weakness: 'Slow to redirect' },
  light: { name: 'Light', strength: 'Turns immediately', weakness: 'Loses speed in the air' },
  elastic: { name: 'Elastic', strength: 'Extreme rebounds', weakness: 'Hard to settle' },
  magnetic: { name: 'Magnetic', strength: 'Bends toward magnets', weakness: 'Magnets are not optional' },
  phase: { name: 'Phase', strength: 'Passes marked surfaces', weakness: 'Those surfaces are the only path' },
  orbit: { name: 'Orbit', strength: 'Deep planetary slingshots', weakness: 'Weaker uniform pull' },
};

export interface Material {
  restitution: number;
  friction: number;
}

export const MATERIALS: Record<MatId, Material> = {
  stone: { restitution: 0.16, friction: 0.72 },
  metal: { restitution: 0.4, friction: 0.3 },
  bounce: { restitution: 0.9, friction: 0.06 },
  ice: { restitution: 0.06, friction: 0.04 },
  sticky: { restitution: 0.02, friction: 2.6 },
};

export const TUNING = {
  dt: 1 / 120,
  gravity: 27,
  ballR: 0.32,
  skin: 0.02,
  hazardShrink: 0.055,
  goalExpand: 0.12,
  starR: 0.28,
  inputGap: 0.085,
  maxSubsteps: 5,
  maxFrameSteps: 8,
  slingCap: 26,
};

export interface RelicState {
  momentum: boolean;
  lens: boolean;
  stabilizer: boolean;
  rebound: boolean;
  voidTime: number;
  orbit: boolean;
  gravityMul: number;
  bounceAdd: number;
}

export function emptyRelics(): RelicState {
  return {
    momentum: false,
    lens: false,
    stabilizer: false,
    rebound: false,
    voidTime: 0,
    orbit: false,
    gravityMul: 1,
    bounceAdd: 0,
  };
}

export type InputKind = 'cw' | 'ccw';

export interface InputEvent {
  tick: number;
  kind: InputKind;
}

export interface RunStats {
  time: number;
  rotations: number;
  collected: number;
  totalCollectibles: number;
  wallContacts: number;
  hazardTouches: number;
  stainTouches: number;
  nearMisses: number;
  finishDir: Dir;
  maxSpeed: number;
  fragments: number;
}

export function emptyStats(stars: number): RunStats {
  return {
    time: 0,
    rotations: 0,
    collected: 0,
    totalCollectibles: stars,
    wallContacts: 0,
    hazardTouches: 0,
    stainTouches: 0,
    nearMisses: 0,
    finishDir: DOWN,
    maxSpeed: 0,
    fragments: 0,
  };
}

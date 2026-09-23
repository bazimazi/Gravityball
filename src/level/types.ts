import type { BallId, Dir, MatId, MedalReq } from '../core/types';

export interface SolidDef {
  x: number;
  y: number;
  w: number;
  h: number;
  mat: MatId;
  fragile?: boolean;
  /** Phase balls pass through. Other balls treat it as stone. */
  phase?: boolean;
  oneWay?: Dir;
  mover?: { axis: 'x' | 'y'; amp: number; period: number; phase: number };
}

export interface HazardDef {
  x: number;
  y: number;
  w: number;
  h: number;
  style: 'pit' | 'spike';
}

export interface ZoneDef {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'override' | 'zero' | 'mul' | 'mirror' | 'lock' | 'conveyor' | 'stain';
  dir?: Dir;
  mul?: number;
  flowX?: number;
  flowY?: number;
}

export type FieldKind = 'planet' | 'blackhole' | 'repulsor' | 'magnet' | 'well';

export interface FieldDef {
  kind: FieldKind;
  x: number;
  y: number;
  /** Uniform-field override is ignored inside influence; this pull is added. */
  influence: number;
  strength: number;
  /** Solid core. Black holes use horizon instead. */
  core?: number;
  /** Kill radius for black holes. */
  horizon?: number;
  mover?: { cx: number; cy: number; amp: number; period: number; phase: number };
}

export interface SwitchDef {
  x: number;
  y: number;
  r: number;
  set?: Dir;
  /** If true, each touch cycles CW. */
  cycle?: boolean;
}

export interface GateDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Gate is passable only while gravity points this way. */
  openDir: Dir;
}

export interface PortalDef {
  id: string;
  x: number;
  y: number;
  r: number;
  to: string;
  redirect?: Dir;
}

export interface LaserDef {
  x: number;
  y: number;
  w: number;
  h: number;
  period: number;
  duty: number;
  phase: number;
}

export interface CheckpointDef {
  id: string;
  x: number;
  y: number;
  r: number;
  order: number;
}

export interface LevelDef {
  id: string;
  name: string;
  world: number;
  w: number;
  h: number;
  spawn: { x: number; y: number; vx?: number; vy?: number };
  gravity: { dir: Dir; mag: number };
  ball: BallId;
  solids: SolidDef[];
  hazards: HazardDef[];
  goal?: { x: number; y: number; r: number; h?: number };
  stars: { id: string; x: number; y: number }[];
  fragments: { id: string; x: number; y: number; line: string }[];
  zones: ZoneDef[];
  fields: FieldDef[];
  switches: SwitchDef[];
  gates: GateDef[];
  portals: PortalDef[];
  lasers: LaserDef[];
  checkpoints: CheckpointDef[];
  /** Goal opens only after checkpoints 1..n are touched in order. */
  orderedCheckpoints?: boolean;
  medals: { bronze: MedalReq; silver: MedalReq; gold: MedalReq; perfect: MedalReq };
  /** Shown once, the first time the chamber is entered. */
  thought: string;
  /** Offered after repeated failure. A way of seeing, not the answer. */
  hint: string;
  win: 'goal' | 'survive';
  surviveTime?: number;
  secret?: boolean;
  unlockFragment?: string;
  challenge?: boolean;
  /** Endless / daily rooms may omit a world unlock. */
  tags?: string[];
}

export interface WorldDef {
  id: number;
  name: string;
  subtitle: string;
  thought: string;
  accent: string;
  accent2: string;
  bg0: string;
  bg1: string;
  bg2: string;
}

export const WORLDS: WorldDef[] = [
  {
    id: 1,
    name: 'Awakening',
    subtitle: 'Four pulls',
    thought: 'Which way does the world fall?',
    accent: '#e6d3b1',
    accent2: '#9eb7d8',
    bg0: '#09080f',
    bg1: '#14121c',
    bg2: '#1c2433',
  },
  {
    id: 2,
    name: 'Momentum',
    subtitle: 'What you already carry',
    thought: 'Gravity writes the future, not the present.',
    accent: '#e0a15a',
    accent2: '#f0d8b0',
    bg0: '#100c09',
    bg1: '#1c1410',
    bg2: '#2a1c12',
  },
  {
    id: 3,
    name: 'Rotation',
    subtitle: 'A path is a sequence',
    thought: 'A path is a sequence of pulls.',
    accent: '#b7d8c8',
    accent2: '#e7efe4',
    bg0: '#07110f',
    bg1: '#10211c',
    bg2: '#163028',
  },
  {
    id: 4,
    name: 'Machines',
    subtitle: 'The room has a will',
    thought: 'The world can aim a pull of its own.',
    accent: '#d7c4f2',
    accent2: '#f0e6c8',
    bg0: '#0c0a12',
    bg1: '#1a1524',
    bg2: '#241c30',
  },
  {
    id: 5,
    name: 'Zero',
    subtitle: 'What remains',
    thought: 'When the pull vanishes, velocity remains.',
    accent: '#d5e6ea',
    accent2: '#a9c3c8',
    bg0: '#0a1014',
    bg1: '#152028',
    bg2: '#1c3038',
  },
  {
    id: 6,
    name: 'Orbits',
    subtitle: 'A center',
    thought: 'Gravity can bend toward a heart.',
    accent: '#e6b089',
    accent2: '#f2e2c4',
    bg0: '#120d0c',
    bg1: '#241610',
    bg2: '#3a2418',
  },
  {
    id: 7,
    name: 'Collapse',
    subtitle: 'The long way',
    thought: 'Sometimes the safe line is the indirect one.',
    accent: '#e07a6a',
    accent2: '#c9b8a8',
    bg0: '#070608',
    bg1: '#140c10',
    bg2: '#241418',
  },
  {
    id: 8,
    name: 'Living',
    subtitle: 'Everything at once',
    thought: 'The chambers start keeping more than one law.',
    accent: '#d6e2a8',
    accent2: '#f0e6c4',
    bg0: '#0a100c',
    bg1: '#142018',
    bg2: '#1c3020',
  },
  {
    id: 9,
    name: 'Paradox',
    subtitle: 'Exceptions',
    thought: 'A rule you trusted can be aimed.',
    accent: '#e4c2d4',
    accent2: '#c9d4e8',
    bg0: '#100c10',
    bg1: '#1c1420',
    bg2: '#281c2c',
  },
  {
    id: 10,
    name: 'The Core',
    subtitle: 'Understanding',
    thought: 'Understanding is the only key.',
    accent: '#f0e6c8',
    accent2: '#e6c98a',
    bg0: '#0e0d0b',
    bg1: '#1a1814',
    bg2: '#2a261c',
  },
];

export function worldById(id: number): WorldDef {
  return WORLDS[id - 1] ?? WORLDS[0];
}

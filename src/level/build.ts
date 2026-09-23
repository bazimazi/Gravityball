import { DOWN, type Dir, type MedalReq, type BallId } from '../core/types';
import type {
  CheckpointDef,
  FieldDef,
  GateDef,
  HazardDef,
  LaserDef,
  LevelDef,
  PortalDef,
  SolidDef,
  SwitchDef,
  ZoneDef,
} from './types';
import type { MatId } from '../core/types';

export const T = 0.46;

export function solid(
  x: number,
  y: number,
  w: number,
  h: number,
  mat: MatId = 'stone',
  extra: Partial<SolidDef> = {},
): SolidDef {
  return { x, y, w, h, mat, ...extra };
}

export function frame(
  w: number,
  h: number,
  open: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean } = {},
): SolidDef[] {
  const s: SolidDef[] = [];
  if (!open.bottom) s.push(solid(0, 0, w, T));
  if (!open.top) s.push(solid(0, h - T, w, T));
  if (!open.left) s.push(solid(0, T, T, h - T * 2));
  if (!open.right) s.push(solid(w - T, T, T, h - T * 2));
  return s;
}

export function pit(x: number, y: number, w: number, h: number): HazardDef {
  return { x, y, w, h, style: 'pit' };
}

export function spikes(x: number, y: number, w: number, h: number): HazardDef {
  return { x, y, w, h, style: 'spike' };
}

export function ladder(silver: MedalReq, gold: MedalReq, perfect: MedalReq): LevelDef['medals'] {
  return {
    bronze: {},
    silver: { ...silver },
    gold: { ...silver, ...gold },
    perfect: { ...silver, ...gold, ...perfect },
  };
}

export interface LevelDraft {
  id: string;
  name: string;
  world: number;
  w?: number;
  h?: number;
  spawn: [number, number, number?, number?];
  dir?: Dir;
  mag?: number;
  ball?: BallId;
  solids?: SolidDef[];
  hazards?: HazardDef[];
  goal?: [number, number, number?, number?];
  stars?: [string, number, number][];
  fragments?: [string, number, number, string][];
  zones?: ZoneDef[];
  fields?: FieldDef[];
  switches?: SwitchDef[];
  gates?: GateDef[];
  portals?: PortalDef[];
  lasers?: LaserDef[];
  checkpoints?: CheckpointDef[];
  orderedCheckpoints?: boolean;
  medals: LevelDef['medals'];
  thought: string;
  hint: string;
  win?: 'goal' | 'survive';
  surviveTime?: number;
  secret?: boolean;
  unlockFragment?: string;
  challenge?: boolean;
  open?: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean };
  tags?: string[];
}

export function L(d: LevelDraft): LevelDef {
  const w = d.w ?? 9;
  const h = d.h ?? 16;
  return {
    id: d.id,
    name: d.name,
    world: d.world,
    w,
    h,
    spawn: { x: d.spawn[0], y: d.spawn[1], vx: d.spawn[2] ?? 0, vy: d.spawn[3] ?? 0 },
    gravity: { dir: d.dir ?? DOWN, mag: d.mag ?? 27 },
    ball: d.ball ?? 'standard',
    solids: [...frame(w, h, d.open), ...(d.solids ?? [])],
    hazards: d.hazards ?? [],
    goal: d.goal ? { x: d.goal[0], y: d.goal[1], r: d.goal[2] ?? 0.58, h: d.goal[3] } : undefined,
    stars: (d.stars ?? []).map(([id, x, y]) => ({ id, x, y })),
    fragments: (d.fragments ?? []).map(([id, x, y, line]) => ({ id, x, y, line })),
    zones: d.zones ?? [],
    fields: d.fields ?? [],
    switches: d.switches ?? [],
    gates: d.gates ?? [],
    portals: d.portals ?? [],
    lasers: d.lasers ?? [],
    checkpoints: d.checkpoints ?? [],
    orderedCheckpoints: d.orderedCheckpoints,
    medals: d.medals,
    thought: d.thought,
    hint: d.hint,
    win: d.win ?? 'goal',
    surviveTime: d.surviveTime,
    secret: d.secret,
    unlockFragment: d.unlockFragment,
    challenge: d.challenge,
    tags: d.tags,
  };
}

export function meets(stats: {
  time: number;
  rotations: number;
  collected: number;
  totalCollectibles: number;
  wallContacts: number;
  stainTouches: number;
  finishDir: Dir;
}, req: MedalReq): boolean {
  if (req.maxRotations != null && stats.rotations > req.maxRotations) return false;
  if (req.maxTime != null && stats.time > req.maxTime + 1e-3) return false;
  if (req.allCollectibles && stats.collected < stats.totalCollectibles) return false;
  if (req.noWallContact && stats.wallContacts > 0) return false;
  if (req.noStain && stats.stainTouches > 0) return false;
  if (req.finishDir != null && stats.finishDir !== req.finishDir) return false;
  return true;
}

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'perfect';

export const MEDAL_RANK: Record<MedalTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  perfect: 4,
};

export function bestMedal(
  stats: Parameters<typeof meets>[0],
  medals: LevelDef['medals'],
): MedalTier {
  const order: MedalTier[] = ['perfect', 'gold', 'silver', 'bronze'];
  for (const tier of order) {
    if (meets(stats, medals[tier])) return tier;
  }
  return 'bronze';
}

export function describeMedal(req: MedalReq): string {
  const parts: string[] = [];
  if (req.maxRotations === 0) parts.push('no rotations');
  else if (req.maxRotations === 1) parts.push('1 rotation');
  else if (req.maxRotations != null) parts.push(`${req.maxRotations} rotations or fewer`);
  if (req.maxTime != null) parts.push(`under ${trimTime(req.maxTime)}`);
  if (req.allCollectibles) parts.push('every star');
  if (req.noWallContact) parts.push('no wall contact');
  if (req.noStain) parts.push('avoid the dust');
  if (req.finishDir != null) {
    const names = ['down', 'left', 'up', 'right'] as const;
    parts.push(`finish pulling ${names[req.finishDir]}`);
  }
  return parts.join(' · ') || 'Finish the chamber';
}

function trimTime(t: number): string {
  return Number.isInteger(t) ? `${t}s` : `${t.toFixed(1)}s`;
}

export function betterMedal(a: MedalTier | null, b: MedalTier | null): MedalTier | null {
  if (!a) return b;
  if (!b) return a;
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

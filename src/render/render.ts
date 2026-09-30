import { dirVector, type Dir } from '../core/types';
import { laserHot, laserWarm, fieldCenter, solidAt, type SimState } from '../physics/sim';
import type { Mote } from '../fx/particles';
import { worldById, type LevelDef, type WorldDef } from '../level/types';
import type { SolidDef } from '../level/types';

export interface Camera {
  scale: number;
  ox: number;
  oy: number;
}

export interface Ripple {
  x: number;
  y: number;
  t: number;
  ccw: boolean;
}

export interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

export interface DrawInput {
  cssW: number;
  cssH: number;
  dpr: number;
  level: LevelDef;
  sim: SimState;
  motes: Mote[];
  trail: { x: number; y: number }[];
  predict: { x: number; y: number }[];
  ghost: { x: number; y: number } | null;
  arrow: number;
  squash: number;
  impactAngle: number;
  flash: number;
  near: number;
  skin: string;
  trailStyle: string;
  gravStyle: string;
  reducedVfx: boolean;
  strongPatterns: boolean;
  showHints: boolean;
  now: number;
  intro: number;
  kickX: number;
  kickY: number;
  orderText: string;
  /** Camera roll in radians; leans the chamber toward a new pull. */
  lean: number;
  /** Smoothed world-space gravity direction, unit length. */
  gravX: number;
  gravY: number;
  /** Sweep of light across the chamber after a turn, 0..1 (1 = done). */
  wave: number;
  waveDir: Dir;
  ripples: Ripple[];
  edgeL: number;
  edgeR: number;
  dialPulse: number;
  spin: number;
  ballX: number;
  ballY: number;
  ballScale: number;
  ballAlpha: number;
  /** Respawn materialize, 0..1 (1 = settled). */
  spawnFx: number;
  /** Chamber reveal on entry, 0..1. */
  reveal: number;
  skyX: number;
  skyY: number;
  pops: Pop[];
  worldLabel: string;
}

const INK = '#f3efe4';
const GOLD = '#f0d78c';
const GOAL = '#f0e2c0';

export function fitCamera(level: LevelDef, cssW: number, cssH: number, kickX: number, kickY: number): Camera {
  const padTop = 132;
  const padBottom = 30;
  const padX = 18;
  const scale = Math.min((cssW - padX * 2) / level.w, (cssH - padTop - padBottom) / level.h);
  const ox = (cssW - level.w * scale) / 2 + kickX;
  const oy = padTop + (cssH - padTop - padBottom - level.h * scale) / 2 + kickY;
  return { scale, ox, oy };
}

function worldToScreen(cam: Camera, x: number, y: number, h: number): [number, number] {
  return [cam.ox + x * cam.scale, cam.oy + (h - y) * cam.scale];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawFrame(ctx: CanvasRenderingContext2D, view: DrawInput): void {
  const { cssW, cssH, dpr, level, sim } = view;
  const world = worldById(level.world || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const cam = fitCamera(level, cssW, cssH, view.kickX, view.kickY);
  paintSky(ctx, cssW, cssH, world, view);

  // Everything inside the chamber shares one transform so the room can lean and settle.
  ctx.save();
  const cx = cam.ox + (level.w * cam.scale) / 2;
  const cy = cam.oy + (level.h * cam.scale) / 2;
  const settle = 0.94 + 0.06 * easeOutCubic(view.reveal);
  ctx.translate(cx, cy);
  ctx.rotate(view.lean);
  ctx.scale(settle, settle);
  ctx.translate(-cx, -cy);
  paintChamber(ctx, cam, level, world, view);
  paintWave(ctx, cam, level, world, view);
  paintZones(ctx, cam, level, view.now);
  paintFields(ctx, cam, level, sim, view.now, world);
  paintHazards(ctx, cam, level, view.strongPatterns, view.now);
  paintSolids(ctx, cam, level, sim, world, view);
  paintLasers(ctx, cam, level, sim.time, view.now);
  paintProps(ctx, cam, level, sim, view.now, world);
  paintPredict(ctx, cam, level, view.predict, world);
  if (view.ghost) paintGhost(ctx, cam, level, view.ghost, view.now);
  paintMotes(ctx, cam, level, view.motes, view.gravStyle, world);
  paintTrail(ctx, cam, level, view.trail, view.trailStyle, world, view.now);
  paintBall(ctx, cam, level, sim, view, world);
  paintPops(ctx, cam, level, view.pops);
  ctx.restore();

  if (view.reveal < 1) {
    ctx.globalAlpha = 1 - easeOutCubic(view.reveal);
    ctx.fillStyle = world.bg0;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
  paintVignette(ctx, cssW, cssH);
  paintTouch(ctx, cssW, cssH, view, world);
  paintDial(ctx, cssW, view, world, sim);
  if (view.intro > 0.02) paintIntro(ctx, cssW, view, world);
  if (view.showHints) paintHints(ctx, cssW, cssH, view.now, world);
  if (view.flash > 0.01) {
    const g = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.2, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.75);
    g.addColorStop(0, `rgba(196, 92, 74, ${view.flash * 0.08})`);
    g.addColorStop(1, `rgba(196, 92, 74, ${view.flash * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }
  if (view.near > 0.01) {
    const g = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.35, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.7);
    g.addColorStop(0, 'rgba(240, 226, 192, 0)');
    g.addColorStop(1, `rgba(240, 226, 192, ${view.near * 0.28})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }
}

// ---------------------------------------------------------------- backdrop

function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, world: WorldDef, view: DrawInput): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, world.bg0);
  g.addColorStop(0.55, world.bg1);
  g.addColorStop(1, world.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const now = view.now;
  const big = Math.max(w, h);
  for (let i = 0; i < 3; i++) {
    const nx = w * (0.2 + i * 0.3) + Math.sin(now * 0.07 + i * 2) * w * 0.08 + view.skyX * (4 + i * 3);
    const ny = h * (0.22 + (i === 1 ? 0.36 : i * 0.18)) + Math.cos(now * 0.05 + i) * h * 0.05 - view.skyY * (4 + i * 3);
    const rad = big * (0.38 + i * 0.1);
    const wash = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad);
    wash.addColorStop(0, hexAlpha(i === 1 ? world.accent : world.accent2, 0.1));
    wash.addColorStop(1, hexAlpha(world.bg0, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  }
  // Three depths of stars, drifting against the pull so the sky reads as falling past.
  ctx.fillStyle = INK;
  for (let i = 0; i < 72; i++) {
    const depth = i % 3 === 0 ? 1 : i % 3 === 1 ? 0.55 : 0.25;
    const bx = hash01(i * 7.13) * w;
    const by = hash01(i * 3.71 + 11) * h;
    const sx = wrap(bx - view.skyX * 22 * depth, w);
    const sy = wrap(by + view.skyY * 22 * depth, h);
    const tw = 0.25 + (Math.sin(now * (0.6 + depth) + i * 1.7) * 0.5 + 0.5) * 0.45 * depth + 0.1;
    const size = depth === 1 ? 1.7 : depth > 0.5 ? 1.2 : 0.9;
    ctx.globalAlpha = tw;
    ctx.fillRect(sx, sy, size, size);
  }
  ctx.globalAlpha = 1;
}

function paintVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.35, w / 2, h * 0.52, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function paintChamber(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, world: WorldDef, view: DrawInput): void {
  const [x, y] = worldToScreen(cam, 0, level.h, level.h);
  const w = level.w * cam.scale;
  const h = level.h * cam.scale;
  ctx.save();
  ctx.shadowColor = hexAlpha(world.accent, 0.16);
  ctx.shadowBlur = 34;
  const fill = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
  fill.addColorStop(0, hexAlpha(world.bg1, 0.82));
  fill.addColorStop(1, hexAlpha(world.bg0, 0.9));
  ctx.fillStyle = fill;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 18);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 18);
  ctx.clip();
  // Blueprint grid: one line per world unit, so speed is legible against it.
  ctx.strokeStyle = hexAlpha(world.accent, 0.045);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 1; gx < level.w; gx++) {
    const sx = Math.round(x + gx * cam.scale) + 0.5;
    ctx.moveTo(sx, y);
    ctx.lineTo(sx, y + h);
  }
  for (let gy = 1; gy < level.h; gy++) {
    const sy = Math.round(y + gy * cam.scale) + 0.5;
    ctx.moveTo(x, sy);
    ctx.lineTo(x + w, sy);
  }
  ctx.stroke();

  // The floor of the room glows: whichever wall the pull points at.
  const band = Math.min(w, h) * 0.28;
  // weight, then a gradient running from that wall inward.
  const sides: [number, number, number, number, number][] = [
    [Math.max(0, -view.gravY), x, y + h, x, y + h - band],
    [Math.max(0, view.gravY), x, y, x, y + band],
    [Math.max(0, -view.gravX), x, y, x + band, y],
    [Math.max(0, view.gravX), x + w, y, x + w - band, y],
  ];
  for (const [wgt, x0, y0, x1, y1] of sides) {
    if (wgt < 0.02) continue;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, hexAlpha(world.accent, 0.16 * wgt));
    g.addColorStop(1, hexAlpha(world.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  ctx.strokeStyle = hexAlpha(world.accent, 0.24);
  ctx.lineWidth = 1;
  roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 18);
  ctx.stroke();
}

function paintWave(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, world: WorldDef, view: DrawInput): void {
  if (view.wave >= 1) return;
  const [x, y] = worldToScreen(cam, 0, level.h, level.h);
  const w = level.w * cam.scale;
  const h = level.h * cam.scale;
  const [dx, dy] = dirVector(view.waveDir);
  const sdx = dx;
  const sdy = -dy;
  const p = easeOutCubic(view.wave);
  const fade = 1 - view.wave;
  // Band travels from the wall behind the pull to the wall it points at.
  const span = Math.abs(sdx) * w + Math.abs(sdy) * h;
  const cx = x + w / 2 - sdx * span * 0.5;
  const cy = y + h / 2 - sdy * span * 0.5;
  const px = cx + sdx * span * (p * 1.3 - 0.15);
  const py = cy + sdy * span * (p * 1.3 - 0.15);
  const thick = span * 0.22;
  const g = ctx.createLinearGradient(px - sdx * thick, py - sdy * thick, px + sdx * thick * 0.35, py + sdy * thick * 0.35);
  g.addColorStop(0, hexAlpha(world.accent, 0));
  g.addColorStop(0.8, hexAlpha(world.accent, 0.16 * fade));
  g.addColorStop(1, hexAlpha(world.accent, 0));
  ctx.save();
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 18);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Chevrons riding the band, pointing with the new pull.
  ctx.strokeStyle = hexAlpha(world.accent, 0.35 * fade);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const across = Math.abs(sdx) > 0.5 ? h : w;
  const n = Math.max(3, Math.round(across / 70));
  const ang = Math.atan2(sdy, sdx);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const ox = px + -sdy * t * across;
    const oy = py + sdx * t * across;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(2, 0);
    ctx.lineTo(-6, 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- level furniture

function paintZones(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, now: number): void {
  for (const z of level.zones) {
    const [x, y] = worldToScreen(cam, z.x, z.y + z.h, level.h);
    const w = z.w * cam.scale;
    const h = z.h * cam.scale;
    const tint = zoneTint(z.mode, z.mul);
    ctx.fillStyle = hexAlpha(tint, 0.075);
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    ctx.clip();
    if ((z.mode === 'override' && z.dir != null) || z.mode === 'conveyor') {
      // Moving chevrons show where this zone pushes.
      let vx = 0;
      let vy = 0;
      if (z.mode === 'override' && z.dir != null) [vx, vy] = dirVector(z.dir);
      else {
        const l = Math.hypot(z.flowX ?? 0, z.flowY ?? 0) || 1;
        vx = (z.flowX ?? 0) / l;
        vy = (z.flowY ?? 0) / l;
      }
      const ang = Math.atan2(-vy, vx);
      ctx.strokeStyle = hexAlpha(tint, 0.16);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      const step = 40;
      const off = (now * 22) % step;
      const cxz = x + w / 2;
      const cyz = y + h / 2;
      const ext = Math.hypot(w, h) / 2 + step;
      ctx.translate(cxz, cyz);
      ctx.rotate(ang);
      for (let a = -ext; a < ext; a += step) {
        for (let b = -ext; b < ext; b += step * 1.2) {
          ctx.beginPath();
          ctx.moveTo(a + off - 4, b - 5);
          ctx.lineTo(a + off + 1, b);
          ctx.lineTo(a + off - 4, b + 5);
          ctx.stroke();
        }
      }
    } else if (z.mode === 'zero') {
      ctx.fillStyle = hexAlpha(tint, 0.35);
      for (let i = 0; i < 10; i++) {
        const px = x + hash01(i * 5.1 + z.x) * w;
        const py = y + wrap(hash01(i * 2.3 + z.y) * h - now * (4 + (i % 3) * 3), h);
        ctx.globalAlpha = 0.3 + 0.3 * Math.sin(now * 2 + i);
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = hexAlpha(tint, 0.32);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -now * 12;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    const mark = zoneMark(z.mode, z.mul);
    if (mark) label(ctx, mark, x + 6, y + 6, tint);
    if (z.mode === 'override' && z.dir != null) drawMiniArrow(ctx, x + (mark ? 20 : 14), y + 14, z.dir);
  }
}

function zoneTint(mode: string, mul?: number): string {
  if (mode === 'mul' && (mul ?? 1) > 1) return '#e0a15a';
  if (mode === 'mul') return '#b7d8c8';
  if (mode === 'mirror') return '#e4c2d4';
  if (mode === 'stain') return '#c45c4a';
  if (mode === 'override') return '#9eb7d8';
  if (mode === 'conveyor') return '#e0a15a';
  if (mode === 'lock') return '#f3efe4';
  return '#d5e6ea';
}

function zoneMark(mode: string, mul?: number): string {
  if (mode === 'zero') return 'zero';
  if (mode === 'mirror') return 'mirror';
  if (mode === 'lock') return 'locked';
  if (mode === 'stain') return 'dust';
  if (mode === 'conveyor') return 'flow';
  if (mode === 'mul') return (mul ?? 1) > 1 ? 'heavy' : 'soft';
  return '';
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tint: string): void {
  ctx.font = '600 9px Outfit, sans-serif';
  const tw = ctx.measureText(text.toUpperCase()).width + 10;
  ctx.fillStyle = 'rgba(9,8,15,0.6)';
  roundRect(ctx, x, y, tw, 15, 7.5);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(tint, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = hexAlpha(tint, 0.9);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), x + 5, y + 8);
  ctx.textBaseline = 'alphabetic';
}

function paintFields(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, now: number, world: WorldDef): void {
  for (const f of level.fields) {
    const [fx, fy] = fieldCenter(f, sim.time);
    const [sx, sy] = worldToScreen(cam, fx, fy, level.h);
    const inf = f.influence * cam.scale;
    if (f.kind === 'blackhole') {
      const hor = (f.horizon ?? 0.5) * cam.scale;
      const halo = ctx.createRadialGradient(sx, sy, hor, sx, sy, inf);
      halo.addColorStop(0, 'rgba(224,122,106,0.22)');
      halo.addColorStop(0.35, 'rgba(80,20,24,0.16)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.fill();
      // Accretion: arcs spiral inward, faster near the horizon.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const u = (now * 0.35 + i / 7) % 1;
        const rad = hor + (inf * 0.8 - hor) * (1 - u);
        const a0 = now * (1.2 + u * 2.5) + i * 2.1;
        ctx.strokeStyle = `rgba(224,122,106,${0.5 * u})`;
        ctx.lineWidth = 1 + u * 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, a0, a0 + 0.9 + u);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#050406';
      ctx.beginPath();
      ctx.arc(sx, sy, hor, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(240,150,130,${0.75 + Math.sin(now * 4) * 0.15})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (f.kind === 'planet') {
      const core = (f.core ?? 0.6) * cam.scale;
      const ring = ctx.createRadialGradient(sx, sy, core, sx, sy, inf);
      ring.addColorStop(0, hexAlpha(world.accent, 0.18));
      ring.addColorStop(1, hexAlpha(world.accent, 0));
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(world.accent, 0.12);
      ctx.setLineDash([2, 8]);
      ctx.lineDashOffset = -now * 10;
      for (const k of [0.55, 0.8]) {
        ctx.beginPath();
        ctx.arc(sx, sy, core + (inf - core) * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      drawGlow(ctx, sx, sy, core * 2.2, world.accent, 0.45);
      const body = ctx.createRadialGradient(sx - core * 0.35, sy - core * 0.4, core * 0.08, sx, sy, core);
      body.addColorStop(0, '#f8ecd4');
      body.addColorStop(0.45, world.accent);
      body.addColorStop(1, '#2a1a12');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(sx, sy, core, 0, Math.PI * 2);
      ctx.fill();
      // Moon on a slow orbit, purely decorative.
      const ma = now * 0.6;
      drawGlow(ctx, sx + Math.cos(ma) * core * 1.5, sy + Math.sin(ma) * core * 0.5, 6, INK, 0.6);
    } else if (f.kind === 'repulsor' || f.kind === 'magnet' || f.kind === 'well') {
      const color = f.kind === 'magnet' ? '#d6c4f2' : f.kind === 'repulsor' ? '#e0a15a' : '#b7d8c8';
      const core = (f.core ?? 0.35) * cam.scale;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        let u = (now * 0.5 + i / 3) % 1;
        if (f.kind !== 'repulsor') u = 1 - u;
        const rad = core + (inf - core) * u;
        ctx.strokeStyle = hexAlpha(color, 0.35 * Math.sin(u * Math.PI));
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = hexAlpha(color, 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.stroke();
      drawGlow(ctx, sx, sy, core * 2.4, color, 0.5);
      ctx.fillStyle = '#12101a';
      ctx.beginPath();
      ctx.arc(sx, sy, core, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(color, 0.85);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = hexAlpha(color, 0.9);
      ctx.font = '600 9px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((f.kind === 'magnet' ? 'magnet' : f.kind === 'repulsor' ? 'push' : 'well').toUpperCase(), sx, sy - inf - 6);
    }
  }
}

function paintHazards(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, strong: boolean, now: number): void {
  const pulse = 0.55 + Math.sin(now * 3.2) * 0.2;
  for (const hz of level.hazards) {
    const [x, y] = worldToScreen(cam, hz.x, hz.y + hz.h, level.h);
    const w = hz.w * cam.scale;
    const h = hz.h * cam.scale;
    ctx.save();
    ctx.shadowColor = `rgba(224,90,70,${0.45 * pulse})`;
    ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#1e0c0c');
    g.addColorStop(1, '#0a0608');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, w, h, 3);
    ctx.clip();
    ctx.strokeStyle = strong ? 'rgba(243,239,228,0.7)' : `rgba(224,110,90,${0.25 + pulse * 0.25})`;
    ctx.lineWidth = strong ? 2 : 1.5;
    const step = strong ? 7 : 10;
    const off = (now * 10) % step;
    ctx.beginPath();
    for (let i = -h - step; i < w + h; i += step) {
      ctx.moveTo(x + i + off, y + h);
      ctx.lineTo(x + i + off + h, y);
    }
    ctx.stroke();
    if (hz.style === 'spike') {
      const n = Math.max(2, Math.floor(w / 10));
      const sg = ctx.createLinearGradient(0, y + h, 0, y);
      sg.addColorStop(0, '#6a2a24');
      sg.addColorStop(1, '#ffd2c6');
      ctx.fillStyle = sg;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const bx = x + (i + 0.5) * (w / n);
        ctx.moveTo(bx - 4.5, y + h);
        ctx.lineTo(bx, y + 2);
        ctx.lineTo(bx + 4.5, y + h);
      }
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(224,110,90,${0.6 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
    ctx.stroke();
  }
}

function paintSolids(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, world: WorldDef, view: DrawInput): void {
  const gx = view.gravX;
  const gy = view.gravY;
  const rects = level.solids.map((def, i) => {
    if (sim.broken[i]) return null;
    const r = solidAt(def, sim.time);
    const [x, y] = worldToScreen(cam, r.x, r.y + r.h, level.h);
    return { def, x, y, w: r.w * cam.scale, h: r.h * cam.scale };
  });

  // Drop shadows fall with the pull; a small cue that the room has a down.
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  const sx = gx * 5;
  const sy = -gy * 5;
  for (const r of rects) {
    if (!r || r.def.phase) continue;
    roundRect(ctx, r.x + sx, r.y + sy, r.w, r.h, Math.min(8, r.w / 4, r.h / 4));
    ctx.fill();
  }

  // Lit faces: the surfaces the ball would land on, weighted by the (animated) pull.
  const faceTop = Math.max(0, -gy);
  const faceBottom = Math.max(0, gy);
  const faceLeft = Math.max(0, gx);
  const faceRight = Math.max(0, -gx);

  for (const r of rects) {
    if (!r) continue;
    const { def, x, y, w, h } = r;
    const rad = Math.min(8, w / 4, h / 4);
    const style = solidStyle(def, world);
    const body = ctx.createLinearGradient(x, y, x, y + h);
    body.addColorStop(0, style.top);
    body.addColorStop(1, style.fill);
    ctx.fillStyle = body;
    roundRect(ctx, x, y, w, h, rad);
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, rad);
    ctx.clip();
    matDetail(ctx, def, x, y, w, h, view.now);
    const t = Math.max(3, Math.min(w, h) * 0.18);
    const lit = style.edge;
    faceStrip(ctx, x, y, w, t, 'down', lit, faceTop);
    faceStrip(ctx, x, y + h - t, w, t, 'up', lit, faceBottom);
    faceStrip(ctx, x, y, t, h, 'right', lit, faceLeft);
    faceStrip(ctx, x + w - t, y, t, h, 'left', lit, faceRight);
    ctx.restore();
    if (def.fragile) {
      ctx.strokeStyle = 'rgba(240,180,110,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + 3);
      ctx.lineTo(x + w * 0.45, y + h * 0.45);
      ctx.lineTo(x + w * 0.38, y + h * 0.6);
      ctx.lineTo(x + w * 0.62, y + h - 3);
      ctx.moveTo(x + w * 0.45, y + h * 0.45);
      ctx.lineTo(x + w * 0.7, y + h * 0.3);
      ctx.stroke();
    }
    ctx.strokeStyle = hexAlpha(style.edge, def.phase ? 0.55 : 0.3);
    ctx.lineWidth = 1;
    if (def.phase) ctx.setLineDash([4, 4]);
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const gate of level.gates) {
    const open = sim.gravityDir === gate.openDir;
    const [x, y] = worldToScreen(cam, gate.x, gate.y + gate.h, level.h);
    const w = gate.w * cam.scale;
    const h = gate.h * cam.scale;
    if (open) {
      ctx.fillStyle = 'rgba(183,216,200,0.07)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(183,216,200,0.7)';
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -view.now * 14;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    } else {
      ctx.fillStyle = 'rgba(20,18,28,0.95)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(243,239,228,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const vertical = h > w;
      const n = Math.max(2, Math.floor((vertical ? h : w) / 9));
      for (let i = 1; i < n; i++) {
        if (vertical) {
          ctx.moveTo(x, y + (h * i) / n);
          ctx.lineTo(x + w, y + (h * i) / n);
        } else {
          ctx.moveTo(x + (w * i) / n, y);
          ctx.lineTo(x + (w * i) / n, y + h);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(243,239,228,0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    drawMiniArrow(ctx, x + w / 2, y + h / 2, gate.openDir, open ? '#b7d8c8' : INK);
  }
}

function faceStrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, inward: 'up' | 'down' | 'left' | 'right', color: string, weight: number): void {
  if (weight < 0.02) return;
  const g = inward === 'down'
    ? ctx.createLinearGradient(0, y, 0, y + h)
    : inward === 'up'
      ? ctx.createLinearGradient(0, y + h, 0, y)
      : inward === 'right'
        ? ctx.createLinearGradient(x, 0, x + w, 0)
        : ctx.createLinearGradient(x + w, 0, x, 0);
  g.addColorStop(0, hexAlpha(color, 0.95 * weight));
  g.addColorStop(0.4, hexAlpha(color, 0.5 * weight));
  g.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function matDetail(ctx: CanvasRenderingContext2D, def: SolidDef, x: number, y: number, w: number, h: number, now: number): void {
  if (def.phase) {
    ctx.strokeStyle = 'rgba(213,230,234,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const off = (now * 8) % 8;
    for (let k = -h; k < w; k += 8) {
      ctx.moveTo(x + k + off, y + h);
      ctx.lineTo(x + k + off + h * 0.6, y);
    }
    ctx.stroke();
  } else if (def.mat === 'ice') {
    // A gleam that crosses the surface now and then.
    const u = ((now * 0.35 + (x + y) * 0.003) % 1.6) - 0.3;
    const gx = x + u * (w + h);
    const g = ctx.createLinearGradient(gx - 20, y, gx + 20, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(235,248,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else if (def.mat === 'bounce') {
    ctx.fillStyle = 'rgba(224,161,90,0.22)';
    for (let i = x + 6; i < x + w - 2; i += 9) {
      for (let j = y + 6; j < y + h - 2; j += 9) {
        ctx.beginPath();
        ctx.arc(i, j, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (def.mat === 'metal') {
    ctx.strokeStyle = 'rgba(213,216,224,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = y + 3; j < y + h; j += 3) {
      ctx.moveTo(x, j);
      ctx.lineTo(x + w, j);
    }
    ctx.stroke();
  } else if (def.mat === 'sticky') {
    ctx.fillStyle = 'rgba(141,115,95,0.35)';
    for (let i = 0; i < Math.max(3, (w * h) / 180); i++) {
      const px = x + hash01(i * 3.3 + x) * w;
      const py = y + hash01(i * 7.7 + y) * h;
      ctx.beginPath();
      ctx.arc(px, py, 1 + hash01(i + w) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function solidStyle(def: SolidDef, world: WorldDef): { fill: string; top: string; edge: string } {
  if (def.phase) return { fill: 'rgba(20,28,32,0.3)', top: 'rgba(40,56,64,0.3)', edge: '#d5e6ea' };
  if (def.mat === 'ice') return { fill: '#142026', top: '#22343c', edge: '#d5e6ea' };
  if (def.mat === 'bounce') return { fill: '#261c14', top: '#3a2a1c', edge: '#f0b56a' };
  if (def.mat === 'sticky') return { fill: '#18130f', top: '#241c16', edge: '#a08468' };
  if (def.mat === 'metal') return { fill: '#171a22', top: '#2a2f3a', edge: '#e2e5ec' };
  return { fill: mix(world.bg0, '#1a1824', 0.7), top: mix(world.bg2, '#262332', 0.6), edge: world.accent };
}

function paintLasers(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, time: number, now: number): void {
  for (const laser of level.lasers) {
    const hot = laserHot(laser, time);
    const warm = laserWarm(laser, time);
    const [x, y] = worldToScreen(cam, laser.x, laser.y + laser.h, level.h);
    const w = laser.w * cam.scale;
    const h = laser.h * cam.scale;
    const vertical = h >= w;
    // Emitters stay visible so the beam's lane is always readable.
    ctx.fillStyle = '#2a1a1c';
    ctx.strokeStyle = 'rgba(224,122,106,0.6)';
    ctx.lineWidth = 1;
    const e = 5;
    if (vertical) {
      ctx.fillRect(x - 2, y - e, w + 4, e);
      ctx.fillRect(x - 2, y + h, w + 4, e);
    } else {
      ctx.fillRect(x - e, y - 2, e, h + 4);
      ctx.fillRect(x + w, y - 2, e, h + 4);
    }
    if (!hot && !warm) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (hot) {
      const flick = 0.85 + Math.sin(now * 60) * 0.08 + Math.sin(now * 23) * 0.07;
      const pad = 7;
      const g = vertical
        ? ctx.createLinearGradient(x - pad, 0, x + w + pad, 0)
        : ctx.createLinearGradient(0, y - pad, 0, y + h + pad);
      g.addColorStop(0, 'rgba(224,90,70,0)');
      g.addColorStop(0.35, `rgba(224,110,90,${0.55 * flick})`);
      g.addColorStop(0.5, `rgba(255,240,232,${0.95 * flick})`);
      g.addColorStop(0.65, `rgba(224,110,90,${0.55 * flick})`);
      g.addColorStop(1, 'rgba(224,90,70,0)');
      ctx.fillStyle = g;
      if (vertical) ctx.fillRect(x - pad, y, w + pad * 2, h);
      else ctx.fillRect(x, y - pad, w, h + pad * 2);
    } else {
      const blink = Math.sin(now * 28) > 0 ? 0.5 : 0.22;
      ctx.strokeStyle = `rgba(224,122,106,${blink})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h);
      } else {
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function paintProps(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, now: number, world: WorldDef): void {
  for (let i = 0; i < level.stars.length; i++) {
    if (sim.stars[i]) continue;
    const s = level.stars[i];
    const [x, y0] = worldToScreen(cam, s.x, s.y, level.h);
    const y = y0 + Math.sin(now * 2.4 + i) * 2.5;
    const r = Math.max(7, 0.26 * cam.scale);
    drawGlow(ctx, x, y, r * 3.2, GOLD, 0.45 + Math.sin(now * 3 + i) * 0.12);
    drawStar(ctx, x, y, r, GOLD, now * 0.8 + i);
    // Occasional glint.
    const gl = Math.max(0, Math.sin(now * 1.3 + i * 2.2) - 0.92) / 0.08;
    if (gl > 0) {
      ctx.strokeStyle = `rgba(255,250,230,${gl})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - r * 1.8, y);
      ctx.lineTo(x + r * 1.8, y);
      ctx.moveTo(x, y - r * 1.8);
      ctx.lineTo(x, y + r * 1.8);
      ctx.stroke();
    }
  }
  for (let i = 0; i < level.fragments.length; i++) {
    if (sim.fragments[i]) continue;
    const s = level.fragments[i];
    const [x, y0] = worldToScreen(cam, s.x, s.y, level.h);
    const y = y0 + Math.sin(now * 1.8 + i) * 2;
    drawGlow(ctx, x, y, 22, '#d5e6ea', 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.cos(now * 1.6), 1);
    ctx.fillStyle = 'rgba(213,230,234,0.18)';
    ctx.strokeStyle = '#e6f2f5';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-5.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const sw of level.switches) {
    const [x, y] = worldToScreen(cam, sw.x, sw.y, level.h);
    const r = sw.r * cam.scale;
    drawGlow(ctx, x, y, r * 2, world.accent, 0.25 + Math.sin(now * 2.5) * 0.08);
    ctx.fillStyle = 'rgba(9,8,15,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = world.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = hexAlpha(world.accent, 0.4);
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = now * (sw.cycle ? 12 : -8);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    if (sw.set != null) drawMiniArrow(ctx, x, y, sw.set);
    else {
      ctx.strokeStyle = world.accent2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, -Math.PI * 0.2, Math.PI * 1.3);
      ctx.stroke();
    }
  }
  level.checkpoints.forEach((cp, i) => {
    const [x, y] = worldToScreen(cam, cp.x, cp.y, level.h);
    const next = !level.orderedCheckpoints || cp.order === sim.order + 1;
    const done = level.orderedCheckpoints ? cp.order <= sim.order : false;
    const r = cp.r * cam.scale;
    if (next && !done) drawGlow(ctx, x, y, r * 2, GOAL, 0.25 + Math.sin(now * 4) * 0.1);
    ctx.strokeStyle = done ? 'rgba(183,216,200,0.55)' : next ? GOAL : 'rgba(243,239,228,0.25)';
    ctx.lineWidth = next ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (done) {
      ctx.fillStyle = 'rgba(183,216,200,0.15)';
      ctx.fill();
    }
    if (level.orderedCheckpoints) {
      ctx.fillStyle = done ? 'rgba(183,216,200,0.8)' : next ? GOAL : 'rgba(243,239,228,0.45)';
      ctx.font = '600 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${cp.order}`, x, y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    void i;
  });
  for (const p of level.portals) {
    const [x, y] = worldToScreen(cam, p.x, p.y, level.h);
    const r = p.r * cam.scale;
    drawGlow(ctx, x, y, r * 2.4, '#c9d4e8', 0.4);
    ctx.fillStyle = '#07070c';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = now * (1.6 + k * 0.7) * (k % 2 ? -1 : 1) + k * 2;
      ctx.strokeStyle = `rgba(201,212,232,${0.8 - k * 0.2})`;
      ctx.lineWidth = 2 - k * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 - k * 0.22), a, a + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (level.goal) paintGoal(ctx, cam, level, sim, now);
}

function paintGoal(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, now: number): void {
  const goal = level.goal;
  if (!goal) return;
  const open = !level.orderedCheckpoints || sim.order >= level.checkpoints.length;
  const a = open ? 1 : 0.35;
  if (goal.h && goal.h > 0) {
    const [x, y] = worldToScreen(cam, goal.x - goal.r, goal.y + goal.h, level.h);
    const w = goal.r * 2 * cam.scale;
    const h = goal.h * cam.scale;
    const glow = ctx.createLinearGradient(x, y, x + w, y);
    glow.addColorStop(0, 'rgba(240,226,192,0)');
    glow.addColorStop(0.5, `rgba(240,226,192,${0.22 * a})`);
    glow.addColorStop(1, 'rgba(240,226,192,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
    // Motes rising through the gate.
    ctx.fillStyle = GOAL;
    for (let i = 0; i < 10; i++) {
      const u = (now * 0.4 + hash01(i * 3.1)) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.7 * a;
      ctx.beginPath();
      ctx.arc(x + hash01(i * 9.7) * w, y + h - u * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(240,226,192,${0.85 * a})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    return;
  }
  const [x, y] = worldToScreen(cam, goal.x, goal.y, level.h);
  const r = goal.r * cam.scale;
  const breathe = 1 + Math.sin(now * 2.2) * 0.06;
  drawGlow(ctx, x, y, r * 2.6 * breathe, GOAL, 0.5 * a);
  const well = ctx.createRadialGradient(x, y, 0, x, y, r);
  well.addColorStop(0, `rgba(255,248,230,${0.35 * a})`);
  well.addColorStop(0.6, `rgba(240,226,192,${0.08 * a})`);
  well.addColorStop(1, 'rgba(240,226,192,0)');
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(240,226,192,${0.9 * a})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([r * 0.5, r * 0.28]);
  ctx.lineDashOffset = -now * 18;
  ctx.beginPath();
  ctx.arc(x, y, r * breathe, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([2, 6]);
  ctx.lineDashOffset = now * 10;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  // Motes spiralling in.
  if (open) {
    ctx.fillStyle = GOAL;
    for (let i = 0; i < 9; i++) {
      const u = (now * 0.45 + i / 9) % 1;
      const ang = i * 2.4 + u * 3.2;
      const rad = r * (1.9 - u * 1.7);
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.85;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 1.2 + u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = GOAL;
  ctx.globalAlpha = a;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- ball and its wake

function paintPredict(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, pts: { x: number; y: number }[], world: WorldDef): void {
  if (!pts.length) return;
  ctx.fillStyle = world.accent2;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = worldToScreen(cam, pts[i].x, pts[i].y, level.h);
    const u = i / pts.length;
    ctx.globalAlpha = 0.55 * (1 - u) + 0.05;
    ctx.beginPath();
    ctx.arc(x, y, 2.4 - u * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintGhost(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, g: { x: number; y: number }, now: number): void {
  const [x, y] = worldToScreen(cam, g.x, g.y, level.h);
  const r = 0.32 * cam.scale;
  ctx.fillStyle = 'rgba(240,226,192,0.08)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,226,192,0.5)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = -now * 10;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function paintMotes(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, motes: Mote[], style: string, world: WorldDef): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const m of motes) {
    if (!m.on) continue;
    const [x, y] = worldToScreen(cam, m.x, m.y, level.h);
    const a = Math.max(0, m.life / m.max);
    if (m.kind === 'dust') {
      // Dust fades in and out over its life so recycling never pops.
      const env = Math.sin(a * Math.PI);
      const sp = Math.hypot(m.vx, m.vy);
      if (style === 'grav-spore') {
        ctx.globalAlpha = 0.28 * env;
        ctx.fillStyle = world.accent2;
        ctx.beginPath();
        ctx.arc(x, y, m.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const color = style === 'grav-ember' ? '#e0a15a' : style === 'grav-aurora' ? '#8fd6c0' : m.color;
      const stretch = (style === 'grav-filament' ? 5 : style === 'grav-aurora' ? 3.4 : 1.6) * Math.min(1, sp / 2) * cam.scale * 0.12 + 0.5;
      ctx.globalAlpha = (style === 'grav-ember' ? 0.5 : style === 'grav-aurora' ? 0.44 : 0.32) * env;
      ctx.strokeStyle = color;
      ctx.lineWidth = m.size * (style === 'grav-filament' ? 0.7 : 1);
      const nx = sp > 1e-3 ? m.vx / sp : 0;
      const ny = sp > 1e-3 ? -m.vy / sp : 0;
      ctx.beginPath();
      ctx.moveTo(x - nx * stretch, y - ny * stretch);
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
    } else if (m.kind === 'ring') {
      const u = 1 - a;
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 1 + a * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, easeOutCubic(u) * m.size + 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.kind === 'glow') {
      drawGlow(ctx, x, y, m.size * (0.6 + (1 - a) * 0.6), m.color, a * 0.8);
    } else if (m.kind === 'shard') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(m.rot);
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(0, -m.size);
      ctx.lineTo(m.size * 0.7, m.size * 0.6);
      ctx.lineTo(-m.size * 0.6, m.size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // Sparks draw as short streaks along their velocity.
      const sp = Math.hypot(m.vx, m.vy);
      const k = Math.min(1.2, sp * 0.04) * cam.scale * 0.35;
      ctx.globalAlpha = a;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.size;
      const nx = sp > 1e-3 ? m.vx / sp : 0;
      const ny = sp > 1e-3 ? -m.vy / sp : 0;
      ctx.beginPath();
      ctx.moveTo(x - nx * k, y - ny * k);
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function paintTrail(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, trail: { x: number; y: number }[], style: string, world: WorldDef, now: number): void {
  if (trail.length < 2) return;
  const pts = trail.map((p) => worldToScreen(cam, p.x, p.y, level.h));
  const n = pts.length;
  const ballR = 0.32 * cam.scale;
  const width = style === 'trail-ribbon' ? ballR * 1.6 : style === 'trail-comet' ? ballR * 1.3 : style === 'trail-ion' ? 1.6 : style === 'trail-thread' ? ballR * 0.5 : ballR * 0.9;
  const color = style === 'trail-ember' ? '#e07a6a' : style === 'trail-comet' ? '#eec766' : world.accent;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  // Tapered ribbon: each segment thinner and fainter toward the tail.
  for (let i = 1; i < n; i++) {
    const u = i / (n - 1);
    ctx.globalAlpha = Math.pow(u, 1.4) * (style === 'trail-ribbon' || style === 'trail-comet' ? 0.55 : 0.45);
    ctx.lineWidth = Math.max(0.6, width * u);
    // Prism walks the hue wheel along the line, and slowly over time.
    if (style === 'trail-prism') ctx.strokeStyle = `hsl(${(i * 14 + now * 90) % 360}, 72%, 74%)`;
    let [x0, y0] = pts[i - 1];
    let [x1, y1] = pts[i];
    if (style === 'trail-ion') {
      const j = (1 - u) * 4;
      x0 += Math.sin(now * 40 + i) * j;
      y0 += Math.cos(now * 37 + i) * j;
      x1 += Math.sin(now * 40 + i + 1) * j;
      y1 += Math.cos(now * 37 + i + 1) * j;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  if (style === 'trail-ember' || style === 'trail-dust' || style === 'trail-comet') {
    ctx.fillStyle = style === 'trail-ember' ? '#f0a070' : style === 'trail-comet' ? '#fff3c8' : world.accent2;
    for (let i = 0; i < n; i += 2) {
      const [x, y] = pts[i];
      const u = i / n;
      ctx.globalAlpha = u * 0.8;
      const jx = (hash01(i * 3.3 + Math.floor(now * 12)) - 0.5) * 6 * (1 - u);
      const jy = (hash01(i * 5.1 + Math.floor(now * 12)) - 0.5) * 6 * (1 - u);
      ctx.beginPath();
      ctx.arc(x + jx, y + jy, (style === 'trail-dust' ? 1.4 : 2) * (0.5 + u), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintBall(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, view: DrawInput, world: WorldDef): void {
  if (view.ballAlpha <= 0.01 || view.ballScale <= 0.01) return;
  const b = sim.ball;
  const [x, y] = worldToScreen(cam, view.ballX, view.ballY, level.h);
  const spawn = view.spawnFx;
  const r = b.r * cam.scale * view.ballScale * (spawn < 1 ? easeOutBack(spawn) : 1);
  if (spawn < 1) {
    // Converging ring as the ball re-forms.
    const k = 1 - spawn;
    ctx.strokeStyle = hexAlpha(world.accent2, 0.9 * spawn);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, b.r * cam.scale * (1 + k * 3.5), 0, Math.PI * 2);
    ctx.stroke();
  }
  if (r <= 0.3) return;
  const [c0, c1, c2] = ballColors(view.skin, world);
  ctx.save();
  ctx.globalAlpha = view.ballAlpha;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, r * 3.4, c1, 0.32);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = view.ballAlpha;
  ctx.translate(x, y);
  // Stretch along velocity, squash along the last impact normal.
  const sp = Math.hypot(b.vx, b.vy);
  const st = view.squash < 0.97 ? 0 : Math.min(0.22, sp / Math.max(8, b.maxSpeed) * 0.26);
  if (st > 0.005) {
    const va = Math.atan2(-b.vy, b.vx);
    ctx.rotate(va);
    ctx.scale(1 + st, 1 / (1 + st));
    ctx.rotate(-va);
  }
  ctx.rotate(view.impactAngle);
  const flat = view.squash;
  ctx.scale(flat, 1 + (1 - flat) * 0.45);
  ctx.rotate(-view.impactAngle);

  const skin = view.skin;
  if (skin === 'ball-void') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0c070c';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.strokeStyle = '#e4c2d4';
    ctx.stroke();
    ctx.save();
    ctx.rotate(view.spin);
    ctx.strokeStyle = 'rgba(228,194,212,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 1.1);
    ctx.stroke();
    ctx.restore();
  } else if (skin === 'ball-geo') {
    ctx.save();
    ctx.rotate(view.spin);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.05);
    ctx.lineTo(r * 0.95, r * 0.62);
    ctx.lineTo(-r * 0.95, r * 0.62);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fff8e6');
    g.addColorStop(1, '#c8b890');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else {
    const grd = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grd.addColorStop(0, c0);
    grd.addColorStop(0.55, c1);
    grd.addColorStop(1, c2);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.rotate(view.spin);
    // A band that rolls with the ball, so rolling reads as rolling.
    if (skin === 'ball-planet') {
      ctx.strokeStyle = 'rgba(90,40,20,0.4)';
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.15);
      ctx.lineTo(r, -r * 0.15);
      ctx.moveTo(-r, r * 0.35);
      ctx.lineTo(r, r * 0.35);
      ctx.stroke();
    } else if (skin === 'ball-crystal') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(-r * 0.1, r);
      ctx.moveTo(r * 0.5, 0);
      ctx.lineTo(r, -r * 0.3);
      ctx.moveTo(-r, r * 0.1);
      ctx.lineTo(-r * 0.2, -r);
      ctx.stroke();
    } else if (skin === 'ball-axis') {
      ctx.strokeStyle = 'rgba(58,52,80,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (skin === 'ball-ancient') {
      ctx.strokeStyle = 'rgba(80,60,40,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Specular and rim stay fixed to the light, whatever the spin.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, Math.PI * 0.95, Math.PI * 1.6);
    ctx.stroke();
  }
  ctx.restore();
}

export function ballColors(skin: string, world: WorldDef): [string, string, string] {
  if (skin === 'ball-metal') return ['#f7f7f8', '#9aa0a8', '#3c414a'];
  if (skin === 'ball-crystal') return ['#f7fbff', '#b7ccea', '#6e86a8'];
  if (skin === 'ball-planet') return ['#f6e2cf', '#e0a15a', '#6a3a28'];
  if (skin === 'ball-plasma') return ['#fff6ea', '#e07a6a', '#6a2430'];
  if (skin === 'ball-ancient') return ['#f3ead6', '#cbb892', '#6d5b45'];
  if (skin === 'ball-aurora') return ['#f4fff8', '#8fd6c0', '#2f5a6a'];
  if (skin === 'ball-gilded') return ['#fff8e0', '#eec766', '#6a4a18'];
  if (skin === 'ball-axis') return ['#ffffff', '#f4f0ff', '#3a3450'];
  return ['#ffffff', world.accent2, '#4a5264'];
}

function paintPops(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, pops: Pop[]): void {
  ctx.textAlign = 'center';
  for (const p of pops) {
    const [x, y] = worldToScreen(cam, p.x, p.y, level.h);
    const u = p.t;
    ctx.globalAlpha = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
    const s = 1 + (u < 0.2 ? easeOutBack(u / 0.2) * 0.2 : 0.2 - (u - 0.2) * 0.2);
    ctx.font = `700 ${Math.round(13 * s)}px Syne, Outfit, sans-serif`;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y - 14 - easeOutCubic(u) * 26);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD

function paintTouch(ctx: CanvasRenderingContext2D, w: number, h: number, view: DrawInput, world: WorldDef): void {
  if (view.edgeL > 0.01) {
    const g = ctx.createLinearGradient(0, 0, 70, 0);
    g.addColorStop(0, hexAlpha(world.accent, 0.28 * view.edgeL));
    g.addColorStop(1, hexAlpha(world.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 70, h);
  }
  if (view.edgeR > 0.01) {
    const g = ctx.createLinearGradient(w, 0, w - 70, 0);
    g.addColorStop(0, hexAlpha(world.accent, 0.28 * view.edgeR));
    g.addColorStop(1, hexAlpha(world.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(w - 70, 0, 70, h);
  }
  for (const rp of view.ripples) {
    const u = easeOutCubic(rp.t);
    ctx.strokeStyle = hexAlpha(world.accent, 0.45 * (1 - rp.t));
    ctx.lineWidth = 2 * (1 - rp.t) + 0.5;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, 8 + u * 46, 0, Math.PI * 2);
    ctx.stroke();
    // A quarter arc that sweeps in the turn's direction.
    const dir = rp.ccw ? -1 : 1;
    const a0 = -Math.PI / 2;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, 22 + u * 10, a0, a0 + dir * u * Math.PI * 0.5, dir < 0);
    ctx.stroke();
  }
}

function paintDial(ctx: CanvasRenderingContext2D, cssW: number, view: DrawInput, world: WorldDef, sim: SimState): void {
  const x = cssW / 2;
  const y = 42;
  const R = 22;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(9,8,15,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(world.accent, 0.28);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (view.dialPulse > 0.01) {
    ctx.strokeStyle = hexAlpha(world.accent, 0.6 * view.dialPulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R + 4 + (1 - view.dialPulse) * 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Four ticks; the active pull's tick lights up.
  for (let d = 0; d < 4; d++) {
    const [vx, vy] = dirVector(d as Dir);
    const on = d === sim.gravityDir;
    ctx.strokeStyle = on ? world.accent : 'rgba(243,239,228,0.25)';
    ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(vx * (R - 5), -vy * (R - 5));
    ctx.lineTo(vx * R, -vy * R);
    ctx.stroke();
  }
  ctx.rotate(-view.arrow);
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 6, 0, 18, world.accent, 0.35 + view.dialPulse * 0.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = world.accent;
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-7, 6.5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, -6.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const pills: string[] = [`↻ ${sim.stats.rotations}`, `${sim.stats.time.toFixed(1)}s`];
  if (sim.level.stars.length) pills.push(`★ ${sim.stats.collected}/${sim.level.stars.length}`);
  if (view.orderText) pills.push(`◎ ${view.orderText}`);
  ctx.font = '500 12px Outfit, sans-serif';
  const widths = pills.map((p) => ctx.measureText(p).width + 18);
  const gap = 6;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1);
  let px = x - total / 2;
  const py = y + R + 12;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  pills.forEach((p, i) => {
    const pw = widths[i];
    ctx.fillStyle = 'rgba(9,8,15,0.5)';
    roundRect(ctx, px, py, pw, 22, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243,239,228,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = i === 2 && sim.stats.collected > 0 ? GOLD : 'rgba(243,239,228,0.78)';
    ctx.fillText(p, px + pw / 2, py + 11.5);
    px += pw + gap;
  });
  ctx.textBaseline = 'alphabetic';
}

function paintIntro(ctx: CanvasRenderingContext2D, cssW: number, view: DrawInput, world: WorldDef): void {
  // intro runs 1 → 0. Quick fade in, long hold, soft fade out.
  const t = 1 - view.intro;
  const inA = Math.min(1, t / 0.12);
  const outA = Math.min(1, view.intro / 0.3);
  const a = Math.min(inA, outA);
  const rise = (1 - easeOutCubic(Math.min(1, t / 0.2))) * 10;
  const y = 136 + rise;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  ctx.font = '600 10px Outfit, sans-serif';
  if ('letterSpacing' in withSpacing) withSpacing.letterSpacing = '3px';
  ctx.fillStyle = hexAlpha(world.accent, 0.7);
  ctx.fillText(view.worldLabel.toUpperCase(), cssW / 2, y - 24);
  if ('letterSpacing' in withSpacing) withSpacing.letterSpacing = '0px';
  ctx.font = '700 26px Syne, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = INK;
  ctx.fillText(view.level.name, cssW / 2, y + 4);
  ctx.shadowBlur = 0;
  const lw = 60 * easeOutCubic(Math.min(1, t / 0.3));
  ctx.fillStyle = world.accent;
  ctx.fillRect(cssW / 2 - lw / 2, y + 14, lw, 2);
  ctx.restore();
}

function paintHints(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, world: WorldDef): void {
  const a = 0.35 + Math.sin(now * 2.2) * 0.15;
  const yy = h * 0.74;
  // Half-screen tap zones.
  const lg = ctx.createLinearGradient(0, 0, w * 0.35, 0);
  lg.addColorStop(0, hexAlpha(world.accent, 0.07 * a));
  lg.addColorStop(1, hexAlpha(world.accent, 0));
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w * 0.35, h);
  const rg = ctx.createLinearGradient(w, 0, w * 0.65, 0);
  rg.addColorStop(0, hexAlpha(world.accent, 0.07 * a));
  rg.addColorStop(1, hexAlpha(world.accent, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(w * 0.65, 0, w * 0.35, h);
  ctx.strokeStyle = `rgba(243,239,228,${a})`;
  ctx.fillStyle = `rgba(243,239,228,${a})`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const wob = Math.sin(now * 2.2) * 0.15;
  turnGlyph(ctx, 40, yy, -1, wob);
  turnGlyph(ctx, w - 40, yy, 1, -wob);
  ctx.font = '600 10px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TAP', 40, yy + 38);
  ctx.fillText('TAP', w - 40, yy + 38);
}

function turnGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, wob: number): void {
  const r = 16;
  const a0 = -Math.PI * 0.8 + wob;
  const a1 = Math.PI * 0.3 + wob;
  ctx.beginPath();
  if (dir > 0) ctx.arc(x, y, r, a0, a1);
  else ctx.arc(x, y, r, Math.PI - a0, Math.PI - a1, true);
  ctx.stroke();
  const end = dir > 0 ? a1 : Math.PI - a1;
  const ex = x + Math.cos(end) * r;
  const ey = y + Math.sin(end) * r;
  const tang = end + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(tang) * 5, ey + Math.sin(tang) * 5);
  ctx.lineTo(ex + Math.cos(tang + 2.4) * 6, ey + Math.sin(tang + 2.4) * 6);
  ctx.lineTo(ex + Math.cos(tang - 2.4) * 6, ey + Math.sin(tang - 2.4) * 6);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- helpers

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,240,0.7)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawMiniArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, color = INK): void {
  const v = dirVector(dir);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-v[1], v[0]));
  ctx.fillStyle = hexAlpha(color, 0.9);
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-4, 3.5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, -3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial sprite, cached per color. Far cheaper than shadowBlur per frame. */
function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, hexAlpha(color, 1));
    grd.addColorStop(0.22, hexAlpha(color, 0.5));
    grd.addColorStop(0.55, hexAlpha(color, 0.14));
    grd.addColorStop(1, hexAlpha(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, c);
  return c;
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.005 || r <= 0.5) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function wrap(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

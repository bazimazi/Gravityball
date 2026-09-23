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
}

export function fitCamera(level: LevelDef, cssW: number, cssH: number, kickX: number, kickY: number): Camera {
  const padTop = 150;
  const padBottom = 36;
  const padX = 20;
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
  const cam = fitCamera(level, cssW, cssH, view.kickX, view.kickY);
  paintSky(ctx, cssW, cssH, world, sim, view.now);
  paintChamber(ctx, cam, level, world);
  paintZones(ctx, cam, level, view.now);
  paintFields(ctx, cam, level, sim, view.now, world);
  paintHazards(ctx, cam, level, view.strongPatterns, view.now);
  paintSolids(ctx, cam, level, sim, world);
  paintLasers(ctx, cam, level, sim.time);
  paintProps(ctx, cam, level, sim, view.now, world);
  paintPredict(ctx, cam, level, view.predict);
  if (view.ghost) paintGhost(ctx, cam, level, view.ghost);
  paintMotes(ctx, cam, level, view.motes, view.gravStyle);
  paintTrail(ctx, cam, level, view.trail, view.trailStyle, world);
  paintBall(ctx, cam, level, sim, view, world);
  paintDial(ctx, cssW, view, world, sim);
  if (view.intro > 0.02) paintIntro(ctx, cssW, view, world);
  if (view.showHints) paintHints(ctx, cssW, cssH, view.now);
  if (view.flash > 0.01) {
    ctx.fillStyle = `rgba(196, 92, 74, ${view.flash * 0.35})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }
  if (view.near > 0.01) {
    ctx.strokeStyle = `rgba(240, 226, 192, ${view.near * 0.45})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, cssW - 12, cssH - 12);
  }
}

function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, world: WorldDef, sim: SimState, now: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, world.bg0);
  g.addColorStop(0.55, world.bg1);
  g.addColorStop(1, world.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const [gx, gy] = dirVector(sim.gravityDir);
  const drift = now * 8;
  for (let i = 0; i < 3; i++) {
    const nx = w * (0.2 + i * 0.28) + gx * drift * (0.15 + i * 0.05);
    const ny = h * (0.25 + (i === 1 ? 0.3 : 0)) - gy * drift * 0.12;
    const rad = Math.max(w, h) * (0.35 + i * 0.08);
    const wash = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad);
    wash.addColorStop(0, hexAlpha(i === 1 ? world.accent : world.accent2, 0.09));
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = 'rgba(243,239,228,0.45)';
  for (let i = 0; i < 48; i++) {
    const sx = ((i * 97) % 1000) / 1000 * w;
    const sy = ((i * 57) % 1000) / 1000 * h;
    const tw = 0.35 + Math.sin(now * 0.8 + i) * 0.25;
    ctx.globalAlpha = tw;
    ctx.fillRect(sx, sy, i % 5 === 0 ? 1.6 : 1, i % 5 === 0 ? 1.6 : 1);
  }
  ctx.globalAlpha = 1;
}

function paintChamber(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, world: WorldDef): void {
  const [x, y] = worldToScreen(cam, 0, level.h, level.h);
  const w = level.w * cam.scale;
  const h = level.h * cam.scale;
  ctx.fillStyle = hexAlpha(world.bg0, 0.55);
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(world.accent, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function paintZones(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, now: number): void {
  for (const z of level.zones) {
    const [x, y] = worldToScreen(cam, z.x, z.y + z.h, level.h);
    const w = z.w * cam.scale;
    const h = z.h * cam.scale;
    let fill = 'rgba(213,230,234,0.05)';
    if (z.mode === 'zero') fill = 'rgba(213,230,234,0.07)';
    else if (z.mode === 'mul' && (z.mul ?? 1) > 1) fill = 'rgba(224,161,90,0.07)';
    else if (z.mode === 'mul') fill = 'rgba(183,216,200,0.07)';
    else if (z.mode === 'mirror') fill = 'rgba(228,194,212,0.08)';
    else if (z.mode === 'lock') fill = 'rgba(243,239,228,0.04)';
    else if (z.mode === 'stain') fill = 'rgba(196,92,74,0.08)';
    else if (z.mode === 'override') fill = 'rgba(158,183,216,0.07)';
    else if (z.mode === 'conveyor') fill = 'rgba(224,161,90,0.05)';
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(243,239,228,0.16)';
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -now * 12;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.fillStyle = 'rgba(243,239,228,0.7)';
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    const mark = zoneMark(z.mode, z.mul);
    ctx.fillText(mark, x + 8, y + 16);
    if (z.mode === 'override' && z.dir != null) drawMiniArrow(ctx, x + 28, y + 12, z.dir);
  }
}

function zoneMark(mode: string, mul?: number): string {
  if (mode === 'zero') return 'zero';
  if (mode === 'mirror') return 'mirror';
  if (mode === 'lock') return 'locked';
  if (mode === 'stain') return 'dust';
  if (mode === 'conveyor') return 'flow';
  if (mode === 'mul') return (mul ?? 1) > 1 ? 'heavy' : 'soft';
  if (mode === 'override') return '';
  return '';
}

function paintFields(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, now: number, world: WorldDef): void {
  for (const f of level.fields) {
    const [fx, fy] = fieldCenter(f, sim.time);
    const [sx, sy] = worldToScreen(cam, fx, fy, level.h);
    const inf = f.influence * cam.scale;
    if (f.kind === 'blackhole') {
      const halo = ctx.createRadialGradient(sx, sy, (f.horizon ?? 0.4) * cam.scale, sx, sy, inf);
      halo.addColorStop(0, 'rgba(0,0,0,0.0)');
      halo.addColorStop(0.45, 'rgba(80,20,24,0.18)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224,122,106,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(sx, sy, inf * (0.45 + i * 0.16), now * 0.4 + i, now * 0.4 + i + 1.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#070608';
      ctx.beginPath();
      ctx.arc(sx, sy, (f.horizon ?? 0.5) * cam.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224,122,106,0.8)';
      ctx.stroke();
    } else if (f.kind === 'planet') {
      const ring = ctx.createRadialGradient(sx, sy, (f.core ?? 0.5) * cam.scale, sx, sy, inf);
      ring.addColorStop(0, hexAlpha(world.accent, 0.16));
      ring.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.fill();
      const core = (f.core ?? 0.6) * cam.scale;
      const body = ctx.createRadialGradient(sx - core * 0.3, sy - core * 0.35, core * 0.1, sx, sy, core);
      body.addColorStop(0, '#f2e2c4');
      body.addColorStop(0.45, world.accent);
      body.addColorStop(1, '#3a2418');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(sx, sy, core, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.kind === 'repulsor' || f.kind === 'magnet' || f.kind === 'well') {
      ctx.strokeStyle = f.kind === 'magnet' ? 'rgba(214,196,242,0.45)' : 'rgba(224,161,90,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, (f.core ?? 0.35) * cam.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(sx, sy, inf, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(243,239,228,0.75)';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.kind === 'magnet' ? 'magnet' : f.kind === 'repulsor' ? 'push' : 'well', sx, sy - inf - 6);
    }
  }
}

function paintHazards(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, strong: boolean, now: number): void {
  for (const hz of level.hazards) {
    const [x, y] = worldToScreen(cam, hz.x, hz.y + hz.h, level.h);
    const w = hz.w * cam.scale;
    const h = hz.h * cam.scale;
    ctx.fillStyle = 'rgba(8,6,8,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(196,92,74,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = strong ? 'rgba(243,239,228,0.7)' : 'rgba(196,92,74,0.45)';
    ctx.lineWidth = strong ? 2 : 1;
    const step = strong ? 7 : 9;
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }
    if (hz.style === 'spike') {
      ctx.fillStyle = '#e7b2a8';
      const n = Math.max(2, Math.floor(w / 10));
      for (let i = 0; i < n; i++) {
        const bx = x + (i + 0.5) * (w / n);
        ctx.beginPath();
        ctx.moveTo(bx - 4, y + h - 2);
        ctx.lineTo(bx, y + 4);
        ctx.lineTo(bx + 4, y + h - 2);
        ctx.fill();
      }
    }
    ctx.restore();
    void now;
  }
}

function paintSolids(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, world: WorldDef): void {
  const [gx, gy] = dirVector(sim.gravityDir);
  level.solids.forEach((def, i) => {
    if (sim.broken[i]) return;
    const r = solidAt(def, sim.time);
    const [x, y] = worldToScreen(cam, r.x, r.y + r.h, level.h);
    const w = r.w * cam.scale;
    const h = r.h * cam.scale;
    const style = solidStyle(def, world);
    ctx.fillStyle = style.fill;
    roundRect(ctx, x, y, w, h, Math.min(8, w / 4, h / 4));
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, Math.min(8, w / 4, h / 4));
    ctx.clip();
    const lit = hexAlpha(style.edge, 0.85);
    ctx.fillStyle = lit;
    const t = Math.max(3, Math.min(w, h) * 0.18);
    if (Math.abs(gx) > Math.abs(gy)) {
      if (gx > 0) ctx.fillRect(x, y, t, h);
      else ctx.fillRect(x + w - t, y, t, h);
    } else if (gy > 0) ctx.fillRect(x, y + h - t, w, t);
    else ctx.fillRect(x, y, w, t);
    ctx.restore();
    if (def.phase) {
      ctx.save();
      roundRect(ctx, x, y, w, h, 6);
      ctx.clip();
      ctx.strokeStyle = 'rgba(213,230,234,0.55)';
      ctx.lineWidth = 1;
      for (let k = -h; k < w; k += 8) {
        ctx.beginPath();
        ctx.moveTo(x + k, y + h);
        ctx.lineTo(x + k + h * 0.6, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (def.fragile && !sim.broken[i]) {
      ctx.strokeStyle = 'rgba(224,161,90,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + 4);
      ctx.lineTo(x + w * 0.5, y + h * 0.6);
      ctx.lineTo(x + w * 0.7, y + h - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = hexAlpha(style.edge, 0.35);
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, Math.min(8, w / 4, h / 4));
    ctx.stroke();
  });

  for (const gate of level.gates) {
    const open = sim.gravityDir === gate.openDir;
    const [x, y] = worldToScreen(cam, gate.x, gate.y + gate.h, level.h);
    const w = gate.w * cam.scale;
    const h = gate.h * cam.scale;
    ctx.fillStyle = open ? 'rgba(183,216,200,0.08)' : 'rgba(20,18,28,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = open ? 'rgba(183,216,200,0.8)' : 'rgba(243,239,228,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    drawMiniArrow(ctx, x + w / 2, y + h / 2, gate.openDir);
  }
}

function solidStyle(def: SolidDef, world: WorldDef): { fill: string; edge: string } {
  if (def.mat === 'ice') return { fill: '#172226', edge: '#d5e6ea' };
  if (def.mat === 'bounce') return { fill: '#2a2118', edge: '#e0a15a' };
  if (def.mat === 'sticky') return { fill: '#1a1614', edge: '#8d735f' };
  if (def.mat === 'metal') return { fill: '#1b1e26', edge: '#d5d8e0' };
  if (def.phase) return { fill: 'rgba(20,28,32,0.35)', edge: '#d5e6ea' };
  return { fill: '#191722', edge: world.accent };
}

function paintLasers(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, time: number): void {
  for (const laser of level.lasers) {
    const hot = laserHot(laser, time);
    const warm = laserWarm(laser, time);
    if (!hot && !warm) continue;
    const [x, y] = worldToScreen(cam, laser.x, laser.y + laser.h, level.h);
    const w = laser.w * cam.scale;
    const h = laser.h * cam.scale;
    ctx.fillStyle = hot ? 'rgba(224,122,106,0.85)' : 'rgba(224,122,106,0.18)';
    ctx.fillRect(x, y, w, h);
    if (hot) {
      ctx.fillStyle = 'rgba(255,236,228,0.85)';
      ctx.fillRect(x + w * 0.35, y, w * 0.3, h);
    }
  }
}

function paintProps(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, now: number, world: WorldDef): void {
  for (let i = 0; i < level.stars.length; i++) {
    if (sim.stars[i]) continue;
    const s = level.stars[i];
    const [x, y] = worldToScreen(cam, s.x, s.y, level.h);
    drawStar(ctx, x, y, 7 + Math.sin(now * 3 + i) * 0.8, '#f0d78c');
  }
  for (let i = 0; i < level.fragments.length; i++) {
    if (sim.fragments[i]) continue;
    const s = level.fragments[i];
    const [x, y] = worldToScreen(cam, s.x, s.y, level.h);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 0.6);
    ctx.strokeStyle = '#d5e6ea';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  for (const sw of level.switches) {
    const [x, y] = worldToScreen(cam, sw.x, sw.y, level.h);
    const r = sw.r * cam.scale;
    ctx.strokeStyle = world.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (sw.set != null) drawMiniArrow(ctx, x, y, sw.set);
    else ctx.fillStyle = world.accent2, ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  level.checkpoints.forEach((cp, i) => {
    const [x, y] = worldToScreen(cam, cp.x, cp.y, level.h);
    const next = !level.orderedCheckpoints || cp.order === sim.order + 1;
    const done = level.orderedCheckpoints ? cp.order <= sim.order : false;
    ctx.strokeStyle = done ? 'rgba(183,216,200,0.4)' : next ? '#f0e2c0' : 'rgba(243,239,228,0.25)';
    ctx.lineWidth = next ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, cp.r * cam.scale, 0, Math.PI * 2);
    ctx.stroke();
    void i;
  });
  for (const p of level.portals) {
    const [x, y] = worldToScreen(cam, p.x, p.y, level.h);
    ctx.strokeStyle = '#c9d4e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, p.r * cam.scale, now, now + Math.PI * 1.4);
    ctx.stroke();
  }
  if (level.goal) {
    const goal = level.goal;
    if (goal.h && goal.h > 0) {
      const [x, y] = worldToScreen(cam, goal.x - goal.r, goal.y + goal.h, level.h);
      const w = goal.r * 2 * cam.scale;
      const h = goal.h * cam.scale;
      const glow = ctx.createLinearGradient(x, y, x + w, y);
      glow.addColorStop(0, 'rgba(240,226,192,0)');
      glow.addColorStop(0.5, 'rgba(240,226,192,0.16)');
      glow.addColorStop(1, 'rgba(240,226,192,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(240,226,192,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    } else {
      const [x, y] = worldToScreen(cam, goal.x, goal.y, level.h);
      const r = goal.r * cam.scale;
      const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.8);
      glow.addColorStop(0, 'rgba(240,226,192,0.28)');
      glow.addColorStop(1, 'rgba(240,226,192,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f0e2c0';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -now * 16;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f0e2c0';
      ctx.fill();
    }
  }
}

function paintPredict(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, pts: { x: number; y: number }[]): void {
  if (!pts.length) return;
  ctx.fillStyle = 'rgba(243,239,228,0.35)';
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = worldToScreen(cam, pts[i].x, pts[i].y, level.h);
    ctx.globalAlpha = 0.15 + (i / pts.length) * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintGhost(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, g: { x: number; y: number }): void {
  const [x, y] = worldToScreen(cam, g.x, g.y, level.h);
  ctx.strokeStyle = 'rgba(240,226,192,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 0.32 * cam.scale, 0, Math.PI * 2);
  ctx.stroke();
}

function paintMotes(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, motes: Mote[], style: string): void {
  for (const m of motes) {
    if (!m.on) continue;
    const [x, y] = worldToScreen(cam, m.x, m.y, level.h);
    const a = Math.max(0, m.life / m.max);
    ctx.globalAlpha = m.kind === 'dust' ? 0.35 * a : a;
    ctx.fillStyle = m.color;
    if (m.kind === 'ring') {
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, (1 - a) * 16 + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (style === 'grav-filament' && m.kind === 'dust') {
      ctx.fillRect(x, y, 6, 1.2);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function paintTrail(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, trail: { x: number; y: number }[], style: string, world: WorldDef): void {
  if (trail.length < 2) return;
  ctx.beginPath();
  trail.forEach((p, i) => {
    const [x, y] = worldToScreen(cam, p.x, p.y, level.h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = hexAlpha(world.accent, style === 'trail-ribbon' ? 0.55 : 0.4);
  ctx.lineWidth = style === 'trail-ribbon' ? 4 : style === 'trail-ion' ? 1.2 : 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  if (style === 'trail-ember' || style === 'trail-dust') {
    ctx.fillStyle = style === 'trail-ember' ? '#e07a6a' : world.accent2;
    for (let i = 0; i < trail.length; i += 2) {
      const [x, y] = worldToScreen(cam, trail[i].x, trail[i].y, level.h);
      ctx.globalAlpha = i / trail.length;
      ctx.beginPath();
      ctx.arc(x, y, style === 'trail-dust' ? 1.6 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function paintBall(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, sim: SimState, view: DrawInput, world: WorldDef): void {
  const b = sim.ball;
  const [x, y] = worldToScreen(cam, b.x, b.y, level.h);
  const r = b.r * cam.scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(view.impactAngle);
  const flat = view.squash;
  ctx.scale(1 + (1 - flat) * 0.45, flat);
  const skin = view.skin;
  if (skin === 'ball-void') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#140c14';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e4c2d4';
    ctx.stroke();
  } else if (skin === 'ball-geo') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.7);
    ctx.lineTo(-r * 0.9, r * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#f0e6c8';
    ctx.fill();
  } else {
    const grd = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    const [c0, c1, c2] = ballColors(skin, world);
    grd.addColorStop(0, c0);
    grd.addColorStop(0.55, c1);
    grd.addColorStop(1, c2);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    if (skin === 'ball-crystal') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.8);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(-r * 0.1, r * 0.7);
      ctx.stroke();
    }
    if (skin === 'ball-planet') {
      ctx.strokeStyle = 'rgba(90,40,20,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.28, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function ballColors(skin: string, world: WorldDef): [string, string, string] {
  if (skin === 'ball-metal') return ['#f7f7f8', '#9aa0a8', '#3c414a'];
  if (skin === 'ball-crystal') return ['#f7fbff', '#b7ccea', '#6e86a8'];
  if (skin === 'ball-planet') return ['#f6e2cf', '#e0a15a', '#6a3a28'];
  if (skin === 'ball-plasma') return ['#fff6ea', '#e07a6a', '#6a2430'];
  if (skin === 'ball-ancient') return ['#f3ead6', '#cbb892', '#6d5b45'];
  return ['#ffffff', world.accent2, '#667084'];
}

function paintDial(ctx: CanvasRenderingContext2D, cssW: number, view: DrawInput, world: WorldDef, sim: SimState): void {
  const x = cssW / 2;
  const y = 46;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexAlpha(world.accent, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(-view.arrow);
  ctx.fillStyle = world.accent;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-6, 5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(243,239,228,0.62)';
  ctx.font = '500 12px Outfit, sans-serif';
  ctx.textAlign = 'center';
  const name = ['down', 'left', 'up', 'right'][sim.gravityDir];
  ctx.fillText(`${name}  ·  ${sim.stats.rotations}  ·  ${sim.stats.time.toFixed(1)}s`, x, y + 32);
  if (view.orderText) {
    ctx.fillStyle = 'rgba(240,226,192,0.8)';
    ctx.fillText(view.orderText, x, y + 48);
  }
}

function paintIntro(ctx: CanvasRenderingContext2D, cssW: number, view: DrawInput, world: WorldDef): void {
  ctx.globalAlpha = Math.min(1, view.intro);
  ctx.fillStyle = world.accent;
  ctx.font = '600 22px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(view.level.name, cssW / 2, 104);
  ctx.globalAlpha = 1;
}

function paintHints(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const a = 0.28 + Math.sin(now * 2.2) * 0.12;
  ctx.strokeStyle = `rgba(243,239,228,${a})`;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = `rgba(243,239,228,${a})`;
  drawCurve(ctx, 28, h * 0.72, -1);
  drawCurve(ctx, w - 28, h * 0.72, 1);
  ctx.font = '500 11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('turn', 36, h * 0.72 + 36);
  ctx.fillText('turn', w - 36, h * 0.72 + 36);
}

function drawCurve(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 18, dir > 0 ? Math.PI * 0.15 : Math.PI * 0.85, dir > 0 ? Math.PI * 1.35 : Math.PI * -0.35, dir < 0);
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : r * 0.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMiniArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir): void {
  const v = dirVector(dir);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-v[1], v[0]));
  ctx.fillStyle = 'rgba(243,239,228,0.85)';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-4, 3.5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, -3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

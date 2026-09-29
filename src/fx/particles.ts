export type MoteKind = 'dust' | 'spark' | 'ring' | 'shard' | 'glow';

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: MoteKind;
  on: boolean;
  rot: number;
  vr: number;
  /** World-space pull applied to sparks and shards, per second. */
  fall: number;
}

export class Particles {
  motes: Mote[] = [];
  private cursor = 0;

  constructor(count = 520) {
    for (let i = 0; i < count; i++) {
      this.motes.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', kind: 'dust', on: false, rot: 0, vr: 0, fall: 0,
      });
    }
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    kind: MoteKind,
  ): Mote {
    // Never steal a live dust mote; ambient dust is a fixed population.
    let m = this.motes[this.cursor];
    for (let k = 0; k < this.motes.length && m.on && m.kind === 'dust'; k++) {
      this.cursor = (this.cursor + 1) % this.motes.length;
      m = this.motes[this.cursor];
    }
    this.cursor = (this.cursor + 1) % this.motes.length;
    m.x = x;
    m.y = y;
    m.vx = vx;
    m.vy = vy;
    m.life = life;
    m.max = life;
    m.size = size;
    m.color = color;
    m.kind = kind;
    m.on = true;
    m.rot = 0;
    m.vr = 0;
    m.fall = 0;
    return m;
  }

  burst(x: number, y: number, dirX: number, dirY: number, n: number, color: string | string[], speed: number, spread = 1.2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const s = speed * (0.3 + Math.random());
      const c = Array.isArray(color) ? color[i % color.length] : color;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.35, 1.2 + Math.random() * 1.8, c, 'spark');
    }
  }

  ring(x: number, y: number, color: string, radius: number, life = 0.45): void {
    this.spawn(x, y, 0, 0, life, radius, color, 'ring');
  }

  glow(x: number, y: number, color: string, radius: number, life = 0.35): void {
    this.spawn(x, y, 0, 0, life, radius, color, 'glow');
  }

  /** The ball breaking: spinning shards that fall with the current pull. */
  shatter(x: number, y: number, vx: number, vy: number, colors: string[], n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const s = 2.5 + Math.random() * 4.5;
      const m = this.spawn(
        x, y,
        Math.cos(a) * s + vx * 0.25,
        Math.sin(a) * s + vy * 0.25,
        0.55 + Math.random() * 0.45,
        2.5 + Math.random() * 3.5,
        colors[i % colors.length],
        'shard',
      );
      m.rot = Math.random() * Math.PI * 2;
      m.vr = (Math.random() - 0.5) * 18;
      m.fall = 14;
    }
    this.glow(x, y, colors[0], 60, 0.4);
  }

  step(dt: number, gx: number, gy: number, worldW: number, worldH: number): void {
    for (const m of this.motes) {
      if (!m.on) continue;
      if (m.kind === 'dust') {
        m.vx += gx * dt * 0.35;
        m.vy += gy * dt * 0.35;
        m.vx *= 1 - dt * 0.8;
        m.vy *= 1 - dt * 0.8;
      } else if (m.kind === 'spark' || m.kind === 'shard') {
        const drag = m.kind === 'spark' ? 3.2 : 1.4;
        m.vx *= 1 - Math.min(1, dt * drag);
        m.vy *= 1 - Math.min(1, dt * drag);
        if (m.fall) {
          const l = Math.hypot(gx, gy) || 1;
          m.vx += (gx / l) * m.fall * dt;
          m.vy += (gy / l) * m.fall * dt;
        }
        m.rot += m.vr * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (m.life <= 0) {
        if (m.kind === 'dust') {
          m.x = Math.random() * worldW;
          m.y = Math.random() * worldH;
          m.vx = 0;
          m.vy = 0;
          m.life = m.max;
        } else m.on = false;
      }
    }
  }

  fillDust(w: number, h: number, color: string, count: number): void {
    for (const m of this.motes) if (m.kind === 'dust') m.on = false;
    let made = 0;
    for (const m of this.motes) {
      if (made >= count) break;
      if (m.on) continue;
      m.on = true;
      m.kind = 'dust';
      m.x = Math.random() * w;
      m.y = Math.random() * h;
      m.vx = 0;
      m.vy = 0;
      m.life = 2 + Math.random() * 3;
      m.max = m.life;
      m.size = 1 + Math.random() * 1.6;
      m.color = color;
      m.rot = 0;
      m.vr = 0;
      m.fall = 0;
      made++;
    }
  }

  clearTransient(): void {
    for (const m of this.motes) if (m.kind !== 'dust') m.on = false;
  }
}

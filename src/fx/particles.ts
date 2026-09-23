export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dust' | 'spark' | 'ring';
  on: boolean;
}

export class Particles {
  motes: Mote[] = [];
  private cursor = 0;

  constructor(count = 420) {
    for (let i = 0; i < count; i++) {
      this.motes.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', kind: 'dust', on: false,
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
    kind: Mote['kind'],
  ): void {
    const m = this.motes[this.cursor];
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
  }

  burst(x: number, y: number, dirX: number, dirY: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.2;
      const s = speed * (0.3 + Math.random());
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.35, 1.5 + Math.random() * 2.2, color, 'spark');
    }
  }

  step(dt: number, gx: number, gy: number, worldW: number, worldH: number): void {
    for (const m of this.motes) {
      if (!m.on) continue;
      if (m.kind === 'dust') {
        m.vx += gx * dt * 0.35;
        m.vy += gy * dt * 0.35;
        m.vx *= 1 - dt * 0.8;
        m.vy *= 1 - dt * 0.8;
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
      made++;
    }
  }

  clearTransient(): void {
    for (const m of this.motes) if (m.kind !== 'dust') m.on = false;
  }
}

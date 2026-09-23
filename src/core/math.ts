/** Mulberry32. Same seed, same stream, every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l < 1e-8) return [0, 0];
  return [x / l, y / l];
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function pointInRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return px >= x && py >= y && px <= x + w && py <= y + h;
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** Signed distance from circle center to rect; negative means overlapping. */
export function circleRectGap(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const qx = clamp(cx, x, x + w);
  const qy = clamp(cy, y, y + h);
  return Math.hypot(cx - qx, cy - qy) - r;
}

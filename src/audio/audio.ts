import type { Dir } from '../core/types';

const TONE: Record<Dir, number> = { 0: 196, 1: 247, 2: 330, 3: 294 };

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  musicVol = 0.65;
  sfxVol = 0.85;
  private started = false;
  private root = 110;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.03 * this.musicVol;
      this.music.connect(this.master);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.master);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  resume(): void {
    this.ensure();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.music) this.music.gain.value = (0.018 + this.intensityHold * 0.02) * music;
    if (this.sfx) this.sfx.gain.value = sfx;
  }

  private intensityHold = 0;

  setWorld(root: number): void {
    this.root = root;
    if (this.droneA) this.droneA.frequency.value = root;
    if (this.droneB) this.droneB.frequency.value = root * 1.5;
  }

  setIntensity(v: number): void {
    this.intensityHold = v;
    if (this.music) this.music.gain.value = (0.018 + v * 0.028) * this.musicVol;
  }

  private startDrone(): void {
    const ctx = this.ensure();
    if (!ctx || !this.music || this.started) return;
    this.started = true;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sine';
    b.type = 'triangle';
    a.frequency.value = this.root;
    b.frequency.value = this.root * 1.5;
    const fa = ctx.createGain();
    const fb = ctx.createGain();
    fa.gain.value = 0.55;
    fb.gain.value = 0.12;
    a.connect(fa).connect(this.music);
    b.connect(fb).connect(this.music);
    a.start();
    b.start();
    this.droneA = a;
    this.droneB = b;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfx || this.sfxVol <= 0.01) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.sfx);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  private burst(dur: number, gain: number, freq: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfx || !this.noise || this.sfxVol <= 0.01) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  gravity(dir: Dir): void {
    this.startDrone();
    this.tone(TONE[dir], 0.12, 'sine', 0.07, -40);
    this.tone(TONE[dir] * 2, 0.08, 'triangle', 0.03, -20);
  }

  land(speed: number): void {
    this.burst(0.07, Math.min(0.12, 0.03 + speed * 0.006), 280 + speed * 20);
  }

  collect(): void {
    this.tone(740, 0.09, 'sine', 0.05);
    this.tone(988, 0.12, 'sine', 0.03);
  }

  fragment(): void {
    this.tone(520, 0.14, 'triangle', 0.04);
    this.tone(780, 0.18, 'sine', 0.03);
  }

  die(): void {
    this.tone(140, 0.16, 'sine', 0.06, -80);
  }

  win(): void {
    this.tone(523, 0.12, 'sine', 0.05);
    window.setTimeout(() => this.tone(659, 0.14, 'sine', 0.045), 90);
    window.setTimeout(() => this.tone(784, 0.2, 'triangle', 0.04), 180);
  }

  near(): void {
    this.tone(880, 0.05, 'sine', 0.03);
  }

  deny(): void {
    this.tone(128, 0.05, 'square', 0.02);
  }

  switched(): void {
    this.tone(392, 0.08, 'triangle', 0.04);
  }

  portal(): void {
    this.tone(300, 0.16, 'sine', 0.04, 240);
  }

  ui(): void {
    this.tone(520, 0.04, 'sine', 0.025);
  }
}

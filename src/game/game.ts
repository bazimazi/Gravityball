import { dirAngle, dirVector, TUNING, type Dir, type InputEvent, type MedalTier, type RelicState } from '../core/types';
import { applyInput, createSim, predict, replay, restartSim, restoreSnap, step, type SimState } from '../physics/sim';
import {
  CHALLENGE_LEVELS,
  FRAGMENTS,
  getLevel,
  isLastInWorld,
  nextCampaign,
  SECRET_LEVELS,
  worldLevels,
} from '../level/campaign';
import { bestMedal, describeMedal } from '../level/build';
import { WORLDS, worldById, type LevelDef } from '../level/types';
import { AudioBus } from '../audio/audio';
import { Particles } from '../fx/particles';
import { ballColors, drawFrame, easeOutCubic, type Pop, type Ripple } from '../render/render';
import {
  betterMedal,
  COSMETICS,
  countPerfects,
  defaultSave,
  encodeGhost,
  levelRecord,
  levelUnlocked,
  loadSave,
  modeUnlocked,
  unlockedBalls,
  worldUnlocked,
  writeSave,
  type SaveData,
  type Settings,
} from '../save/save';
import { grant, grantsForClear } from '../save/achievements';
import { dailyLevel, endlessLevel, freshRelics, rollOffers, sandboxLevel, type Offer } from './modes';
import { UI, type SheetModel } from '../ui/ui';

type Mode = 'campaign' | 'endless' | 'daily' | 'run' | 'sandbox' | 'challenge';
type Phase = 'play' | 'clear' | 'pause' | 'map' | 'settings' | 'wardrobe' | 'mastery' | 'codex' | 'replay' | 'pick' | 'over';

const ROOTS = [110, 98, 123, 87, 130, 92, 73, 116, 104, 138];

export class Game {
  private save: SaveData;
  private ui: UI;
  private audio = new AudioBus();
  private particles = new Particles();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim!: SimState;
  private mode: Mode = 'campaign';
  private phase: Phase = 'play';
  private relics: RelicState = freshRelics();
  private fails = 0;
  private hitstop = 0;
  private acc = 0;
  private last = 0;
  private arrow = 0;
  private arrowTarget = 0;
  private squash = 1;
  private impactAngle = 0;
  private flash = 0;
  private near = 0;
  private kickX = 0;
  private kickY = 0;
  private kickVX = 0;
  private kickVY = 0;
  private arrowV = 0;
  private squashV = 0;
  private lean = 0;
  private leanV = 0;
  private trauma = 0;
  private freeze = 0;
  private spin = 0;
  private spinV = 0;
  private spawnFx = 1;
  private ballHidden = false;
  private winAnim = 0;
  private winAnimMax = 1;
  private winFrom = { x: 0, y: 0 };
  private winTo: { x: number; y: number } | null = null;
  private winBurst = false;
  private afterWin: (() => void) | null = null;
  private wave = 1;
  private waveDir: Dir = 0;
  private ripples: Ripple[] = [];
  private pops: Pop[] = [];
  private edgeL = 0;
  private edgeR = 0;
  private dialPulse = 0;
  private reveal = 1;
  private skyX = 0;
  private skyY = 0;
  private gravX = 0;
  private gravY = -1;
  private trailTick = 0;
  private recordLine = '';
  private intro = 0;
  private thought = '';
  private thoughtLeft = 0;
  private trail: { x: number; y: number }[] = [];
  private ghost: SimState | null = null;
  private ghostInputs: InputEvent[] | null = null;
  private ghostAt = 0;
  private winInputs: InputEvent[] = [];
  private winTick = 0;
  private winMedal: MedalTier = 'bronze';
  private endlessSeed = 1;
  private endlessRoom = 0;
  private endlessScore = 0;
  private runSeed = 1;
  private runRoom = 0;
  private runScore = 0;
  private offers: Offer[] = [];
  private dailyDate = '';
  private dailyLabel = '';
  private replaySim: SimState | null = null;
  private replayUntil = 0;
  private replayPlaying = false;
  private resetArmed = false;
  private slow = false;
  private pendingOver = false;
  private overText = '';
  private overScore = '';
  private log: { e: string }[] = [];

  constructor() {
    this.save = loadSave();
    this.canvas = document.getElementById('view') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    this.ctx = ctx;
    this.ui = new UI({
      pause: () => this.pause(),
      restart: () => this.fullRestart(),
      resume: () => this.resume(),
      map: () => this.open('map'),
      settings: () => this.open('settings'),
      wardrobe: () => this.open('wardrobe'),
      mastery: () => this.open('mastery'),
      codex: () => this.open('codex'),
      selectLevel: (id) => this.select(id),
      next: () => this.next(),
      retry: () => this.retryFromSheet(),
      watch: () => this.watch(),
      closeReplay: () => this.open('clear'),
      scrub: (v) => this.scrub(v),
      toggleReplay: () => { this.replayPlaying = !this.replayPlaying; },
      setSetting: (k, v) => this.setSetting(k, v),
      equip: (id) => this.equip(id),
      mode: (id) => this.startMode(id),
      pickOffer: (i) => this.pickOffer(i),
      copyShare: () => this.copyShare(),
      resetProgress: () => this.resetProgress(),
      click: () => this.audio.ui(),
    });
    this.canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'play') this.pause();
    });
    const id = this.save.lastLevel;
    const level = getLevel(id);
    if (level && levelUnlocked(this.save, id)) this.playLevel(level, level.challenge ? 'challenge' : 'campaign');
    else this.playLevel(mustLevel('1-1'), 'campaign');
    requestAnimationFrame(this.frame);
  }

  private track(e: string): void {
    this.log.push({ e });
    if (this.log.length > 120) this.log.shift();
  }

  private frame = (t: number): void => {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    if (this.phase === 'play') {
      if (this.winAnim > 0) {
        this.winAnim -= dt;
        if (this.winAnim <= 0) this.finishWin();
      } else if (this.hitstop > 0) {
        this.hitstop -= dt;
        if (this.hitstop <= 0) this.afterHit();
      } else if (this.freeze > 0) {
        this.freeze -= dt;
      } else {
        this.acc += dt * (this.slow ? 0.3 : 1);
        let n = 0;
        while (this.acc >= TUNING.dt && n < TUNING.maxFrameSteps && this.hitstop <= 0 && this.winAnim <= 0 && this.phase === 'play') {
          this.stepOnce();
          this.acc -= TUNING.dt;
          n++;
        }
      }
    } else if (this.phase === 'replay' && this.replayPlaying && this.replaySim) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= TUNING.dt && n < TUNING.maxFrameSteps && this.replaySim.tick < this.replayUntil) {
        step(this.replaySim, TUNING.dt);
        this.acc -= TUNING.dt;
        n++;
      }
      if (this.replaySim.tick >= this.replayUntil) this.replayPlaying = false;
    }
    this.animate(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  };

  private stepOnce(): void {
    if (this.ghost && this.ghostInputs) {
      while (this.ghostAt < this.ghostInputs.length && this.ghostInputs[this.ghostAt].tick === this.ghost.tick) {
        applyInput(this.ghost, this.ghostInputs[this.ghostAt].kind);
        this.ghostAt++;
      }
      if (this.ghost.alive && !this.ghost.won) step(this.ghost, TUNING.dt);
    }
    const ev = step(this.sim, TUNING.dt);
    const b = this.sim.ball;
    if ((this.trailTick++ & 1) === 0) {
      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 26) this.trail.shift();
    }
    const accent = worldById(this.sim.level.world || 1).accent;
    for (const hit of ev.impacts) {
      const k = Math.min(1, hit.speed / 14);
      this.squash = Math.min(this.squash, 1 - 0.34 * (0.3 + 0.7 * k));
      this.squashV = 0;
      this.impactAngle = Math.atan2(-hit.ny, hit.nx);
      this.audio.land(hit.speed);
      this.impactFx(hit.x, hit.y, hit.nx, hit.ny, k);
      if (hit.speed > 9) this.addTrauma(0.12 + 0.22 * k);
      if (hit.speed > 13) this.freeze = Math.max(this.freeze, 0.03);
      buzz(8, this.save.settings.haptics);
    }
    for (const c of ev.collects) {
      const star = c.kind === 'star';
      if (star) this.audio.collect();
      else this.takeFragment(c.id);
      const color = star ? '#f0d78c' : '#d5e6ea';
      this.particles.burst(c.x, c.y, 0, 1, this.fxCount(16), color, 5, Math.PI * 2);
      this.particles.ring(c.x, c.y, color, 34);
      this.particles.glow(c.x, c.y, color, 40);
      const text = star ? `${this.sim.stats.collected}/${this.sim.stats.totalCollectibles}` : 'fragment';
      this.pops.push({ x: c.x, y: c.y, t: 0, text, color });
      this.dialPulse = Math.max(this.dialPulse, 0.6);
    }
    if (ev.switched) {
      this.audio.switched();
      this.snapArrow();
      this.startWave();
      this.particles.ring(b.x, b.y, accent, 30);
    }
    if (ev.checkpoint) {
      this.particles.ring(b.x, b.y, '#f0e2c0', 36);
      this.particles.burst(b.x, b.y, 0, 1, this.fxCount(10), '#f0e2c0', 4, Math.PI * 2);
    }
    if (ev.broke) {
      this.addTrauma(0.4);
      this.particles.burst(b.x, b.y, -b.vx, -b.vy, this.fxCount(18), ['#e0a15a', '#f3efe4'], 7, Math.PI * 1.4);
    }
    if (ev.portaled) {
      this.audio.portal();
      this.particles.ring(b.x, b.y, '#c9d4e8', 30);
      this.particles.glow(b.x, b.y, '#c9d4e8', 36);
      this.spawnFx = 0.4;
    }
    if (ev.nearMiss) {
      this.near = 1;
      this.audio.near();
      this.addTrauma(0.1);
    }
    if (ev.died) this.onDie();
    else if (ev.won) this.onWin();
    this.audio.setIntensity(Math.min(1, Math.hypot(b.vx, b.vy) / 16));
  }

  private fxCount(n: number): number {
    return this.save.settings.reducedVfx ? Math.ceil(n / 3) : n;
  }

  private addTrauma(v: number): void {
    if (this.save.settings.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + v);
  }

  private impactFx(x: number, y: number, nx: number, ny: number, k: number): void {
    const n = this.fxCount(Math.round(4 + k * 10));
    const style = this.save.impact;
    if (style === 'impact-prism') this.particles.burst(x, y, nx, ny, n, ['#e07a6a', '#f0d78c', '#9eb7d8'], 3 + k * 5, 1.8);
    else this.particles.burst(x, y, nx, ny, n, '#f3efe4', 3 + k * 5, 1.6);
    if (style === 'impact-ring' || k > 0.6) this.particles.ring(x, y, worldById(this.sim.level.world || 1).accent2, 14 + k * 18, 0.35);
  }

  private startWave(): void {
    this.wave = 0;
    this.waveDir = this.sim.gravityDir;
    this.dialPulse = 1;
  }

  private takeFragment(id: string): void {
    this.audio.fragment();
    const frag = this.sim.level.fragments.find((f) => f.id === id);
    if (!frag || this.save.found.includes(frag.id)) return;
    this.save.found.push(frag.id);
    this.save.currency += 1;
    this.ui.toast(frag.line);
    if (this.save.found.length >= 6) {
      const a = grant(this.save, 'collected');
      if (a) this.ui.toast(a.name);
    }
    writeSave(this.save);
  }

  private onDie(): void {
    this.audio.die();
    this.flash = 1;
    const b = this.sim.ball;
    const colors = ballColors(this.save.ball, worldById(this.sim.level.world || 1));
    this.particles.shatter(b.x, b.y, b.vx, b.vy, colors, this.fxCount(16));
    this.particles.ring(b.x, b.y, '#e07a6a', 44, 0.5);
    this.ballHidden = true;
    this.addTrauma(0.5);
    buzz(16, this.save.settings.haptics);
    this.save.stats.deaths += 1;
    this.track('fail');
    if (this.mode === 'endless' || this.mode === 'run') {
      this.hitstop = 0.7;
      this.pendingOver = true;
      return;
    }
    // Long enough to see the break, short enough that retrying stays quick.
    this.hitstop = 0.42;
    this.pendingOver = false;
    this.fails += 1;
  }

  private afterHit(): void {
    if (this.pendingOver) {
      this.finishRun();
      return;
    }
    const cont = this.sim.snap.tick > 0;
    restoreSnap(this.sim);
    this.trail = [];
    this.ballHidden = false;
    this.spawnFx = 0;
    this.syncGravity();
    if (cont) this.ghost = null;
    else this.resetGhost();
    if (this.fails >= 4) this.ui.setHint(this.sim.level.hint);
  }

  private onWin(): void {
    this.audio.win();
    buzz(12, this.save.settings.haptics);
    this.winInputs = this.sim.inputs.map((e) => ({ ...e }));
    this.winTick = this.sim.tick;
    this.winMedal = bestMedal(this.sim.stats, this.sim.level.medals);
    this.track('clear');
    if (this.mode === 'endless') {
      this.endlessScore += this.scoreChunk();
      this.endlessRoom += 1;
      if (this.endlessRoom === 10) {
        const a = grant(this.save, 'endless-10');
        if (a) this.ui.toast(a.name);
      }
      this.ui.toast(`Room ${this.endlessRoom} · ${this.endlessScore}`);
      this.startWinAnim(0.5, () => this.playLevel(endlessLevel(this.endlessSeed, this.endlessRoom), 'endless', this.relics));
      return;
    }
    if (this.mode === 'run') {
      this.runScore += this.scoreChunk();
      this.runRoom += 1;
      if (this.runRoom === 5) {
        const a = grant(this.save, 'run-5');
        if (a) this.ui.toast(a.name);
      }
      this.offers = rollOffers(this.runSeed, this.runRoom, this.relics);
      this.startWinAnim(0.55, () => this.open('pick'));
      return;
    }
    if (this.mode === 'daily') this.recordDaily();
    if (this.mode === 'campaign' || this.mode === 'challenge') this.recordCampaign();
    this.startWinAnim(0.8, () => this.open('clear'));
  }

  /** The ball is drawn into the goal, the room rings, then the result comes up. */
  private startWinAnim(seconds: number, after: () => void): void {
    if (this.phase !== 'play') {
      after();
      return;
    }
    const b = this.sim.ball;
    const g = this.sim.level.goal;
    this.winFrom = { x: b.x, y: b.y };
    this.winTo = g && !(g.h && g.h > 0) ? { x: g.x, y: g.y } : null;
    this.winAnimMax = this.save.settings.reducedMotion ? Math.min(0.35, seconds) : seconds;
    this.winAnim = this.winAnimMax;
    this.winBurst = false;
    this.afterWin = after;
    this.trail = [];
    const at = this.winTo ?? this.winFrom;
    this.particles.ring(at.x, at.y, '#f0e2c0', 50, 0.6);
    this.particles.glow(at.x, at.y, '#f0e2c0', 70, 0.5);
    this.dialPulse = 1;
    this.addTrauma(0.15);
  }

  private finishWin(): void {
    const after = this.afterWin;
    this.afterWin = null;
    this.winAnim = 0;
    this.ballHidden = true;
    after?.();
  }

  private winProgress(): number {
    return this.winAnim > 0 ? 1 - this.winAnim / this.winAnimMax : 0;
  }

  private scoreChunk(): number {
    const s = this.sim.stats;
    return 120 + s.collected * 40 + s.nearMisses * 20 + Math.max(0, 6 - s.rotations) * 8;
  }

  private recordCampaign(): void {
    const level = this.sim.level;
    const stats = this.sim.stats;
    const rec = levelRecord(this.save, level.id);
    const first = rec.clears === 0;
    rec.clears += 1;
    rec.medal = betterMedal(rec.medal, this.winMedal);
    this.recordLine = first ? 'First clear' : '';
    if (rec.bestTime == null || stats.time < rec.bestTime) {
      if (!first) this.recordLine = 'New best time';
      rec.bestTime = stats.time;
      rec.bestRot = stats.rotations;
      rec.ghost = this.winInputs.slice();
    } else this.recordLine = `Best ${rec.bestTime.toFixed(2)}s`;
    this.save.levels[level.id] = rec;
    this.save.stats.clears += 1;
    this.save.stats.rotations += stats.rotations;
    this.save.lastLevel = level.id;
    if (this.winMedal === 'perfect' && !this.save.awardedPerfect.includes(level.id)) {
      this.save.awardedPerfect.push(level.id);
      this.save.currency += 1;
      this.save.stats.perfects = countPerfects(this.save);
    }
    for (const a of grantsForClear(this.save, {
      world: level.world,
      rotations: stats.rotations,
      medal: this.winMedal,
      firstClear: first,
    })) this.ui.toast(a.name);
    writeSave(this.save);
  }

  private recordDaily(): void {
    const prev = this.save.daily[this.dailyDate];
    const time = this.sim.stats.time;
    if (!prev || time < prev.time) this.save.daily[this.dailyDate] = { time, medal: this.winMedal };
    this.recordLine = !prev ? 'Today’s first clear' : time < prev.time ? 'New best today' : `Today’s best ${prev.time.toFixed(2)}s`;
    if (!prev) this.save.currency += 1;
    const a = grant(this.save, 'daily');
    if (a) this.ui.toast(a.name);
    writeSave(this.save);
  }

  private finishRun(): void {
    const rooms = this.mode === 'run' ? this.runRoom : this.endlessRoom;
    const score = this.mode === 'run' ? this.runScore : this.endlessScore;
    const earned = Math.floor(rooms / (this.mode === 'run' ? 2 : 3));
    this.save.currency += earned;
    if (this.mode === 'endless' && score > this.save.stats.bestEndless) this.save.stats.bestEndless = score;
    if (this.mode === 'run' && score > this.save.stats.bestRun) this.save.stats.bestRun = score;
    writeSave(this.save);
    this.overText = 'The line broke.';
    this.overScore = `${score} points · ${rooms} rooms · ${earned} fragments`;
    this.open('over');
  }

  private playLevel(level: LevelDef, mode: Mode, relics?: RelicState): void {
    this.mode = mode;
    this.relics = relics ?? freshRelics();
    this.sim = createSim(level, this.relics);
    this.fails = 0;
    this.hitstop = 0;
    this.acc = 0;
    this.arrow = dirAngle(level.gravity.dir);
    this.arrowTarget = this.arrow;
    this.arrowV = 0;
    this.intro = 1;
    this.reveal = 0;
    this.resetFx();
    this.thought = '';
    this.thoughtLeft = 0;
    if (!this.save.seenThoughts.includes(level.id) && level.thought) {
      this.thought = level.thought;
      this.thoughtLeft = 3.2;
      this.save.seenThoughts.push(level.id);
      writeSave(this.save);
    }
    this.ui.setHint('');
    this.ui.setBanner(this.thought);
    const rec = levelRecord(this.save, level.id);
    this.ghostInputs = this.save.settings.ghosts ? rec.ghost : null;
    this.resetGhost();
    this.particles.clearTransient();
    this.particles.fillDust(level.w, level.h, '#f3efe4', this.save.settings.reducedVfx ? 24 : 70);
    this.audio.setWorld(ROOTS[(level.world - 1) % ROOTS.length] ?? 110);
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.track('level');
    this.open('play');
  }

  /** Clears every transient animation so a fresh attempt starts still. */
  private resetFx(): void {
    this.trail = [];
    this.trailTick = 0;
    this.squash = 1;
    this.squashV = 0;
    this.kickX = this.kickY = this.kickVX = this.kickVY = 0;
    this.lean = this.leanV = 0;
    this.trauma = 0;
    this.freeze = 0;
    this.spin = this.spinV = 0;
    this.spawnFx = 0;
    this.ballHidden = false;
    this.winAnim = 0;
    this.afterWin = null;
    this.wave = 1;
    this.ripples = [];
    this.pops = [];
    this.flash = 0;
    this.near = 0;
    this.syncGravity();
  }

  private syncGravity(): void {
    const [gx, gy] = dirVector(this.sim.gravityDir);
    this.gravX = gx;
    this.gravY = gy;
    this.snapArrow();
  }

  private resetGhost(): void {
    if (!this.ghostInputs || !this.save.settings.ghosts) {
      this.ghost = null;
      return;
    }
    this.ghost = createSim(this.sim.level, this.relics);
    this.ghostAt = 0;
  }

  private onPointer(e: PointerEvent): void {
    if (this.phase !== 'play' || this.hitstop > 0 || this.winAnim > 0) return;
    this.audio.resume();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const left = px < rect.width / 2;
    const ccw = this.save.settings.swapControls ? !left : left;
    if (this.turn(ccw ? 'ccw' : 'cw', left)) {
      this.ripples.push({ x: px, y: py, t: 0, ccw });
      if (this.ripples.length > 6) this.ripples.shift();
    }
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
    if (k === 'escape') {
      if (this.phase === 'play') this.pause();
      else if (this.phase !== 'map') this.resume();
      return;
    }
    if (k === 'r') {
      this.fullRestart();
      return;
    }
    if (import.meta.env.DEV && k === ']') {
      this.onWin();
      return;
    }
    if (import.meta.env.DEV && k === '[') this.slow = !this.slow;
    if (this.phase !== 'play' || this.hitstop > 0 || this.winAnim > 0) return;
    if (k === 'arrowleft' || k === 'a') this.turn(this.save.settings.swapControls ? 'cw' : 'ccw', true);
    if (k === 'arrowright' || k === 'd') this.turn(this.save.settings.swapControls ? 'ccw' : 'cw', false);
  }

  private turn(kind: 'cw' | 'ccw', leftSide: boolean): boolean {
    const res = applyInput(this.sim, kind);
    if (res === 'locked') {
      this.audio.deny();
      this.addTrauma(0.12);
      return false;
    }
    if (res !== 'ok') return false;
    if (this.sim.stats.rotations === 1) {
      const a = grant(this.save, 'first-shift');
      if (a) {
        this.ui.toast(a.name);
        writeSave(this.save);
      }
    }
    this.arrowTarget += kind === 'cw' ? -Math.PI / 2 : Math.PI / 2;
    const [gx, gy] = dirVector(this.sim.gravityDir);
    if (!this.save.settings.reducedMotion) {
      // Springs, not snaps: the room lurches against the new pull and leans into it.
      this.kickVX += -gx * 210;
      this.kickVY += gy * 210;
      this.leanV += kind === 'cw' ? -0.75 : 0.75;
    }
    if (leftSide) this.edgeL = 1;
    else this.edgeR = 1;
    this.startWave();
    this.audio.gravity(this.sim.gravityDir);
    this.particles.burst(this.sim.ball.x, this.sim.ball.y, gx, gy, this.fxCount(16), '#f3efe4', 5);
    buzz(10, this.save.settings.haptics);
    this.ui.say(`Gravity pulls ${['down', 'left', 'up', 'right'][this.sim.gravityDir]}`);
    this.track('turn');
    return true;
  }

  private snapArrow(): void {
    this.arrowTarget = this.arrow + wrapAngle(dirAngle(this.sim.gravityDir) - this.arrow);
  }

  private animate(dt: number): void {
    // Semi-implicit springs; dt is capped at 50 ms upstream, which keeps them stable.
    this.arrowV += ((this.arrowTarget - this.arrow) * 260 - this.arrowV * 22) * dt;
    this.arrow += this.arrowV * dt;
    this.squashV += ((1 - this.squash) * 320 - this.squashV * 16) * dt;
    this.squash += this.squashV * dt;
    this.kickVX += (-this.kickX * 220 - this.kickVX * 17) * dt;
    this.kickVY += (-this.kickY * 220 - this.kickVY * 17) * dt;
    this.kickX += this.kickVX * dt;
    this.kickY += this.kickVY * dt;
    this.leanV += (-this.lean * 130 - this.leanV * 13) * dt;
    this.lean += this.leanV * dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.flash *= Math.exp(-dt * 6);
    this.near *= Math.exp(-dt * 4);
    this.edgeL *= Math.exp(-dt * 5);
    this.edgeR *= Math.exp(-dt * 5);
    this.dialPulse = Math.max(0, this.dialPulse - dt * 2.2);
    this.wave = Math.min(1, this.wave + dt * 2.1);
    this.reveal = Math.min(1, this.reveal + dt * 2.6);
    this.spawnFx = Math.min(1, this.spawnFx + dt * 3.4);
    this.intro = Math.max(0, this.intro - dt * 0.45);
    for (const r of this.ripples) r.t += dt * 2.4;
    this.ripples = this.ripples.filter((r) => r.t < 1);
    for (const p of this.pops) p.t += dt * 1.1;
    this.pops = this.pops.filter((p) => p.t < 1);
    if (this.thoughtLeft > 0) {
      this.thoughtLeft -= dt;
      this.ui.setBanner(this.thoughtLeft > 0 ? this.thought : '');
    }
    const g = this.sim ? dirVector(this.sim.gravityDir) : [0, -1];
    const ease = Math.min(1, dt * 9);
    this.gravX += (g[0] - this.gravX) * ease;
    this.gravY += (g[1] - this.gravY) * ease;
    this.skyX += this.gravX * dt * 0.5;
    this.skyY += this.gravY * dt * 0.5;
    if (this.sim && this.phase === 'play' && this.hitstop <= 0 && this.winAnim <= 0) {
      const b = this.sim.ball;
      // Roll without slipping while supported; coast otherwise.
      if (this.sim.support >= 0) this.spinV = (this.gravX * b.vy - this.gravY * b.vx) / b.r;
      else this.spinV *= Math.exp(-dt * 0.8);
      this.spin += this.spinV * dt;
    }
    if (this.winAnim > 0) {
      const u = this.winProgress();
      this.spin += dt * (6 + u * 30);
      if (!this.winBurst && u > 0.6) {
        this.winBurst = true;
        const at = this.winTo ?? this.winFrom;
        this.particles.burst(at.x, at.y, 0, 1, this.fxCount(26), ['#f0e2c0', '#f0d78c', '#f3efe4'], 9, Math.PI * 2);
        this.particles.ring(at.x, at.y, '#f0e2c0', 80, 0.7);
        this.addTrauma(0.25);
      }
    }
    this.particles.step(dt, g[0] * 6, g[1] * 6, this.sim?.level.w ?? 9, this.sim?.level.h ?? 16);
  }

  private ballPose(shown: SimState): { x: number; y: number; scale: number; alpha: number } {
    const b = shown.ball;
    if (this.phase === 'replay') return { x: b.x, y: b.y, scale: 1, alpha: 1 };
    if (this.winAnim > 0) {
      const u = this.winProgress();
      const to = this.winTo ?? this.winFrom;
      const m = easeOutCubic(Math.min(1, u * 1.6));
      return {
        x: this.winFrom.x + (to.x - this.winFrom.x) * m,
        y: this.winFrom.y + (to.y - this.winFrom.y) * m,
        scale: 1 - Math.pow(Math.min(1, u / 0.65), 2),
        alpha: 1,
      };
    }
    return { x: b.x, y: b.y, scale: 1, alpha: this.ballHidden ? 0 : 1 };
  }

  private draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    if (this.canvas.width !== Math.floor(cssW * dpr) || this.canvas.height !== Math.floor(cssH * dpr)) {
      this.canvas.width = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
    }
    const shown = this.phase === 'replay' && this.replaySim ? this.replaySim : this.sim;
    if (!shown) return;
    const pts = this.wantPredict() && this.phase === 'play' && !this.ballHidden && this.winAnim <= 0 && this.hitstop <= 0
      ? predict(this.sim, this.save.settings.reducedVfx ? 0.2 : 0.38)
      : [];
    const pose = this.ballPose(shown);
    const calm = this.save.settings.reducedMotion;
    const now = performance.now() / 1000;
    // Trauma shake: squared so small hits stay subtle and big ones land.
    const shake = calm ? 0 : this.trauma * this.trauma;
    const shakeX = shake * 9 * (Math.sin(now * 71) * 0.6 + Math.sin(now * 43 + 1.3) * 0.4);
    const shakeY = shake * 9 * (Math.sin(now * 67 + 2.1) * 0.6 + Math.sin(now * 39 + 0.4) * 0.4);
    const shakeR = shake * 0.035 * Math.sin(now * 53 + 0.7);
    const trail = this.phase === 'replay' || pose.alpha === 0 || this.winAnim > 0 ? [] : [...this.trail, { x: pose.x, y: pose.y }];
    drawFrame(this.ctx, {
      cssW, cssH, dpr,
      level: shown.level,
      sim: shown,
      motes: this.particles.motes,
      trail,
      predict: pts,
      ghost: this.ghost && this.phase === 'play' ? { x: this.ghost.ball.x, y: this.ghost.ball.y } : null,
      arrow: this.arrow,
      squash: this.squash,
      impactAngle: this.impactAngle,
      flash: this.flash,
      near: this.near,
      skin: this.save.ball,
      trailStyle: this.save.trail,
      gravStyle: this.save.gravityFx,
      reducedVfx: this.save.settings.reducedVfx,
      strongPatterns: this.save.settings.strongPatterns,
      showHints: this.wantHints(),
      now,
      intro: this.intro,
      kickX: calm ? 0 : this.kickX + shakeX,
      kickY: calm ? 0 : this.kickY + shakeY,
      orderText: shown.level.orderedCheckpoints ? `${shown.order}/${shown.level.checkpoints.length}` : '',
      lean: calm ? 0 : this.lean + shakeR,
      gravX: this.gravX,
      gravY: this.gravY,
      wave: calm ? 1 : this.wave,
      waveDir: this.waveDir,
      ripples: this.ripples,
      edgeL: this.edgeL,
      edgeR: this.edgeR,
      dialPulse: this.dialPulse,
      spin: this.spin,
      ballX: pose.x,
      ballY: pose.y,
      ballScale: pose.scale,
      ballAlpha: pose.alpha,
      spawnFx: this.phase === 'replay' ? 1 : this.spawnFx,
      reveal: calm ? 1 : this.reveal,
      skyX: this.skyX,
      skyY: this.skyY,
      pops: this.pops,
      worldLabel: this.worldLabel(),
    });
  }

  private worldLabel(): string {
    if (this.mode === 'endless') return `Endless · Room ${this.endlessRoom + 1}`;
    if (this.mode === 'run') return `Gravity Run · Room ${this.runRoom + 1}`;
    if (this.mode === 'daily') return `Daily · ${this.dailyLabel}`;
    if (this.mode === 'sandbox') return 'Sandbox';
    const w = worldById(this.sim.level.world || 1);
    return `${this.mode === 'challenge' ? 'Challenge' : `World ${w.id}`} · ${w.name}`;
  }

  private wantPredict(): boolean {
    if (!this.sim) return false;
    const t = this.save.settings.trajectory;
    if (t === 'off') return false;
    if (t === 'on') return true;
    return this.sim.level.world <= 2 && !this.sim.level.challenge;
  }

  private wantHints(): boolean {
    if (!this.sim) return false;
    const id = this.sim.level.id;
    return (id === '1-1' || id === '1-2' || id === '1-3') && !this.save.levels[id]?.medal;
  }

  private pause(): void {
    if (this.phase === 'play') this.open('pause');
  }

  private resume(): void {
    if (this.sim) this.open('play');
  }

  private fullRestart(): void {
    if (!this.sim) return;
    restartSim(this.sim);
    this.sim.snap = this.sim.start;
    this.resetFx();
    this.resetGhost();
    this.hitstop = 0;
    this.intro = 1;
    this.open('play');
    this.track('restart');
  }

  private retryFromSheet(): void {
    if (this.phase === 'over') {
      if (this.mode === 'endless') this.startEndless();
      else if (this.mode === 'run') this.startRun();
      else this.fullRestart();
      return;
    }
    this.fullRestart();
  }

  private next(): void {
    if (this.mode !== 'campaign') {
      this.open('map');
      return;
    }
    const n = nextCampaign(this.sim.level.id);
    if (n && levelUnlocked(this.save, n.id)) this.playLevel(n, 'campaign');
    else this.open('map');
  }

  private select(id: string): void {
    if (!levelUnlocked(this.save, id)) return;
    const level = getLevel(id);
    if (!level) return;
    this.save.lastLevel = id;
    writeSave(this.save);
    this.playLevel(level, level.challenge ? 'challenge' : 'campaign');
  }

  private open(phase: Phase): void {
    this.phase = phase;
    this.ui.show(this.model());
  }

  private startMode(id: string): void {
    if (id === 'daily' && modeUnlocked(this.save, 'daily')) this.startDaily();
    else if (id === 'endless' && modeUnlocked(this.save, 'endless')) this.startEndless();
    else if (id === 'run' && modeUnlocked(this.save, 'run')) this.startRun();
    else if (id === 'sandbox' && modeUnlocked(this.save, 'sandbox')) this.playLevel(sandboxLevel(), 'sandbox');
  }

  private startDaily(): void {
    const d = new Date();
    this.dailyDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const built = dailyLevel(this.dailyDate);
    this.dailyLabel = built.label;
    this.playLevel(built.level, 'daily');
    this.ui.toast(`${this.dailyDate} · ${this.dailyLabel}`);
  }

  private startEndless(): void {
    this.endlessSeed = (Math.random() * 1e9) >>> 0;
    this.endlessRoom = 0;
    this.endlessScore = 0;
    this.playLevel(endlessLevel(this.endlessSeed, 0), 'endless', freshRelics());
  }

  private startRun(): void {
    this.runSeed = (Math.random() * 1e9) >>> 0;
    this.runRoom = 0;
    this.runScore = 0;
    this.relics = freshRelics();
    this.playLevel(endlessLevel(this.runSeed, 0), 'run', this.relics);
  }

  private pickOffer(index: number): void {
    const offer = this.offers[index];
    if (!offer) return;
    offer.apply(this.relics);
    this.playLevel(endlessLevel(this.runSeed, this.runRoom), 'run', this.relics);
  }

  private watch(): void {
    this.replayUntil = Math.max(1, this.winTick);
    this.replaySim = replay(this.sim.level, this.winInputs, this.relics, this.replayUntil);
    this.replayPlaying = false;
    this.open('replay');
  }

  private scrub(u: number): void {
    const tick = Math.max(1, Math.round(u * this.winTick));
    this.replaySim = replay(this.sim.level, this.winInputs, this.relics, tick);
    this.replayPlaying = false;
  }

  private setSetting(key: keyof Settings, value: number | boolean | string): void {
    (this.save.settings as unknown as Record<string, unknown>)[key] = value;
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    writeSave(this.save);
  }

  private equip(id: string): void {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c) return;
    if (!this.save.unlockedCosmetics.includes(id)) {
      if (this.save.currency < c.cost) {
        this.ui.toast('Not enough fragments');
        return;
      }
      this.save.currency -= c.cost;
      this.save.unlockedCosmetics.push(id);
    }
    if (c.slot === 'ball') this.save.ball = id;
    if (c.slot === 'trail') this.save.trail = id;
    if (c.slot === 'impact') this.save.impact = id;
    if (c.slot === 'gravity') this.save.gravityFx = id;
    writeSave(this.save);
    this.open('wardrobe');
  }

  private copyShare(): void {
    const text = encodeGhost(this.sim.level.id, this.sim.stats.time, this.winInputs);
    const line = `Gravityball ${this.sim.level.name} — ${this.sim.stats.time.toFixed(2)}s. Can you beat it? ${text}`;
    void navigator.clipboard?.writeText(line).then(() => this.ui.toast('Challenge copied'));
  }

  private resetProgress(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.ui.toast('Tap erase again to confirm');
      return;
    }
    this.save = defaultSave();
    writeSave(this.save);
    this.resetArmed = false;
    this.playLevel(mustLevel('1-1'), 'campaign');
  }

  private model(): SheetModel {
    const level = this.sim.level;
    const world = WORLDS.find((w) => w.id === level.world);
    const stats = this.sim.stats;
    const lines = (['bronze', 'silver', 'gold', 'perfect'] as MedalTier[]).map((tier) => ({
      tier,
      text: describeMedal(level.medals[tier]),
      on: rank(this.winMedal) >= rank(tier),
    }));
    const nextWorld = isLastInWorld(level.id) ? WORLDS.find((w) => w.id === level.world + 1) : undefined;
    return {
      phase: this.phase,
      title: this.phase === 'clear' ? medalWord(this.winMedal) : this.phase === 'over' ? this.overText : level.name,
      kicker: this.mode === 'daily' ? `Daily · ${this.dailyLabel}` : `${world?.name ?? ''} · ${level.name}`,
      body: level.hint,
      stat: `${stats.time.toFixed(2)}s · ${stats.rotations} ${stats.rotations === 1 ? 'rotation' : 'rotations'}`,
      time: stats.time,
      rotations: stats.rotations,
      stars: level.stars.length ? `${stats.collected}/${level.stars.length}` : '',
      record: this.recordLine,
      accent: world?.accent ?? '#e6d3b1',
      medal: this.winMedal,
      medalLines: lines,
      nextText: nextWorld ? `${nextWorld.name} — ${nextWorld.thought}` : '',
      canNext: this.mode === 'campaign' && !!nextCampaign(level.id),
      worlds: this.mapWorlds(),
      settings: this.save.settings,
      currency: this.save.currency,
      ball: this.save.ball,
      trail: this.save.trail,
      impact: this.save.impact,
      gravityFx: this.save.gravityFx,
      unlockedCosmetics: this.save.unlockedCosmetics,
      found: FRAGMENTS.map((f) => ({ ...f, have: this.save.found.includes(f.id) })),
      achievements: this.save.achievements,
      offers: this.offers.map((o) => ({ name: o.name, text: o.text })),
      overScore: this.overScore,
      share: '',
      modes: [
        { id: 'daily', name: 'Daily', text: modeUnlocked(this.save, 'daily') ? this.dailyBlurb() : 'Clear one chamber', on: modeUnlocked(this.save, 'daily') },
        { id: 'endless', name: 'Endless', text: modeUnlocked(this.save, 'endless') ? `Best ${this.save.stats.bestEndless}` : 'Finish Awakening', on: modeUnlocked(this.save, 'endless') },
        { id: 'run', name: 'Gravity Run', text: modeUnlocked(this.save, 'run') ? `Best ${this.save.stats.bestRun}` : 'Reach Rotation', on: modeUnlocked(this.save, 'run') },
        { id: 'sandbox', name: 'Sandbox', text: modeUnlocked(this.save, 'sandbox') ? 'A live chamber' : 'Reach Machines', on: modeUnlocked(this.save, 'sandbox') },
      ],
      mastery: this.masteryBlocks(),
    };
  }

  private dailyBlurb(): string {
    const d = new Date();
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const best = this.save.daily[key];
    return best ? `Today ${best.time.toFixed(2)}s` : 'One shared chamber';
  }

  private mapWorlds(): SheetModel['worlds'] {
    let pointed = false;
    return WORLDS.map((w) => {
      const unlocked = worldUnlocked(this.save, w.id);
      const mains = worldLevels(w.id).filter((l) => !l.secret);
      const secrets = SECRET_LEVELS.filter((l) => l.world === w.id && levelUnlocked(this.save, l.id));
      const challenges = unlocked ? CHALLENGE_LEVELS.filter((l) => l.world === w.id) : [];
      const levels = [...mains, ...secrets, ...challenges].map((l) => {
        const medal = this.save.levels[l.id]?.medal ?? null;
        const open = levelUnlocked(this.save, l.id);
        // The first open, unmedalled campaign chamber is where the player is headed.
        const current = !pointed && open && !medal && !l.secret && !l.challenge;
        if (current) pointed = true;
        return { id: l.id, name: l.name, medal, unlocked: open, secret: l.secret, challenge: l.challenge, current };
      });
      const done = mains.filter((l) => this.save.levels[l.id]?.medal).length;
      return {
        id: w.id,
        name: w.name,
        subtitle: w.subtitle,
        thought: w.thought,
        accent: w.accent,
        accent2: w.accent2,
        unlocked,
        done,
        total: mains.length,
        levels: unlocked ? levels : [],
      };
    });
  }

  private masteryBlocks(): { title: string; lines: string[] }[] {
    return [
      { title: 'Understanding', lines: ['Replays keep the line you just drew.', 'A ghost of your best can stand in the room.', 'The dots ahead of the ball are a glance, not an answer.'] },
      { title: 'Exploration', lines: [`${this.save.found.length} fragments in the codex.`, modeUnlocked(this.save, 'endless') ? 'Endless is open.' : 'Endless opens after Awakening.', modeUnlocked(this.save, 'sandbox') ? 'The sandbox is open.' : 'The sandbox opens in Machines.'] },
      { title: 'Experimentation', lines: [`Challenge balls: ${unlockedBalls(this.save).join(', ')}.`, 'Relics live in Gravity Run. They stay out of the campaign.'] },
      { title: 'Mastery', lines: [`${countPerfects(this.save)} perfect chambers.`, `Best endless ${this.save.stats.bestEndless}. Best run ${this.save.stats.bestRun}.`] },
    ];
  }
}

function mustLevel(id: string): LevelDef {
  const level = getLevel(id);
  if (!level) throw new Error(id);
  return level;
}

function rank(m: MedalTier): number {
  return { bronze: 1, silver: 2, gold: 3, perfect: 4 }[m];
}

function medalWord(m: MedalTier): string {
  if (m === 'bronze') return 'Clear';
  if (m === 'silver') return 'Silver';
  if (m === 'gold') return 'Gold';
  return 'Perfect';
}

function wrapAngle(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

function buzz(ms: number, scale: number): void {
  if (scale <= 0 || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(Math.round(ms * scale)); } catch { /* unsupported */ }
}

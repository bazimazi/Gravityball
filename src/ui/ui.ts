import type { MedalTier } from '../core/types';
import type { Settings } from '../save/save';
import { COSMETICS, type Cosmetic } from '../save/save';
import { ACHIEVEMENTS } from '../save/achievements';

export interface MapNode {
  id: string;
  name: string;
  medal: MedalTier | null;
  unlocked: boolean;
  secret?: boolean;
  challenge?: boolean;
  current?: boolean;
}

export interface MapWorld {
  id: number;
  name: string;
  subtitle: string;
  thought: string;
  accent: string;
  accent2: string;
  unlocked: boolean;
  done: number;
  total: number;
  levels: MapNode[];
}

export interface SheetModel {
  phase: string;
  title: string;
  kicker: string;
  body: string;
  stat: string;
  time: number;
  rotations: number;
  stars: string;
  record: string;
  accent: string;
  medal: MedalTier | null;
  medalLines: { tier: MedalTier; text: string; on: boolean }[];
  nextText: string;
  canNext: boolean;
  worlds: MapWorld[];
  settings: Settings;
  currency: number;
  ball: string;
  trail: string;
  impact: string;
  gravityFx: string;
  unlockedCosmetics: string[];
  found: { id: string; line: string; have: boolean }[];
  achievements: string[];
  offers: { name: string; text: string }[];
  overScore: string;
  share: string;
  modes: { id: string; name: string; text: string; on: boolean }[];
  mastery: { title: string; lines: string[] }[];
}

export interface Hooks {
  pause: () => void;
  restart: () => void;
  resume: () => void;
  map: () => void;
  settings: () => void;
  wardrobe: () => void;
  mastery: () => void;
  codex: () => void;
  selectLevel: (id: string) => void;
  next: () => void;
  retry: () => void;
  watch: () => void;
  closeReplay: () => void;
  scrub: (v: number) => void;
  toggleReplay: () => void;
  setSetting: (key: keyof Settings, value: number | boolean | string) => void;
  equip: (id: string) => void;
  mode: (id: string) => void;
  pickOffer: (index: number) => void;
  copyShare: () => void;
  resetProgress: () => void;
  click: () => void;
}

const FULL = new Set(['map', 'settings', 'wardrobe', 'mastery', 'codex']);

export class UI {
  private sheet: HTMLElement;
  private scrim: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private sr: HTMLElement;
  private toasts: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;
  private phase = 'play';
  private closing = 0;
  private bannerText = '';
  private hintText = '';
  private counting = 0;

  constructor(private hooks: Hooks) {
    this.sheet = must('sheet');
    this.scrim = must('scrim');
    this.banner = must('banner');
    this.hint = must('hintline');
    this.sr = must('sr');
    this.toasts = must('toasts');
    this.pauseBtn = must('btn-pause') as HTMLButtonElement;
    this.restartBtn = must('btn-restart') as HTMLButtonElement;
    this.pauseBtn.addEventListener('click', () => this.hooks.pause());
    this.restartBtn.addEventListener('click', () => {
      this.restartBtn.classList.remove('spin');
      void this.restartBtn.offsetWidth;
      this.restartBtn.classList.add('spin');
      this.hooks.restart();
    });
    this.scrim.addEventListener('click', () => {
      if (this.phase === 'pause') {
        this.hooks.click();
        this.hooks.resume();
      }
    });
    this.sheet.addEventListener('click', (e) => this.onClick(e));
    this.sheet.addEventListener('input', (e) => this.onInput(e));
    this.sheet.addEventListener('change', (e) => this.onInput(e));
  }

  chrome(play: boolean): void {
    this.pauseBtn.hidden = !play;
    this.restartBtn.hidden = !play;
  }

  say(text: string): void {
    this.sr.textContent = text;
  }

  setBanner(text: string): void {
    if (text === this.bannerText) return;
    this.bannerText = text;
    if (text) this.banner.textContent = text;
    this.banner.classList.toggle('show', !!text);
  }

  setHint(text: string): void {
    if (text === this.hintText) return;
    this.hintText = text;
    if (text) this.hint.textContent = text;
    this.hint.classList.toggle('show', !!text);
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    // Clear-time grants can arrive in a burst; keep the stack short.
    const live = Array.from(this.toasts.children).filter((c) => !c.classList.contains('out'));
    for (const old of live.slice(0, Math.max(0, live.length - 3))) old.classList.add('out');
    window.setTimeout(() => el.classList.add('out'), 2400);
    window.setTimeout(() => el.remove(), 2800);
  }

  show(model: SheetModel): void {
    document.documentElement.classList.toggle('calm', model.settings.reducedMotion);
    const prev = this.phase;
    this.phase = model.phase;
    this.chrome(model.phase === 'play' || model.phase === 'replay');
    if (model.phase === 'play') {
      this.close();
      return;
    }
    window.clearTimeout(this.closing);
    const entering = this.sheet.hidden || this.sheet.classList.contains('leaving');
    const full = FULL.has(model.phase);
    this.sheet.hidden = false;
    this.sheet.classList.remove('leaving');
    this.sheet.classList.toggle('full', full);
    this.sheet.dataset.phase = model.phase;
    this.sheet.style.setProperty('--tint', model.accent);
    this.scrim.dataset.phase = model.phase;
    this.scrim.classList.toggle('on', !full && model.phase !== 'replay');
    // Slide the sheet in when it appears or changes shape; otherwise only its content moves.
    if (entering || FULL.has(prev) !== full) {
      this.sheet.classList.remove('enter');
      void this.sheet.offsetWidth;
      this.sheet.classList.add('enter');
    }
    this.sheet.innerHTML = this.render(model);
    this.sheet.scrollTop = 0;
    Array.from(this.sheet.children).forEach((el, i) => (el as HTMLElement).style.setProperty('--i', `${Math.min(i, 12)}`));
    if (model.phase === 'clear' || model.phase === 'over') this.countUp();
    if (model.phase === 'map') {
      const cur = this.sheet.querySelector<HTMLElement>('.node.current');
      if (cur) window.requestAnimationFrame(() => cur.scrollIntoView({ block: 'nearest' }));
    }
  }

  private close(): void {
    this.scrim.classList.remove('on');
    if (this.sheet.hidden) return;
    this.sheet.classList.remove('enter');
    this.sheet.classList.add('leaving');
    window.clearTimeout(this.closing);
    this.closing = window.setTimeout(() => {
      this.sheet.hidden = true;
      this.sheet.classList.remove('leaving');
      this.sheet.innerHTML = '';
    }, 260);
  }

  /** Numbers on result screens roll up instead of appearing. */
  private countUp(): void {
    const els = Array.from(this.sheet.querySelectorAll<HTMLElement>('[data-count]'));
    if (!els.length) return;
    const calm = document.documentElement.classList.contains('calm');
    const start = performance.now();
    const dur = 700;
    const token = ++this.counting;
    const tick = (t: number) => {
      if (token !== this.counting) return;
      const u = calm ? 1 : Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      for (const el of els) {
        const to = Number(el.dataset.count);
        const dec = Number(el.dataset.dec ?? 0);
        el.textContent = (to * e).toFixed(dec);
      }
      if (u < 1) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  private render(m: SheetModel): string {
    if (m.phase === 'clear') return this.clear(m);
    if (m.phase === 'pause') return this.pause(m);
    if (m.phase === 'map') return this.map(m);
    if (m.phase === 'settings') return this.settings(m);
    if (m.phase === 'wardrobe') return this.wardrobe(m);
    if (m.phase === 'mastery') return this.mastery(m);
    if (m.phase === 'codex') return this.codex(m);
    if (m.phase === 'pick') return this.pick(m);
    if (m.phase === 'over') return this.over(m);
    if (m.phase === 'replay') return this.replay(m);
    return '';
  }

  private clear(m: SheetModel): string {
    const tier = m.medal ?? 'bronze';
    const unmet = m.medalLines.filter((l) => !l.on).slice(0, 2);
    const stars = m.stars ? `<div class="stat"><b>${esc(m.stars)}</b><span>stars</span></div>` : '';
    return `
      <div class="clear-hero tier-${tier}">
        ${emblem(tier)}
        <div>
          <p class="kicker">${esc(m.kicker)}</p>
          <h2>${esc(m.title)}</h2>
          ${m.record ? `<p class="record">${esc(m.record)}</p>` : ''}
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b data-count="${m.time}" data-dec="2">0.00</b><span>seconds</span></div>
        <div class="stat"><b data-count="${m.rotations}">0</b><span>${m.rotations === 1 ? 'rotation' : 'rotations'}</span></div>
        ${stars}
      </div>
      <div class="medals">${m.medalLines.map((l, i) => `
        <div class="medal ${l.tier} ${l.on ? 'on' : ''}" style="--d:${i}">
          ${medalIcon(l.tier)}<span>${l.tier}</span>
        </div>`).join('')}
      </div>
      ${unmet.length ? `<ul class="goals">${unmet.map((l) => `<li><i class="dot ${l.tier}"></i><span><strong>${esc(l.tier)}</strong> ${esc(l.text)}</span></li>`).join('')}</ul>` : ''}
      ${m.nextText ? `<p class="next-world">${esc(m.nextText)}</p>` : ''}
      <div class="row">
        <button class="ghost" type="button" data-act="retry">${icon('retry')}Retry</button>
        ${m.canNext ? `<button class="action" type="button" data-act="next">Next${icon('next')}</button>` : `<button class="action" type="button" data-act="map">${icon('map')}Map</button>`}
      </div>
      <div class="links">
        <button type="button" data-act="watch">${icon('play')}Watch</button>
        <button type="button" data-act="share">${icon('share')}Copy challenge</button>
        <button type="button" data-act="map">${icon('map')}Map</button>
      </div>`;
  }

  private pause(m: SheetModel): string {
    return `
      <p class="kicker">Paused</p>
      <h2>${esc(m.title)}</h2>
      <p class="lede">${esc(m.body)}</p>
      <div class="row">
        <button class="action" type="button" data-act="resume">${icon('play')}Resume</button>
        <button class="ghost" type="button" data-act="retry">${icon('retry')}Restart</button>
      </div>
      <div class="tiles">
        <button type="button" data-act="map">${icon('map')}<span>Map</span></button>
        <button type="button" data-act="settings">${icon('gear')}<span>Settings</span></button>
        <button type="button" data-act="wardrobe">${icon('brush')}<span>Looks</span></button>
        <button type="button" data-act="mastery">${icon('peak')}<span>Mastery</span></button>
        <button type="button" data-act="codex">${icon('book')}<span>Codex</span></button>
      </div>`;
  }

  private map(m: SheetModel): string {
    const modes = m.modes.map((mode) => `
      <button type="button" class="mode" data-mode="${esc(mode.id)}" ${mode.on ? '' : 'disabled'}>
        <span class="mode-icon">${icon(mode.on ? `mode-${mode.id}` : 'lock')}</span>
        <span class="mode-text">${esc(mode.name)}<small>${esc(mode.text)}</small></span>
      </button>`).join('');
    const medals = m.worlds.reduce((n, w) => n + w.done, 0);
    const total = m.worlds.reduce((n, w) => n + w.total, 0);
    const worlds = m.worlds.map((w) => {
      const pct = w.total ? Math.round((w.done / w.total) * 100) : 0;
      const nodes = w.levels.map((n, i) => `
        <button class="node ${n.medal ?? ''} ${n.secret ? 'secret' : ''} ${n.challenge ? 'challenge' : ''} ${n.current ? 'current' : ''}"
          type="button" data-level="${esc(n.id)}" ${n.unlocked ? '' : 'disabled'}
          aria-label="${esc(n.name)}${n.medal ? `, ${n.medal}` : ''}${n.unlocked ? '' : ', locked'}" title="${esc(n.name)}">
          ${n.unlocked ? (n.secret ? '✦' : n.challenge ? 'C' : `${i + 1}`) : icon('lock')}
        </button>`).join('');
      return `
      <section class="world ${w.unlocked ? '' : 'locked'}" style="--wa:${w.accent};--wb:${w.accent2}">
        <header>
          <span class="world-num">${`${w.id}`.padStart(2, '0')}</span>
          <div class="world-title">
            <h2>${esc(w.name)}</h2>
            <p>${esc(w.unlocked ? w.subtitle : 'Further in')}</p>
          </div>
          <span class="world-count">${w.unlocked ? `${w.done}/${w.total}` : icon('lock')}</span>
        </header>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${w.unlocked ? `<p class="thought">${esc(w.thought)}</p><div class="nodes">${nodes}</div>` : ''}
      </section>`;
    }).join('');
    return `
      <div class="map-head">
        <p class="kicker">Gravityball</p>
        <h1>You do not move the ball.</h1>
        <p class="lede">You turn the pull. The ball does the rest.</p>
        <div class="summary">
          <span>${icon('medal')}${medals}/${total}</span>
          <span>${icon('gem')}${m.currency}</span>
          <span>${icon('book')}${m.found.filter((f) => f.have).length}/${m.found.length}</span>
        </div>
      </div>
      <div class="modes">${modes}</div>
      <div class="links">
        <button type="button" data-act="resume">${icon('back')}Back to chamber</button>
        <button type="button" data-act="settings">${icon('gear')}Settings</button>
        <button type="button" data-act="wardrobe">${icon('brush')}Looks</button>
        <button type="button" data-act="mastery">${icon('peak')}Mastery</button>
        <button type="button" data-act="codex">${icon('book')}Codex</button>
      </div>
      ${worlds}`;
  }

  private settings(m: SheetModel): string {
    const s = m.settings;
    return `
      ${backBar('Settings')}
      <h2>The room, tuned.</h2>
      <section class="group">
        <p class="kicker">Sound &amp; touch</p>
        ${slider('music', 'Music', s.music)}
        ${slider('sfx', 'Sound', s.sfx)}
        ${slider('haptics', 'Haptics', s.haptics)}
      </section>
      <section class="group">
        <p class="kicker">Play</p>
        <div class="setting"><span>Path preview</span>
          <span class="seg" role="radiogroup" aria-label="Path preview">${(['auto', 'on', 'off'] as const).map((v) => `
            <label><input type="radio" name="trajectory" data-set="trajectory" value="${v}" ${s.trajectory === v ? 'checked' : ''} /><span>${v}</span></label>`).join('')}
          </span>
        </div>
        ${check('ghosts', 'Show ghost of your best', s.ghosts)}
        ${check('swapControls', 'Swap left and right', s.swapControls)}
      </section>
      <section class="group">
        <p class="kicker">Comfort</p>
        ${check('reducedMotion', 'Reduced motion', s.reducedMotion)}
        ${check('reducedVfx', 'Fewer effects', s.reducedVfx)}
        ${check('strongPatterns', 'Stronger hazard patterns', s.strongPatterns)}
      </section>
      <div class="links danger"><button type="button" data-act="reset">Erase this device’s progress</button></div>`;
  }

  private wardrobe(m: SheetModel): string {
    const slots: [Cosmetic['slot'], string][] = [['ball', 'Ball'], ['trail', 'Trail'], ['impact', 'Impact'], ['gravity', 'Gravity']];
    const worn = (c: Cosmetic) => (c.slot === 'ball' && m.ball === c.id) || (c.slot === 'trail' && m.trail === c.id) || (c.slot === 'impact' && m.impact === c.id) || (c.slot === 'gravity' && m.gravityFx === c.id);
    const groups = slots.map(([slot, name]) => {
      const cards = COSMETICS.filter((c) => c.slot === slot).map((c) => {
        const owned = m.unlockedCosmetics.includes(c.id);
        const on = worn(c);
        const afford = owned || m.currency >= c.cost;
        const tag = owned ? (on ? `${icon('check')}Worn` : 'Wear') : `${icon('gem')}${c.cost}`;
        return `<button class="card ${on ? 'on' : ''} ${owned ? '' : 'shop'} ${afford ? '' : 'poor'}" type="button" data-equip="${esc(c.id)}">
          <span class="swatch ${esc(c.slot)}" style="${swatch(c.id)}"></span>
          <strong>${esc(c.name)}</strong>
          <small>${esc(c.note)}</small>
          <em>${tag}</em>
        </button>`;
      }).join('');
      return `<section class="group"><p class="kicker">${name}</p><div class="grid">${cards}</div></section>`;
    }).join('');
    return `
      ${backBar(`${icon('gem')}${m.currency} fragments`)}
      <h2>Appearance</h2>
      <p class="lede">None of this changes the pull. It only changes the light.</p>
      ${groups}`;
  }

  private mastery(m: SheetModel): string {
    const blocks = m.mastery.map((b, i) => `
      <section class="world plain" style="--wa:var(--accent)">
        <header><span class="world-num">${i + 1}</span><div class="world-title"><h2>${esc(b.title)}</h2></div></header>
        ${b.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      </section>`).join('');
    return `${backBar('Mastery')}<h2>What you can see.</h2>${blocks}`;
  }

  private codex(m: SheetModel): string {
    const lines = m.found.map((f) => f.have
      ? `<p class="codex-line">${icon('gem')}<span>${esc(f.line)}</span></p>`
      : `<p class="codex-line lost">${icon('lock')}<span>· · ·</span></p>`).join('');
    const earned = ACHIEVEMENTS.map((a) => {
      const have = m.achievements.includes(a.id);
      return `<div class="mark ${have ? 'on' : ''}">${icon(have ? 'medal' : 'lock')}<span><strong>${esc(have ? a.name : '???')}</strong><small>${esc(have ? a.text : 'Not yet.')}</small></span></div>`;
    }).join('');
    return `${backBar('Codex')}<h2>Fragments</h2><div class="group">${lines || '<p>Nothing yet.</p>'}</div><h2>Marks</h2><div class="marks">${earned}</div>`;
  }

  private pick(m: SheetModel): string {
    const cards = m.offers.map((o, i) => `
      <button class="card offer" type="button" data-offer="${i}" style="--d:${i}">
        <span class="offer-num">${i + 1}</span>
        <strong>${esc(o.name)}</strong><small>${esc(o.text)}</small>
      </button>`).join('');
    return `<p class="kicker">Gravity Run · room cleared</p><h2>Choose a change.</h2><p class="statline">${esc(m.stat)}</p><div class="offers">${cards}</div>`;
  }

  private over(m: SheetModel): string {
    const score = Number.parseInt(m.overScore, 10);
    const rest = m.overScore.replace(/^\d+\s*points\s*·\s*/, '');
    return `
      <p class="kicker">Run over</p>
      <h2>${esc(m.title)}</h2>
      <div class="stats">
        <div class="stat big"><b data-count="${Number.isFinite(score) ? score : 0}">0</b><span>points</span></div>
      </div>
      <p class="statline">${esc(rest)}</p>
      <div class="row">
        <button class="action" type="button" data-act="retry">${icon('retry')}Again</button>
        <button class="ghost" type="button" data-act="map">${icon('map')}Map</button>
      </div>`;
  }

  private replay(m: SheetModel): string {
    return `
      <p class="kicker">Replay</p>
      <h2>${esc(m.title)}</h2>
      <div id="replay-bar">
        <button class="round" type="button" data-act="toggleReplay" aria-label="Play">${icon('play')}</button>
        <input id="scrub" type="range" min="0" max="1000" value="1000" aria-label="Scrub replay" />
      </div>
      <div class="row"><button class="ghost" type="button" data-act="closeReplay">${icon('back')}Back to the clear</button></div>`;
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-level],[data-mode],[data-equip],[data-offer]');
    if (!t) return;
    this.hooks.click();
    const act = t.dataset.act;
    if (act === 'resume') this.hooks.resume();
    else if (act === 'retry') this.hooks.retry();
    else if (act === 'next') this.hooks.next();
    else if (act === 'map') this.hooks.map();
    else if (act === 'settings') this.hooks.settings();
    else if (act === 'wardrobe') this.hooks.wardrobe();
    else if (act === 'mastery') this.hooks.mastery();
    else if (act === 'codex') this.hooks.codex();
    else if (act === 'watch') this.hooks.watch();
    else if (act === 'closeReplay') this.hooks.closeReplay();
    else if (act === 'toggleReplay') {
      const playing = t.classList.toggle('playing');
      t.innerHTML = icon(playing ? 'pause' : 'play');
      t.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this.hooks.toggleReplay();
    } else if (act === 'share') this.hooks.copyShare();
    else if (act === 'reset') this.hooks.resetProgress();
    else if (t.dataset.level) this.hooks.selectLevel(t.dataset.level);
    else if (t.dataset.mode) this.hooks.mode(t.dataset.mode);
    else if (t.dataset.equip) this.hooks.equip(t.dataset.equip);
    else if (t.dataset.offer) this.hooks.pickOffer(Number(t.dataset.offer));
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.id === 'scrub') {
      const btn = this.sheet.querySelector<HTMLElement>('[data-act="toggleReplay"]');
      if (btn?.classList.contains('playing')) {
        btn.classList.remove('playing');
        btn.innerHTML = icon('play');
      }
      this.hooks.scrub(Number((t as HTMLInputElement).value) / 1000);
      return;
    }
    const key = t.dataset.set as keyof Settings | undefined;
    if (!key) return;
    if (t instanceof HTMLInputElement && t.type === 'checkbox') this.hooks.setSetting(key, t.checked);
    else if (t instanceof HTMLInputElement && t.type === 'range') {
      t.style.setProperty('--v', `${Number(t.value) * 100}%`);
      this.hooks.setSetting(key, Number(t.value));
    } else if (t instanceof HTMLInputElement && t.type === 'radio') {
      if (t.checked && e.type === 'change') this.hooks.setSetting(key, t.value);
    } else this.hooks.setSetting(key, t.value);
    if (key === 'reducedMotion') document.documentElement.classList.toggle('calm', (t as HTMLInputElement).checked);
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function backBar(title: string): string {
  return `<div class="backbar"><button class="round" type="button" data-act="map" aria-label="Back">${icon('back')}</button><span>${title}</span></div>`;
}

function slider(key: string, label: string, value: number): string {
  return `<label class="setting"><span>${label}</span><input data-set="${key}" type="range" min="0" max="1" step="0.05" value="${value}" style="--v:${value * 100}%" /></label>`;
}

function check(key: string, label: string, value: boolean): string {
  return `<label class="setting"><span>${label}</span><input class="switch" data-set="${key}" type="checkbox" ${value ? 'checked' : ''} /></label>`;
}

function emblem(tier: MedalTier): string {
  const rays = Array.from({ length: 12 }, (_, i) => `<line x1="60" y1="8" x2="60" y2="20" transform="rotate(${i * 30} 60 60)" />`).join('');
  const pips = tier === 'bronze' ? 1 : tier === 'silver' ? 2 : tier === 'gold' ? 3 : 4;
  const marks = Array.from({ length: pips }, (_, i) => {
    const x = 60 + (i - (pips - 1) / 2) * 12;
    return `<circle cx="${x}" cy="78" r="3.2" />`;
  }).join('');
  return `
    <svg class="emblem" viewBox="0 0 120 120" aria-hidden="true">
      <g class="rays">${rays}</g>
      <circle class="disc" cx="60" cy="60" r="34" />
      <circle class="ring" cx="60" cy="60" r="28" />
      <path class="arrow" d="M60 38 L60 66 M50 57 L60 67 L70 57" />
      <g class="pips">${marks}</g>
    </svg>`;
}

function medalIcon(tier: MedalTier): string {
  const inner = tier === 'perfect' ? '<path d="M12 7.5l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z"/>' : '';
  return `<svg viewBox="0 0 24 24" class="mi" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/>${inner}</svg>`;
}

function swatch(id: string): string {
  const balls: Record<string, string> = {
    'ball-glass': 'radial-gradient(circle at 35% 30%, #fff, #9eb7d8 55%, #4a5264)',
    'ball-metal': 'radial-gradient(circle at 35% 30%, #f7f7f8, #9aa0a8 55%, #3c414a)',
    'ball-crystal': 'radial-gradient(circle at 35% 30%, #f7fbff, #b7ccea 55%, #6e86a8)',
    'ball-planet': 'radial-gradient(circle at 35% 30%, #f6e2cf, #e0a15a 55%, #6a3a28)',
    'ball-void': 'radial-gradient(circle, #0c070c 58%, #e4c2d4 62%, #e4c2d4 75%, transparent 78%)',
    'ball-plasma': 'radial-gradient(circle at 35% 30%, #fff6ea, #e07a6a 55%, #6a2430)',
    'ball-ancient': 'radial-gradient(circle at 35% 30%, #f3ead6, #cbb892 55%, #6d5b45)',
    'ball-geo': 'conic-gradient(from 150deg, #fff8e6, #c8b890, #fff8e6)',
  };
  const lines: Record<string, string> = {
    'trail-thread': 'linear-gradient(90deg, transparent, #e6d3b1)',
    'trail-dust': 'radial-gradient(circle, #9eb7d8 1.5px, transparent 2px) 0 50%/8px 8px repeat-x',
    'trail-ribbon': 'linear-gradient(90deg, transparent, #e6d3b1)',
    'trail-ember': 'linear-gradient(90deg, transparent, #e07a6a, #f0a070)',
    'trail-ion': 'repeating-linear-gradient(90deg, #9eb7d8 0 3px, transparent 3px 6px)',
    'impact-mote': 'radial-gradient(circle, #f3efe4 2px, transparent 3px) 0 0/10px 10px',
    'impact-ring': 'radial-gradient(circle, transparent 40%, #9eb7d8 44%, #9eb7d8 52%, transparent 56%)',
    'impact-prism': 'conic-gradient(#e07a6a, #f0d78c, #9eb7d8, #e07a6a)',
    'grav-drift': 'repeating-linear-gradient(180deg, rgba(243,239,228,.5) 0 2px, transparent 2px 7px)',
    'grav-filament': 'repeating-linear-gradient(180deg, rgba(243,239,228,.6) 0 8px, transparent 8px 12px)',
    'grav-spore': 'radial-gradient(circle, rgba(158,183,216,.8) 2.5px, transparent 3.5px) 0 0/11px 11px',
    'grav-ember': 'repeating-linear-gradient(180deg, rgba(224,161,90,.7) 0 3px, transparent 3px 7px)',
  };
  const bg = balls[id] ?? lines[id] ?? 'none';
  return `background:${bg}`;
}

const PATHS: Record<string, string> = {
  retry: '<path d="M12 5a7 7 0 1 1-6.3 4"/><path d="M5 4.5V9h4.5"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  map: '<path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5h2.4v14H8zM13.6 5H16v14h-2.4z" fill="currentColor" stroke="none"/>',
  share: '<path d="M12 4v11"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13v6h14v-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  brush: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor"/>',
  peak: '<path d="M3 19l6-10 4 6 3-4 5 8z"/>',
  book: '<path d="M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h9"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  medal: '<circle cx="12" cy="14" r="6"/><path d="M8.5 3.5l2 5M15.5 3.5l-2 5"/>',
  gem: '<path d="M12 3.5l6 8.5-6 8.5-6-8.5z"/>',
  check: '<path d="M5.5 12.5l4 4 9-9"/>',
  'mode-daily': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  'mode-endless': '<path d="M12 12c-2-2.8-3.6-4-5.4-4a4 4 0 0 0 0 8c1.8 0 3.4-1.2 5.4-4s3.6-4 5.4-4a4 4 0 0 1 0 8c-1.8 0-3.4-1.2-5.4-4z"/>',
  'mode-run': '<path d="M6 19V5M6 12h6l3-4M12 12l3 4"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
  'mode-sandbox': '<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/>',
};

function icon(name: string): string {
  const d = PATHS[name] ?? '';
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}

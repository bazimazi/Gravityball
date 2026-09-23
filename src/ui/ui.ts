import type { MedalTier } from '../core/types';
import type { Settings } from '../save/save';
import { COSMETICS } from '../save/save';
import { ACHIEVEMENTS } from '../save/achievements';

export interface MapNode {
  id: string;
  name: string;
  medal: MedalTier | null;
  unlocked: boolean;
  secret?: boolean;
  challenge?: boolean;
}

export interface MapWorld {
  id: number;
  name: string;
  subtitle: string;
  thought: string;
  unlocked: boolean;
  levels: MapNode[];
}

export interface SheetModel {
  phase: string;
  title: string;
  kicker: string;
  body: string;
  stat: string;
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
}

export class UI {
  private sheet: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private sr: HTMLElement;
  private toasts: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;

  constructor(private hooks: Hooks) {
    this.sheet = must('sheet');
    this.banner = must('banner');
    this.hint = must('hintline');
    this.sr = must('sr');
    this.toasts = must('toasts');
    this.pauseBtn = must('btn-pause') as HTMLButtonElement;
    this.restartBtn = must('btn-restart') as HTMLButtonElement;
    this.pauseBtn.addEventListener('click', () => this.hooks.pause());
    this.restartBtn.addEventListener('click', () => this.hooks.restart());
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
    this.banner.textContent = text;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    window.setTimeout(() => el.remove(), 2600);
  }

  show(model: SheetModel): void {
    const full = model.phase === 'map' || model.phase === 'settings' || model.phase === 'wardrobe' || model.phase === 'mastery' || model.phase === 'codex';
    this.sheet.hidden = model.phase === 'play';
    this.sheet.classList.toggle('full', full);
    this.chrome(model.phase === 'play' || model.phase === 'replay');
    if (model.phase === 'play') {
      this.sheet.innerHTML = '';
      return;
    }
    this.sheet.innerHTML = this.render(model);
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
    return `
      <p class="kicker">${esc(m.kicker)}</p>
      <h2>${esc(m.title)}</h2>
      <p class="statline">${esc(m.stat)}</p>
      <div class="medals">${m.medalLines.map((l) => `<div class="medal ${l.tier} ${l.on ? 'on' : ''}">${l.tier}</div>`).join('')}</div>
      ${m.medalLines.filter((l) => !l.on).slice(0, 2).map((l) => `<p>${esc(l.tier)} — ${esc(l.text)}</p>`).join('')}
      ${m.nextText ? `<p>${esc(m.nextText)}</p>` : ''}
      <div class="row">
        <button class="ghost" type="button" data-act="retry">Retry</button>
        ${m.canNext ? '<button class="action" type="button" data-act="next">Next</button>' : '<button class="action" type="button" data-act="map">Map</button>'}
      </div>
      <div class="links">
        <button type="button" data-act="watch">Watch</button>
        <button type="button" data-act="share">Copy challenge</button>
        <button type="button" data-act="map">Map</button>
      </div>`;
  }

  private pause(m: SheetModel): string {
    return `
      <p class="kicker">Paused</p>
      <h2>${esc(m.title)}</h2>
      <p>${esc(m.body)}</p>
      <div class="row">
        <button class="action" type="button" data-act="resume">Resume</button>
        <button class="ghost" type="button" data-act="retry">Restart</button>
      </div>
      <div class="links">
        <button type="button" data-act="map">Map</button>
        <button type="button" data-act="settings">Settings</button>
        <button type="button" data-act="wardrobe">Appearance</button>
        <button type="button" data-act="mastery">Mastery</button>
        <button type="button" data-act="codex">Codex</button>
      </div>`;
  }

  private map(m: SheetModel): string {
    const modes = m.modes.map((mode) => `
      <button type="button" data-mode="${esc(mode.id)}" ${mode.on ? '' : 'disabled'}>
        ${esc(mode.name)}<small>${esc(mode.text)}</small>
      </button>`).join('');
    const worlds = m.worlds.map((w) => `
      <section class="world ${w.unlocked ? '' : 'locked'}">
        <p class="kicker">World ${w.id}</p>
        <h2>${esc(w.name)}</h2>
        <p>${esc(w.unlocked ? w.thought : 'Further in.')}</p>
        <div class="nodes">
          ${w.levels.map((n, i) => `
            <button class="node ${n.medal ?? ''} ${n.secret ? 'secret' : ''} ${n.challenge ? 'challenge' : ''}"
              type="button" data-level="${esc(n.id)}" ${n.unlocked ? '' : 'disabled'}
              aria-label="${esc(n.name)}">
              ${n.secret ? '·' : n.challenge ? 'C' : i + 1}
            </button>`).join('')}
        </div>
      </section>`).join('');
    return `
      <p class="kicker">Gravityball</p>
      <h1>You do not move the ball.</h1>
      <p>You turn the pull. The ball does the rest.</p>
      <div class="modes">${modes}</div>
      <div class="links">
        <button type="button" data-act="settings">Settings</button>
        <button type="button" data-act="wardrobe">Appearance · ${m.currency}</button>
        <button type="button" data-act="mastery">Mastery</button>
        <button type="button" data-act="codex">Codex</button>
        <button type="button" data-act="resume">Back</button>
      </div>
      ${worlds}`;
  }

  private settings(m: SheetModel): string {
    const s = m.settings;
    return `
      <p class="kicker">Settings</p>
      <h2>The room, tuned.</h2>
      ${slider('music', 'Music', s.music)}
      ${slider('sfx', 'Sound', s.sfx)}
      ${slider('haptics', 'Haptics', s.haptics)}
      ${check('reducedMotion', 'Reduced motion', s.reducedMotion)}
      ${check('reducedVfx', 'Fewer effects', s.reducedVfx)}
      ${check('ghosts', 'Show ghost of your best', s.ghosts)}
      ${check('swapControls', 'Swap left and right', s.swapControls)}
      ${check('strongPatterns', 'Stronger hazard patterns', s.strongPatterns)}
      <label class="setting">Path preview
        <select data-set="trajectory">
          ${['auto', 'on', 'off'].map((v) => `<option value="${v}" ${s.trajectory === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <div class="row"><button class="ghost" type="button" data-act="map">Back</button></div>
      <div class="links"><button type="button" data-act="reset">Erase this device’s progress</button></div>`;
  }

  private wardrobe(m: SheetModel): string {
    const cards = COSMETICS.map((c) => {
      const owned = m.unlockedCosmetics.includes(c.id);
      const on = (c.slot === 'ball' && m.ball === c.id) || (c.slot === 'trail' && m.trail === c.id) || (c.slot === 'impact' && m.impact === c.id) || (c.slot === 'gravity' && m.gravityFx === c.id);
      const label = owned ? (on ? 'Worn' : 'Wear') : `${c.cost} fragments`;
      return `<button class="card ${on ? 'on' : ''}" type="button" data-equip="${esc(c.id)}"><strong>${esc(c.name)}</strong><small>${esc(c.note)} · ${label}</small></button>`;
    }).join('');
    return `
      <p class="kicker">${m.currency} fragments</p>
      <h2>Appearance</h2>
      <p>None of this changes the pull. It only changes the light.</p>
      <div class="grid">${cards}</div>
      <div class="row"><button class="ghost" type="button" data-act="map">Back</button></div>`;
  }

  private mastery(m: SheetModel): string {
    const blocks = m.mastery.map((b) => `<section class="world"><h2>${esc(b.title)}</h2>${b.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('');
    return `<p class="kicker">Mastery</p><h2>What you can see.</h2>${blocks}<div class="row"><button class="ghost" type="button" data-act="map">Back</button></div>`;
  }

  private codex(m: SheetModel): string {
    const lines = m.found.map((f) => f.have
      ? `<p class="codex-line">${esc(f.line)}</p>`
      : `<p class="codex-line">· · ·</p>`).join('');
    const earned = ACHIEVEMENTS.filter((a) => m.achievements.includes(a.id))
      .map((a) => `<p class="codex-line"><strong>${esc(a.name)}</strong><br/>${esc(a.text)}</p>`).join('');
    return `<p class="kicker">Codex</p><h2>Fragments</h2>${lines || '<p>Nothing yet.</p>'}<h2>Marks</h2>${earned || '<p>No marks yet.</p>'}<div class="row"><button class="ghost" type="button" data-act="map">Back</button></div>`;
  }

  private pick(m: SheetModel): string {
    const cards = m.offers.map((o, i) => `<button class="card" type="button" data-offer="${i}"><strong>${esc(o.name)}</strong><small>${esc(o.text)}</small></button>`).join('');
    return `<p class="kicker">Gravity Run</p><h2>Choose a change.</h2><p>${esc(m.stat)}</p><div class="grid">${cards}</div>`;
  }

  private over(m: SheetModel): string {
    return `
      <p class="kicker">Run over</p>
      <h2>${esc(m.title)}</h2>
      <p class="statline">${esc(m.overScore)}</p>
      <p>${esc(m.body)}</p>
      <div class="row">
        <button class="action" type="button" data-act="retry">Again</button>
        <button class="ghost" type="button" data-act="map">Map</button>
      </div>`;
  }

  private replay(m: SheetModel): string {
    return `
      <p class="kicker">Replay</p>
      <h2>${esc(m.title)}</h2>
      <div id="replay-bar">
        <button class="ghost" type="button" data-act="toggleReplay">Play</button>
        <input id="scrub" type="range" min="0" max="1000" value="1000" />
      </div>
      <div class="row"><button class="action" type="button" data-act="closeReplay">Back to the clear</button></div>`;
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-level],[data-mode],[data-equip],[data-offer]');
    if (!t) return;
    if (t.dataset.act === 'resume') this.hooks.resume();
    else if (t.dataset.act === 'retry') this.hooks.retry();
    else if (t.dataset.act === 'next') this.hooks.next();
    else if (t.dataset.act === 'map') this.hooks.map();
    else if (t.dataset.act === 'settings') this.hooks.settings();
    else if (t.dataset.act === 'wardrobe') this.hooks.wardrobe();
    else if (t.dataset.act === 'mastery') this.hooks.mastery();
    else if (t.dataset.act === 'codex') this.hooks.codex();
    else if (t.dataset.act === 'watch') this.hooks.watch();
    else if (t.dataset.act === 'closeReplay') this.hooks.closeReplay();
    else if (t.dataset.act === 'toggleReplay') this.hooks.toggleReplay();
    else if (t.dataset.act === 'share') this.hooks.copyShare();
    else if (t.dataset.act === 'reset') this.hooks.resetProgress();
    else if (t.dataset.level) this.hooks.selectLevel(t.dataset.level);
    else if (t.dataset.mode) this.hooks.mode(t.dataset.mode);
    else if (t.dataset.equip) this.hooks.equip(t.dataset.equip);
    else if (t.dataset.offer) this.hooks.pickOffer(Number(t.dataset.offer));
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.id === 'scrub') {
      this.hooks.scrub(Number((t as HTMLInputElement).value) / 1000);
      return;
    }
    const key = t.dataset.set as keyof Settings | undefined;
    if (!key) return;
    if (t instanceof HTMLInputElement && t.type === 'checkbox') this.hooks.setSetting(key, t.checked);
    else if (t instanceof HTMLInputElement && t.type === 'range') this.hooks.setSetting(key, Number(t.value));
    else this.hooks.setSetting(key, t.value);
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

function slider(key: string, label: string, value: number): string {
  return `<label class="setting">${label}<input data-set="${key}" type="range" min="0" max="1" step="0.05" value="${value}" /></label>`;
}

function check(key: string, label: string, value: boolean): string {
  return `<label class="setting">${label}<input data-set="${key}" type="checkbox" ${value ? 'checked' : ''} /></label>`;
}

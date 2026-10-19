// Screen switching, overlays, toasts, timers and avatar chips.
import { $, h, sleep } from './util.js';
import { avatarSVG } from './avatar.js';
import { sfx, audio } from './audio.js';

export function setScene(name) {
  document.body.dataset.scene = name;
}

export function show(el) {
  const scr = $('#screen');
  scr.replaceChildren(el);
  scr.scrollTop = 0;
  el.classList.add('enter');
  return el;
}

export function toast(html, kind = '') {
  const t = h('div', { class: `toast ${kind}`, html });
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

/** Full-screen dramatic title card. Resolves on tap or after `hold` ms. */
export function banner({ title, sub = '', icon = '', tone = 'sun', hold = 2400, tap = false, button }) {
  return new Promise((resolve) => {
    const ov = $('#overlay');
    const card = h('div', { class: `banner tone-${tone}` },
      icon ? h('div', { class: 'banner-icon', html: icon }) : null,
      h('div', { class: 'banner-title' }, title),
      sub ? h('div', { class: 'banner-sub', html: sub }) : null,
      button ? h('button', { class: 'btn btn-orange banner-btn' }, button) : null,
      tap && !button ? h('div', { class: 'banner-tap' }, 'tap to continue') : null,
    );
    const wrap = h('div', { class: 'banner-wrap' }, card);
    ov.append(wrap);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wrap.classList.add('out');
      setTimeout(() => { wrap.remove(); resolve(); }, 350);
    };
    if (tap || button) {
      setTimeout(() => wrap.addEventListener('click', () => { sfx('click'); finish(); }), 500);
    } else setTimeout(finish, hold);
  });
}

export function avatarChip(p, { size = 56, expr, label = true, cls = '', sub } = {}) {
  return h('div', { class: `chip ${cls} ${p.alive === false ? 'is-out' : ''}`, 'data-id': p.id },
    h('div', { class: 'chip-face', html: avatarSVG(p.look, { size, expr: expr || (p.alive === false ? 'sad' : 'neutral') }) }),
    p.immune ? h('div', { class: 'chip-necklace', title: 'Immune' }, '📿') : null,
    label ? h('div', { class: 'chip-name' }, p.human ? `${p.name} (you)` : p.name) : null,
    sub ? h('div', { class: 'chip-sub' }, sub) : null,
  );
}

/** Countdown that ticks in the last 10 seconds. */
export class Timer {
  constructor(seconds, { onTick, onEnd } = {}) {
    this.total = seconds;
    this.left = seconds;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this._iv = null;
    this._lastWhole = Math.ceil(seconds);
  }
  start() {
    let last = performance.now();
    this._iv = setInterval(() => {
      const now = performance.now();
      this.left -= (now - last) / 1000;
      last = now;
      const whole = Math.ceil(this.left);
      if (whole !== this._lastWhole) {
        this._lastWhole = whole;
        if (whole <= 10 && whole > 0) sfx('tick');
      }
      this.onTick?.(this.left, this);
      if (this.left <= 0) this.end();
    }, 100);
    this.onTick?.(this.left, this);
    return this;
  }
  end() {
    if (!this._iv) return;
    clearInterval(this._iv);
    this._iv = null;
    this.left = 0;
    this.onEnd?.();
  }
  stop() {
    clearInterval(this._iv);
    this._iv = null;
  }
}

export function timerRing(cls = '') {
  const el = h('div', { class: `timer-ring ${cls}`, html: `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="tr-bg"/><circle cx="22" cy="22" r="19" class="tr-fg"/></svg><span class="tr-txt">0:00</span>` });
  el.update = (left, total) => {
    const fg = el.querySelector('.tr-fg');
    const c = 2 * Math.PI * 19;
    fg.style.strokeDasharray = c;
    fg.style.strokeDashoffset = c * (1 - Math.max(0, left) / total);
    const s = Math.max(0, Math.ceil(left));
    el.querySelector('.tr-txt').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', left <= 10);
  };
  return el;
}

export async function typeText(el, text, speed = 22) {
  el.textContent = '';
  for (const ch of text) {
    el.textContent += ch;
    await sleep(speed);
  }
}

export function modal(contentEl, { dismissable = true } = {}) {
  return new Promise((resolve) => {
    const wrap = h('div', { class: 'modal-wrap' }, h('div', { class: 'modal card' }, contentEl));
    const close = (v) => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); resolve(v); };
    if (dismissable) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    contentEl.close = close;
    $('#overlay').append(wrap);
  });
}

export function setMusic(m, amb) {
  audio.music(m);
  if (amb !== undefined) audio.ambient(amb);
}

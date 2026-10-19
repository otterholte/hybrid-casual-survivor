// Challenge runner: intro card, countdown, canvas loop, live bot leaderboard, results.
import coconut from './coconut.js';
import spiral from './spiral.js';
import slide from './slide.js';
import totem from './totem.js';
import balance from './balance.js';
import ring from './ring.js';
import { h, rand, sleep, clamp, store } from '../util.js';
import { show, banner, setScene, setMusic, avatarChip } from '../ui.js';
import { sfx } from '../audio.js';
import { avatarSVG } from '../avatar.js';

export const CHALLENGES = [coconut, spiral, slide, totem, balance, ring];
export const byId = (id) => CHALLENGES.find((c) => c.id === id);

const W = 400, H = 670;
const MULT = { race: { easy: 1.45, normal: 1.1, hard: 0.92 }, endurance: { easy: 0.72, normal: 0.92, hard: 1.08 } };

/** Sample how each bot does. Race: finish time. Endurance: time they drop out. */
export function botResults(ch, bots, diff, final = false) {
  const E = ch.expected(diff);
  return bots.map((b) => {
    const sk = b.t[ch.skill] ?? 0.5;
    const boost = final ? 0.95 : 1;
    if (ch.mode === 'race') return { id: b.id, time: E * MULT.race[diff] * boost * (1.45 - sk * 0.75) * rand(0.8, 1.25) };
    return { id: b.id, time: E * MULT.endurance[diff] / boost * (0.55 + sk * 0.8) * rand(0.75, 1.3) };
  });
}

/** For seasons where the human is on the jury: resolve a challenge instantly. */
export function simulateChallenge(ch, players, diff) {
  const res = botResults(ch, players, diff);
  res.sort((a, b) => (ch.mode === 'race' ? a.time - b.time : b.time - a.time));
  return { winner: res[0].id, order: res.map((r) => r.id) };
}

export function runChallenge({ ch, players, diff, final = false, practice = false }) {
  return new Promise(async (resolve) => {
    setScene('challenge');
    setMusic(null, 'beach');
    const me = players.find((p) => p.human);
    const bots = players.filter((p) => !p.human);
    const goal = ch.goal(diff);
    const limit = ch.mode === 'race' ? Math.round(ch.expected(diff) * 2.6) : 0;

    // ---------- intro ----------
    await new Promise((go) => {
      const scr = h('div', { class: 'screen ch-intro' },
        h('div', { class: 'eyebrow' }, practice ? 'PRACTICE' : final ? '🔥 FINAL IMMUNITY CHALLENGE 🔥' : 'IMMUNITY CHALLENGE'),
        h('div', { class: 'ch-icon bob' }, ch.icon),
        h('h1', { class: 'display' }, ch.name),
        h('div', { class: 'card how', html: ch.how }),
        h('div', { class: 'pill-row' },
          h('span', { class: `pill diff-${diff}` }, diff.toUpperCase()),
          h('span', { class: 'pill' }, ch.mode === 'race' ? `⏱ First to finish wins` : '⏳ Last one standing'),
          goal ? h('span', { class: 'pill' }, `🎯 ${goal} ${ch.unit}`) : null),
        !practice ? h('div', { class: 'necklace-tease' }, h('span', { class: 'necklace' }, '📿'), ' Win and you cannot be voted out tonight.') : null,
        h('div', { class: 'rivals' }, ...bots.map((b) => avatarChip(b, { size: 40 }))),
        h('button', { class: 'btn btn-orange btn-big', onclick: () => { sfx('click'); go(); } }, "I'm Ready!"),
      );
      show(scr);
      sfx('drum');
    });

    // ---------- play screen ----------
    const timeEl = h('div', { class: 'ch-time' }, '0.0');
    const board = h('div', { class: 'ch-board' });
    const rows = {};
    for (const p of players) {
      const bar = h('div', { class: 'ch-bar-fill' });
      const lab = h('div', { class: 'ch-bar-lab' }, ch.mode === 'race' ? `0/${goal}` : 'IN');
      const row = h('div', { class: `ch-row ${p.human ? 'me' : ''}` },
        h('div', { class: 'ch-row-face', html: avatarSVG(p.look, { size: 26 }) }),
        h('div', { class: 'ch-bar' }, bar), lab);
      rows[p.id] = { row, bar, lab };
      board.append(row);
    }
    const canvas = h('canvas', { class: 'ch-canvas' });
    const stage = h('div', { class: 'ch-stage' }, canvas);
    const countEl = h('div', { class: 'countdown' });
    const scr = h('div', { class: 'screen ch-play' },
      h('div', { class: 'ch-hud' }, h('div', { class: 'ch-title' }, `${ch.icon} ${ch.name}`), timeEl),
      board, stage, countEl);
    show(scr);

    const g = canvas.getContext('2d');
    let scale = 1, offX = 0, offY = 0, dpr = 1;
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = stage.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      offX = (canvas.width - W * scale) / 2;
      offY = (canvas.height - H * scale) / 2;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    // ---------- shared effects ----------
    const parts = [], texts = [];
    let shake = 0;
    const fx = {
      burst(x, y, color, n = 10) {
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2), s = rand(60, 260);
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.4, 0.9), color, r: rand(2, 5) });
        }
      },
      text(x, y, str, color = '#fff', size = 24) { texts.push({ x, y, str, color, size, life: 1.1 }); },
      shake(m) { shake = Math.max(shake, m); },
    };

    // ---------- state ----------
    const bres = practice ? [] : botResults(ch, bots, diff, final);
    const btime = Object.fromEntries(bres.map((r) => [r.id, r.time]));
    let myProgress = 0, myDone = false, myFail = false, myTime = null, ended = false;
    let t = 0, running = false;
    const announced = new Set();

    const api = {
      W, H, diff, fx, sfx,
      progress(v) { myProgress = v; },
      complete() { if (!myDone && !myFail && running) { myDone = true; myTime = t; } },
      fail(msg) { if (!myDone && !myFail && running) { myFail = true; myTime = t; failMsg = msg; } },
    };
    let failMsg = '';
    const inst = ch.create.call(ch, api);

    const toLogical = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * dpr - offX) / scale, y: ((e.clientY - r.top) * dpr - offY) / scale };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!running) return;
      canvas.setPointerCapture(e.pointerId);
      const p = toLogical(e);
      inst.down?.(p.x, p.y);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => { if (running) { const p = toLogical(e); inst.move?.(p.x, p.y); } });
    const up = (e) => { if (running) { const p = toLogical(e); inst.up?.(p.x, p.y); } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let last = performance.now(), raf;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running) {
        t += dt;
        inst.update(dt, t);
      }
      for (const p of parts) { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (const x of texts) { x.y -= 40 * dt; x.life -= dt; }
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
      shake = Math.max(0, shake - dt * 40);

      g.setTransform(1, 0, 0, 1, 0, 0);
      const eg = g.createLinearGradient(0, 0, 0, canvas.height);
      eg.addColorStop(0, ch.edge?.[0] || '#123');
      eg.addColorStop(1, ch.edge?.[1] || '#123');
      g.fillStyle = eg;
      g.fillRect(0, 0, canvas.width, canvas.height);
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      g.setTransform(scale, 0, 0, scale, offX + sx * scale, offY + sy * scale);
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.clip();
      inst.draw(g, t);
      for (const p of parts) { g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      for (const x of texts) {
        g.globalAlpha = Math.min(1, x.life * 2);
        g.font = `${x.size}px "Luckiest Guy", sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = 'rgba(40,20,5,.8)'; g.strokeText(x.str, x.x, x.y);
        g.fillStyle = x.color; g.fillText(x.str, x.x, x.y);
      }
      g.globalAlpha = 1;
      g.restore();
      updateBoard();
      raf = requestAnimationFrame(frame);
    };

    const botFrac = (id) => (ch.mode === 'race' ? clamp(t / btime[id], 0, 1) : t < btime[id] ? 1 : 0);
    function updateBoard() {
      timeEl.textContent = ch.mode === 'race' && limit ? `${Math.max(0, limit - t).toFixed(1)}s` : `${t.toFixed(1)}s`;
      timeEl.classList.toggle('urgent', ch.mode === 'race' && limit - t < 10);
      for (const p of players) {
        const r = rows[p.id];
        if (p.human) {
          const f = ch.mode === 'race' ? clamp(myProgress / goal, 0, 1) : myFail ? 0 : 1;
          r.bar.style.width = `${f * 100}%`;
          r.lab.textContent = ch.mode === 'race' ? `${myProgress}/${goal}` : myFail ? 'OUT' : `${myProgress}`;
          r.row.classList.toggle('out', myFail);
        } else {
          const f = botFrac(p.id);
          if (ch.mode === 'race') {
            const shown = Math.min(goal, Math.floor(Math.pow(f, 1.1) * goal + 0.0001));
            r.bar.style.width = `${(shown / goal) * 100}%`;
            r.lab.textContent = `${shown}/${goal}`;
          } else {
            r.bar.style.width = `${f * 100}%`;
            r.lab.textContent = f ? 'IN' : 'OUT';
            r.row.classList.toggle('out', !f);
            if (!f && !announced.has(p.id) && running) {
              announced.add(p.id);
              sfx('gasp');
              flash(`${p.name} is out!`);
            }
          }
        }
      }
      if (running && !ended) checkEnd();
    }

    const flashEl = h('div', { class: 'ch-flash' });
    stage.append(flashEl);
    function flash(text) {
      flashEl.textContent = text;
      flashEl.classList.remove('show');
      void flashEl.offsetWidth;
      flashEl.classList.add('show');
    }

    function checkEnd() {
      if (practice) {
        if (myDone || myFail || (limit && t >= limit)) finish(myDone ? me.id : null);
        return;
      }
      if (ch.mode === 'race') {
        const firstBot = bres.slice().sort((a, b) => a.time - b.time)[0];
        if (myDone) return finish(me.id);
        if (firstBot && t >= firstBot.time) return finish(firstBot.id);
        if (t >= limit) {
          // Time's up: most progress wins.
          const myF = myProgress / goal;
          const best = bres.map((r) => ({ id: r.id, f: Math.min(goal, Math.floor(botFrac(r.id) * goal)) / goal })).sort((a, b) => b.f - a.f)[0];
          return finish(myF >= best.f ? me.id : best.id);
        }
      } else {
        const still = bres.filter((r) => t < r.time);
        if (myFail) {
          const champ = bres.slice().sort((a, b) => b.time - a.time)[0];
          return finish(champ.time > myTime ? champ.id : me.id, champ.time > myTime);
        }
        if (!still.length) return finish(me.id);
      }
    }

    async function finish(winnerId, fastForward = false) {
      if (ended) return;
      ended = true;
      running = false;
      await sleep(fastForward ? 600 : 900);
      cancelAnimationFrame(raf);
      ro.disconnect();
      const winner = players.find((p) => p.id === winnerId);
      let order;
      if (ch.mode === 'race') {
        const mine = myDone ? myTime : limit + (1 - myProgress / Math.max(1, goal)) * 100;
        order = [{ id: me.id, v: mine }, ...bres.map((r) => ({ id: r.id, v: r.time }))].sort((a, b) => a.v - b.v).map((x) => x.id);
      } else {
        order = [{ id: me.id, v: myFail ? myTime : 9999 }, ...bres.map((r) => ({ id: r.id, v: r.time }))].sort((a, b) => b.v - a.v).map((x) => x.id);
      }
      if (winnerId != null) order = [winnerId, ...order.filter((x) => x !== winnerId)];
      if (practice) {
        const key = `ic_best_${ch.id}_${diff}`;
        const prev = store.get(key, null);
        let line = '';
        if (ch.mode === 'race' && myDone) {
          const best = prev == null || myTime < prev;
          if (best) store.set(key, myTime);
          line = `Finished in <b>${myTime.toFixed(1)}s</b>${best ? ' 🏆 New best!' : ` (best ${prev.toFixed(1)}s)`}`;
        } else if (ch.mode === 'endurance') {
          const best = prev == null || myTime > prev;
          if (best) store.set(key, myTime);
          line = `Lasted <b>${(myTime ?? t).toFixed(1)}s</b>${best ? ' 🏆 New best!' : ` (best ${prev.toFixed(1)}s)`}`;
        } else line = 'Out of time!';
        sfx(myDone || ch.mode === 'endurance' ? 'fanfare' : 'fail');
        await banner({ title: myDone || ch.mode === 'endurance' ? 'Nice!' : "Time's up", sub: line, icon: ch.icon, tap: true });
        return resolve({ winner: null, order });
      }
      if (winner.human) {
        sfx('win');
        await banner({ title: 'YOU WIN IMMUNITY!', sub: myTime ? `${ch.mode === 'race' ? 'Finished' : 'Survived'} in ${myTime.toFixed(1)}s` : '', icon: '📿', tone: 'gold', tap: true });
      } else {
        sfx(myFail || !myDone ? 'fail' : 'drum');
        const sub = myFail ? `${failMsg} ${winner.name} outlasted everyone.` : `${winner.name} ${ch.mode === 'race' ? 'finished first' : 'outlasted everyone'}.`;
        await banner({ title: `${winner.name.toUpperCase()} WINS IMMUNITY`, sub, icon: avatarSVG(winner.look, { size: 120, expr: 'happy' }), tone: 'sun', tap: true });
      }
      resolve({ winner: winnerId, order });
    }

    raf = requestAnimationFrame(frame);
    // Countdown.
    for (const n of ['3', '2', '1']) {
      countEl.textContent = n;
      countEl.className = 'countdown show';
      sfx('beep');
      await sleep(650);
      countEl.className = 'countdown';
      await sleep(80);
    }
    countEl.textContent = 'GO!';
    countEl.className = 'countdown show go';
    sfx('go');
    setMusic('challenge');
    running = true;
    last = performance.now();
    setTimeout(() => (countEl.className = 'countdown'), 600);
  });
}

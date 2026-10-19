// Ring Toss: swipe to flick rope rings onto four poles.
import { sky, sun, sea, sand, wood, palm } from './draw.js';
import { shuffle, rand } from '../util.js';

const GROUND = 600, HAND = { x: 58, y: 530 };

export default {
  id: 'ring',
  name: 'Ring Toss',
  icon: '⭕',
  skill: 'physical',
  edge: ['#4fc0ef', '#e8bf6a'],
  mode: 'race',
  how: '<b>Swipe</b> to flick a rope ring: the direction and length of your swipe set the throw. Ring <b>all four poles</b> to win.',
  goal: () => 4,
  expected: (d) => ({ easy: 24, normal: 36, hard: 50 })[d],
  unit: 'poles',
  create(api) {
    const { W, H, diff } = api;
    const tol = { easy: 15, normal: 11, hard: 8 }[diff];
    const heights = shuffle([70, 120, 160, 200]);
    const poles = [168, 236, 302, 362].map((x, i) => ({ x0: x, x, h: heights[i], rings: 0, done: false, ph: rand(0, 6) }));
    let rings = [], swipe = null, ready = true, reload = 0, got = 0, done = false;
    let wind = diff === 'hard' ? rand(-70, 70) : 0;

    return {
      update(dt, t) {
        if (diff === 'hard') {
          for (const p of poles) p.x = p.x0 + Math.sin(t * 0.8 + p.ph) * 10;
          wind = Math.sin(t * 0.25) * 80;
        }
        if (!ready) { reload -= dt; if (reload <= 0) ready = true; }
        for (const r of rings) {
          if (r.state === 'fly') {
            const py = r.y;
            r.vy += 900 * dt;
            r.vx += wind * dt;
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.rot += r.vr * dt;
            for (const p of poles) {
              const top = GROUND - p.h;
              if (r.vy > 0 && py < top && r.y >= top && Math.abs(r.x - p.x) < tol) {
                r.state = 'on'; r.pole = p; r.slide = top; r.rest = GROUND - 8 - p.rings * 9;
                p.rings++;
                if (!p.done) {
                  p.done = true; got++;
                  api.progress(got);
                  api.sfx('clang');
                  api.fx.burst(p.x, top, '#ffe066', 14);
                  api.fx.text(p.x, top - 22, 'RINGER!', '#ffe066', 22);
                  if (got >= 4 && !done) { done = true; api.sfx('fanfare'); setTimeout(() => api.complete(), 800); }
                } else {
                  api.sfx('clack');
                  api.fx.text(p.x, top - 22, 'ALREADY RUNG', '#fff', 16);
                }
                break;
              }
              if (r.y > top && r.y < GROUND && Math.abs(r.x - p.x) < 9) {
                r.vx = -r.vx * 0.35 + (r.x < p.x ? -20 : 20);
                r.x += r.x < p.x ? -4 : 4;
                if (!r.bonk) { api.sfx('clack'); r.bonk = true; }
              }
            }
            if (r.state === 'fly' && r.y >= GROUND - 4) {
              r.state = 'ground'; r.y = GROUND - 4; r.vx *= 0.25; r.life = 1.2;
              api.sfx('thud');
            }
          } else if (r.state === 'on') {
            r.x = r.pole.x;
            r.slide += (r.rest - r.slide) * Math.min(1, dt * 8);
            r.y = r.slide;
            r.rot *= 0.9;
          } else if (r.state === 'ground') {
            r.x += r.vx * dt; r.vx *= 0.95; r.life -= dt;
          }
        }
        rings = rings.filter((r) => !(r.state === 'ground' && r.life <= 0) && r.x < W + 60 && r.x > -60);
      },
      draw(g, t) {
        sky(g, W, H, '#4fc0ef', '#ffe7a6');
        sun(g, 330, 90, 24);
        sea(g, W, 430, t, 90);
        sand(g, W, GROUND - 12, H);
        palm(g, 20, GROUND, 320, 40, t);
        if (wind) {
          g.fillStyle = '#fff'; g.font = '15px "Luckiest Guy", sans-serif'; g.textAlign = 'center';
          g.fillText(`WIND ${wind > 0 ? '→' : '←'} ${Math.round(Math.abs(wind) / 10)}`, 300, 34);
        }
        for (const p of poles) {
          wood(g, p.x - 5, GROUND - p.h, 10, p.h + 4, p.done ? '#e0a458' : '#a8612a', 4);
          g.fillStyle = p.done ? '#7bc043' : '#ef476f';
          g.beginPath(); g.arc(p.x, GROUND - p.h, 7, 0, Math.PI * 2); g.fill();
          if (p.done) {
            g.fillStyle = '#fff'; g.font = '16px "Luckiest Guy", sans-serif'; g.textAlign = 'center';
            g.fillText('✓', p.x, GROUND - p.h - 14);
          }
        }
        const drawRing = (x, y, rot, a = 1) => {
          g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot);
          g.strokeStyle = '#7a4b22'; g.lineWidth = 8;
          g.beginPath(); g.ellipse(0, 0, 21, 7, 0, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#ff9f1c'; g.lineWidth = 5;
          g.beginPath(); g.ellipse(0, 0, 21, 7, 0, 0, Math.PI * 2); g.stroke();
          g.restore();
        };
        for (const r of rings) drawRing(r.x, r.y, r.state === 'fly' ? Math.sin(r.rot) * 0.4 : 0, r.state === 'ground' ? Math.max(0, r.life) : 1);
        // Thrower's hand / ring stand.
        wood(g, HAND.x - 22, HAND.y + 14, 44, 70, '#8b5a2b', 8);
        if (ready && !done) drawRing(HAND.x, HAND.y, 0);
        if (swipe && swipe.cur) {
          const dx = swipe.cur.x - swipe.start.x, dy = swipe.cur.y - swipe.start.y;
          const len = Math.hypot(dx, dy);
          if (len > 10) {
            const k = Math.min(1, len / 240), ux = dx / len, uy = dy / len, L = 20 + k * 60;
            g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.lineCap = 'round';
            g.beginPath(); g.moveTo(HAND.x, HAND.y); g.lineTo(HAND.x + ux * L, HAND.y + uy * L); g.stroke();
            g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(swipe.start.x, swipe.start.y); g.lineTo(swipe.cur.x, swipe.cur.y); g.stroke();
          }
        }
        g.fillStyle = '#fff'; g.font = '22px "Luckiest Guy", sans-serif'; g.textAlign = 'center';
        g.fillText(`POLES: ${got} / 4`, 120, 34);
        if (t < 4 && !got) {
          g.font = '18px "Luckiest Guy", sans-serif';
          g.fillText('SWIPE UP & RIGHT TO THROW', 200, 650 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down(x, y) { if (ready && !done) swipe = { start: { x, y }, cur: { x, y } }; },
      move(x, y) { if (swipe) swipe.cur = { x, y }; },
      up() {
        if (!swipe) return;
        const dx = swipe.cur.x - swipe.start.x, dy = swipe.cur.y - swipe.start.y;
        swipe = null;
        const len = Math.hypot(dx, dy);
        if (len < 20) return;
        const k = Math.min(len, 240) / len;
        rings.push({ x: HAND.x, y: HAND.y, vx: dx * k * 3.3, vy: dy * k * 3.3, rot: 0, vr: 12, state: 'fly' });
        api.sfx('whoosh');
        ready = false; reload = 0.4;
      },
    };
  },
};

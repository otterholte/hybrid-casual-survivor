// Ball Roll: flick balls up a wooden lane into scoring holes. Too fast and they skip right over.
import { wood, ball, rr } from './draw.js';
import { rand } from '../util.js';

const LANE = { x0: 52, x1: 348, top: 70, bottom: 640 }, LAUNCH = { x: 200, y: 600 }, BR = 13;

export default {
  id: 'roll',
  name: 'Ball Roll',
  icon: '🎳',
  skill: 'physical',
  edge: ['#2b1d12', '#120c07'],
  mode: 'race',
  how: '<b>Swipe up</b> to roll a ball up the lane: the longer the swipe, the harder the roll. A ball drops into a hole only if it’s <b>slow enough</b> when it gets there, so aim for distance, not speed. Reach the target score to win.',
  goal: (d) => ({ easy: 80, normal: 110, hard: 130 })[d],
  expected: (d) => ({ easy: 34, normal: 45, hard: 58 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [36, 46], normal: [46, 58], hard: [58, 74] },
  unit: 'points',
  create(api) {
    const { W, H, diff } = api;
    const goal = this.goal(diff);
    const holes = [
      { x: 200, y: 140, r: 20, pts: 50 },
      { x: 112, y: 190, r: 22, pts: 30 },
      { x: 288, y: 190, r: 22, pts: 30 },
      { x: 200, y: 262, r: 26, pts: 20 },
      { x: 130, y: 350, r: 30, pts: 10 },
      { x: 270, y: 350, r: 30, pts: 10 },
    ].map((h0) => ({ ...h0, x0: h0.x, ph: rand(0, 6) }));
    const moving = diff === 'hard';
    const catchSpeed = { easy: 330, normal: 270, hard: 230 }[diff];
    let b = null, ready = true, reload = 0, score = 0, swipe = null, done = false, flash = null;

    return {
      update(dt, t) {
        if (moving) for (const h0 of holes) if (h0.pts >= 30) h0.x = h0.x0 + Math.sin(t * 0.9 + h0.ph) * 26;
        if (!ready) { reload -= dt; if (reload <= 0 && !b) ready = true; }
        if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
        if (!b) return;
        if (b.state === 'roll') {
          const sp = Math.hypot(b.vx, b.vy);
          const dec = 380 * dt;
          if (sp <= dec) { b.vx = 0; b.vy = 0; b.state = 'stop'; b.t = 0.6; api.sfx('tick'); }
          else { b.vx -= (b.vx / sp) * dec; b.vy -= (b.vy / sp) * dec; }
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < LANE.x0 + BR) { b.x = LANE.x0 + BR; b.vx = Math.abs(b.vx) * 0.6; api.sfx('clack'); }
          if (b.x > LANE.x1 - BR) { b.x = LANE.x1 - BR; b.vx = -Math.abs(b.vx) * 0.6; api.sfx('clack'); }
          if (b.y < LANE.top + BR) { b.y = LANE.top + BR; b.vy = Math.abs(b.vy) * 0.4; api.sfx('clack'); }
          if (b.y > LANE.bottom) { b = null; reload = 0.3; ready = false; return; }
          const now = Math.hypot(b.vx, b.vy);
          for (const h0 of holes) {
            const d = Math.hypot(b.x - h0.x, b.y - h0.y);
            if (d < h0.r - 3) {
              if (now < catchSpeed) {
                b.state = 'sink'; b.t = 0; b.hx = h0.x; b.hy = h0.y;
                score += h0.pts;
                api.progress(Math.min(score, goal));
                api.sfx(h0.pts >= 30 ? 'perfect' : 'plop');
                api.fx.text(h0.x, h0.y - 26, `+${h0.pts}`, h0.pts >= 30 ? '#ffe08a' : '#fff', 26);
                api.fx.burst(h0.x, h0.y, '#e9b949', 10);
                if (score >= goal && !done) { done = true; setTimeout(() => api.complete(), 700); }
                break;
              } else if (!b.skipped?.has(h0)) {
                (b.skipped ||= new Set()).add(h0);
                flash = { text: 'TOO FAST!', t: 0.8 };
              }
            }
          }
        } else if (b.state === 'sink') {
          b.t += dt * 3;
          b.x += (b.hx - b.x) * Math.min(1, dt * 12); b.y += (b.hy - b.y) * Math.min(1, dt * 12);
          if (b.t >= 1) { b = null; reload = 0.25; ready = false; }
        } else if (b.state === 'stop') {
          b.t -= dt;
          if (b.t <= 0) { b = null; reload = 0.2; ready = false; }
        }
      },
      draw(g, t) {
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#2b1d12'); bg.addColorStop(1, '#120c07');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        wood(g, LANE.x0 - 16, LANE.top - 16, LANE.x1 - LANE.x0 + 32, LANE.bottom - LANE.top + 40, '#5a3a1e', 14);
        const lg = g.createLinearGradient(0, LANE.top, 0, LANE.bottom);
        lg.addColorStop(0, '#c98d4a'); lg.addColorStop(1, '#e2b273');
        g.fillStyle = lg; g.fillRect(LANE.x0, LANE.top, LANE.x1 - LANE.x0, LANE.bottom - LANE.top);
        g.strokeStyle = 'rgba(90,50,20,.25)'; g.lineWidth = 2;
        for (let x = LANE.x0 + 37; x < LANE.x1; x += 37) { g.beginPath(); g.moveTo(x, LANE.top); g.lineTo(x, LANE.bottom); g.stroke(); }
        // Launch line.
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([8, 6]);
        g.beginPath(); g.moveTo(LANE.x0, 560); g.lineTo(LANE.x1, 560); g.stroke(); g.setLineDash([]);
        for (const h0 of holes) {
          g.fillStyle = h0.pts >= 50 ? '#e9b949' : h0.pts >= 30 ? '#c8373a' : h0.pts >= 20 ? '#2fb39b' : '#3d5a80';
          g.beginPath(); g.arc(h0.x, h0.y, h0.r + 8, 0, Math.PI * 2); g.fill();
          const hg = g.createRadialGradient(h0.x, h0.y, 2, h0.x, h0.y, h0.r);
          hg.addColorStop(0, '#000'); hg.addColorStop(1, '#2a1708');
          g.fillStyle = hg; g.beginPath(); g.arc(h0.x, h0.y, h0.r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.font = '16px "Bebas Neue", sans-serif'; g.textAlign = 'center';
          g.fillText(String(h0.pts), h0.x, h0.y - h0.r - 12);
        }
        if (b) {
          const k = b.state === 'sink' ? 1 - b.t * 0.7 : 1;
          g.globalAlpha = b.state === 'stop' ? Math.max(0, b.t / 0.6) : 1;
          ball(g, b.x, b.y, BR * k, '#e9e4da');
          g.globalAlpha = 1;
        } else if (ready && !done) ball(g, LAUNCH.x, LAUNCH.y, BR, '#e9e4da');
        if (swipe?.cur) {
          const dx = swipe.cur.x - swipe.x, dy = swipe.cur.y - swipe.y, len = Math.hypot(dx, dy);
          if (len > 10 && dy < 0) {
            const ux = dx / len, uy = dy / len, L = 20 + Math.min(1, len / 260) * 90;
            g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.lineCap = 'round';
            g.beginPath(); g.moveTo(LAUNCH.x, LAUNCH.y); g.lineTo(LAUNCH.x + ux * L, LAUNCH.y + uy * L); g.stroke();
            g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 120, 652, 160, 8, 4); g.fill();
            g.fillStyle = '#ff8c1f'; rr(g, 120, 652, 160 * Math.min(1, len / 260), 8, 4); g.fill();
          }
        }
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`SCORE: ${Math.min(score, goal)} / ${goal}`, 200, 40);
        if (flash) { g.fillStyle = '#ff8c8c'; g.font = '26px "Bebas Neue", sans-serif'; g.fillText(flash.text, 200, 470); }
        if (t < 4 && !score) { g.font = '19px "Bebas Neue", sans-serif'; g.fillStyle = '#fff'; g.fillText('SWIPE UP · SLOW BALLS DROP IN', 200, 520); }
      },
      down(x, y) { if (ready && !done && !b) swipe = { x, y, cur: { x, y } }; },
      move(x, y) { if (swipe) swipe.cur = { x, y }; },
      up() {
        if (!swipe) return;
        const dx = swipe.cur.x - swipe.x, dy = swipe.cur.y - swipe.y;
        swipe = null;
        const len = Math.hypot(dx, dy);
        if (len < 20 || dy > -10) return;
        const k = Math.min(len, 260) / len;
        b = { x: LAUNCH.x, y: LAUNCH.y, vx: dx * k * 3.6, vy: dy * k * 3.6, state: 'roll' };
        ready = false;
        api.sfx('whoosh');
      },
    };
  },
};

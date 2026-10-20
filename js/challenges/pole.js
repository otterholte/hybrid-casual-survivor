// Pole Balance: keep a tall bamboo pole upright on your paddle while the wind picks up.
import { sky, sun, sea, sand, palm, rr } from './draw.js';
import { rand } from '../util.js';

const BASE_Y = 560, POLE = 300;

export default {
  id: 'pole',
  name: 'Pole Balance',
  icon: '🎋',
  skill: 'endurance',
  edge: ['#2fa7e0', '#e8bf6a'],
  mode: 'endurance',
  how: '<b>Drag left and right</b> to slide the paddle and keep the bamboo pole standing. Move <b>toward</b> the way it’s leaning to push it back up. The wind gets stronger the longer you last. <b>Let it fall and you’re out!</b>',
  goal: () => 0,
  expected: (d) => ({ easy: 65, normal: 52, hard: 42 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [30, 38], normal: [32, 40], hard: [34, 42] },
  unit: 'seconds',
  create(api) {
    const { W, H, diff } = api;
    const [grav, wind0, windGrow] = { easy: [170, 6, 0.12], normal: [220, 8, 0.17], hard: [270, 10, 0.22] }[diff];
    let x = 200, vx = 0, push = 0, target = 200, th = rand(-0.02, 0.02), om = 0, wind = 0, windT = 2, gust = false, out = false, falling = 0, lastSec = 0;

    return {
      // Read-only view used by automated balance tests.
      peek: () => ({ th, om, x, vx, push }),
      update(dt, t) {
        if (falling) {
          falling += dt;
          om += (grav / POLE) * Math.sin(th) * dt * 1.6;
          th += om * dt;
          if (Math.abs(th) > 1.55) { th = Math.sign(th) * 1.55; om = 0; }
          if (falling > 0.9 && !out) { out = true; api.fail('The pole fell!'); }
          return;
        }
        // The paddle follows your finger. Holding it to one side pushes the pole back the other way,
        // so you steer by moving under the lean. A short lag keeps it from being too easy.
        x += (target - x) * Math.min(1, dt * 12);
        vx = 0;
        const u = Math.max(-1, Math.min(1, (x - 200) / 120));
        push += (u - push) * Math.min(1, dt * 6);
        windT -= dt;
        // Wind comes in short gusts with calm in between; gusts get stronger over time.
        if (windT <= 0) {
          gust = !gust;
          wind = gust ? (wind0 + windGrow * t * 10) * 4 * (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1) : 0;
          windT = gust ? rand(0.5, 0.9) : rand(1.2, 2.6);
        }
        const alpha = (grav / POLE) * Math.sin(th) - push * 2.5 + (wind / POLE) * 1.5;
        om += alpha * dt;
        om *= 1 - 1.4 * dt;
        th += om * dt;
        const sec = Math.floor(t);
        if (sec !== lastSec) { lastSec = sec; api.progress(sec); }
        if (Math.abs(th) > 0.95) { falling = 0.0001; api.sfx('whoosh'); api.fx.shake(6); }
      },
      draw(g, t) {
        sky(g, W, H, '#2fa7e0', '#ffe2a6');
        sun(g, 320, 110, 24);
        sea(g, W, 420, t, 120);
        sand(g, W, 600, H);
        palm(g, 370, 610, 260, -30, t);
        // Wind flag.
        g.strokeStyle = '#5a3a1e'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(40, 120); g.lineTo(40, 40); g.stroke();
        const wl = Math.min(1, Math.abs(wind) / 30);
        g.fillStyle = '#c8373a';
        g.beginPath(); g.moveTo(40, 42); g.lineTo(40 + Math.sign(wind || 1) * (20 + wl * 30), 50 + Math.sin(t * 12) * 3 * wl); g.lineTo(40, 62); g.fill();
        g.fillStyle = '#fff'; g.font = '16px "Bebas Neue", sans-serif'; g.textAlign = 'left';
        g.fillText(`WIND ${wind > 0 ? '→' : '←'}`, 54, 80);
        // Pole.
        g.save();
        g.translate(x, BASE_Y);
        g.rotate(th);
        for (let i = 0; i < 6; i++) {
          const y0 = -i * (POLE / 6);
          const grd = g.createLinearGradient(-8, 0, 8, 0);
          grd.addColorStop(0, '#9fbf4f'); grd.addColorStop(0.5, '#d6e58a'); grd.addColorStop(1, '#7d9a3a');
          g.fillStyle = grd;
          rr(g, -8, y0 - POLE / 6 + 2, 16, POLE / 6 - 2, 4); g.fill();
          g.fillStyle = '#6f8a2c'; g.fillRect(-9, y0 - 3, 18, 4);
        }
        g.fillStyle = '#c8373a';
        g.beginPath(); g.moveTo(0, -POLE); g.lineTo(22, -POLE + 8); g.lineTo(0, -POLE + 16); g.fill();
        g.restore();
        // Paddle.
        g.fillStyle = '#7a4b22';
        rr(g, x - 46, BASE_Y, 92, 14, 6); g.fill();
        g.fillStyle = '#5a3a1e';
        rr(g, x - 7, BASE_Y + 14, 14, 50, 5); g.fill();
        // Lean meter.
        const lean = Math.max(-1, Math.min(1, th / 0.95));
        g.fillStyle = 'rgba(0,0,0,.4)'; rr(g, 100, 636, 200, 10, 5); g.fill();
        g.fillStyle = Math.abs(lean) > 0.6 ? '#c8373a' : '#e9b949';
        g.beginPath(); g.arc(200 + lean * 96, 641, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`${Math.floor(lastSec)}s`, 200, 36);
        if (t < 4) {
          g.font = '19px "Bebas Neue", sans-serif';
          g.fillText('DRAG LEFT & RIGHT · MOVE UNDER THE LEAN', 200, 625 - Math.abs(Math.sin(t * 3)) * 4);
        }
      },
      down(px) { target = px; this.dragging = true; },
      move(px) { if (this.dragging) target = px; },
      up() { this.dragging = false; },
    };
  },
};

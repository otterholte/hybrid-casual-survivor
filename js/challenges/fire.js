// Fire Making: swipe the flint at the right angle until the tinder catches, then feed and blow
// the fire until the flame burns through the rope.
import { rr, wood } from './draw.js';
import { rand } from '../util.js';

const PIT = { x: 200, y: 470 }, ROPE_Y = 150;
const WOOD_BTN = { x: 30, y: 560, w: 160, h: 70 }, BLOW_BTN = { x: 210, y: 560, w: 160, h: 70 };
const inBtn = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export default {
  id: 'fire',
  name: 'Fire Making',
  icon: '🔥',
  skill: 'physical',
  edge: ['#1a0f14', '#0b0705'],
  mode: 'race',
  how: '<b>1. Strike:</b> swipe across the flint along the arrow to throw sparks until the tinder glows. <b>2. Build it:</b> tap <b>Add wood</b> and tap <b>Blow</b> to grow the flame. Too much wood smothers a small fire; no wood and it dies. Keep it roaring until it <b>burns through the rope</b>.',
  goal: () => 10,
  expected: (d) => ({ easy: 32, normal: 44, hard: 56 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [32, 40], normal: [45, 56], hard: [58, 72] },
  unit: 'burn',
  create(api) {
    const { W, H, diff } = api;
    const [sparkGain, need] = { easy: [[16, 24], 62], normal: [[11, 17], 70], hard: [[8, 13], 76] }[diff];
    let phase = 'strike', ember = 0, flame = 0, fuel = 0, burn = 0, air = 0, done = false;
    let angle = rand(-0.9, -0.35), swipe = null, sparks = [], smoke = [], msg = null;
    const newAngle = () => { angle = (Math.random() < 0.5 ? 1 : -1) * rand(0.35, 0.9); };
    newAngle();
    const say = (text, color = '#fff') => { msg = { text, color, t: 1.6 }; };

    return {
      update(dt, t) {
        if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
        for (const s of sparks) { s.vy += 600 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
        sparks = sparks.filter((s) => s.life > 0);
        for (const s of smoke) { s.y -= 30 * dt; s.x += Math.sin(t * 2 + s.p) * 10 * dt; s.life -= dt * 0.5; }
        smoke = smoke.filter((s) => s.life > 0);
        if (done) return;
        if (phase === 'strike') {
          ember = Math.max(0, ember - 5 * dt);
          if (ember >= 100) {
            phase = 'fire'; flame = 28; fuel = 40;
            api.sfx('sparkle');
            say('IT CAUGHT! Now build it up.', '#ffd166');
          }
          return;
        }
        air = Math.max(0, air - 0.55 * dt);
        const a = 0.2 + air;
        if (fuel > 0) flame += (a * 30 - 9) * dt;
        else flame -= 26 * dt;
        if (fuel > 85 && flame < 45) flame -= 10 * dt; // smothered
        if (air > 0.5 && fuel < 10) flame -= 14 * dt;
        fuel = Math.max(0, fuel - (4 + flame * 0.11) * dt);
        flame = Math.max(0, Math.min(100, flame));
        if (Math.random() < flame * 0.02 * dt * 10) smoke.push({ x: PIT.x + rand(-20, 20), y: PIT.y - flame * 2.6, life: 1, p: rand(0, 6) });
        if (flame <= 0) {
          phase = 'strike'; ember = 45; newAngle();
          api.sfx('snuff');
          say('THE FIRE DIED. Strike again!', '#ff8c8c');
          return;
        }
        if (flame >= need) {
          burn += (flame - need + 12) * 0.28 * dt;
          if (Math.random() < dt * 8) api.fx.burst(200 + rand(-60, 60), ROPE_Y, '#ffb347', 2);
          const p = Math.min(10, Math.floor(burn / 10));
          api.progress(p);
          if (burn >= 100) {
            done = true;
            api.sfx('snap');
            api.fx.shake(10);
            api.fx.text(200, ROPE_Y - 20, 'ROPE BURNED THROUGH!', '#ffd166', 28);
            setTimeout(() => api.complete(), 900);
          }
        }
      },
      draw(g, t) {
        const sk = g.createLinearGradient(0, 0, 0, H);
        sk.addColorStop(0, '#120a1a'); sk.addColorStop(1, '#2a1410');
        g.fillStyle = sk; g.fillRect(0, 0, W, H);
        const glow = phase === 'fire' ? flame / 100 : ember / 300;
        const gg = g.createRadialGradient(PIT.x, PIT.y - 40, 10, PIT.x, PIT.y - 40, 300);
        gg.addColorStop(0, `rgba(255,140,40,${0.45 * glow})`); gg.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gg; g.fillRect(0, 0, W, H);
        g.fillStyle = '#2a1a10'; g.fillRect(0, 520, W, H - 520);
        // Posts and rope.
        wood(g, 30, 100, 18, 430, '#5a3a1e', 6);
        wood(g, 352, 100, 18, 430, '#5a3a1e', 6);
        const charred = Math.min(1, burn / 100);
        g.strokeStyle = `rgb(${200 - charred * 150},${160 - charred * 130},${100 - charred * 90})`;
        g.lineWidth = 6 - charred * 3;
        if (!done) { g.beginPath(); g.moveTo(48, ROPE_Y); g.quadraticCurveTo(200, ROPE_Y + 12, 352, ROPE_Y); g.stroke(); }
        else {
          g.beginPath(); g.moveTo(48, ROPE_Y); g.quadraticCurveTo(110, ROPE_Y + 40, 150, ROPE_Y + 90); g.stroke();
          g.beginPath(); g.moveTo(352, ROPE_Y); g.quadraticCurveTo(290, ROPE_Y + 40, 250, ROPE_Y + 90); g.stroke();
        }
        // Threshold marker.
        const flameTopAt = (f) => PIT.y - 30 - f * 3.1;
        g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,209,102,.45)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(60, flameTopAt(need)); g.lineTo(340, flameTopAt(need)); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,209,102,.7)'; g.font = '15px "Bebas Neue", sans-serif'; g.textAlign = 'right';
        g.fillText('BURN LINE', 340, flameTopAt(need) - 5);
        // Fire pit stones and logs.
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          g.fillStyle = i % 2 ? '#6e6259' : '#544a43';
          g.beginPath(); g.ellipse(PIT.x + Math.cos(a) * 70, PIT.y + 10 + Math.sin(a) * -14, 18, 12, 0, 0, Math.PI * 2); g.fill();
        }
        const logs = Math.min(6, Math.ceil(fuel / 16));
        for (let i = 0; i < logs; i++) {
          g.save(); g.translate(PIT.x + (i - logs / 2) * 12, PIT.y); g.rotate((i % 2 ? 0.5 : -0.5));
          g.fillStyle = '#6b4422'; rr(g, -34, -6, 68, 12, 6); g.fill(); g.restore();
        }
        // Tinder / flame.
        if (phase === 'strike') {
          g.fillStyle = `rgb(${120 + ember},${80 + ember * 0.6},${40})`;
          g.beginPath(); g.ellipse(PIT.x, PIT.y - 8, 30, 12, 0, 0, Math.PI * 2); g.fill();
          if (ember > 10) {
            g.fillStyle = `rgba(255,${120 + ember},40,${ember / 120})`;
            g.beginPath(); g.ellipse(PIT.x, PIT.y - 10, 20 * ember / 100 + 4, 6, 0, 0, Math.PI * 2); g.fill();
          }
        } else {
          for (let k = 0; k < 3; k++) {
            const hgt = flame * 3.1 * (1 - k * 0.22) + Math.sin(t * 18 + k) * 6;
            const wdt = 26 + flame * 0.5 - k * 8;
            const fg = g.createLinearGradient(0, PIT.y, 0, PIT.y - hgt);
            fg.addColorStop(0, k === 2 ? '#fff3b0' : '#ffb300');
            fg.addColorStop(0.6, k === 0 ? '#ff5a1f' : '#ff8c1f');
            fg.addColorStop(1, 'rgba(255,90,31,0)');
            g.fillStyle = fg;
            g.beginPath();
            g.moveTo(PIT.x - wdt, PIT.y - 6);
            g.quadraticCurveTo(PIT.x - wdt * 0.6 + Math.sin(t * 9) * 5, PIT.y - hgt * 0.6, PIT.x + Math.sin(t * 7 + k) * 8, PIT.y - 30 - hgt);
            g.quadraticCurveTo(PIT.x + wdt * 0.6 + Math.cos(t * 8) * 5, PIT.y - hgt * 0.6, PIT.x + wdt, PIT.y - 6);
            g.closePath(); g.fill();
          }
        }
        for (const s of smoke) { g.fillStyle = `rgba(160,160,160,${s.life * 0.25})`; g.beginPath(); g.arc(s.x, s.y, 10 + (1 - s.life) * 20, 0, Math.PI * 2); g.fill(); }
        for (const s of sparks) { g.fillStyle = `rgba(255,${180 + Math.random() * 70},80,${s.life * 2})`; g.fillRect(s.x, s.y, 3, 3); }
        if (phase === 'strike') {
          // Flint and the arrow showing the swipe direction.
          g.fillStyle = '#4e4640';
          g.beginPath(); g.ellipse(200, 590, 46, 18, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#7d736b';
          g.beginPath(); g.ellipse(196, 585, 34, 10, 0, 0, Math.PI * 2); g.fill();
          const dx = Math.cos(angle), dy = Math.sin(angle);
          const ax = 200 - dx * 90, ay = 590 - dy * 90;
          g.strokeStyle = 'rgba(255,209,102,.85)'; g.lineWidth = 5; g.setLineDash([12, 8]);
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(200 + dx * 90, 590 + dy * 90); g.stroke(); g.setLineDash([]);
          g.fillStyle = 'rgba(255,209,102,.95)';
          const hx = 200 + dx * 90, hy = 590 + dy * 90;
          g.beginPath(); g.moveTo(hx + dx * 14, hy + dy * 14); g.lineTo(hx - dy * 10, hy + dx * 10); g.lineTo(hx + dy * 10, hy - dx * 10); g.fill();
          // Ember meter.
          g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 100, 520, 200, 12, 6); g.fill();
          g.fillStyle = '#ff8c1f'; rr(g, 100, 520, 2 * Math.min(100, ember), 12, 6); g.fill();
          g.fillStyle = '#fff'; g.font = '18px "Bebas Neue", sans-serif'; g.textAlign = 'center';
          g.fillText('SWIPE ALONG THE ARROW', 200, 648);
          if (swipe?.cur) {
            g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(swipe.x, swipe.y); g.lineTo(swipe.cur.x, swipe.cur.y); g.stroke();
          }
        } else {
          const btn = (b, label, on) => {
            g.fillStyle = on ? 'rgba(255,140,40,.55)' : 'rgba(0,0,0,.5)';
            rr(g, b.x, b.y, b.w, b.h, 14); g.fill();
            g.strokeStyle = 'rgba(255,200,140,.5)'; g.lineWidth = 2; g.stroke();
            g.fillStyle = '#fff'; g.font = '26px "Bebas Neue", sans-serif'; g.textAlign = 'center';
            g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 9);
          };
          btn(WOOD_BTN, '🪵 ADD WOOD', false);
          btn(BLOW_BTN, '💨 BLOW', air > 0.4);
          const bar = (x, y, v, c, label) => {
            g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, x, y, 150, 10, 5); g.fill();
            g.fillStyle = c; rr(g, x, y, 1.5 * Math.min(100, v), 10, 5); g.fill();
            g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '14px "Bebas Neue", sans-serif'; g.textAlign = 'left';
            g.fillText(label, x, y - 4);
          };
          bar(30, 545, fuel, '#a8743f', 'FUEL');
          bar(220, 545, flame, '#ff8c1f', 'FLAME');
        }
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`ROPE: ${Math.min(100, Math.floor(burn))}% BURNED`, 200, 40);
        if (msg) { g.fillStyle = msg.color; g.font = '26px "Bebas Neue", sans-serif'; g.fillText(msg.text, 200, 90); }
      },
      down(x, y) {
        if (phase === 'strike') { swipe = { x, y, t: performance.now() }; return; }
        if (inBtn(WOOD_BTN, x, y)) {
          fuel = Math.min(100, fuel + 22);
          flame -= flame < 30 ? 10 : 3;
          api.sfx('clack');
          if (flame < 30) say('Careful, too much wood smothers it!', '#ffd166');
        } else if (inBtn(BLOW_BTN, x, y)) { air = Math.min(1.2, air + 0.32); api.sfx('whoosh'); }
      },
      move(x, y) { if (swipe) swipe.cur = { x, y }; },
      up(x, y) {
        if (phase !== 'strike' || !swipe) { swipe = null; return; }
        const dx = x - swipe.x, dy = y - swipe.y, len = Math.hypot(dx, dy);
        const ms = performance.now() - swipe.t;
        swipe = null;
        if (len < 40) return;
        // Either direction along the arrow counts; it's the line that matters.
        let diffA = Math.abs(Math.atan2(dy, dx) - angle);
        diffA = Math.min(diffA, Math.abs(diffA - Math.PI), Math.abs(diffA + Math.PI), Math.abs(diffA - 2 * Math.PI));
        const good = diffA < 0.42 && len > 90 && ms < 600;
        const n = good ? 26 : 6;
        for (let i = 0; i < n; i++) sparks.push({ x: 200 + rand(-20, 20), y: 585, vx: rand(-90, 90), vy: rand(-420, -220), life: rand(0.35, 0.7) });
        api.sfx(good ? 'snap' : 'tick');
        if (good) { ember += rand(sparkGain[0], sparkGain[1]); say(ember >= 100 ? '' : 'Good sparks!', '#ffd166'); }
        else { ember += 3; say(len <= 90 ? 'Longer swipe!' : 'Follow the arrow!', '#ff8c8c'); }
        newAngle();
      },
    };
  },
};

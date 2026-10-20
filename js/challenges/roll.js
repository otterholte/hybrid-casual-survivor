// Ball Roll: aim up a wooden lane, then stop a fast power meter in the green to roll the ball.
// A sliding blocker guards the 50 hole and pegs knock sloppy shots off line. Only slow balls drop in.
import { wood, ball, rr } from './draw.js';
import { rand } from '../util.js';

const LANE = { x0: 52, x1: 348, top: 70, bottom: 640 }, LAUNCH = { x: 200, y: 600 }, BR = 13;
const FRICTION = 380, AIM_LIMIT = 535;
const METER = { x: 80, w: 240, y: 648, h: 14 };

export default {
  id: 'roll',
  name: 'Ball Roll',
  icon: '🎳',
  skill: 'physical',
  edge: ['#2b1d12', '#120c07'],
  mode: 'race',
  how: '<b>Drag</b> to aim at a hole, then let go. A marker races across the power bar: <b>tap when it’s in the green</b>. Dead center rolls exactly where you aimed; off-center rolls too soft or too hard and pulls the shot off line. Time it around the <b>sliding blocker</b>, and remember: only slow balls drop in.',
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
    // Power meter: seconds for one sweep across, and half-width of the green zone (fraction of the bar).
    const [sweep, green] = { easy: [0.75, 0.16], normal: [0.55, 0.11], hard: [0.42, 0.08] }[diff];
    // Blocker in front of the 50: width, sweep speed.
    const [bw, bspeed, bamp] = { easy: [56, 1.1, 96], normal: [72, 1.6, 96], hard: [84, 2.2, 100] }[diff];
    const blocker = { x: 200, y: 208, w: bw, h: 14, ph: rand(0, 6) };
    // Pegs sit just off the clean lines to each hole, so only sloppy shots clip them.
    const pegs = [{ x: 92, y: 470 }, { x: 308, y: 470 }, ...(diff === 'hard' ? [{ x: 166, y: 300 }, { x: 234, y: 300 }] : [])].map((p) => ({ ...p, r: 9 }));

    let phase = 'aim', aim = null, meterT = 0, b = null, reload = 0, score = 0, done = false, flash = null, lastHit = null;
    const meterPos = () => { const f = (meterT / sweep) % 2; return f < 1 ? -1 + 2 * f : 3 - 2 * f; }; // -1..1, constant speed
    const clampAim = (x, y) => ({ x: Math.max(LANE.x0 + BR, Math.min(LANE.x1 - BR, x)), y: Math.max(LANE.top + BR, Math.min(AIM_LIMIT, y)) });

    function shoot() {
      const e = meterPos();
      const off = Math.max(0, Math.abs(e) - green);
      lastHit = { e, perfect: off === 0, t: 1.2 };
      const power = 1 + Math.sign(e) * off * 0.42;
      const angErr = Math.sign(e) * off * 0.32;
      const dx = aim.x - LAUNCH.x, dy = aim.y - LAUNCH.y, d = Math.hypot(dx, dy);
      const arrive = catchSpeed * 0.5;
      const v0 = Math.sqrt(arrive * arrive + 2 * FRICTION * d) * power;
      const a = Math.atan2(dy, dx) + angErr;
      b = { x: LAUNCH.x, y: LAUNCH.y, vx: Math.cos(a) * v0, vy: Math.sin(a) * v0, state: 'roll' };
      phase = 'roll';
      api.sfx(off === 0 ? 'perfect' : 'whoosh');
      if (off === 0) api.fx.text(200, 560, 'PERFECT!', '#7bc043', 24);
    }

    const bounceCircle = (cx, cy, r, rest) => {
      const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= r + BR || d === 0) return false;
      const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
      if (dot < 0) { b.vx -= (1 + rest) * dot * nx; b.vy -= (1 + rest) * dot * ny; }
      b.x = cx + nx * (r + BR); b.y = cy + ny * (r + BR);
      return true;
    };

    return {
      update(dt, t) {
        if (moving) for (const h0 of holes) if (h0.pts >= 30) h0.x = h0.x0 + Math.sin(t * 0.9 + h0.ph) * 26;
        blocker.x = 200 + Math.sin(t * bspeed + blocker.ph) * bamp;
        if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
        if (lastHit) { lastHit.t -= dt; if (lastHit.t <= 0) lastHit = null; }
        if (phase === 'power') meterT += dt;
        if (phase === 'wait') { reload -= dt; if (reload <= 0) phase = 'aim'; }
        if (!b) return;
        if (b.state === 'roll') {
          const sp = Math.hypot(b.vx, b.vy);
          const dec = FRICTION * dt;
          if (sp <= dec) { b.vx = 0; b.vy = 0; b.state = 'stop'; b.t = 0.6; api.sfx('tick'); }
          else { b.vx -= (b.vx / sp) * dec; b.vy -= (b.vy / sp) * dec; }
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < LANE.x0 + BR) { b.x = LANE.x0 + BR; b.vx = Math.abs(b.vx) * 0.6; api.sfx('clack'); }
          if (b.x > LANE.x1 - BR) { b.x = LANE.x1 - BR; b.vx = -Math.abs(b.vx) * 0.6; api.sfx('clack'); }
          if (b.y < LANE.top + BR) { b.y = LANE.top + BR; b.vy = Math.abs(b.vy) * 0.4; api.sfx('clack'); }
          if (b.y > LANE.bottom) { b = null; reload = 0.3; phase = 'wait'; return; }
          // Blocker: bounce off its nearest point.
          const nx = Math.max(blocker.x - blocker.w / 2, Math.min(blocker.x + blocker.w / 2, b.x));
          const ny = Math.max(blocker.y - blocker.h / 2, Math.min(blocker.y + blocker.h / 2, b.y));
          if (Math.hypot(b.x - nx, b.y - ny) < BR) { if (bounceCircle(nx, ny, 0, 0.5)) { api.sfx('clack'); flash = { text: 'BLOCKED!', t: 0.7 }; } }
          for (const p of pegs) if (bounceCircle(p.x, p.y, p.r, 0.7)) api.sfx('clack');
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
          if (b.t >= 1) { b = null; reload = 0.25; phase = 'wait'; }
        } else if (b.state === 'stop') {
          b.t -= dt;
          if (b.t <= 0) { b = null; reload = 0.2; phase = 'wait'; }
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
        // Obstacles.
        wood(g, blocker.x - blocker.w / 2, blocker.y - blocker.h / 2, blocker.w, blocker.h, '#7a4b22', 5);
        for (const p of pegs) { g.fillStyle = '#5a3a1e'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(p.x - 3, p.y - 3, 3, 0, Math.PI * 2); g.fill(); }
        // Aim guide.
        if (aim && (phase === 'aiming' || phase === 'power')) {
          g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.setLineDash([6, 8]);
          g.beginPath(); g.moveTo(LAUNCH.x, LAUNCH.y); g.lineTo(aim.x, aim.y); g.stroke(); g.setLineDash([]);
          g.strokeStyle = '#fff'; g.lineWidth = 3;
          g.beginPath(); g.arc(aim.x, aim.y, 14, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(aim.x - 20, aim.y); g.lineTo(aim.x + 20, aim.y); g.moveTo(aim.x, aim.y - 20); g.lineTo(aim.x, aim.y + 20); g.stroke();
        }
        if (b) {
          const k = b.state === 'sink' ? 1 - b.t * 0.7 : 1;
          g.globalAlpha = b.state === 'stop' ? Math.max(0, b.t / 0.6) : 1;
          ball(g, b.x, b.y, BR * k, '#e9e4da');
          g.globalAlpha = 1;
        } else if (!done) ball(g, LAUNCH.x, LAUNCH.y, BR, '#e9e4da');
        // Power meter: red edges, yellow, green middle; the marker sweeps fast.
        const mx = (v) => METER.x + ((v + 1) / 2) * METER.w;
        g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, METER.x - 4, METER.y - 4, METER.w + 8, METER.h + 8, 8); g.fill();
        g.fillStyle = '#c8373a'; rr(g, METER.x, METER.y, METER.w, METER.h, 5); g.fill();
        g.fillStyle = '#e9b949'; g.fillRect(mx(-0.45), METER.y, mx(0.45) - mx(-0.45), METER.h);
        g.fillStyle = '#7bc043'; g.fillRect(mx(-green), METER.y, mx(green) - mx(-green), METER.h);
        if (phase === 'power' || lastHit) {
          const v = phase === 'power' ? meterPos() : lastHit.e;
          g.fillStyle = '#fff'; g.fillRect(mx(v) - 3, METER.y - 7, 6, METER.h + 14);
        }
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`SCORE: ${Math.min(score, goal)} / ${goal}`, 200, 40);
        if (flash) { g.fillStyle = '#ff8c8c'; g.font = '26px "Bebas Neue", sans-serif'; g.fillText(flash.text, 200, 470); }
        g.font = '19px "Bebas Neue", sans-serif'; g.fillStyle = '#fff';
        if (phase === 'power') g.fillText('TAP IN THE GREEN!', 200, 630);
        else if (phase === 'aim' && !done && t < 8 && !score) g.fillText('DRAG TO AIM · LET GO · TAP IN THE GREEN', 200, 520);
      },
      down(x, y) {
        if (done) return;
        if (phase === 'power') { shoot(); return; }
        if (phase === 'aim') { phase = 'aiming'; aim = clampAim(x, y); }
      },
      move(x, y) { if (phase === 'aiming') aim = clampAim(x, y); },
      up() {
        if (phase !== 'aiming') return;
        phase = 'power';
        meterT = 0;
        api.sfx('tick');
      },
    };
  },
};

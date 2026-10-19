// Ball Balance: tilt a rope-held disc to keep every ball aboard. A new ball drops in regularly.
import { jungle, ball, shadow } from './draw.js';
import { rand } from '../util.js';

const C = { x: 200, y: 340 }, R = 150, BR = 13;
const COLORS = ['#ffffff', '#f6c90e', '#ef476f', '#1fb5c9', '#7bc043', '#9b5de5'];

export default {
  id: 'balance',
  name: 'Ball Balance',
  icon: '⚖️',
  skill: 'endurance',
  edge: ['#1e6b45', '#0f3d29'],
  mode: 'endurance',
  how: 'Hold and drag to <b>tilt the disc</b>: balls roll toward your finger. Wind and wobble push them around, and a new ball lands every few seconds. <b>Lose one and you\'re out!</b>',
  goal: () => 0,
  expected: (d) => ({ easy: 70, normal: 55, hard: 45 })[d],
  unit: 'balls',
  create(api) {
    const { W, H, diff } = api;
    const [every, wind0, windGrow] = { easy: [17, 22, 0.6], normal: [14, 32, 0.9], hard: [11, 42, 1.2] }[diff];
    let tilt = { x: 0, y: 0 }, aim = null, out = false, nextBall = every, warn = null;
    const balls = [{ x: rand(-20, 20), y: rand(-20, 20), vx: 0, vy: 0, c: COLORS[0], drop: 1, ph: rand(0, 6) }];
    const addBall = () => {
      const a = rand(0, Math.PI * 2), d = rand(0, R * 0.4);
      warn = { x: Math.cos(a) * d, y: Math.sin(a) * d, t: 1.1 };
    };

    return {
      update(dt, t) {
        if (out) {
          for (const b of balls) if (b.falling) { b.fall += dt * 2; }
          return;
        }
        const target = aim ? { x: (aim.x - C.x) / R, y: (aim.y - C.y) / R } : { x: 0, y: 0 };
        const tl = Math.hypot(target.x, target.y);
        if (tl > 1) { target.x /= tl; target.y /= tl; }
        tilt.x += (target.x - tilt.x) * Math.min(1, dt * 7);
        tilt.y += (target.y - tilt.y) * Math.min(1, dt * 7);
        const amp = wind0 + windGrow * t;
        const wx = amp * (Math.sin(t * 0.7) + 0.6 * Math.sin(t * 1.9 + 1));
        const wy = amp * (Math.cos(t * 0.53) + 0.6 * Math.sin(t * 1.3 + 2));
        for (const b of balls) {
          if (b.drop > 0) { b.drop = Math.max(0, b.drop - dt * 2.5); if (b.drop > 0) continue; api.sfx('clack'); }
          const nx = 28 * Math.sin(t * 1.1 + b.ph), ny = 28 * Math.cos(t * 0.9 + b.ph * 2);
          b.vx += (tilt.x * 330 + wx + nx) * dt;
          b.vy += (tilt.y * 330 + wy + ny) * dt;
          b.vx *= 1 - 0.9 * dt;
          b.vy *= 1 - 0.9 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        // Ball-ball collisions.
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          if (a.drop || b.drop) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d > 0 && d < BR * 2) {
            const nx = dx / d, ny = dy / d, push = (BR * 2 - d) / 2;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
          }
        }
        for (const b of balls) {
          if (Math.hypot(b.x, b.y) > R - BR * 0.3 && !b.drop) {
            out = true;
            b.falling = true;
            b.fall = 0;
            api.sfx('thud');
            api.fx.shake(10);
            api.fail('A ball rolled off!');
            return;
          }
        }
        nextBall -= dt;
        if (nextBall <= 1.1 && !warn) addBall();
        if (warn) {
          warn.t -= dt;
          if (warn.t <= 0) {
            balls.push({ x: warn.x, y: warn.y, vx: rand(-40, 40), vy: rand(-40, 40), c: COLORS[balls.length % COLORS.length], drop: 1, ph: rand(0, 6) });
            api.sfx('whoosh');
            api.progress(balls.length);
            warn = null;
            nextBall = every;
          }
        }
      },
      draw(g, t) {
        jungle(g, W, H, t);
        const ox = -tilt.x * 6, oy = -tilt.y * 6;
        // Ropes out to the corners.
        g.strokeStyle = '#d9b37a'; g.lineWidth = 4;
        for (const [ex, ey, ax, ay] of [[0, 0, -0.7, -0.7], [W, 0, 0.7, -0.7], [0, H, -0.7, 0.7], [W, H, 0.7, 0.7]]) {
          g.beginPath(); g.moveTo(C.x + ox + ax * R, C.y + oy + ay * R); g.lineTo(ex, ey); g.stroke();
        }
        shadow(g, C.x + 10, C.y + 22, R, R * 0.9, 0.35);
        const gr = g.createRadialGradient(C.x + ox - tilt.x * 80, C.y + oy - tilt.y * 80, 10, C.x + ox, C.y + oy, R);
        gr.addColorStop(0, '#e2b273');
        gr.addColorStop(1, '#9a6431');
        g.fillStyle = gr;
        g.beginPath(); g.arc(C.x + ox, C.y + oy, R, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#6b4220'; g.lineWidth = 8; g.stroke();
        g.strokeStyle = 'rgba(80,45,15,.35)'; g.lineWidth = 2;
        for (let r = 30; r < R; r += 30) { g.beginPath(); g.arc(C.x + ox, C.y + oy, r, 0, Math.PI * 2); g.stroke(); }
        if (warn) {
          g.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 20) * 0.3})`;
          g.lineWidth = 3;
          g.beginPath(); g.arc(C.x + ox + warn.x, C.y + oy + warn.y, BR + 4, 0, Math.PI * 2); g.stroke();
        }
        for (const b of balls) {
          const bx = C.x + ox + b.x, by = C.y + oy + b.y;
          if (b.falling) {
            const s = Math.max(0.1, 1 - b.fall);
            ball(g, bx + b.vx * b.fall * 0.3, by + b.vy * b.fall * 0.3 + b.fall * 60, BR * s, b.c);
            continue;
          }
          const lift = b.drop * 120;
          shadow(g, bx + 3 + tilt.x * 4, by + 4 + tilt.y * 4, BR * (1 - b.drop * 0.5), BR * 0.6, 0.35);
          ball(g, bx, by - lift, BR * (1 + b.drop * 0.6), b.c);
        }
        if (aim) {
          g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3;
          g.beginPath(); g.arc(aim.x, aim.y, 22, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`BALLS: ${balls.length}   NEXT IN ${Math.max(0, Math.ceil(nextBall))}`, 200, 34);
        if (t < 4) {
          g.font = '21px "Bebas Neue", sans-serif';
          g.fillText('HOLD & DRAG TO TILT', 200, 560 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down(x, y) { aim = { x, y }; },
      move(x, y) { if (aim) aim = { x, y }; },
      up() { aim = null; },
    };
  },
};

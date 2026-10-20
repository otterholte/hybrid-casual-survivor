// Tilt Maze: tilt a wooden maze with the control pad and roll three balls into the goal slot.
// Holes send a ball back to the start.
import { ball, rr, controlPad, wood } from './draw.js';
import { shuffle } from '../util.js';

const PAD = { x: 200, y: 590, r: 56 };

export default {
  id: 'maze',
  name: 'Tilt Maze',
  icon: '🌀',
  skill: 'puzzle',
  edge: ['#2b1d12', '#120c07'],
  mode: 'race',
  how: 'Use the <b>control pad</b> to tilt the wooden maze. Roll all <b>three balls</b> into the glowing slot. Fall in a hole and that ball goes back to the start.',
  goal: () => 3,
  expected: (d) => ({ easy: 32, normal: 46, hard: 60 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [36, 46], normal: [48, 60], hard: [62, 78] },
  unit: 'balls',
  create(api) {
    const { W, diff } = api;
    const [cols, rows, holeCount, extraOpen] = { easy: [5, 6, 2, 6], normal: [6, 7, 4, 3], hard: [6, 8, 6, 1] }[diff];
    const cell = Math.floor(Math.min(340 / cols, 440 / rows));
    const ox = Math.round((W - cols * cell) / 2), oy = 70 + Math.round((440 - rows * cell) / 2);
    const id = (c, r) => r * cols + c;
    const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

    // Carve a perfect maze, then knock out a few extra walls so there's more than one route.
    const open = new Set();
    const seen = new Array(cols * rows).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const cur = stack.at(-1), c = cur % cols, r = Math.floor(cur / cols);
      const nb = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]).map(([dc, dr]) => [c + dc, r + dr])
        .filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !seen[id(a, b)]);
      if (!nb.length) { stack.pop(); continue; }
      const nxt = id(nb[0][0], nb[0][1]);
      seen[nxt] = true;
      open.add(key(cur, nxt));
      stack.push(nxt);
    }
    for (let k = 0; k < extraOpen; k++) {
      const c = Math.floor(Math.random() * (cols - 1)), r = Math.floor(Math.random() * rows);
      open.add(key(id(c, r), id(c + 1, r)));
    }

    // Wall segments.
    const segs = [];
    const seg = (x1, y1, x2, y2) => segs.push({ x1, y1, x2, y2 });
    seg(ox, oy, ox + cols * cell, oy);
    seg(ox, oy + rows * cell, ox + cols * cell, oy + rows * cell);
    seg(ox, oy, ox, oy + rows * cell);
    seg(ox + cols * cell, oy, ox + cols * cell, oy + rows * cell);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ox + c * cell, y = oy + r * cell;
      if (c < cols - 1 && !open.has(key(id(c, r), id(c + 1, r)))) seg(x + cell, y, x + cell, y + cell);
      if (r < rows - 1 && !open.has(key(id(c, r), id(c, r + 1)))) seg(x, y + cell, x + cell, y + cell);
    }

    const center = (c, r) => ({ x: ox + (c + 0.5) * cell, y: oy + (r + 0.5) * cell });
    const BR = cell * 0.16;
    const start = center(0, 0);
    const goal = { ...center(cols - 1, rows - 1), r: cell * 0.3 };
    const holeCells = shuffle([...Array(cols * rows).keys()].filter((i) => {
      const c = i % cols, r = Math.floor(i / cols);
      return c + r > 1 && !(c === cols - 1 && r === rows - 1);
    })).slice(0, holeCount);
    const holes = holeCells.map((i) => {
      const p = center(i % cols, Math.floor(i / cols));
      return { x: p.x + (Math.random() - 0.5) * cell * 0.25, y: p.y + (Math.random() - 0.5) * cell * 0.25, r: cell * 0.2 };
    });

    const spawn = (b, k) => Object.assign(b, { x: start.x + (k - 1) * BR * 1.2, y: start.y + (k % 2) * BR * 0.6, vx: 0, vy: 0, sink: 0, state: 'roll' });
    const balls = [0, 1, 2].map((k) => spawn({ c: ['#e9e4da', '#e9b949', '#c8373a'][k] }, k));
    let tilt = { x: 0, y: 0 }, stick = null, scored = 0, done = false;

    const collideWalls = (b) => {
      for (const s of segs) {
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len2 = dx * dx + dy * dy;
        let t = ((b.x - s.x1) * dx + (b.y - s.y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = s.x1 + dx * t, py = s.y1 + dy * t;
        const ex = b.x - px, ey = b.y - py, d = Math.hypot(ex, ey), min = BR + 3;
        if (d < min && d > 0.0001) {
          const nx = ex / d, ny = ey / d;
          b.x += nx * (min - d); b.y += ny * (min - d);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.35 * vn * nx; b.vy -= 1.35 * vn * ny; }
        }
      }
    };

    return {
      update(dt) {
        const target = stick || { x: 0, y: 0 };
        tilt.x += (target.x - tilt.x) * Math.min(1, dt * 8);
        tilt.y += (target.y - tilt.y) * Math.min(1, dt * 8);
        const steps = 4, h = dt / steps;
        for (let s = 0; s < steps; s++) {
          for (const b of balls) {
            if (b.state !== 'roll') continue;
            b.vx += tilt.x * 520 * h; b.vy += tilt.y * 520 * h;
            b.vx *= 1 - 1.2 * h; b.vy *= 1 - 1.2 * h;
            const sp = Math.hypot(b.vx, b.vy);
            if (sp > 420) { b.vx *= 420 / sp; b.vy *= 420 / sp; }
            b.x += b.vx * h; b.y += b.vy * h;
            collideWalls(b);
          }
          for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            const a = balls[i], b = balls[j];
            if (a.state !== 'roll' || b.state !== 'roll') continue;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d > 0 && d < BR * 2) {
              const nx = dx / d, ny = dy / d, p = (BR * 2 - d) / 2;
              a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
            }
          }
        }
        for (const b of balls) {
          if (b.state === 'roll') {
            if (Math.hypot(b.x - goal.x, b.y - goal.y) < goal.r - BR * 0.2) {
              b.state = 'goal';
              scored++;
              api.progress(scored);
              api.sfx('perfect');
              api.fx.burst(goal.x, goal.y, '#e9b949', 14);
              api.fx.text(goal.x, goal.y - 30, `${scored}/3`, '#ffe08a', 24);
              if (scored >= 3 && !done) { done = true; setTimeout(() => api.complete(), 600); }
              continue;
            }
            const hole = holes.find((ho) => Math.hypot(b.x - ho.x, b.y - ho.y) < ho.r - BR * 0.25);
            if (hole) {
              b.state = 'sink'; b.hx = hole.x; b.hy = hole.y;
              api.sfx('thud');
              api.fx.text(hole.x, hole.y - 24, 'BACK TO START', '#ff8c8c', 18);
            }
          } else if (b.state === 'sink') {
            b.sink += dt * 2.5;
            b.x += (b.hx - b.x) * Math.min(1, dt * 10); b.y += (b.hy - b.y) * Math.min(1, dt * 10);
            if (b.sink >= 1) spawn(b, balls.indexOf(b));
          } else if (b.state === 'goal') {
            b.sink = Math.min(1, b.sink + dt * 2);
            b.x += (goal.x - b.x) * Math.min(1, dt * 8); b.y += (goal.y - b.y) * Math.min(1, dt * 8);
          }
        }
      },
      draw(g, t) {
        const grd = g.createLinearGradient(0, 0, 0, 670);
        grd.addColorStop(0, '#2b1d12'); grd.addColorStop(1, '#120c07');
        g.fillStyle = grd; g.fillRect(0, 0, W, 670);
        const sx = -tilt.x * 5, sy = -tilt.y * 5;
        g.save();
        g.translate(sx, sy);
        wood(g, ox - 16, oy - 16, cols * cell + 32, rows * cell + 32, '#6b4422', 14);
        const fl = g.createRadialGradient(ox + cols * cell / 2 - tilt.x * 120, oy + rows * cell / 2 - tilt.y * 120, 20, ox + cols * cell / 2, oy + rows * cell / 2, cols * cell);
        fl.addColorStop(0, '#e2b273'); fl.addColorStop(1, '#a8743f');
        g.fillStyle = fl; g.fillRect(ox, oy, cols * cell, rows * cell);
        // Start and goal.
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.beginPath(); g.arc(start.x, start.y, cell * 0.36, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(233,185,73,${0.35 + Math.sin(t * 5) * 0.15})`;
        g.beginPath(); g.arc(goal.x, goal.y, goal.r + 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a1708';
        g.beginPath(); g.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2); g.fill();
        for (const h of holes) {
          const hg = g.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
          hg.addColorStop(0, '#000'); hg.addColorStop(1, '#3a220d');
          g.fillStyle = hg;
          g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = '#4a2c12'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath();
        for (const s of segs) { g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); }
        g.stroke();
        g.strokeStyle = 'rgba(255,220,170,.25)'; g.lineWidth = 2;
        g.beginPath();
        for (const s of segs) { g.moveTo(s.x1 - 1, s.y1 - 1); g.lineTo(s.x2 - 1, s.y2 - 1); }
        g.stroke();
        for (const b of balls) {
          const k = b.state === 'roll' ? 1 : 1 - b.sink * 0.7;
          if (k <= 0.05) continue;
          g.fillStyle = 'rgba(40,20,5,.35)';
          g.beginPath(); g.ellipse(b.x + 3 + tilt.x * 3, b.y + 4 + tilt.y * 3, BR * k, BR * 0.7 * k, 0, 0, Math.PI * 2); g.fill();
          ball(g, b.x, b.y, BR * k, b.c);
        }
        g.restore();
        controlPad(g, PAD, tilt.x, tilt.y);
        g.fillStyle = '#fff'; g.font = '26px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`IN THE SLOT: ${scored} / 3`, 200, 44);
        if (t < 4) {
          g.font = '19px "Bebas Neue", sans-serif';
          g.fillText('TILT WITH THE PAD BELOW', 200, 528 - Math.abs(Math.sin(t * 3)) * 4);
        }
      },
      down(x, y) { if (y > 500) this.move(x, y, true); },
      move(x, y, force) {
        if (!stick && !force) return;
        let dx = (x - PAD.x) / PAD.r, dy = (y - PAD.y) / PAD.r;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        stick = { x: dx, y: dy };
      },
      up() { stick = null; },
    };
  },
};

// Shape Puzzle: drag carved wooden pieces into the silhouette. Tap a piece to rotate it.
// Each puzzle is a random silhouette cut into pieces, so there's always a solution.
import { wood, rr, sky, sand } from './draw.js';
import { pick, shuffle } from '../util.js';

const PAINT = ['#c97b3d', '#a85d2a', '#e0a458', '#8c4f24', '#b86b30', '#d08a4a'];
const STRIPE = ['#2fb39b', '#c8373a', '#e9b949', '#3d5a80', '#ff7a1a', '#7bc043'];

function connected(cells) {
  if (!cells.length) return true;
  const set = new Set(cells.map(([c, r]) => `${c},${r}`));
  const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
  const q = [cells[0]];
  while (q.length) {
    const [c, r] = q.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c + dc},${r + dr}`;
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([c + dc, r + dr]); }
    }
  }
  return seen.size === set.size;
}

const normalize = (cells) => {
  const mc = Math.min(...cells.map((x) => x[0])), mr = Math.min(...cells.map((x) => x[1]));
  return cells.map(([c, r]) => [c - mc, r - mr]);
};
const rotate = (cells) => normalize(cells.map(([c, r]) => [-r, c]));

function makePuzzle(cols, rows, remove, k) {
  for (let attempt = 0; attempt < 400; attempt++) {
    let mask = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) mask.push([c, r]);
    // Nibble cells off the edge to make an interesting outline.
    let removed = 0;
    for (let tries = 0; tries < 60 && removed < remove; tries++) {
      const edge = mask.filter(([c, r]) => c === 0 || r === 0 || c === cols - 1 || r === rows - 1);
      const victim = pick(edge);
      const next = mask.filter((x) => x !== victim);
      if (connected(next)) { mask = next; removed++; }
    }
    // Grow k pieces from random seeds.
    const owner = new Map();
    const seeds = shuffle(mask).slice(0, k);
    const pieces = seeds.map((s, i) => { owner.set(`${s[0]},${s[1]}`, i); return [s]; });
    let stuck = 0;
    while (owner.size < mask.length && stuck < 500) {
      const i = Math.floor(Math.random() * k);
      if (pieces[i].length >= 5) { stuck++; continue; }
      const frontier = [];
      for (const [c, r] of pieces[i]) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${c + dc},${r + dr}`;
        if (!owner.has(key) && mask.some(([mc, mr]) => mc === c + dc && mr === r + dr)) frontier.push([c + dc, r + dr]);
      }
      if (!frontier.length) { stuck++; continue; }
      const cell = pick(frontier);
      owner.set(`${cell[0]},${cell[1]}`, i);
      pieces[i].push(cell);
    }
    if (owner.size === mask.length && pieces.every((p) => p.length >= 2)) return { mask, pieces };
  }
  return null;
}

export default {
  id: 'shape',
  name: 'Shape Puzzle',
  icon: '🧱',
  skill: 'puzzle',
  edge: ['#5fc6ef', '#e8bf6a'],
  mode: 'race',
  how: '<b>Drag</b> the carved pieces into the dark silhouette. <b>Tap</b> a piece to rotate it. Pieces snap into place when they fit. Fill the whole shape to win.',
  goal: (d) => ({ easy: 4, normal: 5, hard: 6 })[d],
  expected: (d) => ({ easy: 30, normal: 50, hard: 72 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [34, 44], normal: [52, 66], hard: [74, 92] },
  unit: 'pieces',
  create(api) {
    const { W, H, diff } = api;
    const [cols, rows, remove, k, spin] = { easy: [4, 4, 2, 4, false], normal: [5, 4, 2, 5, true], hard: [6, 4, 3, 6, true] }[diff];
    const { mask, pieces: raw } = makePuzzle(cols, rows, remove, k);
    const CELL = 48, TCELL = 26;
    const bx = Math.round((W - cols * CELL) / 2), by = 76;
    const maskSet = new Set(mask.map(([c, r]) => `${c},${r}`));
    const pieces = raw.map((cells, i) => {
      let shape = normalize(cells);
      if (spin) for (let n = Math.floor(Math.random() * 4); n > 0; n--) shape = rotate(shape);
      return { cells: shape, at: null, slot: i, paint: PAINT[i % PAINT.length], stripe: STRIPE[i % STRIPE.length] };
    });
    const slots = pieces.map((_, i) => ({ x: 20 + (i % 3) * 124, y: 340 + Math.floor(i / 3) * 150, w: 112, h: 136 }));
    let drag = null, done = false, glow = 0;
    const dims = (p) => [Math.max(...p.cells.map((x) => x[0])) + 1, Math.max(...p.cells.map((x) => x[1])) + 1];
    const occupied = (except) => {
      const s = new Set();
      for (const p of pieces) if (p !== except && p.at) for (const [c, r] of p.cells) s.add(`${p.at.c + c},${p.at.r + r}`);
      return s;
    };
    const fits = (p, at) => {
      const occ = occupied(p);
      return p.cells.every(([c, r]) => { const key = `${at.c + c},${at.r + r}`; return maskSet.has(key) && !occ.has(key); });
    };
    const covered = () => occupied(null).size;
    const report = () => {
      const cov = covered();
      api.progress(Math.round((cov / mask.length) * k));
      if (cov === mask.length && !done) {
        done = true;
        api.sfx('perfect');
        api.fx.burst(W / 2, by + rows * CELL / 2, '#ffe066', 30);
        setTimeout(() => api.complete(), 700);
      }
    };
    const trayOrigin = (p) => {
      const s = slots[p.slot], [w, h] = dims(p);
      return { x: s.x + (s.w - w * TCELL) / 2, y: s.y + (s.h - h * TCELL) / 2 };
    };
    const hit = (x, y) => {
      for (const p of pieces) if (p.at && p.cells.some(([c, r]) => x >= bx + (p.at.c + c) * CELL && x < bx + (p.at.c + c + 1) * CELL && y >= by + (p.at.r + r) * CELL && y < by + (p.at.r + r + 1) * CELL)) return p;
      for (const p of pieces) if (!p.at) { const s = slots[p.slot]; if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return p; }
      return null;
    };
    const drawPiece = (g, p, ox, oy, size) => {
      for (const [c, r] of p.cells) {
        const x = ox + c * size, y = oy + r * size;
        g.fillStyle = p.paint;
        rr(g, x + 1, y + 1, size - 2, size - 2, size * 0.16); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 3, y + 3, size - 6, size * 0.14);
        g.fillStyle = p.stripe; g.fillRect(x + 3, y + size - size * 0.2, size - 6, size * 0.08);
        g.strokeStyle = 'rgba(50,25,8,.55)'; g.lineWidth = 1.5;
        rr(g, x + 1, y + 1, size - 2, size - 2, size * 0.16); g.stroke();
      }
    };

    return {
      update(dt) { if (done) glow = Math.min(1, glow + dt * 2); },
      draw(g, t) {
        sky(g, W, H, '#5fc6ef', '#c8f0ff');
        sand(g, W, 300, H);
        wood(g, bx - 16, by - 16, cols * CELL + 32, rows * CELL + 32, '#7a4b22', 14);
        g.fillStyle = '#d9b37a'; g.fillRect(bx, by, cols * CELL, rows * CELL);
        for (const [c, r] of mask) { g.fillStyle = '#2a1708'; rr(g, bx + c * CELL + 2, by + r * CELL + 2, CELL - 4, CELL - 4, 6); g.fill(); }
        for (const p of pieces) if (p.at && p !== drag?.p) drawPiece(g, p, bx + p.at.c * CELL, by + p.at.r * CELL, CELL);
        if (done) { g.strokeStyle = `rgba(255,236,120,${glow})`; g.lineWidth = 6; rr(g, bx - 6, by - 6, cols * CELL + 12, rows * CELL + 12, 10); g.stroke(); }
        for (const p of pieces) {
          const s = slots[p.slot];
          g.fillStyle = 'rgba(0,0,0,.18)'; rr(g, s.x, s.y, s.w, s.h, 14); g.fill();
          if (!p.at && p !== drag?.p) { const o = trayOrigin(p); drawPiece(g, p, o.x, o.y, TCELL); }
        }
        if (drag) {
          const [w, h] = dims(drag.p);
          g.save(); g.globalAlpha = 0.92;
          drawPiece(g, drag.p, drag.x - (w * CELL) / 2, drag.y - (h * CELL) / 2 - 50, CELL);
          g.restore();
        }
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`FILLED ${covered()} / ${mask.length}`, 200, 36);
        if (t < 4) { g.font = '19px "Bebas Neue", sans-serif'; g.fillText('DRAG PIECES IN · TAP TO ROTATE', 200, 322); }
      },
      down(x, y) {
        if (done) return;
        const p = hit(x, y);
        if (p) drag = { p, x, y, sx: x, sy: y, moved: false, from: p.at };
      },
      move(x, y) {
        if (!drag) return;
        drag.x = x; drag.y = y;
        if (Math.hypot(x - drag.sx, y - drag.sy) > 10) drag.moved = true;
      },
      up() {
        if (!drag) return;
        const p = drag.p;
        if (!drag.moved) {
          // Tap: rotate in place if it still fits, otherwise send it back to the tray.
          p.cells = rotate(p.cells);
          if (p.at && !fits(p, p.at)) p.at = null;
          api.sfx('tick');
        } else {
          const [w, h] = dims(p);
          const at = { c: Math.round((drag.x - (w * CELL) / 2 - bx) / CELL), r: Math.round((drag.y - (h * CELL) / 2 - 50 - by) / CELL) };
          if (fits(p, at)) { p.at = at; api.sfx('clack'); }
          else { p.at = null; api.sfx(drag.y < 320 ? 'fail' : 'tick'); }
        }
        drag = null;
        report();
      },
    };
  },
};

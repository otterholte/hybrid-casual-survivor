// Slide Puzzle: slide carved tiles back into the tiki sun picture.
import { rr, wood, sky, sand } from './draw.js';
import { pick } from '../util.js';

function paintPicture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.75);
  gr.addColorStop(0, '#ffe066');
  gr.addColorStop(0.5, '#ff9f1c');
  gr.addColorStop(1, '#e85d04');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  g.save();
  g.translate(size / 2, size / 2);
  for (let i = 0; i < 16; i++) {
    g.rotate(Math.PI / 8);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.22)' : 'rgba(180,60,0,.25)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-24, -size); g.lineTo(24, -size); g.fill();
  }
  // Tiki mask.
  g.fillStyle = '#8b4a1c';
  rr(g, -88, -110, 176, 220, 60); g.fill();
  g.fillStyle = '#a8612a';
  rr(g, -74, -96, 148, 192, 50); g.fill();
  g.fillStyle = '#1fb5c9';
  g.fillRect(-74, -70, 148, 14);
  g.fillStyle = '#fff3d6';
  for (const x of [-36, 36]) { g.beginPath(); g.ellipse(x, -24, 24, 18, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#2a1408';
  for (const x of [-36, 36]) { g.beginPath(); g.arc(x, -22, 10, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#6b3510';
  g.beginPath(); g.moveTo(0, -10); g.lineTo(-16, 26); g.lineTo(16, 26); g.fill();
  g.fillStyle = '#2a1408';
  rr(g, -46, 42, 92, 34, 14); g.fill();
  g.fillStyle = '#fff3d6';
  for (let i = 0; i < 5; i++) g.fillRect(-40 + i * 17, 44, 12, 10);
  g.fillStyle = '#ef476f';
  g.fillRect(-74, 86, 148, 10);
  g.restore();
  return c;
}

export default {
  id: 'slide',
  name: 'Slide Puzzle',
  icon: '🧩',
  skill: 'puzzle',
  edge: ['#5fc6ef', '#e8bf6a'],
  mode: 'race',
  how: 'The tiki sun has been scrambled! <b>Tap a tile</b> in the same row or column as the gap to slide it. Rebuild the picture to win.',
  goal: (d) => (d === 'hard' ? 15 : 8),
  expected: (d) => ({ easy: 28, normal: 50, hard: 75 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [30, 38], normal: [40, 50], hard: [70, 90] },
  unit: 'tiles',
  create(api) {
    const { W, H, diff } = api;
    const N = diff === 'hard' ? 4 : 3;
    const depth = { easy: 22, normal: 90, hard: 70 }[diff];
    const B = 320, X0 = 40, Y0 = 170, cell = B / N;
    const pic = paintPicture(B);
    // board[i] = tile number at cell i; N*N-1 is the gap.
    const board = [...Array(N * N).keys()];
    let gap = N * N - 1, last = -1;
    const nbrs = (i) => {
      const r = Math.floor(i / N), c = i % N, out = [];
      if (r > 0) out.push(i - N);
      if (r < N - 1) out.push(i + N);
      if (c > 0) out.push(i - 1);
      if (c < N - 1) out.push(i + 1);
      return out;
    };
    do {
      for (let k = 0; k < depth; k++) {
        const opts = nbrs(gap).filter((j) => j !== last);
        const j = pick(opts);
        [board[gap], board[j]] = [board[j], board[gap]];
        last = gap;
        gap = j;
      }
    } while (board.every((v, i) => v === i));
    const draw = {}; // tile -> animated position
    board.forEach((v, i) => { draw[v] = { x: i % N, y: Math.floor(i / N) }; });
    let solved = false, glow = 0;
    const correct = () => board.filter((v, i) => v === i && v !== N * N - 1).length;
    api.progress(correct());

    return {
      update(dt) {
        for (let i = 0; i < board.length; i++) {
          const d = draw[board[i]];
          const tx = i % N, ty = Math.floor(i / N);
          d.x += (tx - d.x) * Math.min(1, dt * 18);
          d.y += (ty - d.y) * Math.min(1, dt * 18);
        }
        if (solved) glow = Math.min(1, glow + dt * 2);
      },
      draw(g, t) {
        sky(g, W, H, '#5fc6ef', '#c8f0ff');
        sand(g, W, 560, H);
        wood(g, X0 - 22, Y0 - 22, B + 44, B + 44, '#7a4b22', 18);
        g.fillStyle = '#3a220d';
        rr(g, X0 - 4, Y0 - 4, B + 8, B + 8, 8); g.fill();
        // Reference picture.
        g.save();
        rr(g, 150, 60, 100, 90, 10); g.clip();
        g.drawImage(pic, 150, 55, 100, 100);
        g.restore();
        g.strokeStyle = '#7a4b22'; g.lineWidth = 4; rr(g, 150, 60, 100, 90, 10); g.stroke();
        g.fillStyle = '#fff'; g.font = '18px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText('MAKE THIS', 200, 52);
        for (const v of board) {
          if (v === N * N - 1 && !solved) continue;
          const d = draw[v];
          const x = X0 + d.x * cell, y = Y0 + d.y * cell;
          const sx = (v % N) * cell, sy = Math.floor(v / N) * cell;
          g.save();
          rr(g, x + 2, y + 2, cell - 4, cell - 4, 10);
          g.clip();
          g.drawImage(pic, sx, sy, cell, cell, x, y, cell, cell);
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fillRect(x, y, cell, 6);
          g.restore();
          g.strokeStyle = 'rgba(60,30,10,.7)'; g.lineWidth = 3;
          rr(g, x + 2, y + 2, cell - 4, cell - 4, 10); g.stroke();
          if (diff !== 'hard' && !solved) {
            g.fillStyle = 'rgba(42,20,8,.75)';
            g.beginPath(); g.arc(x + 18, y + 18, 12, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff'; g.font = '19px "Bebas Neue", sans-serif'; g.textAlign = 'center';
            g.fillText(String(v + 1), x + 18, y + 24);
          }
        }
        if (solved) {
          g.strokeStyle = `rgba(255,236,120,${glow})`;
          g.lineWidth = 8;
          rr(g, X0 - 6, Y0 - 6, B + 12, B + 12, 12); g.stroke();
        }
        if (t < 4) {
          g.fillStyle = '#fff'; g.font = '22px "Bebas Neue", sans-serif'; g.textAlign = 'center';
          g.fillText('TAP A TILE NEXT TO THE GAP', 200, 548 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down(x, y) {
        if (solved) return;
        const c = Math.floor((x - X0) / cell), r = Math.floor((y - Y0) / cell);
        if (c < 0 || r < 0 || c >= N || r >= N) return;
        const i = r * N + c;
        const gr = Math.floor(gap / N), gc = gap % N;
        if (i === gap || (r !== gr && c !== gc)) { api.sfx('tick'); return; }
        const step = r === gr ? (c > gc ? 1 : -1) : (r > gr ? N : -N);
        while (gap !== i) {
          const j = gap + step;
          [board[gap], board[j]] = [board[j], board[gap]];
          gap = j;
        }
        api.sfx('clack');
        const n = correct();
        api.progress(n);
        if (board.every((v, k) => v === k)) {
          solved = true;
          api.sfx('perfect');
          api.fx.burst(200, Y0 + B / 2, '#ffe066', 30);
          setTimeout(() => api.complete(), 700);
        }
      },
    };
  },
};

// Totem Stack: drop sliding carved blocks; overhang gets sliced off.
import { sky, sun, sea, sand, rr, palm } from './draw.js';

const WOODS = ['#c97b3d', '#a85d2a', '#e0a458', '#8c4f24', '#b86b30'];
const PAINT = ['#1fb5c9', '#ef476f', '#f6c90e', '#7bc043', '#ff6b35'];
const TH = 34, GROUND = 590;

export default {
  id: 'totem',
  name: 'Totem Stack',
  icon: '🗿',
  skill: 'physical',
  edge: ['#2fa7e0', '#e8bf6a'],
  mode: 'race',
  how: 'A carved block slides back and forth. <b>Tap</b> to drop it on the totem. Anything hanging over the edge gets chopped off, so line it up! Hit the target height to win.',
  goal: (d) => ({ easy: 8, normal: 12, hard: 15 })[d],
  expected: (d) => ({ easy: 20, normal: 32, hard: 46 })[d],
  unit: 'tiers',
  create(api) {
    const { W, H, diff } = api;
    const goal = this.goal(diff);
    const [base, inc] = { easy: [140, 7], normal: [185, 11], hard: [225, 15] }[diff];
    const tiers = [{ x: 200, w: 170, c: 0 }];
    let mover = null, falling = null, debris = [], cam = 0, done = false, perfectStreak = 0;
    const spawn = () => {
      const top = tiers[tiers.length - 1];
      const dir = Math.random() < 0.5 ? 1 : -1;
      mover = { x: dir > 0 ? top.w / 2 + 10 : W - top.w / 2 - 10, w: top.w, dir, c: tiers.length };
    };
    spawn();
    const yOf = (i) => GROUND - (i + 1) * TH + cam;

    const drawBlock = (g, x, y, w, ci, rot = 0) => {
      g.save();
      g.translate(x, y + TH / 2);
      g.rotate(rot);
      g.fillStyle = WOODS[ci % WOODS.length];
      rr(g, -w / 2, -TH / 2, w, TH, 6); g.fill();
      g.strokeStyle = 'rgba(50,25,8,.6)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = PAINT[ci % PAINT.length];
      g.fillRect(-w / 2 + 2, -TH / 2 + 3, w - 4, 4);
      if (w > 34) {
        g.fillStyle = '#2a1408';
        const ew = Math.min(9, w * 0.08);
        g.beginPath(); g.ellipse(-w * 0.18, -2, ew, 5, 0, 0, Math.PI * 2); g.ellipse(w * 0.18, -2, ew, 5, 0, 0, Math.PI * 2); g.fill();
        g.fillRect(-w * 0.16, 8, w * 0.32, 4);
      }
      g.restore();
    };

    return {
      update(dt) {
        const n = tiers.length - 1;
        const targetCam = Math.max(0, n * TH - 280);
        cam += (targetCam - cam) * Math.min(1, dt * 4);
        if (mover && !done) {
          const sp = base + n * inc;
          mover.x += mover.dir * sp * dt;
          if (mover.x > W - mover.w / 2 + 30) mover.dir = -1;
          if (mover.x < mover.w / 2 - 30) mover.dir = 1;
        }
        if (falling) {
          falling.vy += 2600 * dt;
          falling.y += falling.vy * dt;
          const top = tiers[tiers.length - 1];
          const land = yOf(tiers.length);
          if (falling.y >= land) {
            const fb = falling;
            falling = null;
            const l = Math.max(fb.x - fb.w / 2, top.x - top.w / 2);
            const r = Math.min(fb.x + fb.w / 2, top.x + top.w / 2);
            const ov = r - l;
            if (ov <= 2) {
              debris.push({ x: fb.x, y: land, w: fb.w, vy: 0, vx: fb.x < top.x ? -90 : 90, rot: 0, vr: fb.x < top.x ? -3 : 3, c: fb.c });
              api.sfx('fail');
              api.fx.shake(6);
              api.fx.text(200, land - 30 + 0, 'MISSED!', '#ef476f', 26);
              perfectStreak = 0;
              setTimeout(spawn, 400);
              return;
            }
            if (Math.abs(fb.x - top.x) < 6) {
              perfectStreak++;
              tiers.push({ x: top.x, w: Math.min(170, top.w + (perfectStreak > 1 ? 6 : 0)), c: fb.c });
              api.sfx('perfect');
              api.fx.text(top.x, land - 18, perfectStreak > 1 ? `PERFECT x${perfectStreak}` : 'PERFECT!', '#ffe066', 24);
              api.fx.burst(top.x, land + TH, '#ffe066', 14);
            } else {
              perfectStreak = 0;
              tiers.push({ x: (l + r) / 2, w: ov, c: fb.c });
              const cutW = fb.w - ov;
              const cutX = fb.x < top.x ? l - cutW / 2 : r + cutW / 2;
              debris.push({ x: cutX, y: land, w: cutW, vy: -60, vx: fb.x < top.x ? -60 : 60, rot: 0, vr: fb.x < top.x ? -4 : 4, c: fb.c });
              api.sfx('clack');
              api.fx.burst(fb.x < top.x ? l : r, land + TH / 2, '#e0a458', 8);
            }
            const count = tiers.length - 1;
            api.progress(count);
            if (count >= goal) {
              done = true;
              api.sfx('fanfare');
              api.fx.burst(200, yOf(tiers.length - 1), '#ffe066', 30);
              setTimeout(() => api.complete(), 700);
            } else spawn();
          }
        }
        for (const d of debris) { d.vy += 1400 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += d.vr * dt; }
        debris = debris.filter((d) => d.y < H + 100);
      },
      draw(g, t) {
        sky(g, W, H, '#2fa7e0', '#ffd98a');
        sun(g, 80, 110 + cam * 0.2, 26);
        sea(g, W, 470 + cam * 0.5, t, 140);
        sand(g, W, GROUND + cam, H + cam + 100);
        palm(g, 360, GROUND + cam + 6, 300, -40, t);
        // Goal flag line.
        const gy = yOf(goal - 1) + TH / 2 - TH / 2;
        g.setLineDash([10, 8]);
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(20, gy); g.lineTo(380, gy); g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#fff'; g.font = '16px "Luckiest Guy", sans-serif'; g.textAlign = 'left';
        g.fillText('GOAL', 22, gy - 6);
        tiers.forEach((tr, i) => drawBlock(g, tr.x, yOf(i), tr.w, tr.c));
        for (const d of debris) drawBlock(g, d.x, d.y, d.w, d.c, d.rot);
        if (mover && !falling && !done) {
          const my = yOf(tiers.length) - 130;
          g.strokeStyle = 'rgba(90,58,26,.8)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(mover.x, 0); g.lineTo(mover.x, my); g.stroke();
          drawBlock(g, mover.x, my, mover.w, mover.c);
          g.fillStyle = 'rgba(255,255,255,.2)';
          g.fillRect(mover.x - mover.w / 2, my + TH, mover.w, yOf(tiers.length) - my - TH);
        }
        if (falling) drawBlock(g, falling.x, falling.y, falling.w, falling.c);
        g.fillStyle = '#fff'; g.font = '22px "Luckiest Guy", sans-serif'; g.textAlign = 'center';
        g.fillText(`${tiers.length - 1} / ${goal}`, 200, 34);
        if (t < 4 && tiers.length === 1) {
          g.font = '18px "Luckiest Guy", sans-serif';
          g.fillText('TAP TO DROP', 200, 650 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down() {
        if (!mover || falling || done) return;
        const my = yOf(tiers.length) - 130;
        falling = { x: mover.x, y: my, w: mover.w, c: mover.c, vy: 0 };
        mover = null;
        api.sfx('whoosh');
      },
    };
  },
};

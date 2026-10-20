// Fill the Bucket: catch water from a swinging spout, carry it right, and pour it into the barrel.
import { sky, sun, sea, sand, wood, palm, coconut, rr } from './draw.js';
import { rand } from '../util.js';

const RIM = 470, CAP = 8;

export default {
  id: 'bucket',
  name: 'Fill the Bucket',
  icon: '🪣',
  skill: 'physical',
  edge: ['#4fc0ef', '#e8bf6a'],
  mode: 'race',
  how: '<b>Drag</b> the bucket to catch water from the swinging spout, then carry it to the <b>barrel on the right</b> to pour. Fill the barrel first to win. On harder levels, dodge falling coconuts: they knock water out.',
  goal: (d) => ({ easy: 18, normal: 24, hard: 28 })[d],
  expected: (d) => ({ easy: 30, normal: 45, hard: 58 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [30, 38], normal: [42, 54], hard: [54, 68] },
  unit: 'scoops',
  create(api) {
    const { W, H, diff } = api;
    const goal = this.goal(diff);
    const [rate, swing, nutEvery] = { easy: [0.24, 0.8, 0], normal: [0.28, 1.1, 7], hard: [0.3, 1.45, 4] }[diff];
    let bx = 140, target = 140, water = 0, level = 0, dropT = 0, nutT = nutEvery || 999, done = false, pouring = 0, spoutX = 160;
    let drops = [], nuts = [], splashes = [];

    return {
      update(dt, t) {
        spoutX = 165 + 115 * Math.sin(t * swing) * Math.cos(t * 0.37);
        bx += (target - bx) * Math.min(1, dt * 14);
        dropT -= dt;
        if (dropT <= 0) { drops.push({ x: spoutX + rand(-4, 4), y: 92, vy: 120 }); dropT = rate; }
        if (nutEvery) {
          nutT -= dt;
          if (nutT <= 0) { nuts.push({ x: rand(60, 300), y: -20, vy: 60, rot: 0 }); nutT = nutEvery * rand(0.7, 1.3); }
        }
        for (const d of drops) {
          const py = d.y;
          d.vy += 700 * dt; d.y += d.vy * dt;
          if (!d.gone && py < RIM && d.y >= RIM && Math.abs(d.x - bx) < 30) {
            d.gone = true;
            if (water < CAP) { water++; api.sfx('tick'); } else api.fx.text(bx, RIM - 40, 'FULL! POUR IT', '#9df0de', 18);
            splashes.push({ x: d.x, y: RIM, t: 0 });
          }
          if (!d.gone && d.y > 600) { d.gone = true; splashes.push({ x: d.x, y: 600, t: 0 }); }
        }
        drops = drops.filter((d) => !d.gone);
        for (const n of nuts) {
          const py = n.y;
          n.vy += 500 * dt; n.y += n.vy * dt; n.rot += dt * 6;
          if (!n.gone && py < RIM && n.y >= RIM && Math.abs(n.x - bx) < 34) {
            n.gone = true;
            const lost = Math.ceil(water / 2);
            water -= lost;
            api.sfx('thud'); api.fx.shake(6);
            if (lost) api.fx.text(bx, RIM - 40, `-${lost} SPILLED`, '#ff8c8c', 20);
          }
          if (n.y > 640) n.gone = true;
        }
        nuts = nuts.filter((n) => !n.gone);
        for (const s of splashes) s.t += dt;
        splashes = splashes.filter((s) => s.t < 0.4);
        // Pour when over the barrel.
        if (bx > 318 && water > 0 && !done) {
          pouring += dt;
          if (pouring > 0.12) {
            pouring = 0;
            water--; level++;
            api.progress(level);
            api.sfx('plop');
            if (level >= goal) {
              done = true;
              api.sfx('fanfare');
              api.fx.burst(360, 300, '#58d6d0', 26);
              setTimeout(() => api.complete(), 600);
            }
          }
        } else pouring = 0;
      },
      draw(g, t) {
        sky(g, W, H, '#3fa9df', '#ffe1a0');
        sun(g, 80, 120, 22);
        sea(g, W, 430, t, 80);
        sand(g, W, 600, H);
        palm(g, 30, 610, 300, 30, t);
        // Spout and pipe.
        wood(g, 0, 52, 330, 18, '#7a4b22', 6);
        g.fillStyle = '#5a3a1e';
        rr(g, spoutX - 12, 64, 24, 28, 6); g.fill();
        // Barrel.
        const bh = 230, by = 600 - bh;
        wood(g, 330, by, 62, bh, '#8b5a2b', 10);
        const fill = Math.min(1, level / goal);
        g.fillStyle = 'rgba(70,180,220,.85)';
        rr(g, 336, by + bh - 6 - (bh - 12) * fill, 50, (bh - 12) * fill, 6); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([6, 5]); g.lineWidth = 2;
        g.beginPath(); g.moveTo(330, by + 6); g.lineTo(392, by + 6); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#fff'; g.font = '16px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText('POUR HERE', 361, by - 8);
        for (const d of drops) {
          g.fillStyle = '#7fd6ef';
          g.beginPath(); g.moveTo(d.x, d.y - 9); g.quadraticCurveTo(d.x + 6, d.y, d.x, d.y + 5); g.quadraticCurveTo(d.x - 6, d.y, d.x, d.y - 9); g.fill();
        }
        for (const n of nuts) coconut(g, n.x, n.y, 13, n.rot);
        for (const s of splashes) {
          g.strokeStyle = `rgba(127,214,239,${1 - s.t / 0.4})`; g.lineWidth = 2;
          g.beginPath(); g.ellipse(s.x, s.y, 6 + s.t * 40, 3 + s.t * 10, 0, Math.PI, 0); g.stroke();
        }
        // Bucket (tips toward the barrel while pouring).
        g.save();
        g.translate(bx, RIM);
        if (bx > 318 && water > 0) g.rotate(0.6);
        g.fillStyle = '#9c6934';
        g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.lineTo(24, 48); g.lineTo(-24, 48); g.closePath(); g.fill();
        g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.stroke();
        const wf = water / CAP;
        g.fillStyle = 'rgba(70,180,220,.85)';
        g.beginPath(); g.moveTo(-24 - 6 * wf, 48 - 46 * wf); g.lineTo(24 + 6 * wf, 48 - 46 * wf); g.lineTo(24, 46); g.lineTo(-24, 46); g.closePath(); g.fill();
        g.strokeStyle = '#3a2412'; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 30, Math.PI, 0); g.stroke();
        g.restore();
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(`BARREL: ${level} / ${goal}    BUCKET: ${water} / ${CAP}`, 200, 34);
        if (t < 4) {
          g.font = '19px "Bebas Neue", sans-serif';
          g.fillText('DRAG TO CATCH · CARRY RIGHT TO POUR', 180, 650 - Math.abs(Math.sin(t * 3)) * 4);
        }
      },
      down(x) { target = Math.max(40, Math.min(352, x)); this.dragging = true; },
      move(x) { if (this.dragging) target = Math.max(40, Math.min(352, x)); },
      up() { this.dragging = false; },
    };
  },
};

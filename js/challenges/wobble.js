// Wobble Table: blocks keep landing on a see-saw plank. Slide the counterweight to keep it level.
// If a block slides off the end, you're out.
import { jungle, wood, slider, coconut } from './draw.js';
import { rand } from '../util.js';

const PIV = { x: 200, y: 360 }, L = 155, TH = 14;

export default {
  id: 'wobble',
  name: 'Wobble Table',
  icon: '🪵',
  skill: 'endurance',
  edge: ['#1e6b45', '#0f3d29'],
  mode: 'endurance',
  how: 'Blocks keep dropping onto a wobbly plank. <b>Slide the counterweight</b> with the slider underneath to keep it level. If anything slides off the end, <b>you\'re out!</b>',
  goal: () => 0,
  expected: (d) => ({ easy: 70, normal: 55, hard: 45 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [30, 38], normal: [32, 40], hard: [34, 42] },
  unit: 'blocks',
  create(api) {
    const { W, H, diff } = api;
    const [every, wind0, windGrow] = { easy: [8.5, 25, 0.6], normal: [6.5, 40, 0.9], hard: [5.8, 45, 1.0] }[diff];
    let th = 0, om = 0, s = 0, sTarget = 0, dragging = false, next = 1.2, out = false, faller = null;
    const blocks = [];
    const drop = () => {
      const x = rand(-L * 0.8, L * 0.8);
      blocks.push({ x, v: 0, m: rand(0.8, 1.6), w: rand(26, 36), drop: 1, kind: Math.random() < 0.3 ? 'nut' : 'crate' });
      api.sfx('whoosh');
    };

    return {
      // Read-only view used by automated balance tests.
      peek: () => ({ th, om, s, torque: blocks.reduce((sum, b) => sum + (b.drop ? 0 : b.m * b.x), 0), n: blocks.length }),
      update(dt, t) {
        if (faller) {
          faller.t += dt;
          faller.vy += 900 * dt;
          faller.y += faller.vy * dt;
          faller.x += faller.vx * dt;
          faller.rot += faller.vx * 0.02 * dt;
          if (faller.t > 0.9 && !out) { out = true; api.fail('A block slid off the table!'); }
          return;
        }
        s += (sTarget - s) * Math.min(1, dt * 9);
        // Torque from blocks, counterweight and wind. Small spring at the pivot keeps it playable.
        let tq = 0;
        for (const b of blocks) if (!b.drop) tq += b.m * b.x;
        tq += 2.6 * s * L * 0.9;
        const wind = (wind0 + windGrow * t) * (Math.sin(t * 0.6) + 0.5 * Math.sin(t * 1.7 + 1));
        tq += wind;
        const alpha = tq * 0.0085 - 2.6 * om - 1.4 * th;
        om += alpha * dt;
        th += om * dt;
        th = Math.max(-0.7, Math.min(0.7, th));
        for (const b of blocks) {
          if (b.drop > 0) {
            b.drop -= dt * 2.2;
            if (b.drop <= 0) { b.drop = 0; api.sfx('clack'); om += b.x * 0.004 * b.m; }
            continue;
          }
          // Blocks grip until the plank tips past their friction angle, then slide downhill.
          const a = Math.sin(th) * 650;
          if (Math.abs(th) > 0.07 || Math.abs(b.v) > 2) b.v += (a - Math.sign(b.v || a) * 60) * dt;
          b.v *= 1 - 1.5 * dt;
          b.x += b.v * dt;
        }
        // Blocks don't pass through each other.
        blocks.sort((p, q) => p.x - q.x);
        for (let i = 1; i < blocks.length; i++) {
          const p = blocks[i - 1], q = blocks[i];
          if (p.drop || q.drop) continue;
          const min = (p.w + q.w) / 2;
          if (q.x - p.x < min) { const push = (min - (q.x - p.x)) / 2; p.x -= push; q.x += push; const v = (p.v + q.v) / 2; p.v = q.v = v; }
        }
        for (const b of blocks) {
          if (!b.drop && Math.abs(b.x) > L) {
            const c = Math.cos(th), sn = Math.sin(th);
            faller = { b, t: 0, x: PIV.x + b.x * c, y: PIV.y + b.x * sn - TH, vx: b.v * c, vy: b.v * sn, rot: th };
            blocks.splice(blocks.indexOf(b), 1);
            api.sfx('thud');
            api.fx.shake(8);
            return;
          }
        }
        next -= dt;
        if (next <= 0) {
          drop();
          api.progress(blocks.length);
          next = every;
        }
      },
      draw(g, t) {
        jungle(g, W, H, t);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, W, H);
        // Fulcrum.
        g.fillStyle = '#6e6259';
        g.beginPath(); g.moveTo(PIV.x, PIV.y + 6); g.lineTo(PIV.x - 46, PIV.y + 110); g.lineTo(PIV.x + 46, PIV.y + 110); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath(); g.ellipse(PIV.x, PIV.y + 112, 90, 12, 0, 0, Math.PI * 2); g.fill();
        g.save();
        g.translate(PIV.x, PIV.y);
        g.rotate(th);
        // Rail and counterweight under the plank.
        g.strokeStyle = '#3a2412'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(-L * 0.92, TH / 2 + 10); g.lineTo(L * 0.92, TH / 2 + 10); g.stroke();
        const cx = s * L * 0.9;
        g.strokeStyle = '#5a3a1e'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx, TH / 2 + 10); g.lineTo(cx, TH / 2 + 30); g.stroke();
        const sg = g.createRadialGradient(cx - 5, TH / 2 + 38, 3, cx, TH / 2 + 44, 20);
        sg.addColorStop(0, '#a99f95'); sg.addColorStop(1, '#4e4640');
        g.fillStyle = sg;
        g.beginPath(); g.ellipse(cx, TH / 2 + 46, 20, 16, 0, 0, Math.PI * 2); g.fill();
        wood(g, -L - 8, -TH / 2, L * 2 + 16, TH, '#a8743f', 6);
        for (const b of blocks) {
          const lift = b.drop * 200;
          if (b.kind === 'nut') coconut(g, b.x, -TH / 2 - b.w * 0.42 - lift, b.w * 0.42);
          else wood(g, b.x - b.w / 2, -TH / 2 - b.w * 0.8 - lift, b.w, b.w * 0.8, '#c98d4a', 4);
        }
        g.restore();
        if (faller) {
          g.save(); g.translate(faller.x, faller.y); g.rotate(faller.rot);
          if (faller.b.kind === 'nut') coconut(g, 0, -faller.b.w * 0.42, faller.b.w * 0.42);
          else wood(g, -faller.b.w / 2, -faller.b.w * 0.8, faller.b.w, faller.b.w * 0.8, '#c98d4a', 4);
          g.restore();
        }
        // Level indicator.
        g.fillStyle = Math.abs(th) > 0.07 ? '#ff8c8c' : '#9df0de';
        g.font = '20px "Bebas Neue", sans-serif'; g.textAlign = 'center';
        g.fillText(Math.abs(th) > 0.07 ? (th > 0 ? 'TIPPING RIGHT!' : 'TIPPING LEFT!') : 'LEVEL', 200, 520);
        slider(g, 70, 330, 590, s, 'SLIDE THE COUNTERWEIGHT');
        g.fillStyle = '#fff'; g.font = '24px "Bebas Neue", sans-serif';
        g.fillText(`BLOCKS: ${blocks.length}   NEXT IN ${Math.max(0, Math.ceil(next))}`, 200, 40);
      },
      down(x, y) { if (y > 470) { dragging = true; this.move(x, y); } },
      move(x) { if (dragging) sTarget = Math.max(-1, Math.min(1, (x - 200) / 130)); },
      up() { dragging = false; },
    };
  },
};

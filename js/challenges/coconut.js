// Coconut Drop: slingshot coconuts into a swinging sack until the rope snaps.
import { sky, sun, sea, sand, palm, coconut, wood, shadow } from './draw.js';
import { rand, clamp } from '../util.js';

const G = 700, K = 10, KX = 3.6, MAXPULL = 120;

export default {
  id: 'coconut',
  name: 'Coconut Drop',
  icon: '🥥',
  skill: 'physical',
  edge: ['#49bdf0', '#e8bf6a'],
  mode: 'race',
  how: 'Drag back from the slingshot and release to launch. Land coconuts in the <b>open top</b> of the sack. Fill it until the rope snaps!',
  goal: (d) => ({ easy: 5, normal: 7, hard: 10 })[d],
  expected: (d) => ({ easy: 22, normal: 36, hard: 55 })[d],
  // Seconds the best bot takes (race) or lasts (endurance); see botResults.
  firstPlace: { easy: [32, 40], normal: [40, 50], hard: [51, 64] },
  unit: 'coconuts',
  create(api) {
    const { W, H, diff } = api;
    const goal = this.goal(diff);
    const pivot = { x: diff === 'easy' ? rand(170, 230) : 200, y: 64 };
    const amp = { easy: 0, normal: 0.3, hard: 0.38 }[diff];
    const A = { x: 200, y: 548 };
    let phase = 0, ropeL = 150, jig = 0, jigV = 0;
    let aiming = false, pull = { x: 0, y: 0 }, ready = true, reload = 0;
    let nuts = [], count = 0, snapped = false, fall = null, done = false, strain = 0;

    const bagPos = () => {
      const th = amp * Math.sin(phase) + jig;
      return { x: pivot.x + Math.sin(th) * ropeL, y: pivot.y + Math.cos(th) * ropeL, th };
    };

    return {
      update(dt, t) {
        const omega = diff === 'hard' ? 1.25 + 0.75 * Math.sin(t * 0.33) : 1.35;
        phase += omega * dt;
        jigV += (-jig * 30 - jigV * 3) * dt;
        jig += jigV * dt;
        strain = Math.max(0, strain - dt);
        if (!ready) { reload -= dt; if (reload <= 0) ready = true; }
        const bag = bagPos();
        const half = (diff === 'easy' ? 34 : 27) + count * 0.6;
        for (const n of nuts) {
          const py = n.y;
          n.vy += G * dt;
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          n.rot += n.vr * dt;
          if (snapped || n.dead) continue;
          // The only way in is through the mouth, falling downward.
          if (py < bag.y && n.y >= bag.y && n.vy > 0 && Math.abs(n.x - bag.x) < half) {
            n.dead = true;
            count++;
            api.progress(count);
            api.sfx('plop');
            api.fx.burst(bag.x, bag.y, '#f4d58d', 10);
            api.fx.text(bag.x, bag.y - 20, `${count}/${goal}`, '#fff');
            jigV += n.vx * 0.0025 + (Math.random() - 0.5) * 0.6;
            ropeL += 3;
            strain = 0.6;
            if (count >= goal) {
              snapped = true;
              api.sfx('snap');
              api.fx.text(pivot.x, pivot.y + 40, 'SNAP!', '#ff6b35', 34);
              fall = { x: bag.x, y: bag.y, vy: 0, rot: bag.th };
            }
            continue;
          }
          // Bonk off the side of the sack.
          if (n.vy > 0 && n.y > bag.y + 6 && n.y < bag.y + 76 && Math.abs(n.x - bag.x) < half + 8 && !n.bonked) {
            n.bonked = true;
            n.vx = -n.vx * 0.35 + (n.x < bag.x ? -60 : 60);
            n.vy *= 0.5;
            api.sfx('thud');
            jigV += 0.25 * Math.sign(n.vx || 1);
          }
          if (n.y > 600 && n.vy > 0 && !n.landed) {
            n.landed = true;
            n.vy = -Math.abs(n.vy) * 0.2;
            n.vx *= 0.3;
            api.fx.burst(n.x, 600, '#e8bf6a', 5);
          }
        }
        nuts = nuts.filter((n) => !n.dead && n.y < H + 60 && n.x > -60 && n.x < W + 60);
        if (fall && !done) {
          fall.vy += G * dt;
          fall.y += fall.vy * dt;
          fall.rot *= 0.95;
          if (fall.y >= 520) {
            fall.y = 520;
            done = true;
            api.sfx('boom');
            api.fx.shake(14);
            api.fx.burst(fall.x, 590, '#e8bf6a', 26);
            setTimeout(() => api.complete(), 500);
          }
        }
      },
      draw(g, t) {
        sky(g, W, H, '#49bdf0', '#ffe6a3');
        sun(g, 330, 120, 28);
        sea(g, W, 420, t, 70);
        sand(g, W, 588, H);
        palm(g, 26, 600, 520, 30, t);
        // Branch the sack hangs from.
        g.strokeStyle = '#7a4b22';
        g.lineCap = 'round';
        g.lineWidth = 16;
        g.beginPath(); g.moveTo(52, 92); g.quadraticCurveTo(200, 30, 360, 56); g.stroke();
        g.lineWidth = 6;
        g.strokeStyle = '#9c6934';
        g.beginPath(); g.moveTo(60, 86); g.quadraticCurveTo(200, 26, 355, 50); g.stroke();

        const bag = fall ? null : bagPos();
        const bx = fall ? fall.x : bag.x, by = fall ? fall.y : bag.y, th = fall ? fall.rot : bag.th;
        const fill = count / goal;
        // Rope (frays + reddens under strain).
        if (!fall) {
          const tension = clamp(fill, 0, 1);
          g.strokeStyle = `rgb(${150 + tension * 90},${120 - tension * 60},${70 - tension * 40})`;
          g.lineWidth = 4 - tension * 1.5 + (strain > 0 ? Math.sin(t * 60) * 0.6 : 0);
          g.beginPath(); g.moveTo(pivot.x, pivot.y); g.lineTo(bx, by - 4); g.stroke();
          g.fillStyle = '#7a4b22';
          g.beginPath(); g.arc(pivot.x, pivot.y, 6, 0, Math.PI * 2); g.fill();
        } else {
          g.strokeStyle = '#c9a46b';
          g.lineWidth = 3;
          g.beginPath(); g.moveTo(pivot.x, pivot.y); g.lineTo(pivot.x + Math.sin(t * 8) * 6, pivot.y + 40); g.stroke();
        }
        if (!fall) shadow(g, bx, 600, 30 + fill * 10, 6, 0.18);
        // The sack.
        g.save();
        g.translate(bx, by);
        g.rotate(-th * 0.6);
        const half = (diff === 'easy' ? 34 : 27) + count * 0.6, bulge = 8 + fill * 14;
        g.fillStyle = '#c9a46b';
        g.strokeStyle = '#8a6a3a';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-half, 0);
        g.bezierCurveTo(-half - bulge, 30, -half - bulge * 0.6, 72, 0, 78);
        g.bezierCurveTo(half + bulge * 0.6, 72, half + bulge, 30, half, 0);
        g.closePath();
        g.fill(); g.stroke();
        g.strokeStyle = 'rgba(110,80,40,.5)';
        g.lineWidth = 1.5;
        for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-half - 4, i * 15); g.lineTo(half + 4, i * 15 + 2); g.stroke(); }
        for (let i = 0; i < Math.min(count, 6); i++) coconut(g, -half + 9 + (i % 3) * (half * 0.75), -2 - Math.floor(i / 3) * 6, 7);
        g.fillStyle = '#3a2a14';
        g.beginPath(); g.ellipse(0, 0, half, 6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#a5824d';
        g.lineWidth = 4;
        g.beginPath(); g.ellipse(0, 0, half, 6, 0, 0, Math.PI * 2); g.stroke();
        g.restore();

        for (const n of nuts) coconut(g, n.x, n.y, 11, n.rot);

        // Slingshot.
        wood(g, A.x - 7, A.y + 4, 14, 52, '#8b5a2b', 6);
        g.strokeStyle = '#8b5a2b'; g.lineWidth = 12; g.lineCap = 'round';
        g.beginPath(); g.moveTo(A.x, A.y + 10); g.lineTo(A.x - 22, A.y - 20); g.moveTo(A.x, A.y + 10); g.lineTo(A.x + 22, A.y - 20); g.stroke();
        const pos = aiming ? { x: A.x + pull.x, y: A.y - 14 + pull.y } : { x: A.x, y: A.y - 14 };
        g.strokeStyle = '#5a3a1a'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(A.x - 22, A.y - 20); g.lineTo(pos.x, pos.y); g.lineTo(A.x + 22, A.y - 20); g.stroke();
        if (ready) coconut(g, pos.x, pos.y, 11);
        if (aiming) {
          const len = Math.hypot(pull.x, pull.y);
          if (len > 12) {
            const vx = -pull.x * KX, vy = -pull.y * K, vl = Math.hypot(vx, vy) || 1;
            const ux = vx / vl, uy = vy / vl, L = 26 + (len / MAXPULL) * 46;
            g.strokeStyle = 'rgba(255,255,255,.9)';
            g.fillStyle = 'rgba(255,255,255,.9)';
            g.lineWidth = 5;
            const sx = A.x + ux * 24, sy = A.y - 14 + uy * 24;
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + ux * L, sy + uy * L); g.stroke();
            g.beginPath();
            g.moveTo(sx + ux * (L + 12), sy + uy * (L + 12));
            g.lineTo(sx + ux * L - uy * 9, sy + uy * L + ux * 9);
            g.lineTo(sx + ux * L + uy * 9, sy + uy * L - ux * 9);
            g.fill();
          }
        }
        if (t < 4 && !count) {
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.font = '22px "Bebas Neue", sans-serif';
          g.textAlign = 'center';
          g.fillText('DRAG BACK & RELEASE', 200, 630 - Math.abs(Math.sin(t * 3)) * 6);
        }
      },
      down(x, y) {
        if (!ready || snapped) return;
        aiming = true;
        this.move(x, y);
      },
      move(x, y) {
        if (!aiming) return;
        let px = x - A.x, py = y - (A.y - 14);
        const len = Math.hypot(px, py);
        if (len > MAXPULL) { px *= MAXPULL / len; py *= MAXPULL / len; }
        pull = { x: px, y: py };
      },
      up() {
        if (!aiming) return;
        aiming = false;
        const len = Math.hypot(pull.x, pull.y);
        if (len < 15) return;
        nuts.push({ x: A.x + pull.x, y: A.y - 14 + pull.y, vx: -pull.x * KX, vy: -pull.y * K, rot: 0, vr: rand(-8, 8) });
        api.sfx('whoosh');
        ready = false;
        reload = 0.35;
      },
    };
  },
};

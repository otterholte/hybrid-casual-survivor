// Spiral Catch: balls zigzag down three lanes. Tap the lane where a ball reaches the catch zone.
// Each caught ball is sent back to the top of a random lane, so you have to track all three.
import { jungle, ball, rr } from './draw.js';
import { rand, pick } from '../util.js';

const COLORS = ['#ff7a1a', '#e9b949', '#2fb39b', '#c8373a', '#8fb7ff', '#c7a6f5'];
const LANES = [70, 200, 330];
const HALF = 52; // half lane width for the zigzag
const ZONE = 80;

function lanePath(cx) {
  const pts = [[cx - HALF, 86]];
  let y = 86;
  for (let i = 0; i < 4; i++) {
    const right = i % 2 === 0;
    y += 62;
    pts.push([right ? cx + HALF : cx - HALF, y]);
    y += 26;
    pts.push([right ? cx + HALF : cx - HALF, y]);
  }
  pts.pop();
  pts.push([cx, y + 16], [cx, y + 16 + 92]);
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, len, s0: L });
    L += len;
  }
  return { segs, L, end: pts[pts.length - 1] };
}

export default {
  id: 'spiral',
  name: 'Spiral Catch',
  icon: '🎱',
  skill: 'endurance',
  edge: ['#0f2416', '#081a10'],
  mode: 'endurance',
  how: 'Balls zigzag down <b>three lanes</b>. When a ball glows in a lane’s catch zone, <b>tap that lane</b> to catch it. Caught balls come back down a <b>random lane</b>, and more keep coming. Tap the wrong lane and you fumble. <b>Drop one and you’re out!</b>',
  goal: () => 0,
  expected: (d) => ({ easy: 60, normal: 48, hard: 38 })[d],
  unit: 'catches',
  create(api) {
    const { W, H, diff } = api;
    const [speed0, accel, every, startBalls] = { easy: [120, 2.2, 12, 2], normal: [150, 2.8, 10, 2], hard: [175, 3.4, 8, 3] }[diff];
    const paths = LANES.map(lanePath);
    const at = (lane, s) => {
      for (const sg of paths[lane].segs) if (s <= sg.s0 + sg.len) {
        const f = Math.max(0, (s - sg.s0) / sg.len);
        return [sg.x1 + (sg.x2 - sg.x1) * f, sg.y1 + (sg.y2 - sg.y1) * f];
      }
      return paths[lane].end;
    };
    const balls = [];
    const spawn = (lane, s = 0) => balls.push({ lane, s, m: rand(0.92, 1.08), c: COLORS[balls.length % COLORS.length], pop: 1 });
    // Stagger the opening balls so they don't arrive together.
    const startLanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < startBalls; i++) spawn(startLanes[i], -i * 170);
    let spawnT = every, catches = 0, out = false, dropBall = null;
    const fumble = [0, 0, 0], flash = [0, 0, 0], caughtFx = [0, 0, 0];
    const inZone = (b) => b.s >= paths[b.lane].L - ZONE;

    return {
      // Read-only view of the lanes, used by automated balance tests.
      peek: () => balls.filter((b) => !b.gone).map((b) => ({ lane: b.lane, inZone: inZone(b) })),
      update(dt, t) {
        if (out) {
          if (dropBall) { dropBall.vy += 900 * dt; dropBall.y += dropBall.vy * dt; }
          return;
        }
        const speed = speed0 + t * accel;
        for (let i = 0; i < 3; i++) { fumble[i] = Math.max(0, fumble[i] - dt); flash[i] = Math.max(0, flash[i] - dt); caughtFx[i] = Math.max(0, caughtFx[i] - dt); }
        for (const b of balls) {
          b.s += speed * b.m * dt;
          b.pop = Math.max(0, b.pop - dt * 3);
          if (b.s > paths[b.lane].L) {
            out = true;
            const [x, y] = paths[b.lane].end;
            dropBall = { x, y, vy: 0, c: b.c };
            b.gone = true;
            api.sfx('splash');
            api.fx.shake(10);
            api.fail('You dropped a ball!');
            return;
          }
        }
        spawnT -= dt;
        if (spawnT <= 0 && balls.length < 6) {
          const lane = pick([0, 1, 2].filter((l) => balls.every((b) => b.lane !== l || b.s > 140)));
          if (lane != null) {
            spawn(lane);
            api.sfx('pop');
            api.fx.text(LANES[lane], 60, 'NEW BALL!', '#fff', 20);
            spawnT = every;
          }
        }
      },
      draw(g, t) {
        jungle(g, W, H, t);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(0, 0, W, H);
        paths.forEach((p, li) => {
          g.fillStyle = 'rgba(0,0,0,.22)';
          rr(g, LANES[li] - HALF - 14, 70, HALF * 2 + 28, p.end[1] - 50, 14);
          g.fill();
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.strokeStyle = '#3a220d';
          g.lineWidth = 15;
          g.beginPath();
          p.segs.forEach((sg, i) => { if (i === 0) g.moveTo(sg.x1, sg.y1 + 11); g.lineTo(sg.x2, sg.y2 + 11); });
          g.stroke();
          g.strokeStyle = '#b98544';
          g.lineWidth = 9;
          g.stroke();
          // Catch zone.
          const hot = balls.some((b) => b.lane === li && inZone(b) && !b.gone);
          g.save();
          g.globalAlpha = hot ? 0.5 + Math.sin(t * 22) * 0.18 : 0.14;
          g.fillStyle = flash[li] > 0 ? '#c8373a' : hot ? '#ffd166' : '#ffffff';
          rr(g, LANES[li] - 40, p.end[1] - ZONE - 12, 80, ZONE + 24, 16);
          g.fill();
          g.restore();
          // Catch cup.
          const cy = p.end[1] + 22;
          g.fillStyle = caughtFx[li] > 0 ? '#e9b949' : '#5a3a1e';
          g.beginPath(); g.ellipse(LANES[li], cy, 40, 13, 0, 0, Math.PI); g.fill();
          g.fillStyle = '#8a5a2e';
          g.beginPath(); g.ellipse(LANES[li], cy, 40, 7, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = fumble[li] > 0 ? '#ff8c8c' : 'rgba(255,255,255,.75)';
          g.font = '20px "Bebas Neue", sans-serif';
          g.textAlign = 'center';
          g.fillText(fumble[li] > 0 ? 'FUMBLE' : ['LEFT', 'MIDDLE', 'RIGHT'][li], LANES[li], cy + 34);
        });
        for (const b of balls) {
          if (b.gone || b.s < 0) continue;
          const [x, y] = at(b.lane, b.s);
          ball(g, x, y, 11 + b.pop * 6, b.c);
        }
        if (dropBall) ball(g, dropBall.x, dropBall.y, 11, dropBall.c);
        g.fillStyle = '#fff';
        g.font = '26px "Bebas Neue", sans-serif';
        g.textAlign = 'center';
        g.fillText(`CATCHES: ${catches}`, 200, 40);
        if (t < 4) {
          g.font = '21px "Bebas Neue", sans-serif';
          g.fillText('TAP THE LANE WHERE A BALL GLOWS', 200, 662 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down(x) {
        if (out) return;
        const li = x < 135 ? 0 : x < 265 ? 1 : 2;
        if (fumble[li] > 0) return;
        const ready = balls.filter((b) => b.lane === li && inZone(b) && !b.gone).sort((a, b) => b.s - a.s)[0];
        if (!ready) {
          fumble[li] = 0.5;
          flash[li] = 0.35;
          api.sfx('fail');
          return;
        }
        const [bx, by] = at(ready.lane, ready.s);
        api.fx.burst(bx, by, ready.c, 12);
        caughtFx[li] = 0.25;
        // Send it back to the top of a random lane, away from any ball that just started there.
        const free = [0, 1, 2].filter((l) => balls.every((b) => b === ready || b.lane !== l || b.s > 120));
        ready.lane = pick(free.length ? free : [0, 1, 2]);
        ready.s = 0;
        ready.pop = 1;
        catches++;
        api.progress(catches);
        api.sfx('pop');
      },
    };
  },
};

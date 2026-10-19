// Spiral Catch: balls roll down switchback ramps; tap when one reaches the catch zone.
import { jungle, ball, wood, rr } from './draw.js';
import { rand } from '../util.js';

const PTS = [[46, 70], [354, 128], [354, 170], [46, 228], [46, 270], [354, 328], [354, 370], [46, 428], [46, 470], [200, 506], [200, 584]];
const COLORS = ['#ff6b35', '#f6c90e', '#1fb5c9', '#ef476f', '#7bc043', '#9b5de5'];
const ZONE = 82;

export default {
  id: 'spiral',
  name: 'Spiral Catch',
  icon: '🎱',
  skill: 'endurance',
  edge: ['#1e6b45', '#0f3d29'],
  mode: 'endurance',
  how: 'Balls roll down the ramps toward you. <b>Tap</b> when a ball is in the glowing catch zone to send it back to the top. More balls keep coming. <b>Drop one and you\'re out!</b>',
  goal: () => 0,
  expected: (d) => ({ easy: 70, normal: 55, hard: 45 })[d],
  unit: 'catches',
  create(api) {
    const { W, H, diff } = api;
    const cfg = { easy: [105, 17, 2.2], normal: [135, 13, 3.0], hard: [165, 10, 3.8] }[diff];
    const segs = [];
    let L = 0;
    for (let i = 0; i < PTS.length - 1; i++) {
      const [x1, y1] = PTS[i], [x2, y2] = PTS[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      segs.push({ x1, y1, x2, y2, len, s0: L });
      L += len;
    }
    const at = (s) => {
      for (const sg of segs) if (s <= sg.s0 + sg.len) {
        const f = (s - sg.s0) / sg.len;
        return [sg.x1 + (sg.x2 - sg.x1) * f, sg.y1 + (sg.y2 - sg.y1) * f];
      }
      return PTS[PTS.length - 1];
    };
    let balls = [{ s: 0, m: 1, c: COLORS[0], pop: 0 }];
    let spawnT = cfg[1], cooldown = 0, catches = 0, out = false, dropBall = null, flash = 0;
    const inZone = (b) => b.s >= L - ZONE;

    return {
      update(dt, t) {
        if (out) {
          if (dropBall) { dropBall.vy += 900 * dt; dropBall.y += dropBall.vy * dt; }
          return;
        }
        const speed = cfg[0] + t * cfg[2];
        cooldown = Math.max(0, cooldown - dt);
        flash = Math.max(0, flash - dt);
        for (const b of balls) {
          b.s += speed * b.m * dt;
          b.pop = Math.max(0, b.pop - dt * 3);
          if (b.s > L) {
            out = true;
            const [x, y] = at(L);
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
          if (balls.every((b) => b.s > 160)) {
            balls.push({ s: 0, m: rand(0.92, 1.1), c: COLORS[balls.length % COLORS.length], pop: 1 });
            api.sfx('pop');
            api.fx.text(70, 52, 'NEW BALL!', '#fff', 20);
            spawnT = cfg[1];
          }
        }
      },
      draw(g, t) {
        jungle(g, W, H, t);
        // Bamboo frame posts.
        for (const x of [30, 370]) wood(g, x - 9, 40, 18, 560, '#b98b3e', 8);
        for (let i = 0; i < segs.length; i++) {
          const sg = segs[i];
          g.lineCap = 'round';
          g.strokeStyle = '#5a3416';
          g.lineWidth = 18;
          g.beginPath(); g.moveTo(sg.x1, sg.y1 + 12); g.lineTo(sg.x2, sg.y2 + 12); g.stroke();
          g.strokeStyle = '#c98d4a';
          g.lineWidth = 12;
          g.beginPath(); g.moveTo(sg.x1, sg.y1 + 12); g.lineTo(sg.x2, sg.y2 + 12); g.stroke();
        }
        // Catch zone.
        const hot = balls.some(inZone);
        const zy = PTS[PTS.length - 2][1];
        g.save();
        g.globalAlpha = 0.25 + (hot ? 0.45 + Math.sin(t * 20) * 0.15 : 0.1);
        g.fillStyle = hot ? '#ffe066' : '#ffffff';
        rr(g, 160, zy + 8, 80, ZONE + 4, 18);
        g.fill();
        g.restore();
        // Catch bowl.
        g.fillStyle = '#8b5a2b';
        g.beginPath(); g.ellipse(200, 606, 54, 18, 0, 0, Math.PI); g.fill();
        g.fillStyle = '#a8743f';
        g.beginPath(); g.ellipse(200, 604, 54, 10, 0, 0, Math.PI * 2); g.fill();
        if (flash > 0) {
          g.fillStyle = `rgba(239,71,111,${flash * 2})`;
          g.font = '28px "Luckiest Guy", sans-serif';
          g.textAlign = 'center';
          g.fillText('MISS!', 200, 650);
        }
        for (const b of balls) {
          if (b.gone) continue;
          const [x, y] = at(b.s);
          ball(g, x, y, 11 + b.pop * 6, b.c);
        }
        if (dropBall) ball(g, dropBall.x, dropBall.y, 11, dropBall.c);
        g.fillStyle = '#fff';
        g.font = '20px "Luckiest Guy", sans-serif';
        g.textAlign = 'center';
        g.fillText(`CATCHES: ${catches}`, 200, 30);
        if (t < 4) {
          g.font = '17px "Luckiest Guy", sans-serif';
          g.fillText('TAP WHEN A BALL GLOWS IN THE ZONE', 200, 652 - Math.abs(Math.sin(t * 3)) * 5);
        }
      },
      down() {
        if (out) return;
        if (cooldown > 0) return;
        const ready = balls.filter(inZone).sort((a, b) => b.s - a.s)[0];
        if (!ready) {
          cooldown = 0.45;
          flash = 0.5;
          api.sfx('fail');
          return;
        }
        const [x, y] = at(ready.s);
        api.fx.burst(x, y, ready.c, 12);
        ready.s = 0;
        ready.pop = 1;
        catches++;
        api.progress(catches);
        api.sfx('pop');
      },
    };
  },
};

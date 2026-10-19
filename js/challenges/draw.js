// Shared canvas painting helpers for the island look.

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function sky(g, W, H, top = '#56c4f0', bottom = '#ffe8a8') {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}

export function sun(g, x, y, r) {
  const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r * 2.2);
  gr.addColorStop(0, 'rgba(255,240,170,1)');
  gr.addColorStop(0.35, 'rgba(255,214,102,.6)');
  gr.addColorStop(1, 'rgba(255,214,102,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff3b0';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

export function sea(g, W, y, t, h = 60) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#1fa9c9');
  gr.addColorStop(1, '#58d6d0');
  g.fillStyle = gr;
  g.fillRect(0, y, W, h);
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    g.beginPath();
    const yy = y + 12 + row * 16;
    for (let x = 0; x <= W; x += 8) {
      const w = Math.sin(x * 0.05 + t * 1.6 + row * 2) * 2.5;
      x === 0 ? g.moveTo(x, yy + w) : g.lineTo(x, yy + w);
    }
    g.stroke();
  }
}

export function sand(g, W, y, H) {
  const gr = g.createLinearGradient(0, y, 0, H);
  gr.addColorStop(0, '#f7dc9a');
  gr.addColorStop(1, '#e8bf6a');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, y + 6);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin(x * 0.03) * 4);
  g.lineTo(W, H); g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(160,110,40,.18)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % W, yy = y + 12 + ((i * 53) % Math.max(1, H - y - 12));
    g.fillRect(x, yy, 2, 2);
  }
}

export function palm(g, x, y, height, lean, t = 0) {
  g.save();
  const topX = x + lean, topY = y - height;
  g.strokeStyle = '#8b5a2b';
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = i / 9, b = (i + 1) / 9;
    const x1 = x + lean * a * a, y1 = y - height * a;
    const x2 = x + lean * b * b, y2 = y - height * b;
    g.lineWidth = 16 - i * 0.9;
    g.strokeStyle = i % 2 ? '#8b5a2b' : '#9c6934';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  const sway = Math.sin(t * 1.2) * 0.05;
  const fronds = [-2.7, -2.1, -1.5, -0.9, -0.3, 0.35];
  fronds.forEach((ang, i) => {
    const a = ang + sway;
    g.save();
    g.translate(topX, topY);
    g.rotate(a);
    g.fillStyle = i % 2 ? '#2f9e44' : '#3cb84f';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(45, -22, 90, 12);
    g.quadraticCurveTo(45, 0, 0, 6);
    g.fill();
    g.restore();
  });
  coconut(g, topX - 6, topY + 8, 8);
  coconut(g, topX + 7, topY + 9, 8);
  g.restore();
}

export function coconut(g, x, y, r, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  gr.addColorStop(0, '#a8743f');
  gr.addColorStop(1, '#5c3a1a');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a220d';
  for (const [dx, dy] of [[-0.3, -0.25], [0.3, -0.25], [0, 0.2]]) {
    g.beginPath(); g.arc(dx * r, dy * r, r * 0.14, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

export function wood(g, x, y, w, h, color = '#b9773a', r = 6) {
  g.save();
  rr(g, x, y, w, h, Math.min(r, h / 2, w / 2));
  g.fillStyle = color;
  g.fill();
  g.clip();
  g.strokeStyle = 'rgba(60,30,10,.25)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    const yy = y + (h * i) / 4;
    g.moveTo(x, yy);
    g.bezierCurveTo(x + w * 0.3, yy - 3, x + w * 0.7, yy + 3, x + w, yy);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(x, y, w, Math.max(2, h * 0.18));
  g.restore();
  g.strokeStyle = 'rgba(60,30,10,.55)';
  g.lineWidth = 2;
  rr(g, x, y, w, h, Math.min(r, h / 2, w / 2));
  g.stroke();
}

export function shadow(g, x, y, rx, ry, a = 0.25) {
  g.fillStyle = `rgba(40,25,10,${a})`;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

export function jungle(g, W, H, t) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#1e6b45');
  gr.addColorStop(1, '#0f3d29');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const x = (i * 71) % W, y = (i * 137) % H;
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 0.6 + i) * 0.05 + i);
    g.fillStyle = i % 2 ? 'rgba(60,170,90,.25)' : 'rgba(30,120,70,.35)';
    g.beginPath();
    g.ellipse(0, 0, 70, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

export function ball(g, x, y, r, color) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, shade(color, -0.35));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

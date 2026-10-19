// Procedural castaway portraits: modern flat style with soft shading (inline SVG, 100x100).

export const SKINS = ['#f6d7c3', '#eac0a0', '#d9a37c', '#b97f57', '#8d5a3b', '#5e3a26', '#3f281b'];
export const HAIRS = ['#1b1512', '#3b2618', '#6a4024', '#a86b3c', '#d8b27a', '#b5462b', '#8a8a8a', '#e9e4dc'];
export const EYE_COLORS = ['#4a2e1c', '#6b4a2a', '#3b6e8f', '#4f7a4a', '#6e7b85'];
export const BUFFS = ['#e8642c', '#2a9d8f', '#c9a227', '#b23a48', '#3d5a80', '#6a4c93', '#3a3a3a'];
export const FACES = ['oval', 'round', 'square', 'heart', 'long'];
export const EYES = ['almond', 'round', 'narrow', 'hooded', 'wide'];
export const BROWS = ['soft', 'straight', 'arched', 'thick', 'angled'];
export const NOSES = ['straight', 'button', 'wide', 'pointed'];
export const MOUTHS = ['calm', 'smile', 'smirk', 'serious', 'full'];
export const FACIAL = ['none', 'stubble', 'beard', 'goatee', 'mustache'];
export const HAIR_STYLES = ['buzz', 'crop', 'sidepart', 'curly', 'afro', 'undercut', 'long', 'wavy', 'bun', 'pony', 'braids', 'pixie', 'bald'];
export const HAIR_LABELS = ['Buzz', 'Crop', 'Side part', 'Curls', 'Afro', 'Undercut', 'Long', 'Waves', 'Bun', 'Ponytail', 'Braids', 'Pixie', 'Bald'];

const at = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const FACE_PATHS = {
  oval: 'M50 19 C64 19 70 31 70 44 C70 58 62 70 50 70 C38 70 30 58 30 44 C30 31 36 19 50 19Z',
  round: 'M50 20 C66 20 71.5 32 71.5 45 C71.5 59 62 68.5 50 68.5 C38 68.5 28.5 59 28.5 45 C28.5 32 34 20 50 20Z',
  square: 'M50 19 C64 19 70.5 29 70.5 42 L70.5 53 C70.5 62 62 69 50 70 C38 69 29.5 62 29.5 53 L29.5 42 C29.5 29 36 19 50 19Z',
  heart: 'M50 19 C66 19 71 31 70.5 43 C70 55 59 69 50 71 C41 69 30 55 29.5 43 C29 31 34 19 50 19Z',
  long: 'M50 17 C63 17 68.5 29 68.5 44 C68.5 60 60 72.5 50 72.5 C40 72.5 31.5 60 31.5 44 C31.5 29 37 17 50 17Z',
};

function body(look, buff) {
  const f = look.gender === 'f';
  const torso = f
    ? 'M15 100 C16 88 27 80 41 77.5 L59 77.5 C73 80 84 88 85 100Z'
    : 'M7 100 C9 86 22 78.5 39 76 L61 76 C78 78.5 91 86 93 100Z';
  const neckline = f ? 'M40 77.5 Q50 88 60 77.5Z' : 'M41 76 Q50 84 59 76Z';
  return `<path d="${torso}" fill="${buff}"/>
    <path d="${torso}" fill="url(#avBodyShade)"/>
    <path d="${neckline}" fill="${shade(look._skin, -0.12)}"/>`;
}

function hairBack(style, c) {
  const hl = shade(c, 0.12);
  switch (style) {
    case 'long': return `<path d="M27 40 C24 62 26 82 31 94 L69 94 C74 82 76 62 73 40Z" fill="${c}"/>`;
    case 'wavy': return `<path d="M27 40 C22 56 28 66 24 78 C22 86 28 92 32 94 L68 94 C72 92 78 86 76 78 C72 66 78 56 73 40Z" fill="${c}"/>`;
    case 'pony': return `<path d="M66 30 C82 34 84 52 78 72 C76 60 72 50 66 44Z" fill="${c}"/><path d="M70 36 C78 44 80 56 78 66" stroke="${hl}" stroke-width="1.2" fill="none" opacity=".6"/>`;
    case 'bun': return `<circle cx="50" cy="14" r="9.5" fill="${c}"/><path d="M43 12 Q50 8 57 12" stroke="${hl}" stroke-width="1.2" fill="none" opacity=".6"/>`;
    case 'braids': return `<path d="M30 46 C28 60 30 74 31 88" stroke="${c}" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M70 46 C72 60 70 74 69 88" stroke="${c}" stroke-width="7" stroke-linecap="round" fill="none"/>
      ${[56, 64, 72, 80].map((y) => `<path d="M27.5 ${y} l7 -3 M65.5 ${y - 3} l7 3" stroke="${shade(c, -0.35)}" stroke-width="1"/>`).join('')}`;
    case 'afro': return `<circle cx="50" cy="38" r="29" fill="${c}"/>`;
    case 'curly': return `<path d="M27 44 C24 30 34 16 50 15 C66 16 76 30 73 44Z" fill="${c}"/>`;
    default: return '';
  }
}

function hairFront(style, c) {
  const hl = shade(c, 0.15), dk = shade(c, -0.3);
  switch (style) {
    case 'buzz': return `<path d="M30 40 C30 25 39 17.5 50 17.5 C61 17.5 70 25 70 40 C66 30 58 25.5 50 25.5 C42 25.5 34 30 30 40Z" fill="${c}" opacity=".88"/>`;
    case 'crop': return `<path d="M29 42 C27 23 38 14 50 14 C62 14 73 23 71 42 C69 33 64 28 58 27.5 C54 30 46 30 42 27.5 C36 28.5 31 33 29 42Z" fill="${c}"/><path d="M38 19 Q50 15 62 19" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'sidepart': return `<path d="M29 45 C26 22 39 13 52 14 C65 15 74 24 71 44 C70 35 66 29 60 27 C52 31 40 31 33 35 C31 38 29.5 41 29 45Z" fill="${c}"/><path d="M41 16 C38 22 36 27 34 33" stroke="${dk}" stroke-width="1.2" fill="none"/><path d="M45 17 Q58 15 66 22" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'undercut': return `<path d="M31 40 C31 30 34 24 38 22 L38 30 C35 32 33 36 31 40Z M69 40 C69 30 66 24 62 22 L62 30 C65 32 67 36 69 40Z" fill="${c}" opacity=".55"/><path d="M36 30 C34 16 44 10 54 11 C64 12 70 18 66 28 C60 24 50 25 44 29 C41 30 38 30 36 30Z" fill="${c}"/><path d="M44 14 Q56 11 64 17" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'curly': return [[33, 31], [41, 24], [50, 21], [59, 24], [67, 31], [30, 39], [70, 39], [45, 28], [55, 28]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${c}"/><circle cx="${x - 1.5}" cy="${y - 1.8}" r="2" fill="${hl}" opacity=".35"/>`).join('');
    case 'afro': return `<path d="M29 42 C28 20 40 14 50 14 C60 14 72 20 71 42 C66 33 58 30 50 30 C42 30 34 33 29 42Z" fill="${c}"/>`;
    case 'long': return `<path d="M28 52 C24 24 37 14 50 14 C63 14 76 24 72 52 C70 38 66 29 57 26.5 C51 33 40 36 31 40 C29.5 44 28.5 48 28 52Z" fill="${c}"/><path d="M42 17 Q55 14 65 22" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'wavy': return `<path d="M28 50 C24 24 37 14 50 14 C63 14 76 24 72 50 C70 36 64 28 55 27 C48 31 38 33 31 38 C29.5 42 28.5 46 28 50Z" fill="${c}"/><path d="M40 18 Q53 14 64 21" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'bun': case 'pony': return `<path d="M29.5 42 C29 24 39 17.5 50 17.5 C61 17.5 71 24 70.5 42 C67 31 59 26.5 50 26.5 C41 26.5 33 31 29.5 42Z" fill="${c}"/><path d="M38 21 Q50 17 62 21" stroke="${hl}" stroke-width="1.3" fill="none" opacity=".7"/>`;
    case 'braids': return `<path d="M29.5 44 C29 24 39 17 50 17 C61 17 71 24 70.5 44 C68 32 60 27 50 26.5 C40 27 32 32 29.5 44Z" fill="${c}"/><path d="M50 17 L50 26.5" stroke="${dk}" stroke-width="1.2"/>`;
    case 'pixie': return `<path d="M29 46 C26 24 38 15 51 15 C64 15 74 24 71 42 C68 34 63 29 57 28 C50 35 38 37 30 46Z" fill="${c}"/><path d="M44 17 Q57 15 66 22" stroke="${hl}" stroke-width="1.4" fill="none" opacity=".7"/>`;
    case 'bald': return `<path d="M38 24 Q46 20 54 21" stroke="#fff" stroke-width="2" fill="none" opacity=".18" stroke-linecap="round"/>`;
    default: return '';
  }
}

function eyes(look, expr) {
  const type = at(EYES, look.eyes ?? 0);
  const iris = at(EYE_COLORS, look.eyeColor ?? 0);
  const dims = { almond: [4.6, 2.6], round: [4, 3.3], narrow: [4.7, 1.9], hooded: [4.4, 2.5], wide: [5, 3] }[type];
  let [rx, ry] = dims;
  if (expr === 'happy') ry *= 0.55;
  if (expr === 'shock') ry *= 1.35;
  const lid = shade(look._skin, -0.45);
  const fem = look.gender === 'f';
  const one = (cx, flip) => {
    const tilt = type === 'almond' ? (flip ? 4 : -4) : 0;
    const irisR = Math.min(2.7, ry * 0.95 + 0.3);
    let s = `<g transform="rotate(${tilt} ${cx} 47)">
      <ellipse cx="${cx}" cy="47" rx="${rx}" ry="${ry}" fill="#fbf7f2"/>
      <circle cx="${cx + (expr === 'smug' ? 1 : 0)}" cy="47.2" r="${irisR}" fill="${iris}"/>
      <circle cx="${cx + (expr === 'smug' ? 1 : 0)}" cy="47.2" r="${irisR * 0.45}" fill="#140c08"/>
      <circle cx="${cx + 0.9}" cy="46.2" r=".7" fill="#fff" opacity=".9"/>
      <path d="M${cx - rx - 0.4} 47 Q${cx} ${47 - ry * 1.55} ${cx + rx + 0.4} 47" stroke="${lid}" stroke-width="${fem ? 1.5 : 1.1}" fill="none" stroke-linecap="round"/>`;
    if (type === 'hooded') s += `<path d="M${cx - rx - 0.5} 46.2 Q${cx} ${43.5} ${cx + rx + 0.5} 46.2 L${cx + rx + 0.5} 44 L${cx - rx - 0.5} 44Z" fill="${shade(look._skin, -0.06)}"/>`;
    if (fem) s += `<path d="M${flip ? cx - rx - 0.3 : cx + rx + 0.3} 46.6 l${flip ? -1.6 : 1.6} -1.3" stroke="${lid}" stroke-width="1.1" stroke-linecap="round"/>`;
    return s + '</g>';
  };
  return one(41, true) + one(59, false);
}

function brows(look, expr) {
  const type = at(BROWS, look.brows ?? 0);
  const c = shade(at(HAIRS, look.hair), -0.15);
  const w = { soft: 1.6, straight: 1.8, arched: 1.5, thick: 2.8, angled: 2 }[type] + (look.gender === 'f' ? -0.3 : 0.2);
  const lift = expr === 'shock' ? -2.5 : 0;
  const L = () => {
    const y = 40 + lift;
    if (expr === 'sad') return `M35 ${y + 1} Q40 ${y - 0.5} 45.5 ${y - 1.2}`;
    if (expr === 'smug') return `M35 ${y} Q40 ${y - 2.5} 45.5 ${y - 0.5}`;
    if (type === 'arched') return `M35 ${y + 0.5} Q39.5 ${y - 3} 45.5 ${y}`;
    if (type === 'angled') return `M35 ${y + 0.6} L42 ${y - 1.8} L45.5 ${y - 0.6}`;
    if (type === 'straight') return `M35 ${y} L45.5 ${y - 0.4}`;
    return `M35 ${y + 0.3} Q40 ${y - 1.5} 45.5 ${y - 0.2}`;
  };
  const left = L();
  const mirrored = mirrorPath(left);
  return `<path d="${left}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
    <path d="${mirrored}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}

// Mirrors every x coordinate in a simple path (commands M, L, Q with absolute coords).
function mirrorPath(d) {
  const tokens = d.match(/[MLQ]|-?\d+(\.\d+)?/g);
  let out = [], expectX = true;
  for (const t of tokens) {
    if (/[MLQ]/.test(t)) { out.push(t); expectX = true; continue; }
    if (expectX) out.push((100 - parseFloat(t)).toFixed(2));
    else out.push(t);
    expectX = !expectX;
  }
  return out.join(' ');
}

function nose(look) {
  const type = at(NOSES, look.nose ?? 0);
  const c = shade(look._skin, -0.25);
  switch (type) {
    case 'button': return `<path d="M47.5 56 Q50 58 52.5 56" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="50" cy="54.5" r="2" fill="${c}" opacity=".18"/>`;
    case 'wide': return `<path d="M51 47 L52 54" stroke="${c}" stroke-width="1" opacity=".5"/><path d="M45.5 55.5 Q47 58 50 57.5 Q53 58 54.5 55.5" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    case 'pointed': return `<path d="M50.5 46 L53 55.5 Q51 57.5 48.5 56.5" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    default: return `<path d="M51 46.5 L52 55" stroke="${c}" stroke-width="1" opacity=".55"/><path d="M47 56 Q50 58 53 56" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }
}

function mouth(look, expr) {
  let type = at(MOUTHS, look.mouth ?? 0);
  if (expr === 'happy') type = 'grin';
  if (expr === 'sad') type = 'sad';
  if (expr === 'shock') type = 'shock';
  if (expr === 'smug') type = 'smirk';
  const lip = look.gender === 'f' ? shade('#b5524e', look._dark ? -0.3 : 0) : shade(look._skin, -0.32);
  const line = shade(look._skin, -0.5);
  switch (type) {
    case 'grin': return `<path d="M43 61 Q50 68.5 57 61 Q50 63 43 61Z" fill="#fff"/><path d="M43 61 Q50 68.5 57 61" stroke="${line}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    case 'smile': return `<path d="M43.5 61.5 Q50 66 56.5 61.5" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'smirk': return `<path d="M44 62.5 Q51 64 56.5 60.5" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'serious': return `<path d="M44.5 62.5 L55.5 62.5" stroke="${lip}" stroke-width="2" stroke-linecap="round"/>`;
    case 'full': return `<path d="M44 62 Q47 60 50 61 Q53 60 56 62 Q50 65.5 44 62Z" fill="${lip}"/><path d="M44 62 Q50 63 56 62" stroke="${line}" stroke-width=".8" fill="none"/>`;
    case 'sad': return `<path d="M44.5 64 Q50 60.5 55.5 64" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'shock': return `<ellipse cx="50" cy="63" rx="3.2" ry="4" fill="#3a1d16"/>`;
    default: return `<path d="M44.5 62 Q50 64 55.5 62" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
}

function facialHair(look) {
  const type = at(FACIAL, look.facial ?? 0);
  const c = at(HAIRS, look.hair);
  switch (type) {
    case 'stubble': return `<path d="M31.5 52 C33 63 41 70 50 70.5 C59 70 67 63 68.5 52 C66 60 60 65.5 50 66 C40 65.5 34 60 31.5 52Z" fill="${c}" opacity=".28"/><path d="M43 59 Q50 57 57 59 L57 60 Q50 58.5 43 60Z" fill="${c}" opacity=".3"/>`;
    case 'beard': return `<path d="M30.5 48 C31 64 40 72.5 50 73 C60 72.5 69 64 69.5 48 C67 56 62 60 57 60.5 Q50 58 43 60.5 C38 60 33 56 30.5 48Z M44 63 Q50 67 56 63 Q50 64.5 44 63Z" fill="${c}" fill-rule="evenodd"/><path d="M42.5 59.5 Q50 56.5 57.5 59.5 L57 61 Q50 59 43 61Z" fill="${c}"/>`;
    case 'goatee': return `<path d="M44.5 65 Q50 67 55.5 65 L54 70.5 Q50 72.5 46 70.5Z" fill="${c}"/><path d="M43 59.5 Q50 57 57 59.5 L56.5 61 Q50 59 43.5 61Z" fill="${c}"/>`;
    case 'mustache': return `<path d="M42.5 60 Q46 56.5 50 58.5 Q54 56.5 57.5 60 Q54 59.8 50 60.3 Q46 59.8 42.5 60Z" fill="${c}"/>`;
    default: return '';
  }
}

function necklace() {
  const beads = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = 31 + t * 38, y = 75 + Math.sin(t * Math.PI) * 13;
    const big = i % 2 === 0;
    beads.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 2.6 : 1.8}" fill="${big ? '#f2c14e' : '#f7ecd2'}" stroke="#4a2e0c" stroke-width=".6"/>`);
  }
  return `<g class="necklace">
    <path d="M31 75 Q50 101 69 75" stroke="#4a2e0c" stroke-width="1.2" fill="none"/>
    ${beads.join('')}
    <path d="M50 86 L44.5 91.5 L50 100 L55.5 91.5Z" fill="#f2c14e" stroke="#4a2e0c" stroke-width="1"/>
    <path d="M50 89 L47.6 91.6 L50 96.5 L52.4 91.6Z" fill="#b07a22"/>
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="avFaceShade" x1="0" x2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
  <linearGradient id="avBodyShade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
</defs>`;

/** Returns an SVG string. look: {gender, skin, hair, style, face, eyes, eyeColor, brows, nose, mouth, facial, buff}. */
export function avatarSVG(look, { expr = 'neutral', size = 64, cls = '', necklace: neck = false } = {}) {
  const skin = at(SKINS, look.skin ?? 0);
  const L = { ...look, _skin: skin, _dark: (look.skin ?? 0) >= 4 };
  const hair = at(HAIRS, look.hair ?? 0);
  const style = at(HAIR_STYLES, look.style ?? 0);
  const buff = at(BUFFS, look.buff ?? 0);
  const facePath = FACE_PATHS[at(FACES, look.face ?? 0)];
  const ear = shade(skin, -0.08);
  return `<svg class="avatar ${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${DEFS}
    ${hairBack(style, hair)}
    ${body(L, buff)}
    <path d="M42.5 62 L42.5 78 Q50 82 57.5 78 L57.5 62Z" fill="${shade(skin, -0.1)}"/>
    <path d="M42.5 66 Q50 71 57.5 66 L57.5 62 L42.5 62Z" fill="${shade(skin, -0.22)}" opacity=".6"/>
    <ellipse cx="30" cy="48" rx="3.6" ry="5.5" fill="${ear}"/>
    <ellipse cx="70" cy="48" rx="3.6" ry="5.5" fill="${ear}"/>
    <path d="${facePath}" fill="${skin}"/>
    <path d="${facePath}" fill="url(#avFaceShade)"/>
    ${facialHair(L)}
    ${hairFront(style, hair)}
    ${brows(L, expr)}
    ${eyes(L, expr)}
    ${nose(L)}
    ${mouth(L, expr)}
    ${look.headband ? `<path d="M29.5 34 Q50 25 70.5 34 L70.5 39 Q50 30.5 29.5 39Z" fill="${buff}"/>` : ''}
    ${neck ? necklace() : ''}
  </svg>`;
}

export function randomLook(gender, rnd = Math.random) {
  const r = (n) => Math.floor(rnd() * n);
  const femStyles = [3, 4, 6, 7, 8, 9, 10, 11, 1];
  const maleStyles = [0, 1, 2, 3, 4, 5, 12, 6];
  return {
    gender,
    skin: r(SKINS.length), hair: r(6), style: gender === 'f' ? femStyles[r(femStyles.length)] : maleStyles[r(maleStyles.length)],
    face: r(FACES.length), eyes: r(EYES.length), eyeColor: r(EYE_COLORS.length), brows: r(BROWS.length),
    nose: r(NOSES.length), mouth: r(MOUTHS.length), facial: gender === 'f' ? 0 : [0, 0, 1, 2, 3, 4][r(6)], buff: r(BUFFS.length),
  };
}

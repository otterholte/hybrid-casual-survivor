// Procedural cartoon castaway portraits (inline SVG, 100x100 viewBox).

export const SKINS = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
export const HAIRS = ['#2b1b0e', '#5a3214', '#a0522d', '#e6be8a', '#d94f2b', '#1c1c1c', '#7a7a7a', '#f2e3b3'];
export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'spiky', 'pony', 'mohawk', 'bald'];
export const BUFFS = ['#ff6b35', '#1fb5c9', '#7bc043', '#f6c90e', '#9b5de5', '#ef476f'];

const darken = (hex, amt = 0.25) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
};

function backHair(style, c) {
  switch (style) {
    case 'long': return `<path d="M24 44 Q20 80 30 92 L70 92 Q80 80 76 44 Z" fill="${c}"/>`;
    case 'pony': return `<path d="M70 38 Q92 50 82 78 Q78 62 68 52 Z" fill="${c}"/>`;
    case 'bun': return `<circle cx="50" cy="16" r="11" fill="${c}"/>`;
    default: return '';
  }
}

function frontHair(style, c) {
  switch (style) {
    case 'short': return `<path d="M27 46 Q26 20 50 19 Q74 20 73 46 Q68 32 50 31 Q34 31 27 46Z" fill="${c}"/>`;
    case 'long': return `<path d="M26 50 Q24 18 50 18 Q76 18 74 50 Q70 30 56 28 Q46 36 30 36 Z" fill="${c}"/>`;
    case 'bun': return `<path d="M28 44 Q28 22 50 22 Q72 22 72 44 Q66 30 50 30 Q34 30 28 44Z" fill="${c}"/>`;
    case 'curly': return [
      [32, 30], [42, 23], [54, 22], [65, 27], [71, 37], [28, 40], [50, 28], [38, 30], [60, 30],
    ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/>`).join('');
    case 'spiky': return `<path d="M27 45 L28 26 L35 32 L38 17 L45 28 L50 14 L55 28 L62 17 L65 32 L72 26 L73 45 Q66 33 50 32 Q34 33 27 45Z" fill="${c}"/>`;
    case 'pony': return `<path d="M27 46 Q26 20 50 19 Q74 20 73 46 Q64 28 44 30 Q34 32 27 46Z" fill="${c}"/>`;
    case 'mohawk': return `<path d="M44 34 L44 14 Q50 8 56 14 L56 34 Z" fill="${c}"/>`;
    default: return '';
  }
}

function face(expr) {
  const eyes = {
    happy: `<path d="M38 52 Q41 48 44 52" stroke="#2a1a10" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M56 52 Q59 48 62 52" stroke="#2a1a10" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    shock: `<circle cx="41" cy="51" r="4.2" fill="#fff"/><circle cx="59" cy="51" r="4.2" fill="#fff"/><circle cx="41" cy="51" r="2" fill="#2a1a10"/><circle cx="59" cy="51" r="2" fill="#2a1a10"/>`,
    sad: `<circle cx="41" cy="53" r="2.6" fill="#2a1a10"/><circle cx="59" cy="53" r="2.6" fill="#2a1a10"/>`,
  }[expr] || `<ellipse cx="41" cy="52" rx="2.8" ry="3.4" fill="#2a1a10"/><ellipse cx="59" cy="52" rx="2.8" ry="3.4" fill="#2a1a10"/><circle cx="42" cy="51" r="1" fill="#fff"/><circle cx="60" cy="51" r="1" fill="#fff"/>`;
  const brows = {
    sad: `<path d="M36 45 L45 47" stroke="#2a1a10" stroke-width="2" stroke-linecap="round"/><path d="M64 45 L55 47" stroke="#2a1a10" stroke-width="2" stroke-linecap="round"/>`,
    smug: `<path d="M36 46 L45 44" stroke="#2a1a10" stroke-width="2" stroke-linecap="round"/><path d="M55 44 L64 45" stroke="#2a1a10" stroke-width="2" stroke-linecap="round"/>`,
    shock: `<path d="M36 42 Q40 39 45 42" stroke="#2a1a10" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M55 42 Q60 39 64 42" stroke="#2a1a10" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  }[expr] || `<path d="M36 45 Q40 43 45 45" stroke="#2a1a10" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M55 45 Q60 43 64 45" stroke="#2a1a10" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const mouth = {
    happy: `<path d="M41 62 Q50 72 59 62 Z" fill="#7a2e1e"/><path d="M44 63 Q50 66 56 63" fill="#fff"/>`,
    shock: `<ellipse cx="50" cy="66" rx="4.5" ry="5.5" fill="#7a2e1e"/>`,
    sad: `<path d="M43 68 Q50 62 57 68" stroke="#7a2e1e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    smug: `<path d="M43 64 Q52 68 58 61" stroke="#7a2e1e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  }[expr] || `<path d="M43 63 Q50 68 57 63" stroke="#7a2e1e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  return brows + eyes + mouth;
}

/** Returns an SVG string. look: {skin, hair, style, buff}. */
export function avatarSVG(look, { expr = 'neutral', size = 64, cls = '' } = {}) {
  const skin = SKINS[look.skin % SKINS.length];
  const hair = HAIRS[look.hair % HAIRS.length];
  const style = HAIR_STYLES[look.style % HAIR_STYLES.length];
  const buff = BUFFS[look.buff % BUFFS.length];
  return `<svg class="avatar ${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    ${backHair(style, hair)}
    <path d="M18 100 Q20 78 50 76 Q80 78 82 100 Z" fill="${buff}"/>
    <path d="M30 82 L50 96 L70 82 Q60 78 50 78 Q40 78 30 82Z" fill="${darken(buff, 0.25)}"/>
    <rect x="43" y="66" width="14" height="14" rx="5" fill="${darken(skin, 0.12)}"/>
    <circle cx="26" cy="54" r="6" fill="${darken(skin, 0.08)}"/>
    <circle cx="74" cy="54" r="6" fill="${darken(skin, 0.08)}"/>
    <ellipse cx="50" cy="50" rx="24" ry="26" fill="${skin}"/>
    <ellipse cx="34" cy="60" rx="4.5" ry="2.8" fill="#ff8a7a" opacity=".45"/>
    <ellipse cx="66" cy="60" rx="4.5" ry="2.8" fill="#ff8a7a" opacity=".45"/>
    ${frontHair(style, hair)}
    ${look.headband ? `<path d="M26 38 Q50 30 74 38 L74 44 Q50 36 26 44 Z" fill="${buff}"/>` : ''}
    ${face(expr)}
  </svg>`;
}

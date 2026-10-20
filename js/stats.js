// Season stats for every castaway, available any time during a season (📊 button) and at the end.
// Hidden information stays hidden: other castaways' idols show as "?" until the season is over.
import { game, nm } from './state.js';
import { h, clock } from './util.js';
import { avatarSVG } from './avatar.js';
import { modal } from './ui.js';
import { sfx } from './audio.js';

/** The stats table plus the vote history. `reveal` shows everyone's idols (end of season). */
export function statsPanel({ reveal = false } = {}) {
  const S = game.S;
  if (!S) return h('div', { class: 'muted center' }, 'No season in progress.');
  const order = S.players.slice().sort((a, b) => (b.alive - a.alive) || ((a.placement || 0) - (b.placement || 0)) || (b.outDay || 0) - (a.outDay || 0));
  const status = (p) => {
    if (p.placement === 1) return '👑 Winner';
    if (p.alive) return p.immune ? '📿 Immune' : 'In the game';
    return `${p.juror ? 'Jury' : 'Out'}${p.outDay ? ` · Day ${p.outDay}` : ''}`;
  };
  const idols = (p) => (p.human || reveal ? String(p.idols || 0) : '?');
  const head = h('div', { class: 'st-row st-head' },
    h('span', { class: 'st-who' }, 'Castaway'),
    h('span', { title: 'Immunity wins' }, '📿'), h('span', { title: 'Votes cast against them' }, '🗳️'),
    h('span', { title: 'Times on the right side of the vote' }, '🎯'), h('span', { title: 'Idols played' }, '🛡️'),
    h('span', { title: 'Idols in hand' }, '🗿'));
  const rows = order.map((p) => h('div', { class: `st-row ${p.human ? 'me' : ''} ${p.alive ? '' : 'gone'}` },
    h('span', { class: 'st-who' },
      h('span', { class: 'mini', html: avatarSVG(p.look, { size: 30, necklace: p.immune }) }),
      h('span', { class: 'st-name' }, h('b', {}, p.human ? `${p.name} (you)` : p.name),
        h('small', {}, `${status(p)}${!p.human && S.allied[0][p.id] ? ' · 🤝 Ally' : ''}`))),
    h('span', {}, String(p.stats.wins)), h('span', {}, String(p.stats.votesAgainst)),
    h('span', {}, String(p.stats.correctVotes)), h('span', {}, String(p.stats.idolsPlayed || 0)),
    h('span', { class: idols(p) === '?' ? 'st-q' : '' }, idols(p))));
  const me = S.players[0];
  const mine = h('div', { class: 'st-mine' },
    h('span', {}, `🐍 Broken promises: `, h('b', {}, String(me.stats.betrayals))),
    h('span', {}, `🗿 Idols found: `, h('b', {}, String(me.stats.idolsFound))),
    h('span', {}, `🛡️ Idol saves: `, h('b', {}, String(me.stats.idolSaves))));
  const votes = S.voteHistory.length
    ? S.voteHistory.map((v) => {
      const byTarget = {};
      for (const [k, t] of Object.entries(v.votes)) {
        if (!/^\d+$/.test(k)) continue;
        (byTarget[t] = byTarget[t] || []).push(nm(+k));
      }
      return h('div', { class: 'st-vote' },
        h('div', { class: 'st-vote-h' }, `Day ${v.day} · ${nm(v.out)} voted out`),
        ...Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length).map(([t, who]) =>
          h('div', { class: `st-vote-l ${+t === v.out ? 'out' : ''}` }, h('b', {}, `${nm(+t)} (${who.length})`), `: ${who.join(', ')}`)));
    })
    : [h('div', { class: 'muted' }, 'No Tribal Councils yet.')];
  return h('div', { class: 'stats-panel' },
    h('div', { class: 'st-table' }, head, ...rows),
    mine,
    h('div', { class: 'feed-title' }, 'TRIBAL COUNCIL VOTES'),
    ...votes,
    reveal ? null : h('div', { class: 'muted center st-note' }, 'Other castaways’ idols stay hidden until the season ends.'));
}

/** Opens the stats as a modal and pauses the game clock while it's open. */
export function openStats() {
  if (!game.S) return;
  sfx('click');
  const wasPaused = clock.paused;
  clock.paused = true;
  const box = h('div', { class: 'stats-modal' },
    h('div', { class: 'display sm' }, `Day ${game.S.day} · Season stats`),
    statsPanel(),
    h('button', { class: 'btn', onclick: () => box.close() }, 'Close'));
  modal(box).then(() => { clock.paused = wasPaused; });
}


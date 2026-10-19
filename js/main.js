// App entry: menus, season loop, jury spectating and the end screen.
import { h, $, sleep, pick, shuffle, store } from './util.js';
import { audio, sfx } from './audio.js';
import { show, banner, setScene, setMusic, avatarChip, modal } from './ui.js';
import { avatarSVG, SKINS, HAIRS, HAIR_STYLES, BUFFS } from './avatar.js';
import { ARCHETYPES, PLAYER_JOBS } from './data.js';
import { game, newSeason, alive, aliveBots, human, P, nm } from './state.js';
import { beginRoundAI, computePlans } from './ai.js';
import { CHALLENGES, byId, runChallenge, simulateChallenge } from './challenges/index.js';
import { runCamp, simulateCamp, hideIdolIfNeeded } from './camp.js';
import { runTribal, simulateTribal } from './tribal.js';
import { finalTribal } from './finale.js';

const DEFAULTS = { name: '', castSize: 8, difficulty: 'normal', pace: 'classic', look: { skin: 1, hair: 1, style: 0, buff: 0 } };
let settings = { ...DEFAULTS, ...store.get('ic_settings', {}) };
settings.look = { ...DEFAULTS.look, ...(settings.look || {}) };
const saveSettings = () => store.set('ic_settings', settings);

// ---------- global chrome ----------
const muteBtn = $('#muteBtn');
const paintMute = () => (muteBtn.textContent = audio.muted ? '🔇' : '🔊');
paintMute();
muteBtn.addEventListener('click', () => { audio.init(); audio.setMuted(!audio.muted); paintMute(); });
const unlock = () => { audio.init(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// ---------- title ----------
function titleScreen() {
  setScene('day');
  setMusic('title', 'beach');
  const rec = store.get('ic_record', { played: 0, won: 0 });
  show(h('div', { class: 'screen title' },
    h('div', { class: 'logo' },
      h('div', { class: 'logo-torches' }, h('span', { class: 'mini-torch' }, h('i')), h('span', { class: 'mini-torch' }, h('i'))),
      h('div', { class: 'logo-top' }, 'ISLAND'),
      h('div', { class: 'logo-bot' }, 'COUNCIL'),
      h('div', { class: 'logo-tag' }, 'Win challenges · Make alliances · Survive the vote')),
    h('div', { class: 'title-cast', html: shuffle([0, 1, 2, 3, 4]).map((i) => avatarSVG({ skin: i, hair: i + 2, style: i * 2, buff: i }, { size: 62, expr: pick(['happy', 'smug', 'neutral']) })).join('') }),
    h('div', { class: 'stack menu' },
      h('button', { class: 'btn btn-orange btn-big', onclick: () => { sfx('click'); setupScreen(); } }, '🏝️ Play Solo Season'),
      h('button', { class: 'btn btn-teal', onclick: () => { sfx('click'); practiceScreen(); } }, '🎯 Practice Challenges'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); howTo(); } }, '📜 How to Play'),
      h('button', { class: 'btn btn-ghost disabled', title: 'Coming soon', onclick: () => { sfx('fail'); banner({ title: 'Group play is coming soon', sub: 'For now, play a solo season against bots who scheme, lie and vote just like friends would.', icon: '👥', tap: true }); } }, '👥 Play With Friends (soon)')),
    rec.played ? h('div', { class: 'record' }, `Seasons played: ${rec.played} · Crowns won: ${rec.won} 👑`) : null,
  ));
}

function howTo() {
  const box = h('div', { class: 'howto' },
    h('div', { class: 'display sm' }, 'How to Play'),
    h('ol', {},
      h('li', {}, h('b', {}, '📿 Immunity Challenge: '), 'a quick skill game. Win and you can’t be voted out tonight.'),
      h('li', {}, h('b', {}, '🏝️ Back at Camp: '), 'a timed phase. Hunt for idols, message castaways, or spy on conversations. Every second you spend on one thing is time you don’t spend on another.'),
      h('li', {}, h('b', {}, '🔥 Tribal Council: '), 'talk it out, then cast a secret vote. Idols are played before votes are read.'),
      h('li', {}, h('b', {}, '⚖️ The Jury: '), 'everyone voted out joins the jury and picks the winner at Final Tribal. Betray them and they will remember.')),
    h('p', { class: 'muted' }, 'Bots lie. Promises aren’t binding. Watch who keeps their word.'),
    h('button', { class: 'btn btn-orange', onclick: () => box.close() }, 'Got it'));
  modal(box);
}

// ---------- setup ----------
function setupScreen() {
  setScene('day');
  const preview = h('div', { class: 'setup-face' });
  const paint = () => (preview.innerHTML = avatarSVG(settings.look, { size: 130, expr: 'happy' }));
  paint();
  const cycler = (label, key, arr) => h('div', { class: 'cycler' },
    h('button', { class: 'cyc', onclick: () => { settings.look[key] = (settings.look[key] - 1 + arr.length) % arr.length; sfx('click'); paint(); } }, '‹'),
    h('span', {}, label),
    h('button', { class: 'cyc', onclick: () => { settings.look[key] = (settings.look[key] + 1) % arr.length; sfx('click'); paint(); } }, '›'));
  const seg = (key, opts) => {
    const wrap = h('div', { class: 'seg' });
    const render = () => wrap.replaceChildren(...opts.map(([v, lab]) => h('button', { class: settings[key] === v ? 'on' : '', onclick: () => { settings[key] = v; sfx('click'); render(); } }, lab)));
    render();
    return wrap;
  };
  const nameIn = h('input', { class: 'name-in', placeholder: 'Your castaway name', maxlength: 12, value: settings.name || '' });
  show(h('div', { class: 'screen setup' },
    h('div', { class: 'display' }, 'Create Your Castaway'),
    h('div', { class: 'card setup-card' },
      preview,
      h('div', { class: 'cyclers' }, cycler('Skin', 'skin', SKINS), cycler('Hair color', 'hair', HAIRS), cycler('Hair style', 'style', HAIR_STYLES), cycler('Buff', 'buff', BUFFS)),
      nameIn),
    h('div', { class: 'card setup-card' },
      h('div', { class: 'opt-lab' }, 'Castaways'), seg('castSize', [[6, '6 · ~18 min'], [8, '8 · ~28 min'], [10, '10 · ~40 min']]),
      h('div', { class: 'opt-lab' }, 'Challenge difficulty'), seg('difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]),
      h('div', { class: 'opt-lab' }, 'Season pace'), seg('pace', [['classic', 'Classic'], ['blitz', 'Blitz (double boots)']])),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); titleScreen(); } }, '← Back'),
      h('button', { class: 'btn btn-orange btn-big grow', onclick: () => {
        settings.name = (nameIn.value.trim() || 'Castaway').slice(0, 12);
        saveSettings();
        sfx('click');
        playSeason();
      } }, 'Start the Season!')),
  ));
}

// ---------- practice ----------
function practiceScreen() {
  setScene('day');
  setMusic('title', 'beach');
  const me = { id: 0, human: true, name: settings.name || 'You', look: settings.look, alive: true, t: {} };
  show(h('div', { class: 'screen practice' },
    h('div', { class: 'display' }, 'Practice'),
    h('p', { class: 'muted center' }, 'Learn the challenges before the game is on the line.'),
    h('div', { class: 'practice-grid' }, ...CHALLENGES.map((c) => {
      const best = store.get(`ic_best_${c.id}_${settings.difficulty}`, null);
      return h('button', { class: 'practice-card', onclick: async () => { sfx('click'); await runChallenge({ ch: c, players: [me], diff: settings.difficulty, practice: true }); practiceScreen(); } },
        h('div', { class: 'pc-ic' }, c.icon), h('div', { class: 'pc-n' }, c.name),
        h('div', { class: 'pc-s' }, best != null ? `Best: ${best.toFixed(1)}s` : c.mode === 'race' ? 'Race' : 'Endurance'));
    })),
    h('div', { class: 'muted center' }, `Difficulty: ${settings.difficulty} (change it in season setup)`),
    h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); titleScreen(); } }, '← Back'),
  ));
}

// ---------- season ----------
let challengeBag = [];
function nextChallenge(final) {
  const S = game.S;
  if (final) {
    const opts = ['coconut', 'spiral', 'balance'].filter((id) => id !== S.usedChallenges.at(-1));
    const id = pick(opts);
    S.usedChallenges.push(id);
    return byId(id);
  }
  if (!challengeBag.length) challengeBag = shuffle(CHALLENGES.map((c) => c.id)).filter((id) => id !== S.usedChallenges.at(-1));
  const id = challengeBag.shift();
  S.usedChallenges.push(id);
  return byId(id);
}

async function playSeason() {
  const S = newSeason({ ...settings, job: pick(PLAYER_JOBS) });
  challengeBag = [];
  await castReveal();
  let fast = false;

  while (alive().length > 3) {
    S.round++;
    S.day = 1 + (S.round - 1) * 3;
    for (const p of S.players) p.immune = false;
    hideIdolIfNeeded();
    beginRoundAI();
    const final = alive().length === 4;
    const ch = nextChallenge(final);

    // ----- immunity -----
    let res;
    if (!S.humanOut) {
      setScene('day');
      await banner({ title: `DAY ${S.day}`, sub: final ? 'The final four. One last necklace.' : pick(['The sun rises on a hungry tribe.', 'Come on in, castaways!', 'Rain overnight. Spirits are low.', 'Another day in paradise...']), icon: '🌅', tone: 'sun', hold: 1800 });
      res = await runChallenge({ ch, players: alive(), diff: S.settings.difficulty, final });
    } else {
      res = simulateChallenge(ch, alive(), S.settings.difficulty);
      if (!fast) {
        setScene('day');
        await banner({ title: `DAY ${S.day}: ${ch.name}`, sub: `${nm(res.winner)} wins ${final ? 'the FINAL' : ''} immunity!`, icon: `${ch.icon}`, tone: 'sun', tap: true });
      }
    }
    const w = P(res.winner);
    w.immune = true;
    w.stats.wins++;
    S.threat[w.id] += 0.2;
    S.lastWinner = w.id;
    computePlans();

    // ----- camp -----
    if (!S.humanOut) await runCamp();
    else {
      const sim = simulateCamp();
      if (!fast) await juryLounge(sim);
    }

    // ----- tribal -----
    const doDouble = S.settings.pace === 'blitz' && !S.didDouble && S.round >= 2 && alive().length >= 7;
    let out;
    if (fast) out = simulateTribal().out;
    else out = await runTribal({ juror: S.humanOut });
    if (out === 0) fast = await humanVotedOut();
    if (doDouble && alive().length > 4) {
      S.didDouble = true;
      if (!fast) await banner({ title: 'WAIT!', sub: 'This is a <b>double elimination</b>. A second castaway goes home tonight.', icon: '⚡', tone: 'night', tap: true });
      let out2;
      if (fast) out2 = simulateTribal().out;
      else out2 = await runTribal({ juror: S.humanOut, second: true });
      if (out2 === 0) fast = await humanVotedOut();
    }
  }

  if (fast) await recap();
  S.day += 3;
  const { winner } = await finalTribal();
  const rec = store.get('ic_record', { played: 0, won: 0 });
  rec.played++;
  if (winner === 0) rec.won++;
  store.set('ic_record', rec);
  endScreen(winner);
}

async function castReveal() {
  const S = game.S;
  setScene('day');
  setMusic('title', 'beach');
  sfx('conch');
  await new Promise((go) => show(h('div', { class: 'screen cast' },
    h('div', { class: 'eyebrow' }, 'DAY 1 · THE MAROONING'),
    h('div', { class: 'display' }, `${S.players.length} Strangers. 1 Champion.`),
    h('div', { class: 'cast-grid' }, ...S.players.map((p) => {
      const a = p.arch ? ARCHETYPES[p.arch] : null;
      return h('div', { class: `cast-card ${p.human ? 'me' : ''}` },
        h('div', { html: avatarSVG(p.look, { size: 64, expr: p.human ? 'happy' : pick(['happy', 'smug', 'neutral']) }) }),
        h('div', { class: 'cc-name' }, p.human ? `${p.name} (you)` : p.name),
        h('div', { class: 'cc-job' }, p.job),
        a ? h('div', { class: 'cc-arch' }, `${a.emoji} ${a.label}`) : h('div', { class: 'cc-arch' }, '⭐ That’s you'));
    })),
    h('p', { class: 'muted center' }, 'Everyone voted out joins the jury. At the end, the jury crowns the Island Champion.'),
    h('button', { class: 'btn btn-orange btn-big', onclick: () => { sfx('click'); go(); } }, 'Let the game begin!'))));
}

async function juryLounge(sim) {
  setScene('camp');
  setMusic('camp', 'beach');
  await new Promise((go) => show(h('div', { class: 'screen lounge' },
    h('div', { class: 'eyebrow' }, `DAY ${game.S.day} · JURY LOUNGE`),
    h('div', { class: 'display sm' }, 'You see everything now'),
    h('p', { class: 'muted center' }, 'As a juror you can read every camp conversation.'),
    h('div', { class: 'card lounge-log' },
      ...sim.msgs.map((m) => h('div', { class: 'spy-msg' }, h('span', { class: 'mini', html: avatarSVG(P(m.from).look, { size: 24 }) }), h('b', {}, nm(m.from)), ' → ', h('b', {}, nm(m.to)), h('div', {}, `“${m.text}”`))),
      sim.finder ? h('div', { class: 'spy-msg gold' }, `🗿 ${sim.finder.name} found a hidden immunity idol!`) : null),
    h('button', { class: 'btn btn-orange', onclick: () => { sfx('click'); go(); } }, 'Off to Tribal Council'))));
}

async function humanVotedOut() {
  const S = game.S, me = human();
  setMusic(null);
  sfx('fail');
  return new Promise((resolve) => show(h('div', { class: 'screen out' },
    h('div', { class: 'out-face', html: avatarSVG(me.look, { size: 140, expr: 'sad' }) }),
    h('div', { class: 'display' }, 'The island has spoken.'),
    h('p', { class: 'center' }, `You finished in ${ordinal(me.placement)} place out of ${S.players.length}.`),
    h('div', { class: 'card stats' },
      stat('📿', 'Immunity wins', me.stats.wins), stat('🗳️', 'Votes against you', me.stats.votesAgainst),
      stat('🗿', 'Idols found', me.stats.idolsFound), stat('🎯', 'Correct votes', me.stats.correctVotes)),
    h('p', { class: 'muted center' }, 'But it’s not over: you’re on the jury, and you’ll help pick the winner.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-orange btn-big', onclick: () => { sfx('click'); resolve(false); } }, '🪑 Watch from the Jury'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); resolve(true); } }, '⏩ Skip to the Finale')))));
}

async function recap() {
  const S = game.S;
  setScene('camp');
  await new Promise((go) => show(h('div', { class: 'screen lounge' },
    h('div', { class: 'display sm' }, 'Previously on Island Council...'),
    h('div', { class: 'card lounge-log' }, ...S.voteHistory.map((v) => {
      const n = Object.values(v.votes).filter((t) => t === v.out).length;
      return h('div', { class: 'spy-msg' }, h('span', { class: 'mini', html: avatarSVG(P(v.out).look, { size: 24, expr: 'sad' }) }), `Day ${v.day}: `, h('b', {}, nm(v.out)), ` voted out (${n} vote${n === 1 ? '' : 's'})`);
    })),
    h('p', { class: 'center' }, `Final three: ${alive().map((p) => p.name).join(', ')}`),
    h('button', { class: 'btn btn-orange', onclick: () => { sfx('click'); go(); } }, 'To Final Tribal Council'))));
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const stat = (ic, lab, v) => h('div', { class: 'stat' }, h('span', { class: 'st-ic' }, ic), h('span', { class: 'st-l' }, lab), h('b', {}, String(v)));

function endScreen(winnerId) {
  const S = game.S, me = human();
  setScene('day');
  setMusic('title', 'beach');
  const ranked = S.players.slice().sort((a, b) => (a.placement || 99) - (b.placement || 99));
  const won = winnerId === 0;
  show(h('div', { class: 'screen end' },
    h('div', { class: 'eyebrow' }, 'SEASON COMPLETE'),
    h('div', { class: 'end-hero', html: `<div class="crown">👑</div>${avatarSVG(P(winnerId).look, { size: 120, expr: 'happy' })}` }),
    h('div', { class: 'display' }, won ? 'You won the season!' : `${nm(winnerId)} wins!`),
    h('div', { class: 'card stats' },
      stat('🏅', 'Your finish', ordinal(me.placement || 1)), stat('📿', 'Immunity wins', me.stats.wins),
      stat('🗿', 'Idols found', me.stats.idolsFound), stat('🛡️', 'Idol saves', me.stats.idolSaves),
      stat('🎯', 'Correct votes', me.stats.correctVotes), stat('🐍', 'Broken promises', me.stats.betrayals)),
    h('div', { class: 'card standings' }, h('div', { class: 'feed-title' }, 'Final standings'),
      ...ranked.map((p) => h('div', { class: `stand-row ${p.human ? 'me' : ''}` },
        h('span', { class: 'sr-place' }, ordinal(p.placement || 1)),
        h('span', { html: avatarSVG(p.look, { size: 30, expr: p.placement === 1 ? 'happy' : 'neutral' }) }),
        h('span', { class: 'sr-name' }, p.human ? `${p.name} (you)` : p.name),
        h('span', { class: 'sr-info' }, `📿${p.stats.wins} · 🗳️${p.stats.votesAgainst}`)))),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-orange btn-big', onclick: () => { sfx('click'); playSeason(); } }, 'Play another season'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); titleScreen(); } }, 'Main menu')),
  ));
}

titleScreen();

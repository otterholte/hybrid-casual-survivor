// App entry: menus, character creator, season loop, jury spectating and the end screen.
import { h, $, pick, shuffle, store } from './util.js';
import { audio, sfx } from './audio.js';
import { show, banner, setScene, setMusic, avatarChip, modal, setPausable, openPause } from './ui.js';
import { avatarSVG, randomLook, SKINS, HAIRS, HAIR_STYLES, HAIR_LABELS, SHIRTS, SHIRT_NAMES, FACES, FACE_NAMES, EYES, EYE_COLORS, NOSES, MOUTHS, FACIAL } from './avatar.js';
import { ARCHETYPES, PLAYER_JOBS, ADVANTAGES } from './data.js';
import { game, newSeason, alive, human, P, nm } from './state.js';
import { beginRoundAI, computePlans, botTakesAdvantage } from './ai.js';
import { CHALLENGES, byId, runChallenge, simulateChallenge } from './challenges/index.js';
import { runCamp, simulateCamp, hideIdolIfNeeded } from './camp.js';
import { runTribal, simulateTribal } from './tribal.js';
import { finalTribal } from './finale.js';
import { llm, loadLLM, llmEnabled, llmChoice, setLlmChoice, MODELS } from './llm.js';

const DEFAULTS = { name: '', castSize: 8, difficulty: 'normal', campTimer: 0, look: randomLook('m') };
let settings = { ...DEFAULTS, ...store.get('ic_settings2', {}) };
settings.look = { ...DEFAULTS.look, ...(settings.look || {}) };
const saveSettings = () => store.set('ic_settings2', settings);

// ---------- global chrome ----------
const muteBtn = $('#muteBtn');
const paintMute = () => (muteBtn.textContent = audio.muted ? '🔇' : '🔊');
paintMute();
muteBtn.addEventListener('click', () => { audio.init(); audio.setMuted(!audio.muted); paintMute(); });
$('#pauseBtn').addEventListener('click', () => openPause({ onHowTo: howTo }));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('pausable')) openPause({ onHowTo: howTo }); });
const unlock = () => audio.init();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// ---------- title ----------
function titleScreen() {
  setPausable(false);
  setScene('day');
  setMusic('title', 'beach');
  const rec = store.get('ic_record', { played: 0, won: 0 });
  const faces = [randomLook('f'), randomLook('m'), randomLook('f'), randomLook('m'), randomLook('f')];
  show(h('div', { class: 'screen title' },
    h('div', { class: 'logo' },
      h('div', { class: 'logo-fire' }, h('span', { class: 'mini-torch' }, h('i')), h('span', { class: 'mini-torch' }, h('i'))),
      h('div', { class: 'logo-top' }, 'ISLAND'),
      h('div', { class: 'logo-bot' }, 'COUNCIL'),
      h('div', { class: 'logo-tag' }, 'Win immunity. Build alliances. Survive the vote.')),
    h('div', { class: 'title-cast' }, ...faces.map((l) => h('div', { class: 'chip-face', style: { width: '58px', height: '58px' }, html: avatarSVG(l, { size: 58, expr: pick(['neutral', 'smug', 'neutral']) }) }))),
    h('div', { class: 'stack menu' },
      h('button', { class: 'btn btn-big', onclick: () => { sfx('click'); setupScreen(); } }, 'Play Solo Season'),
      h('button', { class: 'btn btn-dark', onclick: () => { sfx('click'); practiceScreen(); } }, 'Practice Challenges'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); howTo(); } }, 'How to Play'),
      h('button', { class: 'btn btn-ghost', style: { opacity: '.6' }, onclick: () => { sfx('click'); banner({ title: 'Group play is coming', sub: 'For now, play a solo season against castaways who scheme, lie and vote like real players.', icon: '👥', tap: true }); } }, 'Play With Friends · Soon')),
    rec.played ? h('div', { class: 'record' }, `Seasons played: ${rec.played} · Titles won: ${rec.won}`) : null,
  ));
}

function howTo() {
  const box = h('div', { class: 'howto' },
    h('div', { class: 'display sm fire' }, 'How to Play'),
    h('ol', {},
      h('li', {}, h('b', {}, 'Immunity: '), 'win a quick skill challenge and you can’t be voted out tonight. The winner wears the necklace.'),
      h('li', {}, h('b', {}, 'Camp: '), 'you get two actions. Have a private strategy talk, spy on someone, or search for a hidden immunity idol. Messages castaways send you are free to answer.'),
      h('li', {}, h('b', {}, 'Tribal Council: '), 'the host questions the tribe, then everyone votes in secret. Idols are played before the votes are read.'),
      h('li', {}, h('b', {}, 'The Jury: '), 'everyone voted out becomes a juror and picks the winner at Final Tribal. They remember who betrayed them.')),
    h('p', { class: 'muted' }, 'Tap the pause button in the corner any time during a season.'),
    h('button', { class: 'btn', onclick: () => box.close() }, 'Got it'));
  modal(box);
}

// ---------- setup ----------
function setupScreen() {
  setPausable(false);
  setScene('day');
  const L = settings.look;
  const preview = h('div', { class: 'setup-face' });
  const paint = () => preview.replaceChildren(h('div', { class: 'chip-face', style: { width: '150px', height: '150px' }, html: avatarSVG(L, { size: 150 }) }));
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const basic = [
    ['Skin', 'skin', SKINS.length, (i) => `Tone ${i + 1}`],
    ['Hair style', 'style', HAIR_STYLES.length, (i) => HAIR_LABELS[i]],
    ['Hair color', 'hair', HAIRS.length, (i) => `Shade ${i + 1}`],
    ['Shirt', 'shirt', SHIRTS.length, (i) => SHIRT_NAMES[i]],
  ];
  const more = [
    ['Face shape', 'face', FACES.length, (i) => FACE_NAMES[i]],
    ['Eyes', 'eyes', EYES.length, (i) => cap(EYES[i])],
    ['Eye color', 'eyeColor', EYE_COLORS.length, (i) => ['Brown', 'Hazel', 'Blue', 'Green', 'Gray'][i]],
    ['Nose', 'nose', NOSES.length, (i) => cap(NOSES[i])],
    ['Mouth', 'mouth', MOUTHS.length, (i) => cap(MOUTHS[i])],
    ['Facial hair', 'facial', FACIAL.length, (i) => cap(FACIAL[i])],
  ];
  const basicBox = h('div', { class: 'cyclers' });
  const moreBox = h('div', { class: 'cyclers hidden' });
  const moreBtn = h('button', { class: 'btn btn-ghost sm', onclick: () => { sfx('click'); moreBox.classList.toggle('hidden'); moreBtn.textContent = moreBox.classList.contains('hidden') ? 'More options ▾' : 'Fewer options ▴'; } }, 'More options ▾');
  const makeCyclers = (fields) => fields.map(([label, key, n, name]) => {
    const val = h('small', {}, name((((L[key] ?? 0) % n) + n) % n));
    const step = (d) => { L[key] = (((L[key] ?? 0) + d) % n + n) % n; sfx('click'); paint(); val.textContent = name(L[key]); };
    return h('div', { class: 'cycler' },
      h('button', { class: 'cyc', onclick: () => step(-1) }, '‹'),
      h('span', {}, label, val),
      h('button', { class: 'cyc', onclick: () => step(1) }, '›'));
  });
  const paintCyclers = () => { basicBox.replaceChildren(...makeCyclers(basic)); moreBox.replaceChildren(...makeCyclers(more)); };
  const genderSeg = h('div', { class: 'seg' });
  const paintGender = () => genderSeg.replaceChildren(...[['m', 'Man'], ['f', 'Woman']].map(([g, lab]) => h('button', {
    class: L.gender === g ? 'on' : '', onclick: () => {
      if (L.gender === g) return;
      Object.assign(L, randomLook(g), { skin: L.skin, eyeColor: L.eyeColor, shirt: L.shirt });
      sfx('click'); paint(); paintGender(); paintCyclers();
    },
  }, lab)));
  paint(); paintGender(); paintCyclers();
  const seg = (key, opts) => {
    const wrap = h('div', { class: 'seg' });
    const render = () => wrap.replaceChildren(...opts.map(([v, lab]) => h('button', { class: settings[key] === v ? 'on' : '', onclick: () => { settings[key] = v; sfx('click'); render(); } }, lab)));
    render();
    return wrap;
  };
  const aiSeg = h('div', { class: 'seg' });
  const aiNote = h('div', { class: 'muted', style: { fontSize: '12px' } });
  const paintAi = () => {
    const c = llmChoice();
    const opt = (v, lab) => h('button', { class: c === v ? 'on' : '', onclick: () => { setLlmChoice(v); sfx('click'); if (v !== 'off') loadLLM(); paintAi(); } }, lab);
    aiSeg.replaceChildren(opt('off', 'Classic'), opt('light', `Light AI · ${MODELS.light.size}`), opt('best', `Best AI · ${MODELS.best.size}`));
    const m = MODELS[c];
    aiNote.textContent = c === 'off' ? 'Castaways answer from the game\u2019s rules engine.'
      : llm.model === c && llm.status === 'ready' ? `AI ready on your ${llm.device === 'webgpu' ? 'GPU' : 'CPU'}. Small talk is written live on your device; strategy replies still follow the rules engine.`
      : llm.model === c && llm.status === 'loading' ? `Downloading once (${m.size})... ${Math.round(llm.progress * 100)}%`
      : llm.model === c && llm.status === 'error' ? 'This model couldn\u2019t load on this device. Classic chat will be used.'
      : `Runs fully on your device after a one-time ${m.size} download. No internet needed afterwards.`;
  };
  llm.listeners.add(() => { if (aiNote.isConnected) paintAi(); });
  paintAi();
  const nameIn = h('input', { class: 'name-in', placeholder: 'Your castaway name', maxlength: 12, value: settings.name || '' });
  show(h('div', { class: 'screen setup' },
    h('div', { class: 'eyebrow' }, 'NEW SEASON'),
    h('div', { class: 'display' }, 'Create Your Castaway'),
    h('div', { class: 'panel setup-card' },
      preview,
      genderSeg,
      h('button', { class: 'btn btn-dark', onclick: () => { Object.assign(L, randomLook(L.gender)); sfx('click'); paint(); paintCyclers(); } }, '🎲 Randomize look'),
      basicBox,
      moreBtn,
      moreBox,
      nameIn),
    h('div', { class: 'panel setup-card' },
      h('div', { class: 'opt-lab' }, 'Castaways'), seg('castSize', [[6, '6 · ~20 min'], [8, '8 · ~30 min'], [10, '10 · ~40 min']]),
      h('div', { class: 'opt-lab' }, 'Challenge difficulty'), seg('difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]),
      h('div', { class: 'opt-lab' }, 'Camp time limit'), seg('campTimer', [[0, 'None'], [120, '2 min'], [180, '3 min']]),
      h('div', { class: 'opt-lab' }, 'Castaway chat'), aiSeg, aiNote),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); saveSettings(); titleScreen(); } }, 'Back'),
      h('button', { class: 'btn btn-big grow', onclick: () => {
        settings.name = (nameIn.value.trim() || 'Castaway').slice(0, 12);
        saveSettings();
        sfx('click');
        playSeason();
      } }, 'Start the Season')),
  ));
}

// ---------- practice ----------
function practiceScreen() {
  setPausable(false);
  setScene('day');
  setMusic('title', 'beach');
  const me = { id: 0, human: true, name: settings.name || 'You', look: settings.look, alive: true, t: {} };
  show(h('div', { class: 'screen practice' },
    h('div', { class: 'eyebrow' }, 'TRAINING GROUNDS'),
    h('div', { class: 'display' }, 'Practice'),
    h('p', { class: 'muted center' }, 'Learn the challenges before your life in the game is on the line.'),
    h('div', { class: 'practice-grid' }, ...CHALLENGES.map((c) => {
      const best = store.get(`ic_best_${c.id}_${settings.difficulty}`, null);
      return h('button', { class: 'practice-card', onclick: async () => { sfx('click'); setPausable(true); await runChallenge({ ch: c, players: [me], diff: settings.difficulty, practice: true }); practiceScreen(); } },
        h('div', { class: 'pc-ic' }, c.icon), h('div', { class: 'pc-n' }, c.name),
        h('div', { class: 'pc-s' }, best != null ? `Best: ${best.toFixed(1)}s` : c.mode === 'race' ? 'Race' : 'Endurance'));
    })),
    h('div', { class: 'muted center' }, `Difficulty: ${settings.difficulty} (change it in season setup)`),
    h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); titleScreen(); } }, 'Back'),
  ));
}

// ---------- season ----------
let challengeBag = [];

function rollPrizes(final) {
  const S = game.S;
  const small = ['intel', 'extraTrip'];
  if (S.hiddenIdol || (S.idolsLeft > 0 && alive().length > 5)) small.push('idolClue', 'idolClue');
  const big = pick(['extraVote', 'voteBlock']);
  const sm = final ? 'intel' : pick(small);
  return [{ id: big, ...ADVANTAGES[big] }, { id: sm, ...ADVANTAGES[sm] }];
}

function awardPrizes(order, prizes) {
  order.slice(0, 2).forEach((id, i) => {
    const p = P(id);
    p.advantages.push(prizes[i].id);
    if (!p.human) botTakesAdvantage(id, prizes[i].id);
  });
}
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
  const S = newSeason({ ...settings, look: { ...settings.look }, job: pick(PLAYER_JOBS) });
  if (llmEnabled()) loadLLM();
  setPausable(true);
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
    const prizes = rollPrizes(final);

    // ----- immunity -----
    let res;
    if (!S.humanOut) {
      setScene('day');
      sfx('boom');
      await banner({ title: `DAY ${S.day}`, sub: final ? 'Final four. One last necklace.' : pick(['The tide is turning.', 'Hunger is setting in.', 'Rain all night. Tempers are short.', 'Somebody is lying. Nobody knows who.']), tone: 'sunset', hold: 2400 });
      res = await runChallenge({ ch, players: alive(), diff: S.settings.difficulty, final, prizes });
    } else {
      res = simulateChallenge(ch, alive(), S.settings.difficulty);
    }
    const w = P(res.winner);
    w.immune = true;
    w.stats.wins++;
    S.threat[w.id] += 0.2;
    S.lastWinner = w.id;
    awardPrizes(res.order, prizes);
    computePlans();
    if (S.humanOut && !fast) {
      setScene('day');
      const second = P(res.order[1]);
      await banner({ title: `${w.name} wins immunity`, sub: `Day ${S.day} · ${ch.name}${final ? ' · Final immunity' : ''}<br>${prizes[0].icon} ${w.name} also wins ${prizes[0].name}. ${prizes[1].icon} ${second.name} takes 2nd: ${prizes[1].name}.`, icon: avatarSVG(w.look, { size: 120, expr: 'happy', necklace: true }), tone: 'gold', tap: true });
    }

    // ----- camp -----
    if (!S.humanOut) await runCamp();
    else {
      const sim = simulateCamp();
      if (!fast) await juryLounge(sim);
    }

    // ----- tribal -----
    const out = fast ? simulateTribal().out : await runTribal({ juror: S.humanOut });
    if (out === 0) fast = await humanVotedOut();
  }

  if (fast) await recap();
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
    h('div', { class: 'display fire' }, `${S.players.length} Strangers. 1 Champion.`),
    h('div', { class: 'cast-grid' }, ...S.players.map((p, i) => {
      const a = p.arch ? ARCHETYPES[p.arch] : null;
      return h('div', { class: `cast-card ${p.human ? 'me' : ''}`, style: { animationDelay: `${i * 70}ms` } },
        h('div', { class: 'chip-face', style: { width: '66px', height: '66px' }, html: avatarSVG(p.look, { size: 66, expr: p.human ? 'happy' : pick(['neutral', 'smug', 'neutral']) }) }),
        h('div', { class: 'cc-name' }, p.human ? `${p.name} (you)` : p.name),
        h('div', { class: 'cc-job' }, p.job),
        a ? h('div', { class: 'cc-arch' }, `${a.emoji} ${a.label}`) : h('div', { class: 'cc-arch' }, '⭐ That’s you'));
    })),
    h('p', { class: 'muted center' }, 'Everyone voted out joins the jury. At the end, the jury crowns the Island Champion.'),
    h('button', { class: 'btn btn-big', onclick: () => { sfx('click'); go(); } }, 'Let the game begin'))));
}

async function juryLounge(sim) {
  setScene('camp');
  setMusic('camp', 'beach');
  await new Promise((go) => show(h('div', { class: 'screen lounge' },
    h('div', { class: 'eyebrow' }, `DAY ${game.S.day} · JURY LOUNGE`),
    h('div', { class: 'display sm' }, 'You see everything now'),
    h('p', { class: 'muted center' }, 'As a juror you can read every camp conversation.'),
    h('div', { class: 'panel lounge-log' },
      ...sim.msgs.map((m) => h('div', { class: 'spy-msg' }, h('span', { class: 'mini', html: avatarSVG(P(m.from).look, { size: 24 }) }), h('b', {}, nm(m.from)), ' → ', h('b', {}, nm(m.to)), h('div', {}, `“${m.text}”`))),
      sim.finder ? h('div', { class: 'spy-msg gold' }, `🗿 ${sim.finder.name} found a hidden immunity idol!`) : null),
    h('button', { class: 'btn', onclick: () => { sfx('click'); go(); } }, 'Off to Tribal Council'))));
}

async function humanVotedOut() {
  const S = game.S, me = human();
  setMusic(null);
  return new Promise((resolve) => show(h('div', { class: 'screen out' },
    h('div', { class: 'out-face' }, h('div', { class: 'chip-face', style: { width: '140px', height: '140px', filter: 'grayscale(.6)' }, html: avatarSVG(me.look, { size: 140, expr: 'sad' }) })),
    h('div', { class: 'display fire' }, 'The island has spoken.'),
    h('p', { class: 'center' }, `You finished ${ordinal(me.placement)} out of ${S.players.length}.`),
    h('div', { class: 'stats' },
      stat('📿', 'Immunity wins', me.stats.wins), stat('🗳️', 'Votes against you', me.stats.votesAgainst),
      stat('🗿', 'Idols found', me.stats.idolsFound), stat('🎯', 'Correct votes', me.stats.correctVotes)),
    h('p', { class: 'muted center' }, 'It’s not over. You’re on the jury and you’ll help pick the winner.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-big', onclick: () => { sfx('click'); resolve(false); } }, 'Watch from the Jury'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); resolve(true); } }, 'Skip to the Finale')))));
}

async function recap() {
  const S = game.S;
  setScene('camp');
  await new Promise((go) => show(h('div', { class: 'screen lounge' },
    h('div', { class: 'display sm' }, 'Previously on Island Council'),
    h('div', { class: 'panel lounge-log' }, ...S.voteHistory.map((v) => {
      const n = Object.values(v.votes).filter((t) => t === v.out).length;
      return h('div', { class: 'spy-msg' }, h('span', { class: 'mini', html: avatarSVG(P(v.out).look, { size: 24, expr: 'sad' }) }), `Day ${v.day}: `, h('b', {}, nm(v.out)), ` voted out (${n} vote${n === 1 ? '' : 's'})`);
    })),
    h('p', { class: 'center' }, `Final three: ${alive().map((p) => p.name).join(', ')}`),
    h('button', { class: 'btn', onclick: () => { sfx('click'); go(); } }, 'To Final Tribal Council'))));
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const stat = (ic, lab, v) => h('div', { class: 'stat' }, h('span', { class: 'st-ic' }, ic), h('span', { class: 'st-l' }, lab), h('b', {}, String(v)));

function endScreen(winnerId) {
  const S = game.S, me = human();
  setPausable(false);
  setScene('day');
  setMusic('title', 'beach');
  const ranked = S.players.slice().sort((a, b) => (a.placement || 99) - (b.placement || 99));
  const won = winnerId === 0;
  show(h('div', { class: 'screen end' },
    h('div', { class: 'eyebrow' }, 'SEASON COMPLETE'),
    h('div', { class: 'end-hero' }, h('div', { class: 'crown' }, '👑'), h('div', { class: 'chip-face', style: { width: '120px', height: '120px', borderColor: 'var(--gold)' }, html: avatarSVG(P(winnerId).look, { size: 120, expr: 'happy' }) })),
    h('div', { class: 'display fire' }, won ? 'You won the season!' : `${nm(winnerId)} wins!`),
    h('div', { class: 'stats' },
      stat('🏅', 'Your finish', ordinal(me.placement || 1)), stat('📿', 'Immunity wins', me.stats.wins),
      stat('🗿', 'Idols found', me.stats.idolsFound), stat('🛡️', 'Idol saves', me.stats.idolSaves),
      stat('🎯', 'Correct votes', me.stats.correctVotes), stat('🐍', 'Broken promises', me.stats.betrayals)),
    h('div', { class: 'panel standings' }, h('div', { class: 'feed-title' }, 'FINAL STANDINGS'),
      ...ranked.map((p) => h('div', { class: `stand-row ${p.human ? 'me' : ''}` },
        h('span', { class: 'sr-place' }, ordinal(p.placement || 1)),
        h('span', { class: 'mini', html: avatarSVG(p.look, { size: 30, expr: p.placement === 1 ? 'happy' : 'neutral' }) }),
        h('span', { class: 'sr-name' }, p.human ? `${p.name} (you)` : p.name),
        h('span', { class: 'sr-info' }, `📿${p.stats.wins} · 🗳️${p.stats.votesAgainst}`)))),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-big', onclick: () => { sfx('click'); playSeason(); } }, 'Play another season'),
      h('button', { class: 'btn btn-ghost', onclick: () => { sfx('click'); titleScreen(); } }, 'Main menu')),
  ));
}

titleScreen();

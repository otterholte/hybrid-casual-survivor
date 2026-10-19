// Final Tribal Council: the jury questions the finalists and crowns a champion.
import { game, P, nm, alive, human } from './state.js';
import { juryScore, ftcEffect, FTC_ANSWERS, JURY_QUESTIONS } from './ai.js';
import { h, sleep, pick, rand, shuffle } from './util.js';
import { show, banner, setScene, setMusic, avatarChip, tapOrWait } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';
import { HOST } from './tribal.js';

const BOT_ANSWERS = {
  strategic: ['I made the big moves. Every blindside had my fingerprints on it.', 'I played the numbers every single vote, and I was right.'],
  loyal: ['I told people where I stood whenever I could.', 'Was I perfect? No. But I never lied just to lie.'],
  social: ['I built real relationships. That’s why I’m sitting here.', 'People talked to me because they trusted me.'],
};
const readMs = (text) => 2400 + text.length * 38;

export async function finalTribal() {
  const S = game.S, me = human();
  const finalists = alive().map((p) => p.id);
  const jurors = S.jury.slice();
  setScene('night');
  setMusic('tribal', 'night');
  sfx('boom');
  await banner({ title: 'Final Tribal Council', sub: `Day ${S.day + 3} · ${jurors.length} jurors will decide who wins`, icon: '<div class="torch-icon">🔥</div>', tone: 'night', hold: 3200 });

  const stage = h('div', { class: 'stage' });
  const controls = h('div', { class: 'tc-controls' });
  const seats = h('div', { class: 'seats' }, ...finalists.map((f) => h('div', { class: 'seat', 'data-id': f }, h('div', { class: 'torch' }, h('div', { class: 'flame' }), h('div', { class: 'stick' })), avatarChip(P(f), { size: 64 }))));
  const scr = h('div', { class: 'screen tribal ftc' },
    h('div', { class: 'jury big' }, h('div', { class: 'jury-lab' }, 'THE JURY'), ...jurors.map((j) => h('div', { class: `jury-face ${P(j).human ? 'me' : ''}`, title: nm(j), html: avatarSVG(P(j).look, { size: 38 }) }))),
    seats, h('div', { class: 'firepit' }, h('div', { class: 'fire' }, h('i'), h('i'), h('i'))), stage, controls);
  show(scr);

  const spotlight = (id) => {
    seats.classList.toggle('dim', id != null);
    for (const el of seats.children) el.classList.toggle('spot', +el.dataset.id === id);
  };
  const card = (who, text, label) => {
    const face = who == null ? avatarSVG(HOST.look, { size: 46 }) : avatarSVG(P(who).look, { size: 46 });
    stage.replaceChildren(h('div', { class: 'host-card' }, h('div', { class: 'host-face', html: face }),
      h('div', { class: 'host-q' }, h('div', { class: 'who' }, label || (who == null ? HOST.name.toUpperCase() : `JUROR ${P(who).name.toUpperCase()}`)), h('div', { class: 'q' }, text))));
  };
  const answer = (id, text) => {
    const p = P(id);
    stage.append(h('div', { class: `answer ${p.human ? 'me' : ''}` },
      h('div', { class: 'a-face', html: avatarSVG(p.look, { size: 40 }) }),
      h('div', { class: 'a-body' }, h('div', { class: 'a-name' }, p.human ? `${p.name} (you)` : p.name), h('div', { class: 'a-text' }, text))));
  };
  const beat = async (ms) => { controls.replaceChildren(h('div', { class: 'tap-hint' }, 'TAP TO CONTINUE')); await tapOrWait(scr, ms); controls.replaceChildren(); };

  const bonus = {};
  for (const f of finalists) bonus[f] = {};
  const addBonus = (f, b, mult = 1, onlyJ = null) => {
    for (const [j, v] of Object.entries(b)) if (onlyJ == null || +j === onlyJ) bonus[f][j] = (bonus[f][j] || 0) + v * mult;
  };
  const choose = () => new Promise((resolve) => {
    controls.replaceChildren(h('div', { class: 'choices' }, h('div', { class: 'ch-q' }, 'YOUR ANSWER'),
      ...FTC_ANSWERS.map((a) => h('button', { class: 'choice', onclick: () => { sfx('click'); resolve(a); } }, a.label))));
  });
  const spoken = (a) => a.label.split(': ')[1].replace(/"/g, '');

  card(null, 'Finalists, this is your last chance to make your case. Let’s start with opening statements.');
  sfx('question');
  await beat(4000);
  for (const f of finalists) {
    spotlight(f);
    card(null, `${nm(f)}, your opening statement.`);
    await sleep(1200);
    if (P(f).human) {
      const a = await choose();
      controls.replaceChildren();
      answer(0, spoken(a));
      addBonus(0, ftcEffect(a.id), 0.6);
      await beat(3000);
    } else {
      const tone = pick(['strategic', 'loyal', 'social']);
      const text = pick(BOT_ANSWERS[tone]);
      answer(f, text);
      for (const j of jurors) bonus[f][j] = (bonus[f][j] || 0) + (P(j).t[tone] - 0.45) * 0.3;
      await beat(readMs(text));
    }
  }

  const askers = shuffle(jurors.filter((j) => !P(j).human)).slice(0, 3);
  for (const j of askers) {
    const q = pick(JURY_QUESTIONS);
    const target = me.alive && Math.random() < 0.6 ? 0 : pick(finalists);
    spotlight(target);
    card(j, `${nm(target)}: ${q.q}`);
    sfx('question');
    await sleep(1800);
    if (P(target).human) {
      const a = await choose();
      controls.replaceChildren();
      answer(0, spoken(a));
      const b = ftcEffect(a.id);
      addBonus(0, b, 0.5);
      addBonus(0, b, 1.5, j);
      await sleep(1600);
      const reply = (b[j] || 0) > 0.05 ? pick(['...Okay. I respect that.', 'That’s what I needed to hear.']) : pick(['Hm. Not convinced.', 'We’ll see.']);
      answer(j, reply);
      await beat(readMs(reply));
    } else {
      const text = pick(BOT_ANSWERS[q.tone]);
      answer(target, text);
      bonus[target][j] = (bonus[target][j] || 0) + rand(-0.15, 0.25);
      await beat(readMs(text));
    }
  }
  spotlight(null);

  // Votes.
  card(null, 'Jurors, it is time to vote for the winner.');
  sfx('boom');
  await sleep(2400);
  const votes = [];
  for (const j of jurors) {
    if (P(j).human) votes.push(await humanJuryVote(finalists, controls));
    else {
      const sc = finalists.map((f) => juryScore(j, f, bonus[f][j] || 0) + rand(0, 0.35));
      votes.push(finalists[sc.indexOf(Math.max(...sc))]);
    }
  }
  controls.replaceChildren();
  card(null, 'I’ll read the votes. When I reach a majority, I’ll stop.');
  setMusic('tension');
  await sleep(3200);

  const need = Math.floor(jurors.length / 2) + 1;
  const counts = {};
  const order = shuffle(votes);
  const countEl = h('div', { class: 'rb-count' });
  const pips = h('div', { class: 'pips' }, ...order.map(() => h('span', { class: 'pip' })));
  const paperBox = h('div', { class: 'rb-card' }, h('div', { class: 'rb-paper hidden-name' }));
  const cols = {};
  const tallyEl = h('div', { class: 'rb-tally' }, ...finalists.map((f) => {
    const num = h('div', { class: 'rb-num' }, '0');
    const col = h('div', { class: `rb-col ${f === 0 ? 'me' : ''}` }, h('div', { class: 'chip-face', style: { width: '48px', height: '48px' }, html: avatarSVG(P(f).look, { size: 48 }) }), h('div', { class: 'rb-name' }, P(f).name), num);
    cols[f] = { col, num };
    return col;
  }));
  const hostMini = h('div', { class: 'host-mini' }, `${need} votes to win`);
  stage.replaceChildren(h('div', { class: 'reading-board' }, h('div', { class: 'rb-status' }, countEl, pips), paperBox, tallyEl, hostMini));
  const paintCount = (n) => countEl.replaceChildren('VOTES READ ', h('b', {}, String(n)), ` OF ${order.length}`);
  paintCount(0);

  let winner = null;
  for (let i = 0; i < order.length; i++) {
    const v = order[i];
    const decisive = (counts[v] || 0) + 1 >= need;
    hostMini.textContent = decisive ? 'The winner of Island Council is...' : 'Next vote...';
    sfx(decisive ? 'drumroll' : 'swell');
    await sleep(decisive ? 2400 : 1100);
    counts[v] = (counts[v] || 0) + 1;
    paperBox.replaceChildren(h('div', { class: 'rb-paper in' }, h('div', { class: 'scrawl' }, P(v).name)));
    sfx('reveal');
    pips.children[i].classList.add('read');
    paintCount(i + 1);
    cols[v].num.textContent = String(counts[v]);
    cols[v].col.classList.remove('bump'); void cols[v].col.offsetWidth; cols[v].col.classList.add('bump');
    const maxN = Math.max(...Object.values(counts));
    for (const [id, cc] of Object.entries(cols)) cc.col.classList.toggle('leader', (counts[id] || 0) === maxN);
    if (decisive) { winner = v; hostMini.textContent = `${P(v).name}.`; await sleep(1800); break; }
    hostMini.textContent = `${P(v).name}.`;
    await tapOrWait(scr, 2600);
  }
  if (winner == null) {
    const max = Math.max(...Object.values(counts));
    const top = Object.keys(counts).filter((k) => counts[k] === max).map(Number);
    winner = top.sort((a, b) => P(b).stats.wins - P(a).stats.wins || Math.random() - 0.5)[0];
    hostMini.textContent = top.length > 1 ? `A tie. The tiebreaker goes to the finalist with the most immunity wins: ${nm(winner)}.` : `${nm(winner)} has the most votes.`;
    await sleep(3200);
  }
  setMusic(null);
  sfx('win');
  confetti();
  await banner({
    title: P(winner).human ? 'You are the Island Champion' : `${P(winner).name} is the Island Champion`,
    sub: `${counts[winner] || 0} jury vote${counts[winner] === 1 ? '' : 's'}`,
    icon: `<div class="crown">👑</div>${avatarSVG(P(winner).look, { size: 130, expr: 'happy' })}`,
    tone: 'gold', tap: true,
  });
  for (const f of finalists) P(f).placement = f === winner ? 1 : 2;
  return { winner, votes };
}

function humanJuryVote(finalists, controls) {
  return new Promise((resolve) => {
    controls.replaceChildren(h('div', { class: 'choices' }, h('div', { class: 'ch-q' }, 'YOU ARE ON THE JURY. WHO SHOULD WIN?'),
      h('div', { class: 'vote-grid' }, ...finalists.map((f) => h('button', { class: 'vote-card', onclick: () => { sfx('cast'); resolve(f); } }, avatarChip(P(f), { size: 64 }))))));
  });
}

export function confetti() {
  const layer = document.getElementById('overlay');
  const colors = ['#ff7a1a', '#e9b949', '#ffe08a', '#c8373a', '#2fb39b', '#f2e8da'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.animationDuration = `${2.4 + Math.random() * 1.6}s`;
    layer.append(c);
    setTimeout(() => c.remove(), 5000);
  }
}

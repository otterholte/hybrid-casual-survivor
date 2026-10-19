// Final Tribal Council: the jury questions the finalists and crowns a champion.
import { game, P, nm, alive, human } from './state.js';
import { juryScore, ftcEffect, FTC_ANSWERS, JURY_QUESTIONS } from './ai.js';
import { h, sleep, pick, rand, shuffle } from './util.js';
import { show, banner, setScene, setMusic, avatarChip } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';
import { HOST } from './tribal.js';

const BOT_ANSWERS = {
  strategic: ['I made the big moves. Every blindside had my fingerprints on it.', 'I played the numbers every single vote.'],
  loyal: ['I told people where I stood whenever I could.', 'Was I perfect? No. But I never lied for fun.'],
  social: ['I built real relationships. That’s why I’m sitting here.', 'People talked to me because they trusted me.'],
};

export async function finalTribal() {
  const S = game.S, me = human();
  const finalists = alive().map((p) => p.id);
  const jurors = S.jury.slice();
  setScene('night');
  setMusic('tribal', 'night');
  sfx('boom');
  await banner({ title: 'FINAL TRIBAL COUNCIL', sub: `Day ${S.day + 2} · ${jurors.length} jurors will decide`, icon: '<div class="torch-icon">🔥🔥🔥</div>', tone: 'night', hold: 2600 });

  const hostLine = h('div', { class: 'host-line' });
  const log = h('div', { class: 'tc-log tall' });
  const controls = h('div', { class: 'tc-controls' });
  const scr = h('div', { class: 'screen tribal ftc' },
    h('div', { class: 'tc-top' }, h('div', { class: 'host' }, h('div', { class: 'host-face', html: avatarSVG(HOST.look, { size: 54 }) }), hostLine)),
    h('div', { class: 'jury big' }, h('div', { class: 'jury-lab' }, 'THE JURY'), ...jurors.map((j) => h('div', { class: `jury-face ${P(j).human ? 'me' : ''}`, title: nm(j), html: avatarSVG(P(j).look, { size: 40 }) }))),
    h('div', { class: 'seats finalists' }, ...finalists.map((f) => h('div', { class: 'seat' }, h('div', { class: 'torch' }, h('div', { class: 'flame' }), h('div', { class: 'stick' })), avatarChip(P(f), { size: 64 })))),
    log, controls);
  show(scr);

  const say = (who, text, cls = '') => {
    const p = who == null ? null : P(who);
    log.append(h('div', { class: `tc-say ${cls} ${p?.human ? 'me' : ''}` },
      h('span', { class: 'tc-face', html: p ? avatarSVG(p.look, { size: 28 }) : avatarSVG(HOST.look, { size: 28 }) }),
      h('span', {}, h('b', {}, p ? p.name : HOST.name), ' ', text)));
    log.scrollTop = log.scrollHeight;
  };
  const host = (t) => { hostLine.textContent = t; say(null, t, 'host'); };

  const bonus = {}; // finalist -> juror -> bonus
  for (const f of finalists) bonus[f] = {};
  const addBonus = (f, b, mult = 1, onlyJ = null) => {
    for (const [j, v] of Object.entries(b)) if (onlyJ == null || +j === onlyJ) bonus[f][j] = (bonus[f][j] || 0) + v * mult;
  };

  const choose = (title) => new Promise((resolve) => {
    controls.replaceChildren(h('div', { class: 'say-title asked' }, title),
      h('div', { class: 'stack' }, ...FTC_ANSWERS.map((a) => h('button', { class: 'chip-btn wide', onclick: () => { sfx('send'); resolve(a); } }, a.label))));
  });

  host('Finalists, this is your last chance to make your case. Opening statements.');
  await sleep(1800);
  for (const f of finalists) {
    if (P(f).human) {
      const a = await choose('🎤 Your opening statement:');
      controls.replaceChildren();
      say(0, a.label.split(': ')[1].replace(/"/g, ''));
      addBonus(0, ftcEffect(a.id), 0.6);
    } else {
      const tone = pick(['strategic', 'loyal', 'social']);
      say(f, pick(BOT_ANSWERS[tone]));
      for (const j of jurors) bonus[f][j] = (bonus[f][j] || 0) + (P(j).t[tone === 'social' ? 'social' : tone === 'loyal' ? 'loyal' : 'strategic'] - 0.45) * 0.3;
    }
    await sleep(2200);
  }

  host('Jury, the floor is yours.');
  await sleep(1500);
  const askers = shuffle(jurors.filter((j) => !P(j).human)).slice(0, 3);
  for (const j of askers) {
    const q = pick(JURY_QUESTIONS);
    const target = me.alive && Math.random() < 0.6 ? 0 : pick(finalists);
    sfx('drum');
    say(j, `${nm(target)}: ${q.q}`);
    await sleep(1800);
    if (P(target).human) {
      const a = await choose(`🎤 ${nm(j)} is asking you:`);
      controls.replaceChildren();
      say(0, a.label.split(': ')[1].replace(/"/g, ''));
      const b = ftcEffect(a.id);
      addBonus(0, b, 0.5);
      addBonus(0, b, 1.5, j);
      await sleep(1200);
      say(j, (b[j] || 0) > 0.05 ? pick(['...Okay. I respect that.', 'That’s what I needed to hear.']) : pick(['Hm. Not convinced.', '*writes something down*']));
    } else {
      const tone = q.tone;
      say(target, pick(BOT_ANSWERS[tone]));
      bonus[target][j] = (bonus[target][j] || 0) + rand(-0.15, 0.25);
    }
    await sleep(2200);
  }

  // Votes.
  host('Jurors, it is time to vote for the winner.');
  await sleep(1400);
  const votes = [];
  for (const j of jurors) {
    if (P(j).human) {
      votes.push(await humanJuryVote(finalists, controls));
    } else {
      const sc = finalists.map((f) => juryScore(j, f, bonus[f][j] || 0) + rand(0, 0.35));
      votes.push(finalists[sc.indexOf(Math.max(...sc))]);
    }
  }
  controls.replaceChildren();
  host('I’ll read the votes. When I read the deciding vote, I’ll stop.');
  setMusic('tension');
  await sleep(2000);
  const need = Math.floor(jurors.length / 2) + 1;
  const counts = {};
  const card = h('div', { class: 'vote-card-big' });
  const tallyEl = h('div', { class: 'tally' });
  controls.replaceChildren(h('div', { class: 'reading' }, h('div', { class: 'urn' }, '🏺'), card, tallyEl));
  const order = shuffle(votes);
  // Hold a winning vote for last so the reveal lands.
  const outcome = (() => {
    const c = {};
    for (const v of votes) c[v] = (c[v] || 0) + 1;
    const max = Math.max(...Object.values(c));
    const top = Object.keys(c).filter((k) => c[k] === max).map(Number);
    if (top.length === 1) return top[0];
    return top.sort((a, b) => P(b).stats.wins - P(a).stats.wins || Math.random() - 0.5)[0];
  })();
  let winner = null;
  for (let i = 0; i < order.length; i++) {
    const v = order[i];
    card.className = 'vote-card-big';
    card.replaceChildren();
    void card.offsetWidth;
    card.classList.add('flip');
    sfx('paper');
    await sleep(800);
    counts[v] = (counts[v] || 0) + 1;
    const decisive = counts[v] >= need;
    if (decisive) { sfx('drumroll'); await sleep(1300); }
    card.replaceChildren(h('div', { class: 'scrawl' }, P(v).name));
    sfx('drum');
    host(decisive ? `${P(v).name}...` : `${P(v).name}.`);
    tallyEl.replaceChildren(...Object.entries(counts).map(([id, n]) => h('span', { class: `tally-pill ${+id === 0 ? 'me' : ''}` }, `${nm(+id)} · ${n}`)));
    if (decisive) { winner = v; break; }
    await sleep(1500);
  }
  if (winner == null) {
    winner = outcome;
    host(`Nobody has a majority. The tiebreaker goes to the finalist with the most immunity wins: ${nm(winner)}.`);
    await sleep(2500);
  }
  await sleep(800);
  setMusic(null);
  sfx('win');
  confetti();
  await banner({
    title: P(winner).human ? 'YOU ARE THE ISLAND CHAMPION!' : `${P(winner).name.toUpperCase()} IS THE ISLAND CHAMPION!`,
    sub: `${counts[winner] || 0} jury vote${counts[winner] === 1 ? '' : 's'}`,
    icon: `<div class="crown">👑</div>${avatarSVG(P(winner).look, { size: 130, expr: 'happy' })}`,
    tone: 'gold', tap: true,
  });
  for (const f of finalists) P(f).placement = f === winner ? 1 : 2;
  return { winner, votes };
}

function humanJuryVote(finalists, controls) {
  return new Promise((resolve) => {
    controls.replaceChildren(h('div', { class: 'say-title asked' }, '⚖️ You are on the jury. Who should win?'),
      h('div', { class: 'vote-grid' }, ...finalists.map((f) => h('button', { class: 'vote-card', onclick: () => { sfx('paper'); resolve(f); } }, avatarChip(P(f), { size: 64 })))));
  });
}

export function confetti() {
  const layer = document.getElementById('overlay');
  const colors = ['#ff6b35', '#f6c90e', '#1fb5c9', '#ef476f', '#7bc043', '#9b5de5'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.append(c);
    setTimeout(() => c.remove(), 4800);
  }
}

// Tribal Council: host-led questions, the secret vote, idols, and the vote reading.
import { game, P, nm, alive, aliveBots, human, pron } from './state.js';
import { candidates, botVote, botIdolChoice, buildQuestions, botAnswer, humanChoices, learnFromVote, computePlans, botBlockChoice, botUsesExtraVote, spendAdv } from './ai.js';
import { h, sleep, pick } from './util.js';
import { show, banner, setScene, setMusic, Timer, timerRing, avatarChip, modal, tapOrWait } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

export const HOST = { name: 'Kai', look: { gender: 'm', skin: 4, hair: 0, style: 1, face: 2, eyes: 3, eyeColor: 0, nose: 0, mouth: 0, facial: 1, shirt: 6 } };
const hostFace = (size = 50) => avatarSVG(HOST.look, { size });
const readMs = (text) => 2200 + text.length * 38;

// ------------------------------------------------------------------
// Pure vote logic (shared by the UI path and instant simulation)
// ------------------------------------------------------------------
function tally(votes, protectedIds) {
  const counts = {};
  for (const t of Object.values(votes)) if (!protectedIds.has(t)) counts[t] = (counts[t] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max).map(Number);
  return { counts, max, top };
}

function botIdols(lastChance) {
  const plays = [];
  if (alive().length < 4) return plays;
  for (const b of aliveBots()) {
    const f = botIdolChoice(b.id, lastChance);
    if (f != null) plays.push({ by: b.id, for: f });
  }
  return plays;
}

function finalize(outId, votes, plays, protectedIds) {
  const S = game.S;
  for (const p of plays) {
    P(p.by).idols--;
    P(p.by).stats.idolsPlayed++;
    if (Object.values(votes).some((t) => t === p.for)) P(p.by).stats.idolSaves++;
    S.idolSusp[p.by] = 0;
  }
  for (const t of Object.values(votes)) P(t).stats.votesAgainst++;
  S.voteHistory.push({ day: S.day, votes: { ...votes }, out: outId, protected: [...protectedIds] });
  learnFromVote(votes, outId);
  const out = P(outId);
  out.alive = false;
  out.immune = false;
  out.outDay = S.day;
  out.placement = alive().length + 1;
  out.idols = 0;
  out.juror = true;
  S.jury.push(outId);
  if (out.human) S.humanOut = true;
  computePlans();
}

/** Instant resolution for fast-forwarded rounds. */
export function simulateTribal() {
  const lastChance = alive().length === 4;
  const blocked = new Set();
  for (const b of aliveBots()) { const t = botBlockChoice(b.id); if (t != null) blocked.add(t); }
  const votes = {};
  for (const b of aliveBots()) {
    if (blocked.has(b.id)) continue;
    votes[b.id] = botVote(b.id, candidates(b.id));
    if (botUsesExtraVote(b.id)) votes[`x${b.id}`] = votes[b.id];
  }
  const plays = botIdols(lastChance);
  const prot = new Set(plays.map((p) => p.for));
  let { top } = tally(votes, prot);
  if (!top.length) top = candidates(-1).filter((c) => !prot.has(c));
  if (top.length > 1) {
    const re = {};
    for (const b of aliveBots()) if (!top.includes(b.id)) re[b.id] = botVote(b.id, top);
    const r = tally(re, new Set());
    top = r.top.length ? r.top : top;
  }
  const out = top.length === 1 ? top[0] : pick(top);
  finalize(out, votes, plays, prot);
  return { out, votes };
}

// ------------------------------------------------------------------
// UI
// ------------------------------------------------------------------
export async function runTribal({ juror = false } = {}) {
  const S = game.S;
  setScene('night');
  setMusic('tribal', 'night');
  const me = human();
  const meAlive = me.alive;
  sfx('boom');
  await banner({ title: 'Tribal Council', sub: `Day ${S.day + 2} · ${alive().length} castaways remain`, icon: '<div class="torch-icon">🔥</div>', tone: 'night', hold: 3000 });

  // ----- layout -----
  const seats = h('div', { class: 'seats' });
  const seatEls = {};
  for (const p of alive()) {
    const el = h('div', { class: `seat ${p.human ? 'me' : ''}` },
      h('div', { class: 'torch' }, h('div', { class: 'flame' }), h('div', { class: 'stick' })),
      avatarChip(p, { size: 52 }));
    seatEls[p.id] = el;
    seats.append(el);
  }
  const head = h('div', { class: 'tc-head' },
    S.jury.length ? h('div', { class: 'jury' }, h('div', { class: 'jury-lab' }, 'JURY'), ...S.jury.map((j) => h('div', { class: `jury-face ${P(j).human ? 'me' : ''}`, title: nm(j), html: avatarSVG(P(j).look, { size: 30 }) }))) : null);
  const stage = h('div', { class: 'stage' });
  const controls = h('div', { class: 'tc-controls' });
  const scr = h('div', { class: 'screen tribal' }, head, seats, h('div', { class: 'firepit' }, h('div', { class: 'fire' }, h('i'), h('i'), h('i'))), stage, controls);
  show(scr);

  const spotlight = (id) => {
    seats.classList.toggle('dim', id != null);
    for (const [k, el] of Object.entries(seatEls)) el.classList.toggle('spot', +k === id);
  };
  const hostCard = (text, label = `${HOST.name.toUpperCase()} · YOUR HOST`) => {
    stage.replaceChildren(h('div', { class: 'host-card' },
      h('div', { class: 'host-face', html: hostFace(46) }),
      h('div', { class: 'host-q' }, h('div', { class: 'who' }, label), h('div', { class: 'q' }, text))));
  };
  const answer = (id, text, cls = '') => {
    const p = P(id);
    const el = h('div', { class: `answer ${p.human ? 'me' : ''} ${cls}` },
      h('div', { class: 'a-face', html: avatarSVG(p.look, { size: 40, necklace: p.immune }) }),
      h('div', { class: 'a-body' }, h('div', { class: 'a-name' }, p.human ? `${p.name} (you)` : p.name), h('div', { class: 'a-text' }, text)));
    stage.append(el);
    return el;
  };
  const tapHint = () => controls.replaceChildren(h('div', { class: 'tap-hint' }, 'TAP TO CONTINUE'));
  const beat = async (ms) => { tapHint(); await tapOrWait(scr, ms); controls.replaceChildren(); };

  // ----- opening -----
  const imm = alive().find((p) => p.immune);
  hostCard(imm
    ? `Welcome to Tribal Council. ${imm.human ? 'You have' : `${imm.name} has`} individual immunity tonight. ${imm.human ? 'You' : pron(imm.id, 'subj').replace(/^./, (c) => c.toUpperCase())} cannot be voted out. Everyone else is vulnerable.`
    : 'Welcome to Tribal Council. Nobody is safe tonight.', `${HOST.name.toUpperCase()} · YOUR HOST`);
  if (imm) spotlight(imm.id);
  sfx('question');
  await beat(4200);
  spotlight(null);

  // ----- questions -----
  let skip = false;
  const qs = buildQuestions(alive().length >= 6 ? 4 : 3);
  for (const q of qs) {
    if (skip) break;
    spotlight(q.to);
    hostCard(q.text);
    sfx('question');
    if (juror) controls.replaceChildren(h('button', { class: 'btn btn-ghost sm', onclick: () => { skip = true; } }, 'Skip to the vote'));
    await sleep(1500);
    if (q.to === 0 && meAlive) {
      const reaction = await humanAnswer(q);
      if (reaction) { await sleep(1300); sfx('gasp'); answer(reaction.who, reaction.text, 'reaction'); await beat(readMs(reaction.text)); }
      else await sleep(900);
    } else {
      const a = botAnswer(q.to, q.type);
      answer(q.to, a.text);
      if (!juror) await beat(readMs(a.text)); else await sleep(readMs(a.text));
      if (a.reaction && !skip) {
        answer(a.reaction.who, a.reaction.text, 'reaction');
        sfx('gasp');
        if (!juror) await beat(readMs(a.reaction.text)); else await sleep(1800);
      }
    }
  }
  spotlight(null);

  async function humanAnswer(q) {
    const choices = humanChoices(q.type);
    let picking = false;
    const chosen = await new Promise((resolve) => {
      controls.replaceChildren(h('div', { class: 'choices' },
        h('div', { class: 'ch-q' }, 'YOUR ANSWER'),
        ...choices.map((c) => h('button', {
          class: 'choice', onclick: async () => {
            if (picking) return;
            let target = null;
            if (c.pick) {
              picking = true;
              target = await pickPlayer('Who?', alive().filter((p) => !p.human).map((p) => p.id));
              picking = false;
              if (target == null) return;
            }
            sfx('click');
            resolve({ c, target });
          },
        }, c.label.replace('{X}', '___')))));
    });
    controls.replaceChildren();
    const text = chosen.c.label.replace('{X}', chosen.target != null ? nm(chosen.target) : '');
    answer(0, text);
    const reaction = chosen.c.fx(chosen.target);
    await sleep(1600);
    return reaction;
  }

  // ----- the vote -----
  hostCard('It is time to vote.');
  sfx('boom');
  await sleep(2400);
  // ----- advantages before the vote -----
  const blocked = new Set();
  if (alive().some((p) => p.advantages.includes('voteBlock'))) {
    hostCard('Before we vote: does anyone have an advantage they want to play?');
    await sleep(2800);
    if (meAlive && me.advantages.includes('voteBlock')) {
      const t = await blockPrompt();
      if (t != null) { spendAdv(0, 'voteBlock'); blocked.add(t); await announceBlock(0, t); }
    }
    for (const b of aliveBots()) {
      const t = botBlockChoice(b.id);
      if (t != null && !blocked.has(t)) { blocked.add(t); await announceBlock(b.id, t); }
    }
    if (!blocked.size) { hostCard('Nobody? Okay.'); await sleep(1600); }
  }

  const votes = {};
  for (const b of aliveBots()) if (!blocked.has(b.id)) votes[b.id] = botVote(b.id, candidates(b.id));
  if (meAlive && !blocked.has(0)) {
    votes[0] = await humanVote(candidates(0), 'Cast your vote');
    if (me.advantages.includes('extraVote') && await extraPrompt()) {
      spendAdv(0, 'extraVote');
      votes.x0 = await humanVote(candidates(0), 'Your Extra Vote');
    }
  } else if (meAlive) {
    await banner({ title: 'You can\u2019t vote tonight', sub: 'Your vote was blocked.', icon: '🚫', tone: 'night', tap: true });
  }
  const extraBy = [];
  for (const b of aliveBots()) if (!blocked.has(b.id) && botUsesExtraVote(b.id)) { votes[`x${b.id}`] = botVote(b.id, candidates(b.id)); extraBy.push(b.id); }
  for (const b of aliveBots()) {
    if (blocked.has(b.id)) continue;
    spotlight(b.id);
    hostCard(`${b.name} goes to vote.`, 'THE VOTE');
    sfx('heartbeat');
    await sleep(850);
  }
  spotlight(null);
  for (const id of [...(votes.x0 != null ? [0] : []), ...extraBy]) {
    spotlight(id);
    answer(id, id === 0 ? 'I played my Extra Vote.' : 'I\u2019m playing an Extra Vote tonight.');
    sfx('reveal');
    await banner({ title: 'Extra Vote', sub: `${id === 0 ? 'You' : nm(id)} cast two votes tonight.`, icon: '🗳️', tone: 'gold', tap: true });
    spotlight(null);
  }

  // ----- idols -----
  const lastChance = alive().length === 4;
  hostCard('I’ll go tally the votes.');
  await sleep(2400);
  setMusic('tension');
  hostCard('If anybody has a hidden immunity idol and you want to play it, now would be the time to do so.');
  await sleep(3600);
  const plays = [];
  if (meAlive && me.idols > 0 && alive().length >= 4) {
    const target = await idolPrompt(lastChance);
    if (target != null) plays.push({ by: 0, for: target });
  }
  plays.push(...botIdols(lastChance));
  const prot = new Set(plays.map((p) => p.for));
  if (!plays.length) { hostCard('Okay. Once the votes are read, the decision is final.'); await sleep(3000); }
  for (const p of plays) {
    spotlight(p.by);
    sfx('gasp');
    answer(p.by, p.by === p.for ? 'I’d like to play this... for me.' : `I’m playing this for ${nm(p.for)}.`);
    await sleep(2200);
    sfx('swell');
    await sleep(900);
    sfx('reveal');
    await banner({
      title: 'This is a hidden immunity idol',
      sub: `Any votes cast against <b>${nm(p.for)}</b> will not count.`,
      icon: '<div class="idol-big">🗿</div>', tone: 'gold', tap: true,
    });
    seatEls[p.for]?.classList.add('protected');
    spotlight(null);
  }

  // ----- read the votes -----
  let result = await readVotes(votes, prot);
  if (result.none) {
    hostCard('Every vote cast was for a protected castaway. We will revote.');
    await sleep(3000);
    const pool = alive().filter((p) => !p.immune && !prot.has(p.id)).map((p) => p.id);
    const re = {};
    for (const b of aliveBots()) re[b.id] = botVote(b.id, pool.filter((x) => x !== b.id));
    if (meAlive) re[0] = await humanVote(pool.filter((x) => x !== 0), 'Revote');
    result = await readVotes(re, new Set());
  }
  if (result.tie) {
    hostCard(`We have a tie between ${result.tie.map(nm).join(' and ')}. We will revote. Only those not tied will vote.`);
    sfx('gasp');
    await sleep(3600);
    const re = {};
    for (const b of aliveBots()) if (!result.tie.includes(b.id)) re[b.id] = botVote(b.id, result.tie);
    if (meAlive && !result.tie.includes(0)) re[0] = await humanVote(result.tie, 'Revote: break the tie');
    const r2 = Object.keys(re).length ? await readVotes(re, new Set()) : { tie: result.tie };
    if (r2.tie) {
      hostCard('Still deadlocked. Fate will decide. The tied castaways will draw rocks.');
      sfx('drumroll');
      await sleep(3000);
      const out = pick(r2.tie);
      sfx('reveal');
      await banner({ title: `${nm(out)} drew the purple rock`, sub: 'Fate has spoken.', icon: '🪨', tone: 'night', tap: true });
      result = { out };
    } else result = r2;
  }

  const outId = result.out;
  finalize(outId, votes, plays, prot);
  await snuff(outId);
  return outId;

  // ---------- helpers ----------
  function humanVote(cands, title) {
    return new Promise((resolve) => {
      let sel = null;
      const secs = 30;
      const r = timerRing('sm');
      const confirm = h('button', { class: 'btn btn-red', disabled: true }, 'Cast my vote');
      const grid = h('div', { class: 'vote-grid' }, ...cands.map((id) => {
        const b = h('button', { class: 'vote-card' }, avatarChip(P(id), { size: 60 }));
        b.addEventListener('click', () => { sel = id; sfx('click'); [...grid.children].forEach((c) => c.classList.toggle('sel', c === b)); confirm.disabled = false; });
        return b;
      }));
      const box = h('div', { class: 'vote-booth' },
        h('div', { class: 'vb-head' }, h('div', { class: 'display sm' }, title), r),
        h('p', { class: 'muted' }, 'Your vote is secret. Nobody will know who wrote which name.'), grid, confirm);
      const wrap = h('div', { class: 'modal-wrap' }, h('div', { class: 'modal panel' }, box));
      document.getElementById('overlay').append(wrap);
      const t = new Timer(secs, { onTick: (l) => r.update(l, secs), onEnd: () => cast(sel ?? pick(cands)) }).start();
      confirm.addEventListener('click', () => cast(sel));
      let castDone = false;
      async function cast(id) {
        if (castDone || id == null) return;
        castDone = true;
        t.stop();
        box.replaceChildren(h('div', { class: 'parchment-write' }, h('div', { class: 'scrawl' }, P(id).name)), h('div', { class: 'muted center' }, 'You fold the parchment and drop it in the urn.'));
        sfx('scribble');
        await sleep(2600);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 250);
        resolve(id);
      }
    });
  }

  function blockPrompt() {
    const box = h('div', { class: 'idol-prompt' },
      h('div', { class: 'idol-big' }, '🚫'),
      h('div', { class: 'display sm' }, 'Play your Vote Blocker?'),
      h('p', { class: 'muted' }, 'Pick one castaway. They won\u2019t be able to vote tonight.'),
      h('div', { class: 'pick-grid' }, ...aliveBots().map((p) => h('button', { class: 'pick', onclick: () => { sfx('click'); box.close(p.id); } }, avatarChip(p, { size: 50 })))),
      h('button', { class: 'btn btn-dark', onclick: () => { sfx('click'); box.close(null); } }, 'Save it for later'));
    return modal(box, { dismissable: false });
  }

  async function announceBlock(by, target) {
    spotlight(by);
    answer(by, by === 0 ? `I\u2019m playing a Vote Blocker on ${nm(target)}.` : `I have a Vote Blocker. I\u2019m using it on ${target === 0 ? 'you' : nm(target)}.`);
    sfx('gasp');
    await sleep(1800);
    sfx('reveal');
    await banner({ title: 'Vote Blocker', sub: `${target === 0 ? 'You' : nm(target)} will not vote tonight.`, icon: '🚫', tone: 'night', tap: true });
    seatEls[target]?.classList.add('blocked');
    spotlight(null);
  }

  function extraPrompt() {
    const box = h('div', { class: 'idol-prompt' },
      h('div', { class: 'idol-big' }, '🗳️'),
      h('div', { class: 'display sm' }, 'Use your Extra Vote?'),
      h('p', { class: 'muted' }, alive().length === 4 ? 'This is the last Tribal where it can be used.' : 'You\u2019ll write a second name tonight.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-gold', onclick: () => { sfx('click'); box.close(true); } }, 'Cast a second vote'),
        h('button', { class: 'btn btn-dark', onclick: () => { sfx('click'); box.close(false); } }, 'Save it')));
    return modal(box, { dismissable: false });
  }

  function idolPrompt(isLastChance) {
    const box = h('div', { class: 'idol-prompt' },
      h('div', { class: 'idol-big' }, '🗿'),
      h('div', { class: 'display sm' }, 'Play your idol?'),
      h('p', { class: 'muted' }, isLastChance ? 'This is the LAST Tribal where idols can be played.' : 'Votes against the person you protect will not count.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-gold', onclick: () => { sfx('click'); box.close(0); } }, 'Play it for myself'),
        ...alive().filter((p) => !p.human && !p.immune).map((p) => h('button', { class: 'btn btn-ghost sm', onclick: () => { sfx('click'); box.close(p.id); } }, `Play it for ${p.name}`)),
        h('button', { class: 'btn btn-dark', onclick: () => { sfx('click'); box.close(null); } }, 'Keep it hidden')));
    return modal(box, { dismissable: false });
  }

  function pickPlayer(prompt, ids) {
    const box = h('div', { class: 'picker' },
      h('div', { class: 'section-title' }, prompt),
      h('div', { class: 'pick-grid' }, ...ids.map((id) => h('button', { class: 'pick', onclick: () => { sfx('click'); box.close(id); } }, avatarChip(P(id), { size: 52 })))));
    return modal(box);
  }

  async function readVotes(vts, prot2) {
    const list = Object.values(vts);
    const { counts, max, top } = tally(vts, prot2);
    if (!top.length || max === 0) { await showReading(list, prot2, null); return { none: true }; }
    if (top.length > 1) { await showReading(list, prot2, null); return { tie: top }; }
    await showReading(list, prot2, top[0], counts);
    return { out: top[0] };
  }

  async function showReading(list, prot2, out) {
    hostCard('I’ll read the votes.');
    await sleep(2200);
    // Round-robin from the biggest pile so the leader's votes come last.
    const groups = {};
    for (const t of list) (groups[t] = groups[t] || []).push(t);
    const order = Object.keys(groups).map(Number).sort((a, b) => groups[a].length - groups[b].length || (b === out ? -1 : 1));
    const seq = [];
    let more = true;
    while (more) {
      more = false;
      for (const k of order) if (groups[k].length) { seq.push(groups[k].pop()); more = true; }
    }

    const total = seq.length;
    const countEl = h('div', { class: 'rb-count' });
    const pips = h('div', { class: 'pips' }, ...seq.map(() => h('span', { class: 'pip' })));
    const card = h('div', { class: 'rb-card' }, h('div', { class: 'rb-paper hidden-name' }));
    const tallyEl = h('div', { class: 'rb-tally' });
    const hostMini = h('div', { class: 'host-mini' });
    stage.replaceChildren(h('div', { class: 'reading-board' }, h('div', { class: 'rb-status' }, countEl, pips), card, tallyEl, hostMini));
    controls.replaceChildren();
    const shown = {}, voided = {}, cols = {};
    const paintCount = (n) => countEl.replaceChildren('VOTES READ ', h('b', {}, String(n)), ` OF ${total}`);
    paintCount(0);
    const colFor = (id) => {
      if (cols[id]) return cols[id];
      const num = h('div', { class: 'rb-num' }, '0');
      const vd = h('div', { class: 'rb-void' });
      const col = h('div', { class: `rb-col ${id === 0 ? 'me' : ''}` },
        h('div', { class: 'chip-face', style: { width: '44px', height: '44px' }, html: avatarSVG(P(id).look, { size: 44 }) }),
        h('div', { class: 'rb-name' }, P(id).name), num, vd);
      cols[id] = { col, num, vd };
      tallyEl.append(col);
      return cols[id];
    };
    const ordinals = ['First vote', 'Second vote', 'Third vote', 'Fourth vote', 'Fifth vote', 'Sixth vote', 'Seventh vote', 'Eighth vote', 'Ninth vote'];

    for (let i = 0; i < seq.length; i++) {
      const t = seq[i];
      hostMini.textContent = i === seq.length - 1 && out != null ? 'Final vote...' : `${ordinals[i] || 'Next vote'}...`;
      sfx('swell');
      await sleep(1100);
      const paper = h('div', { class: 'rb-paper in' }, h('div', { class: 'scrawl' }, P(t).name));
      card.replaceChildren(paper);
      sfx('reveal');
      seatEls[t]?.classList.add('hit');
      setTimeout(() => seatEls[t]?.classList.remove('hit'), 900);
      pips.children[i].classList.add('read');
      paintCount(i + 1);
      const c = colFor(t);
      if (prot2.has(t)) {
        await sleep(900);
        paper.append(h('div', { class: 'stamp' }, 'DOES NOT COUNT'));
        sfx('void');
        voided[t] = (voided[t] || 0) + 1;
        c.vd.textContent = `${voided[t]} void`;
        pips.children[i].classList.add('void');
        hostMini.textContent = `${P(t).name}. Does not count.`;
      } else {
        shown[t] = (shown[t] || 0) + 1;
        c.num.textContent = String(shown[t]);
        c.col.classList.remove('bump');
        void c.col.offsetWidth;
        c.col.classList.add('bump');
        hostMini.textContent = `${P(t).name}.`;
        const maxN = Math.max(...Object.values(shown));
        for (const [id, cc] of Object.entries(cols)) cc.col.classList.toggle('leader', (shown[id] || 0) === maxN && maxN > 0);
      }
      if (out != null) {
        // Only call it once nobody could catch up, whatever the unread votes say.
        const unread = seq.length - (i + 1);
        const leader = shown[out] || 0;
        const bestRival = Math.max(0, ...Object.entries(shown).filter(([id]) => +id !== out).map(([, n]) => n));
        if (unread > 0 && leader > bestRival + unread) {
          await sleep(2200);
          hostMini.textContent = `That’s ${leader}. That’s enough.`;
          sfx('boom');
          await sleep(2600);
          return;
        }
      }
      await tapOrWait(scr, i >= seq.length - 2 ? 3000 : 2400);
    }
    await sleep(1400);
  }

  async function snuff(id) {
    const p = P(id);
    const seat = seatEls[id];
    setMusic('tribal');
    spotlight(id);
    hostCard(`${S.round === 1 ? 'The first' : 'The next'} person voted out of the game... ${p.name}.`);
    sfx('gasp');
    await sleep(3200);
    hostCard(`${p.name}, you need to bring me your torch.`);
    seat?.classList.add('walking');
    await sleep(3000);
    hostCard(`${p.name}, the island has spoken.`);
    seat?.classList.add('snuffed');
    sfx('snuff');
    await sleep(2400);
    hostCard('It’s time for you to go.');
    await sleep(1800);
    spotlight(null);
    if (!p.human) {
      const enemies = alive().filter((x) => S.voteHistory.at(-1).votes[x.id] === id);
      const bitter = enemies.length ? pick(enemies) : null;
      const words = bitter && S.trust[id][bitter.id] > 0.2
        ? `${bitter.name}... really? I trusted you. I’ll see you at the jury.`
        : pick(['I got blindsided. Respect. I’ll be watching from the jury.', 'Choose wisely. The jury remembers everything.', 'Didn’t see that coming. Well played.', 'I gave it everything. No regrets.']);
      await banner({ title: `${p.name}'s final words`, sub: `“${words}”`, icon: avatarSVG(p.look, { size: 110, expr: 'sad' }), tone: 'night', tap: true });
    } else {
      sfx('reveal');
      await banner({ title: 'The island has spoken', sub: 'Your torch has been snuffed.', icon: avatarSVG(p.look, { size: 110, expr: 'sad' }), tone: 'night', tap: true });
    }
  }
}

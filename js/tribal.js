// Tribal Council: discussion, secret vote, idols, and the vote reading.
import { game, P, nm, alive, aliveBots, human } from './state.js';
import { candidates, botVote, botIdolChoice, hostQuestion, botTribalLine, applyTribalLine, learnFromVote, computePlans } from './ai.js';
import { TRIBAL_LINES } from './data.js';
import { h, sleep, pick, rand, shuffle } from './util.js';
import { show, banner, setScene, setMusic, Timer, timerRing, avatarChip, modal, toast } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

export const HOST = { name: 'Kai', look: { skin: 3, hair: 5, style: 0, buff: 3 } };
const hostFace = (expr = 'neutral', size = 54) => avatarSVG(HOST.look, { size, expr });

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
  // Unplayed idols leave with you.
  out.idols = 0;
  out.juror = true;
  S.jury.push(outId);
  if (out.human) S.humanOut = true;
  computePlans();
}

/** Instant resolution for fast-forwarded rounds. */
export function simulateTribal() {
  const S = game.S;
  const lastChance = alive().length === 4;
  let votes = {};
  for (const b of aliveBots()) votes[b.id] = botVote(b.id, candidates(b.id));
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
export async function runTribal({ juror = false, second = false } = {}) {
  const S = game.S;
  setScene('night');
  setMusic('tribal', 'night');
  const me = human();
  const meAlive = me.alive;
  if (!second) {
    sfx('boom');
    await banner({ title: 'TRIBAL COUNCIL', sub: `Day ${S.day} · ${alive().length} castaways remain`, icon: '<div class="torch-icon">🔥</div>', tone: 'night', hold: 2300 });
  }

  // ----- council layout -----
  const hostLine = h('div', { class: 'host-line' });
  const seats = h('div', { class: 'seats' });
  const seatEls = {};
  for (const p of alive()) {
    const el = h('div', { class: `seat ${p.human ? 'me' : ''}` },
      h('div', { class: 'torch' }, h('div', { class: 'flame' }), h('div', { class: 'stick' })),
      avatarChip(p, { size: 50 }));
    seatEls[p.id] = el;
    seats.append(el);
  }
  const jury = S.jury.length ? h('div', { class: 'jury' }, h('div', { class: 'jury-lab' }, 'JURY'), ...S.jury.map((j) => h('div', { class: 'jury-face', title: nm(j), html: avatarSVG(P(j).look, { size: 30 }) }))) : null;
  const log = h('div', { class: 'tc-log' });
  const controls = h('div', { class: 'tc-controls' });
  const ring = timerRing('sm');
  const scr = h('div', { class: 'screen tribal' },
    h('div', { class: 'tc-top' },
      h('div', { class: 'host' }, h('div', { class: 'host-face', html: hostFace() }), hostLine),
      ring),
    jury, seats, h('div', { class: 'firepit' }, h('div', { class: 'fire' }, h('i'), h('i'), h('i'))),
    log, controls);
  show(scr);

  const say = (who, text, cls = '') => {
    const p = who == null ? null : P(who);
    const row = h('div', { class: `tc-say ${cls} ${p?.human ? 'me' : ''}` },
      h('span', { class: 'tc-face', html: p ? avatarSVG(p.look, { size: 28 }) : hostFace('neutral', 28) }),
      h('span', {}, h('b', {}, p ? p.name : HOST.name), ' ', text));
    log.append(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 30) log.firstChild.remove();
    if (p) { seatEls[p.id]?.classList.add('talking'); setTimeout(() => seatEls[p.id]?.classList.remove('talking'), 1600); }
  };
  const host = (text) => { hostLine.textContent = text; say(null, text, 'host'); };

  // ----- discussion -----
  if (!second) await discussion();
  else host('We are not done. Tonight, a second castaway will go home. No discussion. Grab a parchment.');

  async function discussion() {
    const secs = juror ? 30 : S.settings.pace === 'blitz' ? 60 : 90;
    let done = false, uses = 3, askedMe = false;
    host(pick(['Welcome to Tribal Council. Let’s get right to it.', 'Fire represents your life in this game. Let’s talk.', 'Another tribal, another torch about to go out. Let’s talk about camp.']));
    const timer = new Timer(secs, { onTick: (l) => ring.update(l, secs), onEnd: () => (done = true) }).start();

    const paintControls = () => {
      controls.replaceChildren();
      if (juror || !meAlive) {
        controls.append(h('div', { class: 'muted center' }, '🪑 You’re watching from the jury bench.'),
          h('button', { class: 'btn btn-orange', onclick: () => timer.end() }, 'Skip to the vote'));
        return;
      }
      controls.append(
        h('div', { class: `say-title ${askedMe ? 'asked' : ''}` }, askedMe ? `🎤 ${HOST.name} is asking YOU!` : `Speak up (${uses} left)`),
        h('div', { class: 'chips' }, ...TRIBAL_LINES.map((l) => h('button', {
          class: 'chip-btn', disabled: uses <= 0, onclick: async () => {
            let target = null;
            if (l.needs) {
              target = await pickPlayer(l.text.replace('{X}', '...'), alive().filter((p) => !p.human).map((p) => p.id));
              if (target == null) return;
            }
            uses--;
            askedMe = false;
            sfx('send');
            say(0, l.text.replace('{X}', target != null ? nm(target) : ''));
            const r = applyTribalLine(l.id, target);
            paintControls();
            if (r) { await sleep(1300); sfx('gasp'); say(r.who, r.text); }
          },
        }, l.text.replace('{X}', '___')))),
        h('button', { class: 'btn btn-orange', onclick: () => { sfx('click'); timer.end(); } }, "I'm ready to vote"),
      );
    };
    paintControls();

    let beat = 0;
    while (!done) {
      await sleep(juror ? 2600 : 3200);
      if (done) break;
      beat++;
      if (beat % 2 === 1) {
        const q = hostQuestion();
        host(q.text);
        if (q.to === 0 && meAlive && !juror) { askedMe = true; paintControls(); }
        else {
          await sleep(1800);
          if (done) break;
          const who = q.to != null && P(q.to).alive && !P(q.to).human ? q.to : pick(aliveBots()).id;
          say(who, botTribalLine(who));
        }
      } else {
        const b = pick(aliveBots());
        if (b) say(b.id, botTribalLine(b.id));
      }
    }
    timer.stop();
  }

  // ----- the vote -----
  controls.replaceChildren();
  ring.style.visibility = 'hidden';
  host('It is time to vote.');
  sfx('drum');
  await sleep(1200);
  const votes = {};
  for (const b of aliveBots()) votes[b.id] = botVote(b.id, candidates(b.id));
  if (meAlive) votes[0] = await humanVote(candidates(0), 'Who do you want to vote out?');
  else {
    controls.append(h('div', { class: 'muted center' }, 'The castaways go one by one to the voting booth...'));
    for (const b of aliveBots()) { seatEls[b.id].classList.add('voting'); sfx('paper'); await sleep(450); seatEls[b.id].classList.remove('voting'); }
  }

  // ----- idols -----
  controls.replaceChildren();
  const lastChance = alive().length === 4;
  host('I’ll go tally the votes.');
  sfx('paper');
  await sleep(1500);
  host('If anybody has a hidden immunity idol and you want to play it, now would be the time to do so.');
  setMusic('tension');
  await sleep(1800);
  const plays = [];
  if (meAlive && me.idols > 0 && alive().length >= 4) {
    const target = await idolPrompt(lastChance);
    if (target != null) plays.push({ by: 0, for: target });
  }
  plays.push(...botIdols(lastChance));
  const prot = new Set(plays.map((p) => p.for));
  if (!plays.length) { await sleep(1200); host('Okay. Once the votes are read, the decision is final.'); await sleep(1500); }
  for (const p of plays) {
    sfx('gasp');
    say(p.by, p.by === p.for ? 'I’d like to play this... for me.' : `I’m playing this for ${nm(p.for)}.`);
    await sleep(1200);
    sfx('drumroll');
    await banner({
      title: 'THIS IS A HIDDEN IMMUNITY IDOL',
      sub: `${nm(p.by)} played it for ${p.by === p.for ? 'themself' : nm(p.for)}. Any votes cast against <b>${nm(p.for)}</b> will not count.`,
      icon: '<div class="idol-big">🗿</div>', tone: 'gold', tap: true,
    });
    seatEls[p.for]?.classList.add('protected');
  }

  // ----- read the votes -----
  let result = await readVotes(votes, prot);
  if (result.none) {
    host('Every vote cast was for a protected castaway. We will revote.');
    await sleep(1600);
    const pool = alive().filter((p) => !p.immune && !prot.has(p.id)).map((p) => p.id);
    const re = {};
    for (const b of aliveBots()) re[b.id] = botVote(b.id, pool.filter((x) => x !== b.id));
    if (meAlive) re[0] = await humanVote(pool.filter((x) => x !== 0), 'Revote');
    result = await readVotes(re, new Set());
  }
  if (result.tie) {
    host(`We have a tie between ${result.tie.map(nm).join(' and ')}. We will revote. Only those not tied will vote.`);
    sfx('gasp');
    await sleep(2400);
    const re = {};
    for (const b of aliveBots()) if (!result.tie.includes(b.id)) re[b.id] = botVote(b.id, result.tie);
    if (meAlive && !result.tie.includes(0)) re[0] = await humanVote(result.tie, 'Revote: break the tie');
    const r2 = Object.keys(re).length ? await readVotes(re, new Set()) : { tie: result.tie };
    if (r2.tie) {
      host('Still deadlocked. Fate will decide: the tied castaways will draw rocks.');
      sfx('drumroll');
      await sleep(2000);
      const out = pick(r2.tie);
      await banner({ title: `${nm(out)} DREW THE PURPLE ROCK`, sub: 'Fate has spoken.', icon: '🪨', tone: 'night', tap: true });
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
        const b = h('button', { class: 'vote-card' }, avatarChip(P(id), { size: 58 }));
        b.addEventListener('click', () => { sel = id; sfx('click'); [...grid.children].forEach((c) => c.classList.toggle('sel', c === b)); confirm.disabled = false; });
        return b;
      }));
      const box = h('div', { class: 'vote-booth' },
        h('div', { class: 'vb-head' }, h('div', { class: 'display sm' }, title), r),
        h('p', { class: 'muted' }, 'Your vote is secret. Nobody sees who wrote which name.'), grid, confirm);
      const wrap = h('div', { class: 'modal-wrap booth' }, h('div', { class: 'modal card parchment' }, box));
      document.getElementById('overlay').append(wrap);
      const t = new Timer(secs, { onTick: (l) => r.update(l, secs), onEnd: () => cast(sel ?? pick(cands)) }).start();
      confirm.addEventListener('click', () => cast(sel));
      let castDone = false;
      async function cast(id) {
        if (castDone || id == null) return;
        castDone = true;
        t.stop();
        box.replaceChildren(h('div', { class: 'parchment-write' }, h('div', { class: 'scrawl' }, P(id).name)), h('div', { class: 'muted center' }, 'You fold the parchment and drop it in the urn.'));
        sfx('paper');
        await sleep(1700);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 250);
        resolve(id);
      }
    });
  }

  function idolPrompt(isLastChance) {
    const box = h('div', { class: 'idol-prompt' },
      h('div', { class: 'idol-big' }, '🗿'),
      h('div', { class: 'display sm' }, 'Play your idol?'),
      h('p', { class: 'muted' }, isLastChance ? 'This is the LAST tribal where idols can be played!' : 'Votes against the person you protect will not count.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-gold', onclick: () => { sfx('click'); box.close(0); } }, 'Play it for myself'),
        ...alive().filter((p) => !p.human && !p.immune).map((p) => h('button', { class: 'btn btn-ghost sm', onclick: () => { sfx('click'); box.close(p.id); } }, `Play it for ${p.name}`)),
        h('button', { class: 'btn btn-teal', onclick: () => { sfx('click'); box.close(null); } }, 'Keep it hidden')));
    return modal(box, { dismissable: false });
  }

  function pickPlayer(prompt, ids) {
    const box = h('div', { class: 'picker' },
      h('div', { class: 'section-title' }, prompt),
      h('div', { class: 'pick-grid' }, ...ids.map((id) => h('button', { class: 'pick', onclick: () => { sfx('click'); box.close(id); } }, avatarChip(P(id), { size: 50 })))));
    return modal(box);
  }

  async function readVotes(vts, prot2) {
    const list = Object.values(vts);
    const { counts, max, top } = tally(vts, prot2);
    if (!top.length || max === 0) {
      await showReading(list, prot2, null);
      return { none: true };
    }
    if (top.length > 1) {
      await showReading(list, prot2, null);
      return { tie: top };
    }
    const out = top[0];
    await showReading(list, prot2, out, counts);
    return { out };
  }

  async function showReading(list, prot2, out) {
    host('I’ll read the votes.');
    await sleep(1200);
    // Order: round-robin from the biggest pile so the leader is read last.
    const groups = {};
    for (const t of list) (groups[t] = groups[t] || []).push(t);
    const order = Object.keys(groups).map(Number).sort((a, b) => groups[a].length - groups[b].length || (b === out ? -1 : 1));
    const seq = [];
    let more = true;
    while (more) {
      more = false;
      for (const k of order) if (groups[k].length) { seq.push(groups[k].pop()); more = true; }
    }
    const urn = h('div', { class: 'urn' }, '🏺');
    const card = h('div', { class: 'vote-card-big' });
    const tallyEl = h('div', { class: 'tally' });
    const stage = h('div', { class: 'reading' }, urn, card, tallyEl);
    controls.replaceChildren(stage);
    const shown = {};
    const validLeft = (fromIdx) => seq.slice(fromIdx).filter((t) => !prot2.has(t));
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i];
      card.className = 'vote-card-big';
      card.replaceChildren();
      void card.offsetWidth;
      card.classList.add('flip');
      sfx('paper');
      await sleep(700);
      card.replaceChildren(h('div', { class: 'scrawl' }, P(t).name));
      seatEls[t]?.classList.add('hit');
      setTimeout(() => seatEls[t]?.classList.remove('hit'), 900);
      const nullified = prot2.has(t);
      if (nullified) {
        await sleep(700);
        card.append(h('div', { class: 'stamp' }, 'DOES NOT COUNT'));
        sfx('stamp');
      } else {
        shown[t] = (shown[t] || 0) + 1;
        sfx('drum');
      }
      const ordinal = ['First vote', 'Second vote', 'Third vote', 'Fourth vote', 'Fifth vote', 'Sixth vote', 'Seventh vote', 'Eighth vote', 'Ninth vote'][i] || 'Next vote';
      host(nullified ? `${P(t).name}. Does not count.` : `${ordinal}: ${P(t).name}.`);
      tallyEl.replaceChildren(...Object.entries(shown).sort((a, b) => b[1] - a[1]).map(([id, n]) => h('span', { class: `tally-pill ${+id === 0 ? 'me' : ''}` }, `${nm(+id)} · ${n}`)));
      // Stop when the outcome is locked.
      if (out != null) {
        const rest = validLeft(i + 1);
        const leader = shown[out] || 0;
        const rivals = Object.entries(shown).filter(([id]) => +id !== out).map(([, n]) => n);
        const bestRival = Math.max(0, ...rivals);
        if (leader > bestRival + rest.filter((x) => x !== out).length && rest.length) {
          await sleep(1500);
          host(`That's ${leader}. That's enough.`);
          sfx('boom');
          await sleep(1400);
          return;
        }
      }
      await sleep(i >= seq.length - 2 ? 2000 : 1300);
    }
    await sleep(600);
  }

  async function snuff(id) {
    const p = P(id);
    const seat = seatEls[id];
    if (S.voteHistory.length && P(id).human) setMusic(null);
    host(`${second ? 'The second person voted out' : `The ${S.round === 1 && !second ? 'first' : 'next'} person voted out`} of the game is... ${p.name}.`);
    sfx('gasp');
    await sleep(2200);
    host(`${p.name}, you need to bring me your torch.`);
    seat?.classList.add('walking');
    await sleep(1800);
    host(`${p.name}, the island has spoken.`);
    seat?.classList.add('snuffed');
    sfx('snuff');
    await sleep(1600);
    setMusic('tribal');
    if (!p.human) {
      const S2 = game.S;
      const enemies = alive().filter((x) => S2.voteHistory.at(-1).votes[x.id] === id);
      const bitter = enemies.length ? pick(enemies) : null;
      const words = bitter && S2.trust[id][bitter.id] > 0.2
        ? `${bitter.name}... really? I trusted you. I’ll see you at the jury.`
        : pick(['I came, I played, I got blindsided. Respect.', 'I’ll be watching from the jury. Choose wisely.', 'Didn’t see that coming. Well played, everyone.', 'I gave it everything. No regrets!']);
      await banner({ title: `${p.name}'s final words`, sub: `“${words}”`, icon: avatarSVG(p.look, { size: 110, expr: 'sad' }), tone: 'night', tap: true });
    }
  }
}

// The Vote Board: game logic behind the one-screen Strategy view.
// Ask castaways who they're voting for, tell them your vote (or pass on what someone said),
// judge what they told you, and see where the votes are. Everything feeds the same castaway
// minds as chat (mind.js), so bots remember, gossip and catch lies the same way.
import { game, P, nm, alive, aliveBots, adjTrust } from './state.js';
import { candidates, computePlans, rawScore } from './ai.js';
import { note, facts, thisRound, fresh, reasonsAgainst, recordHuman } from './mind.js';
import { pick, chance } from './util.js';

const S = () => game.S;
const H = 0;
const ASKS_PER_DAY = 3; // how many times each castaway will answer you before they get cagey

/** This round's board (what each castaway told you, how you judged it, what you told them). */
export function board() {
  const s = S();
  if (!s.board || s.board.round !== s.round) {
    s.board = { round: s.round, ppl: {}, me: { real: null }, cards: [], asks: {}, day: s.day };
  }
  if (s.board.day !== s.day) { s.board.day = s.day; s.board.asks = {}; }
  for (const b of aliveBots()) s.board.ppl[b.id] = s.board.ppl[b.id] || { claim: undefined, state: 'word', read: null, told: null, meant: true, spied: null };
  return s.board;
}
export const person = (id) => board().ppl[id];

const honestWith = (botId) => S().trust[botId][H] + P(botId).t.honesty * 0.5 > 0.45;

/**
 * What a castaway tells you its vote is, right now. Consistent with what it already told you
 * this round unless its plan honestly changed. Returns a player id, or null for "not sure yet".
 */
export function botClaim(botId) {
  const s = S(), b = P(botId), tr = s.trust[botId][H], plan = s.plan[botId];
  const honest = honestWith(botId);
  const told = s.botTold[botId];
  if (told != null && P(told).alive && !P(told).immune) {
    if (plan === told || !honest) return told;
    if (plan != null && plan !== H) { s.botTold[botId] = plan; return plan; }
  }
  if (plan == null) return null;
  if (plan === H) {
    if (b.t.honesty > 0.85 && tr > 0.3) return H;
    const decoy = candidates(botId, [H]).sort((x, y) => rawScore(botId, y) - rawScore(botId, x))[0] ?? null;
    if (decoy != null) s.botTold[botId] = decoy;
    return decoy;
  }
  if (honest) { s.botTold[botId] = plan; return plan; }
  if (chance(0.55)) {
    const lie = pick(candidates(botId, [H, plan]));
    if (lie != null) { s.botTold[botId] = lie; return lie; }
  }
  return null;
}

/** A short spoken version of a claim. */
function claimLine(botId, claim) {
  if (claim == null) return fresh(botId, ['Honestly? Not sure yet.', 'Still deciding.', 'I want to hear everyone first.']);
  if (claim === H) return '...It’s you. I’m sorry.';
  const why = reasonsAgainst(botId, claim)[0];
  return chance(0.45) && why.w > 0.3 ? `${nm(claim)}. ${why.text}` : fresh(botId, [`${nm(claim)}.`, `${nm(claim)}, probably.`, `Between us? ${nm(claim)}.`]);
}

/**
 * Ask one or more castaways who they're voting for.
 * together: they hear each other's answers (and remember them).
 * Returns { answers: [{id, text}], askBack: {id, text} | null }.
 */
export function ask(ids, together) {
  const s = S(), bd = board();
  const answers = [];
  for (const id of ids) {
    bd.asks[id] = (bd.asks[id] || 0) + 1;
    note(id, { src: H, kind: 'h_asked_ask_vote', about: H });
    if (bd.asks[id] > ASKS_PER_DAY) { answers.push({ id, text: fresh(id, ['You already asked me. Ask me tomorrow.', 'Same answer as before. People are watching us.']) }); continue; }
    const claim = botClaim(id);
    const p = bd.ppl[id];
    if (p.claim !== claim) { p.claim = claim; if (p.state === 'believe') p.state = 'word'; }
    answers.push({ id, text: claimLine(id, claim) });
  }
  if (together && ids.length > 1) {
    // Everyone in the huddle heard everyone else's answer.
    for (const a of ids) for (const b of ids) if (a !== b && bd.ppl[b].claim != null) note(a, { src: b, kind: 'b_pitch', about: b, target: bd.ppl[b].claim });
    computePlans();
  }
  // Someone who likes you asks you back.
  const asker = ids.find((id) => s.trust[id][H] > 0.15 && bd.ppl[id].told == null && bd.ppl[id].claim != null && bd.ppl[id].claim !== H);
  const askBack = asker != null ? { id: asker, text: `Are you on ${nm(bd.ppl[asker].claim)} too?` } : null;
  return { answers, askBack };
}

/** Tell castaways your vote. meant=false is a private bluff; they can't tell the difference. */
export function tellVote(ids, target, meant) {
  const s = S(), bd = board();
  if (meant) bd.me.real = target;
  const replies = [];
  for (const id of ids) {
    const p = bd.ppl[id];
    p.told = target;
    p.meant = meant;
    if (id === target) { adjTrust(id, H, -0.4); replies.push({ id, text: 'You’re voting for ME? Good to know.' }); continue; }
    recordHuman(id, 'h_vote', target);
    s.promises[id] = target;
    const plan = s.plan[id];
    if (plan === target) { adjTrust(id, H, 0.08); s.botTold[id] = target; s.influence[id][target] += 0.3; replies.push({ id, text: fresh(id, ['Good. Same page.', `Same. ${nm(target)} it is.`]) }); }
    else if (s.allied[id][target] || s.trust[id][target] > 0.45) { adjTrust(id, H, -0.08); replies.push({ id, text: `${nm(target)}? That’s my person. Noted.` }); }
    else {
      s.influence[id][target] += 0.25 + Math.max(0, s.trust[id][H]) * 0.6;
      computePlans();
      replies.push({ id, text: s.plan[id] === target ? fresh(id, [`You know what? I could do ${nm(target)}.`, `${nm(target)}. Okay, I’m in.`]) : fresh(id, [`${nm(target)}. Hm. I’m not there yet.`, `Interesting. I was leaning ${s.plan[id] != null && s.plan[id] !== H ? nm(s.plan[id]) : 'elsewhere'}.`]) });
    }
    // Their answer back updates what they've told you.
    const prev = p.claim, claim = botClaim(id);
    p.claim = claim;
    if (prev !== claim && p.state === 'believe') p.state = 'word';
  }
  computePlans();
  return replies;
}

/**
 * Pass something on.
 * src === H: "I told [toldWho] I'm voting for [toldVote], but I'm really on [real]" (a confession).
 * src = castaway: "[src] told me they're voting for [toldVote]".
 * meant=false means you made it up.
 */
export function passOn(ids, { src, toldWho = null, toldVote, real = null, meant }) {
  const s = S(), bd = board();
  const replies = [];
  for (const id of ids) {
    if (src === H) {
      // Letting them in on your bluff: they now believe your real vote.
      const vote = real ?? toldVote;
      bd.ppl[id].told = vote;
      bd.ppl[id].meant = meant;
      if (meant && real != null) bd.me.real = real;
      recordHuman(id, 'h_vote', vote);
      s.promises[id] = vote;
      adjTrust(id, H, 0.06);
      note(id, { src: H, kind: 'confided', about: toldWho, target: toldVote });
      if (vote !== id && !(s.allied[id][vote] || s.trust[id][vote] > 0.45)) s.influence[id][vote] += 0.2;
      replies.push({ id, text: id === toldWho ? 'Wait. You lied to ME? Wow.' : real != null ? fresh(id, [`Ha. Okay. I won’t tell ${toldWho != null ? nm(toldWho) : 'anyone'}.`, `Got it. ${nm(vote)} for real. Thanks for trusting me.`]) : 'Okay. Good to know.' });
      if (id === toldWho) adjTrust(id, H, -0.3);
    } else {
      note(id, { src, kind: 'b_pitch', about: src, target: toldVote, via: H });
      note(id, { src: H, kind: 'h_relay', about: src, target: toldVote, made: !meant });
      if (toldVote === id) {
        note(id, { src: H, kind: 'targeting_me', about: src });
        adjTrust(id, src, -0.2);
        s.influence[id][src] += 0.25;
        replies.push({ id, text: s.trust[id][src] > 0.45 ? `${nm(src)}? I don’t buy it.` : `${nm(src)} is coming for me? Thanks for telling me.` });
      } else if (s.plan[id] === toldVote) replies.push({ id, text: `Good. Then ${nm(src)} is with us.` });
      else replies.push({ id, text: fresh(id, [`Huh. ${nm(src)} on ${toldVote === H ? 'you' : nm(toldVote)}. Interesting.`, 'Good to know.']) });
    }
  }
  computePlans();
  return replies;
}

/** Spy: what someone has been telling people this round (their story, not their secret). */
export function spyStory(X) {
  const s = S(), bd = board();
  const groups = new Map();
  const add = (target, who) => { if (target == null) return; const g = groups.get(target) || []; if (!g.includes(who)) g.push(who); groups.set(target, g); };
  for (const b of alive()) {
    if (b.human || b.id === X) continue;
    const f = facts(b.id, (x) => thisRound(x) && x.src === X && x.kind === 'b_pitch' && !x.via).at(-1);
    if (f) add(f.target, b.id);
  }
  if (bd.ppl[X]?.claim != null) add(bd.ppl[X].claim, H);
  // Someone who hasn't told anyone yet still has a lean everybody around camp can feel.
  if (!groups.size && s.plan[X] != null) add(s.plan[X], null);
  const story = [...groups.entries()].map(([target, who]) => ({ target, who: who.filter((w) => w != null) })).sort((a, b) => b.who.length - a.who.length);
  const top = story[0];
  if (top) { bd.ppl[X].spied = { target: top.target, n: top.who.length }; bd.ppl[X].state = 'read'; bd.ppl[X].read = top.target; }
  return story;
}

/** Where you think the votes are: trusted/read marks count as sure, their word as maybe. */
export function tally() {
  const bd = board(), out = new Map();
  const add = (t, sure) => { if (t == null || t === '?') return; const e = out.get(t) || { sure: 0, maybe: 0 }; sure ? e.sure++ : e.maybe++; out.set(t, e); };
  for (const b of aliveBots()) {
    const p = bd.ppl[b.id];
    if (p.state === 'read') add(p.read, true);
    else if (p.claim != null) add(p.claim, p.state === 'believe');
  }
  if (bd.me.real != null) add(bd.me.real, true);
  return [...out.entries()].map(([id, e]) => ({ id, ...e, total: e.sure + e.maybe })).sort((a, b) => b.total - a.total);
}

/** Cycle a chip: their word → believe → my read (caller opens the picker) → their word. */
export function cycleChip(id) {
  const p = person(id);
  if (p.state === 'word') { p.state = 'believe'; return 'believe'; }
  if (p.state === 'believe') return 'pick';
  p.state = 'word'; p.read = null; p.spied = null;
  return 'word';
}
export function setRead(id, target) {
  const p = person(id);
  if (target === 'word') { p.state = 'word'; p.read = null; return; }
  p.state = 'read'; p.read = target;
}

/** A castaway pitch shown as a one-tap card. Recording the claim it contains. */
export function addCard(botId, op) {
  const bd = board();
  if (op.claim != null) { bd.ppl[botId].claim = op.claim; if (bd.ppl[botId].state === 'believe') bd.ppl[botId].state = 'word'; }
  bd.cards.push({ botId, text: op.text, options: op.options || [], claim: op.claim ?? null, day: S().day });
}

/** Did a reply say you're in on someone? Keep "what you told them" up to date. */
export function noteToldFromLabel(botId, label, meant = true) {
  const m = /^(?:i'm|i’m)\s+(?:in on|voting|still in on|with you on)\s+([a-z]+)/i.exec(label) || /^yes,\s+([a-z]+)\s+tonight/i.exec(label);
  if (!m) return;
  const t = alive().find((p) => p.name.toLowerCase() === m[1].toLowerCase());
  if (t) { const p = person(botId); p.told = t.id; p.meant = meant; if (meant) board().me.real = t.id; }
}

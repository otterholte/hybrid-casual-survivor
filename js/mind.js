// Castaway minds: what each bot remembers, has heard and believes, so every reply and pitch
// can draw on the whole season so far (not just the last message).
//
// - facts: things this bot was told or saw ({ r: round, day, src, kind, about, target })
// - asked: what this bot already raised with the human (key -> round), so it doesn't repeat itself
// - said: its recent lines, so it doesn't parrot the same sentence twice in a row
import { game, P, nm, alive, aliveBots, adjTrust } from './state.js';
import { pick, chance, clamp } from './util.js';

const S = () => game.S;
const H = 0;

export function mind(id) {
  const s = S();
  s.minds = s.minds || {};
  return (s.minds[id] = s.minds[id] || { facts: [], asked: {}, said: [] });
}

/** Remember something. Same kind/src/target within a round replaces the old one. */
export function note(id, f) {
  const m = mind(id), s = S();
  const fact = { r: s.round, day: s.day, ...f };
  m.facts = m.facts.filter((x) => !(x.r === fact.r && x.kind === fact.kind && x.src === fact.src && x.about === fact.about));
  m.facts.push(fact);
  if (m.facts.length > 80) m.facts.shift();
  return fact;
}

export const facts = (id, pred) => mind(id).facts.filter(pred);
export const thisRound = (f) => f.r === S().round;

/** Mark that the bot raised a topic with the human. `once` keys last the season, others a round. */
export const markAsked = (id, key) => { mind(id).asked[key] = S().round; };
export const wasAsked = (id, key, seasonLong = false) => {
  const r = mind(id).asked[key];
  return r != null && (seasonLong || r === S().round);
};

/** Pick a line this bot hasn't said recently. */
export function fresh(id, lines) {
  const m = mind(id);
  const strs = lines.filter((l) => typeof l === 'string');
  const unused = strs.filter((l) => !m.said.includes(l));
  const line = pick(unused.length ? unused : lines);
  if (typeof line === 'string') { m.said.push(line); if (m.said.length > 14) m.said.shift(); }
  return line;
}

// ------------------------------------------------------------------
// Public knowledge: things everyone at camp can see
// ------------------------------------------------------------------
/** How well-liked X is: average trust the other living bots have in them. */
export function likeability(X) {
  const others = aliveBots().filter((k) => k.id !== X);
  if (!others.length) return 0;
  return others.reduce((a, k) => a + S().trust[k.id][X], 0) / others.length;
}

/** The castaway X is closest to (mutual trust), if it's a real pair. */
export function partnerOf(X) {
  const s = S();
  let best = null, bv = 0.45;
  for (const p of alive()) {
    if (p.id === X) continue;
    const v = Math.min(s.trust[X][p.id], s.trust[p.id][X]);
    if (v > bv) { bv = v; best = p.id; }
  }
  return best;
}

/** Who wrote whose name at the most recent Tribal (votes are read out, so everyone knows). */
export function lastVotes() {
  const v = S().voteHistory.at(-1);
  if (!v) return null;
  const votes = {};
  for (const [k, t] of Object.entries(v.votes)) if (/^\d+$/.test(k)) votes[+k] = t;
  return { votes, out: v.out };
}

const wonText = (n) => (n === 1 ? 'an immunity' : `${n} immunities`);

/**
 * Why `botId` would want X gone, strongest first. Every reason is something the bot actually
 * knows: the vote board, challenge results, what it saw at camp, what people told it.
 */
export function reasonsAgainst(botId, X) {
  const s = S(), p = P(X), out = [];
  const add = (w, text) => out.push({ w, text });
  if (p.human) return reasonsAgainstYou(botId);
  const he = p.human ? 'you' : p.name;
  const lv = lastVotes();
  if (lv && lv.votes[X] === botId) add(1.1, `${p.name} wrote my name down last Tribal. I haven’t forgotten.`);
  else if (lv && lv.votes[X] != null && s.allied[botId][lv.votes[X]]) add(0.6, `${p.name} voted against ${nm(lv.votes[X])} last time. That’s one of mine.`);
  const heard = facts(botId, (f) => thisRound(f) && f.kind === 'targeting_me' && f.about === X)[0];
  if (heard) add(0.95, heard.src === H ? `You told me ${p.name} is coming for me. I believe you.` : `${nm(heard.src)} told me ${p.name} is gunning for me.`);
  if (facts(botId, (f) => f.kind === 'lied_to_me' && f.about === X).length) add(0.8, `${p.name} lied to my face. I can’t work with that.`);
  if (p.stats.wins >= 1) add(0.3 + p.stats.wins * 0.25, `${p.name} has won ${wonText(p.stats.wins)}. The next time ${pronoun(X)} loses, we have to take the shot.`);
  if (s.idolSusp[X] > 0.3) add(0.25 + s.idolSusp[X] * 0.6, `${p.name} keeps slipping off into the jungle. I’d bet ${pronoun(X)} has an idol, or is close to one.`);
  const like = likeability(X);
  if (like > 0.25) add(0.2 + like, `Everybody loves ${p.name}. Sit next to ${pronoun(X, 'obj')} at the end and you lose.`);
  const partner = partnerOf(X);
  if (partner != null && partner !== botId && partner !== H && !s.allied[botId][partner]) add(0.45, `${p.name} and ${nm(partner)} are joined at the hip. We have to break that up.`);
  const tribals = s.voteHistory.filter((v) => v.votes[X] != null).length;
  if (p.stats.correctVotes >= 2) add(0.2 + p.stats.correctVotes * 0.12, `${p.name} has been on the right side of ${p.stats.correctVotes >= tribals ? 'every vote' : `${p.stats.correctVotes} votes`}. ${cap(pronoun(X))}’s quietly running this.`);
  if (s.trust[botId][X] < -0.15) add(0.4 - s.trust[botId][X], `I just don’t trust ${he}. Something’s off.`);
  // Softer reads, from what anyone can see around camp.
  const piling = aliveBots().filter((k) => k.id !== botId && k.id !== X && s.plan[k.id] === X).length;
  if (piling >= 2) add(0.2 + piling * 0.05, `Half of camp is already saying ${p.name}’s name. I’d rather be on the right side of it.`);
  if (p.t.physical > 0.7) add(0.28, `${p.name} is a beast in challenges. Get ${pronoun(X, 'obj')} out before ${pronoun(X)} starts winning necklaces.`);
  if (p.t.strategic > 0.72) add(0.26, `${p.name} talks to everybody and never gives a straight answer. That’s someone running a game.`);
  if (p.t.social > 0.85) add(0.24, `${p.name} is way too easy to like. That’s a jury threat.`);
  if (s.trust[X][botId] < 0 || s.trust[botId][X] < 0.05) add(0.18, `I don’t know where ${p.name}’s head is at, and I can’t afford a question mark.`);
  if (!out.length) add(0.1, `It’s a numbers thing. If it’s not ${p.name}, it’s one of us.`);
  // Different people notice different things: a stable per-castaway lean between close reasons.
  for (const r of out) r.w += lean(botId, r.text);
  return out.sort((a, b) => b.w - a.w);
}

function lean(botId, text) {
  let h = botId * 2654435761;
  for (let i = 0; i < 24 && i < text.length; i++) h = (h ^ text.charCodeAt(i)) * 16777619 >>> 0;
  return (h % 1000) / 1000 * 0.18;
}

/** The same reasoning, said to the human's face. */
function reasonsAgainstYou(botId) {
  const s = S(), me = P(H), out = [];
  const add = (w, text) => out.push({ w, text });
  const lv = lastVotes();
  if (lv && lv.votes[H] === botId) add(1.1, 'You wrote my name down last Tribal.');
  if (facts(botId, (f) => f.kind === 'lied_to_me' && f.about === H).length) add(0.8, 'You told me one thing and wrote down another.');
  if (facts(botId, (f) => thisRound(f) && f.kind === 'both_sides').length) add(0.75, 'You’ve been telling different people different names.');
  const heard = facts(botId, (f) => thisRound(f) && f.kind === 'targeting_me' && f.about === H)[0];
  if (heard) add(0.9, `${nm(heard.src)} says you’re coming for me.`);
  if (me.stats.wins) add(0.3 + me.stats.wins * 0.25, `You’ve won ${wonText(me.stats.wins)}. People are scared of you.`);
  if (s.idolSusp[H] > 0.3) add(0.25 + s.idolSusp[H] * 0.6, 'You keep disappearing into the jungle. People think you have an idol.');
  if (likeability(H) > 0.25) add(0.2 + likeability(H), 'Everybody likes you. That scares people.');
  const partner = partnerOf(H);
  if (partner != null && partner !== botId) add(0.45, `You and ${nm(partner)} are too close. People see it.`);
  if (!out.length) add(0.1, 'Honestly? It’s a numbers thing. Nothing personal.');
  return out.sort((a, b) => b.w - a.w);
}

export const reasonText = (botId, X) => reasonsAgainst(botId, X)[0].text;

/** Why the bot would keep X around. */
export function reasonsToKeep(botId, X) {
  const s = S(), p = P(X), out = [];
  if (s.allied[botId][X]) out.push(`${p.name} is with me. That’s my person.`);
  if (s.trust[botId][X] > 0.35) out.push(`${p.name} has been straight with me since day one.`);
  if (p.stats.wins === 0 && p.t.physical < 0.45) out.push(`${p.name} isn’t winning anything. I’d rather sit next to ${pronoun(X, 'obj')} at the end.`);
  return out;
}

const cap = (t) => t[0].toUpperCase() + t.slice(1);
/** How bots refer to the human when talking to each other. */
export const humanSubj = () => (P(H).look?.gender === 'f' ? 'she' : 'he');
export function pronoun(id, kind = 'subj') {
  const p = P(id);
  if (p.human) return { subj: 'you', obj: 'you', pos: 'your' }[kind];
  const f = p.look?.gender === 'f';
  return { subj: f ? 'she' : 'he', obj: f ? 'her' : 'him', pos: f ? 'her' : 'his' }[kind];
}

/** Extra vote pull from memory, folded into the bot's scoring (ai.js rawScore). */
export function memoryScore(botId, X) {
  let sc = 0;
  const lv = lastVotes();
  if (lv && lv.votes[X] === botId) sc += 0.35;
  for (const f of mind(botId).facts) {
    if (f.about !== X) continue;
    if (f.kind === 'targeting_me' && thisRound(f)) sc += f.src === H ? 0.25 : 0.35;
    if (f.kind === 'lied_to_me') sc += 0.3;
  }
  return sc;
}

// ------------------------------------------------------------------
// What the human has said, as this bot remembers it
// ------------------------------------------------------------------
/** The human's most recent stated vote to this bot this round (or null). */
export const humanSaidVote = (botId) => facts(botId, (f) => thisRound(f) && f.src === H && f.kind === 'h_vote').at(-1)?.target ?? null;

/** Record what the human told a bot. Returns any reaction-worthy contradiction. */
export function recordHuman(botId, kind, target) {
  const before = humanSaidVote(botId);
  note(botId, { src: H, kind, target, about: H });
  if (kind === 'h_vote' && before != null && target != null && before !== target) {
    return { flipped: before };
  }
  return null;
}

// ------------------------------------------------------------------
// Gossip: bots pass on what the human told them (and what they heard)
// ------------------------------------------------------------------
/**
 * Bot a tells bot b one thing it knows about the human. Returns the line(s) said, or null.
 * This is how "playing both sides" gets caught.
 */
export function gossipAboutHuman(a, b) {
  const s = S();
  const loose = (1 - P(a).t.loyal) * 0.6 + (s.trust[a][H] < 0.1 ? 0.3 : 0) + (s.trust[a][b] > 0.3 ? 0.2 : 0);
  if (!chance(clamp(loose, 0.1, 0.85))) return null;
  const said = facts(a, (f) => thisRound(f) && f.src === H && (f.kind === 'h_vote' || f.kind === 'h_pitch')).at(-1);
  if (!said || said.target == null || said.target === b) {
    // Tell b the human is targeting them, if that's what the human said.
    if (said && said.target === b) {
      note(b, { src: a, kind: 'targeting_me', about: H });
      adjTrust(b, H, -0.25);
      s.influence[b][H] += 0.25;
      return [`Watch yourself. ${nm(H)} told me ${humanSubj()}’s writing your name tonight.`, 'Are you serious? Thanks for telling me.'];
    }
    return null;
  }
  const hisVote = humanSaidVote(b);
  note(b, { src: a, kind: 'heard_h_vote', about: H, target: said.target });
  if (hisVote != null && hisVote !== said.target) {
    // Caught: the human told b one name and a another.
    note(b, { src: a, kind: 'both_sides', about: H, target: said.target });
    adjTrust(b, H, -0.2);
    adjTrust(a, H, -0.1);
    return [`${nm(H)} told me ${nm(said.target)} tonight.`, `Funny. ${nm(H)} told ME ${nm(hisVote)}. Somebody’s playing both sides.`];
  }
  return [`${nm(H)} says ${nm(said.target)} tonight.`, hisVote === said.target ? 'Same thing they told me. Good, that tracks.' : 'Noted. Good to know where they stand.'];
}

/** Bot a tells bot b that a heard someone is targeting b (real plans only). */
export function warnBot(a, b) {
  const s = S();
  const enemy = aliveBots().find((k) => k.id !== a && k.id !== b && s.plan[k.id] === b);
  if (!enemy || s.trust[a][b] < 0.25) return null;
  note(b, { src: a, kind: 'targeting_me', about: enemy.id });
  adjTrust(b, enemy.id, -0.15);
  return [`Heads up. ${enemy.name} has been saying your name.`, `${enemy.name}? Okay. Thank you.`];
}

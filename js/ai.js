// Bot brains: vote planning, conversation replies, gossip, idols and jury votes.
import { game, P, nm, alive, aliveBots, adjTrust } from './state.js';
import { rand, pick, chance, clamp, shuffle, weightedPick } from './util.js';

const S = () => game.S;
const H = 0; // human id

export function candidates(voter, exclude = []) {
  return alive().filter((p) => p.id !== voter && !p.immune && !exclude.includes(p.id)).map((p) => p.id);
}

export function beginRoundAI() {
  const s = S();
  for (const a of s.players) for (const b of s.players) {
    s.influence[a.id][b.id] *= 0.3;
    s.noise[a.id][b.id] = rand(0, 0.35);
  }
  s.promises = {};
  s.botTold = {};
  // Everyone gets a little more dangerous the longer they last.
  for (const p of alive()) s.threat[p.id] += 0.02 + p.t.strategic * 0.02;
  // Living together builds a little goodwill with the human, even without talking.
  for (const b of aliveBots()) adjTrust(b.id, H, 0.03 * b.t.social);
  computePlans();
}

function rawScore(b, c) {
  const s = S(), bt = P(b).t;
  return -s.trust[b][c] * 1.3
    + s.threat[c] * (0.4 + bt.strategic * 0.8)
    - s.idolSusp[c] * 0.35 * bt.strategic
    + s.influence[b][c]
    - (s.allied[b][c] ? 0.8 * bt.loyal : 0)
    + s.noise[b][c];
}

export function computePlans() {
  const s = S();
  const bots = aliveBots();
  const prefs = {};
  for (const b of bots) {
    const cands = candidates(b.id);
    prefs[b.id] = Object.fromEntries(cands.map((c) => [c, rawScore(b.id, c)]));
    s.plan[b.id] = argmax(prefs[b.id]);
  }
  // Social pass: bots lean toward what the people they trust are planning.
  for (let iter = 0; iter < 3; iter++) {
    for (const b of bots) {
      const sc = { ...prefs[b.id] };
      for (const k of bots) {
        if (k.id === b.id) continue;
        const w = s.trust[b.id][k.id];
        const t = s.plan[k.id];
        if (w > 0.15 && t != null && t in sc && t !== b.id) sc[t] += w * 0.55;
      }
      s.plan[b.id] = argmax(sc);
    }
  }
}

function argmax(obj) {
  let best = null, bv = -Infinity;
  for (const [k, v] of Object.entries(obj)) if (v > bv) { bv = v; best = +k; }
  return best;
}

// How worried bot b is that it's going home tonight (it only "knows" what friends tell it).
export function perceivedDanger(b) {
  const s = S();
  const bots = aliveBots().filter((k) => k.id !== b);
  if (!bots.length) return 0;
  let against = 0;
  for (const k of bots) if (s.plan[k.id] === b) against += s.trust[b][k.id] > 0.2 ? 1 : 0.6;
  return clamp(against / (alive().length - 1) + rand(-0.12, 0.12) + P(b).t.paranoia * 0.15, 0, 1);
}

// ------------------------------------------------------------------
// Camp: replies to the human's messages
// ------------------------------------------------------------------
const say = (arr) => pick(arr);
const T = (id) => (id === H ? 'you' : nm(id));

export function replyTo(botId, presetId, target, freeText) {
  const s = S(), b = P(botId), tr = s.trust[botId][H], bt = b.t;
  const plan = s.plan[botId];
  let out;
  switch (presetId) {
    case 'who': {
      const honest = tr + bt.honesty * 0.5 > 0.45;
      if (plan === H) {
        if (bt.honesty > 0.85 && tr > 0.3) out = "Honestly? Your name came up. I'm not happy about it either.";
        else {
          const decoy = pick(candidates(botId, [H])) ?? plan;
          s.botTold[botId] = decoy;
          out = say([`I'm thinking ${nm(decoy)}. Easy vote.`, `Probably ${nm(decoy)}. You good with that?`, `${nm(decoy)}, for sure. Don't spread it.`]);
        }
      } else if (honest && plan != null) {
        s.botTold[botId] = plan;
        out = say([`Between us? ${nm(plan)}.`, `I'm leaning ${nm(plan)}. They're dangerous.`, `${nm(plan)}. I think it's the move.`]);
      } else {
        const lie = pick(candidates(botId, [H, plan])) ?? plan;
        if (lie != null && chance(0.6)) {
          s.botTold[botId] = lie;
          out = say([`Uh... ${nm(lie)}, maybe?`, `I guess ${nm(lie)}? Still figuring it out.`]);
        } else out = say(["Not sure yet. I'm keeping my options open.", "Still feeling it out. Who are YOU thinking?"]);
      }
      break;
    }
    case 'ally': {
      if (s.allied[botId][H]) { out = "We already are! Don't make it weird 😄"; adjTrust(botId, H, 0.03); break; }
      const accept = tr + bt.social * 0.3 + rand(0, 0.3) > 0.4;
      if (accept) {
        s.allied[botId][H] = s.allied[H][botId] = true;
        if (bt.honesty > 0.3 || tr > 0.2) adjTrust(botId, H, 0.25);
        s.threat[H] += 0.03;
        out = say(["I'm in. You and me, all the way.", "Deal. I've been waiting for someone to ask.", "Yes. Let's keep it quiet though."]);
      } else {
        adjTrust(botId, H, 0.05);
        out = say(["Let's see how tonight's vote goes first.", "I like you, but it's early. Show me something.", "Hmm. Maybe. Let me think."]);
      }
      break;
    }
    case 'voteout': {
      if (target == null) { out = 'Who?'; break; }
      if (target === botId) { adjTrust(botId, H, -0.4); out = say(["...Me?! Wow. Good to know.", "You're telling ME to vote MYSELF out? Bold."]); break; }
      s.promises[botId] = target;
      const pull = 0.25 + Math.max(0, tr) * 0.9;
      if (plan === target) { s.influence[botId][target] += pull; adjTrust(botId, H, 0.1); out = say([`Same page. ${nm(target)} has to go.`, `Yes! I was going to say the same thing.`, `${nm(target)}. Locked in.`]); }
      else if (s.allied[botId][target] || s.trust[botId][target] > 0.45) { s.influence[botId][target] += pull * 0.3; adjTrust(botId, H, -0.05); out = say([`${nm(target)}? No way, ${nm(target)} is with me.`, `I can't do ${nm(target)}. Pick someone else.`]); }
      else { s.influence[botId][target] += pull; out = say([`Hmm, ${nm(target)}... I could see it.`, `Interesting. Tell me more about why ${nm(target)}.`, `Maybe. If the numbers are there, I'm in.`]); }
      computePlans();
      break;
    }
    case 'trust': {
      adjTrust(botId, H, 0.04);
      if (tr > 0.35) out = say(["100%. I've got your back.", "Absolutely. You're one of my people.", "Of course. We're good."]);
      else if (tr > 0) out = say(["Yeah... I think so.", "Sure! Why, what have you heard?", "I mean, as much as anyone out here."]);
      else out = say(["Of course... why do you ask?", "...Yeah. Totally.", "Why wouldn't you?"]);
      break;
    }
    case 'idol': {
      adjTrust(botId, H, 0.15);
      s.idolSusp[H] = clamp(s.idolSusp[H] + 0.3, 0, 1);
      s.influence[botId][H] -= 0.7;
      if (chance((1 - bt.loyal) * 0.7)) s.leaks.push({ from: botId, about: H, kind: 'idol' });
      computePlans();
      out = say(["Whoa. Your secret's safe with me.", "Seriously?! Okay. I won't tell a soul.", "That changes things. Thanks for trusting me."]);
      break;
    }
    case 'split': {
      adjTrust(botId, H, 0.05);
      const opts = candidates(botId, [H]).sort((x, y) => rawScore(botId, y) - rawScore(botId, x));
      out = opts.length >= 2 ? `Smart, in case of an idol. ${nm(opts[0])} and ${nm(opts[1])}?` : 'Not enough of us left to split.';
      break;
    }
    case 'warn': {
      if (target == null || target === botId) { out = 'Who?'; break; }
      const real = s.plan[target] === botId;
      const closeness = s.trust[botId][target];
      adjTrust(botId, target, -(0.2 + Math.max(0, tr) * 0.3));
      s.influence[botId][target] += 0.3;
      if (real) { adjTrust(botId, H, 0.15); out = say([`I KNEW it. ${nm(target)} has been acting weird.`, `Thank you. ${nm(target)} just made a big mistake.`]); }
      else if (closeness > 0.4) { adjTrust(botId, H, -0.12); out = say([`${nm(target)}? I don't buy that.`, `Hm. That doesn't sound like ${nm(target)}. Why are you telling me this?`]); }
      else out = say([`Really? Okay... I'll keep an eye on ${nm(target)}.`, `Noted. ${nm(target)} better watch it.`]);
      computePlans();
      break;
    }
    default: out = freeReply(botId, freeText || '');
  }
  return out;
}

function freeReply(botId, text) {
  const s = S(), low = text.toLowerCase();
  const named = alive().find((p) => !p.human && p.id !== botId && low.includes(p.name.toLowerCase()));
  if (/idol/.test(low)) return replyTo(botId, 'idol');
  if (named && /(vote|out|go home|target|get rid|blindside)/.test(low)) return replyTo(botId, 'voteout', named.id);
  if (/(alliance|work together|team up|final (two|2|three|3)|deal)/.test(low)) return replyTo(botId, 'ally');
  if (/trust/.test(low)) return replyTo(botId, 'trust');
  if (/(who|what).*(vot|think)/.test(low)) return replyTo(botId, 'who');
  if (named) return pick([`What about ${named.name}?`, `${named.name}? Hm. I've been watching them too.`, `Careful talking about ${named.name} out loud.`]);
  adjTrust(botId, H, 0.02);
  return pick(['Ha, yeah.', "Totally. It's hot out here 🥵", "I hear you.", "Let's talk more before tribal.", "Mm-hm. Interesting..."]);
}

// Bots reaching out to the human on their own.
export function botOpener(botId) {
  const s = S(), tr = s.trust[botId][H], plan = s.plan[botId];
  const enemies = aliveBots().filter((k) => k.id !== botId && s.plan[k.id] === H);
  if (enemies.length && tr > 0.25 && P(botId).t.honesty > 0.4 && chance(0.6)) {
    const k = pick(enemies).id;
    return {
      text: `Heads up... ${nm(k)} has been saying your name.`,
      options: [
        { label: 'Thanks for the heads up', fx: () => { adjTrust(botId, H, 0.08); return 'Anytime. We look out for each other.'; } },
        { label: `Let's flip it on ${nm(k)}`, fx: () => { s.influence[botId][k] += 0.5; s.promises[botId] = k; computePlans(); return `I like it. ${nm(k)} won't see it coming.`; } },
      ],
    };
  }
  if (tr > 0.25 && !s.allied[botId][H] && chance(0.35)) {
    return {
      text: 'I feel like you and I could go far together. Final two deal?',
      options: [
        { label: 'Deal 🤝', fx: () => { s.allied[botId][H] = s.allied[H][botId] = true; adjTrust(botId, H, 0.2); return "Let's do this. Nobody knows."; } },
        { label: "Let's see", fx: () => { adjTrust(botId, H, -0.03); return 'Fair. The offer stands.'; } },
      ],
    };
  }
  if (plan != null && tr > -0.1 && chance(0.6)) {
    const named = plan === H ? pick(candidates(botId, [H])) ?? plan : plan;
    s.botTold[botId] = named;
    return {
      text: `Hey ${nm(H)}. I'm thinking ${nm(named)} tonight. You in?`,
      options: [
        { label: "I'm in", fx: () => { s.promises[botId] = named; adjTrust(botId, H, 0.12); s.influence[botId][named] += 0.2; computePlans(); return 'Perfect. Keep it between us.'; } },
        { label: 'Not sure yet', fx: () => 'Okay. Let me know before tribal.' },
        { label: 'No way', fx: () => { adjTrust(botId, H, -0.1); s.influence[botId][H] += 0.12; computePlans(); return 'Huh. Okay then.'; } },
      ],
    };
  }
  const opts = shuffle(candidates(botId, [H])).slice(0, 3);
  return {
    text: 'So... who are you voting for tonight?',
    options: [
      ...opts.map((c) => ({
        label: nm(c),
        fx: () => {
          s.promises[botId] = c;
          if (s.plan[botId] === c) { adjTrust(botId, H, 0.1); return 'Same. Good.'; }
          if (s.allied[botId][c]) { adjTrust(botId, H, -0.2); return `${nm(c)}? Oh. Okay.`; }
          s.influence[botId][c] += 0.15; computePlans();
          return 'Interesting. I could get there.';
        },
      })),
      { label: 'Not sure', fx: () => { adjTrust(botId, H, -0.03); return 'Mm. Keep me posted.'; } },
    ],
  };
}

// ------------------------------------------------------------------
// Bot-to-bot conversations (what spies and jurors get to read)
// ------------------------------------------------------------------
export function botConvo(forceWith) {
  const s = S(), bots = aliveBots();
  if (bots.length < 2) return [];
  let a, b;
  if (forceWith != null && !P(forceWith).human) {
    a = P(forceWith);
    b = weightedPick(bots.filter((k) => k.id !== a.id), (k) => s.trust[a.id][k.id] + 1.1);
  } else {
    a = weightedPick(bots, (k) => k.t.social + 0.3);
    b = weightedPick(bots.filter((k) => k.id !== a.id), (k) => s.trust[a.id][k.id] + 1.1);
  }
  if (!b) return [];
  const msgs = [];
  const m = (from, to, text) => msgs.push({ from: from.id, to: to.id, text });
  const pa = s.plan[a.id], pb = s.plan[b.id];

  const leakIdx = s.leaks.findIndex((l) => l.from === a.id);
  if (leakIdx >= 0) {
    s.leaks.splice(leakIdx, 1);
    m(a, b, `Don't repeat this... ${nm(H)} told me they have an idol.`);
    m(b, a, pick(['WHAT. Okay, so we can’t put all our votes on them.', 'That explains a lot. Good to know.']));
    s.influence[b.id][H] -= 0.4;
    s.idolSusp[H] = clamp(s.idolSusp[H] + 0.15, 0, 1);
  } else if (pa != null && pa !== b.id) {
    m(a, b, pick([`I'm thinking ${nm(pa)} tonight.`, `${nm(pa)} has to go. Are you with me?`, `We need to talk about ${nm(pa)}.`, `What do you think about ${nm(pa)}?`]));
    if (pb === pa) m(b, a, pick([`Same. ${nm(pa)} is done.`, `100%. I was going to say the same.`, `Yes. Let's lock it in.`]));
    else if (s.allied[b.id][pa] || s.trust[b.id][pa] > 0.45) {
      m(b, a, `${nm(pa)}? No... I need ${nm(pa)}.`);
      if (pb != null && pb !== a.id) m(b, a, `What about ${nm(pb)} instead?`);
    } else {
      m(b, a, pick([`Maybe. I was leaning ${pb != null && pb !== a.id ? nm(pb) : 'somewhere else'}.`, `I could do ${nm(pa)}. Who else is on board?`]));
      s.influence[b.id][pa] += 0.15 * Math.max(0, s.trust[b.id][a.id] + 0.3);
    }
    adjTrust(a.id, b.id, 0.03);
    adjTrust(b.id, a.id, 0.03);
  } else {
    const idolGuy = s.idolSusp.indexOf(Math.max(...s.idolSusp));
    const winner = s.lastWinner;
    if (s.idolSusp[idolGuy] > 0.25 && P(idolGuy).alive && idolGuy !== a.id && idolGuy !== b.id && chance(0.5)) {
      m(a, b, `Have you seen ${nm(idolGuy)} sneaking off? Idol hunting for sure.`);
      m(b, a, pick(['Ugh. We might need to split the vote.', 'Yeah, I noticed. Suspicious.']));
    } else if (winner != null && P(winner).alive && winner !== a.id && winner !== b.id) {
      m(a, b, `${nm(winner)} keeps winning. We have to get them out the second they lose.`);
      m(b, a, pick(['Agreed. Big threat.', 'Maybe... but they help us in challenges.']));
      s.threat[winner] += 0.03;
    } else {
      m(a, b, pick(['Can I trust you?', "Do you think we're good?", "I feel like we haven't talked much."]));
      m(b, a, s.trust[b.id][a.id] > 0.2 ? pick(['Of course. You and me.', 'Yeah! We’re solid.']) : pick(['...Sure.', 'Why do you ask?']));
    }
  }
  computePlans();
  return msgs;
}

// ------------------------------------------------------------------
// Tribal Council talk
// ------------------------------------------------------------------
export function hostQuestion() {
  const s = S(), al = alive(), immune = al.find((p) => p.immune);
  const q = [];
  if (immune) q.push({ to: immune.id, text: `${immune.name}, you're wearing the necklace tonight. Does that change the conversation?` });
  const scared = al.filter((p) => !p.human).sort((x, y) => perceivedDanger(y.id) - perceivedDanger(x.id))[0];
  if (scared) q.push({ to: scared.id, text: `${scared.name}, how safe do you feel tonight?` });
  const b = pick(al.filter((p) => !p.human));
  if (b) q.push({ to: b.id, text: `${b.name}, a lot of people were walking off in pairs today. What's going on out there?` });
  q.push({ to: null, text: 'Is anybody worried about a hidden immunity idol tonight?' });
  q.push({ to: H, text: `${nm(H)}, where do you stand going into this vote?` });
  return pick(q);
}

export function botTribalLine(botId) {
  const s = S(), b = P(botId), d = perceivedDanger(botId), plan = s.plan[botId];
  const lines = [];
  if (d > 0.4 && plan != null) {
    lines.push(`I know my name's out there. But ${nm(plan)} is the one you should be worried about.`);
    for (const k of aliveBots()) if (k.id !== botId) s.influence[k.id][plan] += 0.05;
  }
  if (d < 0.25) lines.push(pick(['I feel good tonight. I trust my people.', "I'm calm. I know where I stand.", "Honestly? I'm not worried."]));
  if (b.t.strategic > 0.6) {
    const w = alive().filter((p) => p.id !== botId).sort((x, y) => y.stats.wins - x.stats.wins)[0];
    if (w && w.stats.wins > 0) lines.push(`This vote is about who can win. ${w.name} has ${w.stats.wins} immunity win${w.stats.wins > 1 ? 's' : ''}. Think about that.`);
  }
  if (b.t.honesty < 0.35) lines.push(pick(['Some people are playing both sides. You know who you are.', "Everyone's smiling at camp. That's what scares me."]));
  if (s.idolSusp[H] > 0.35 && chance(0.5)) lines.push(`I'll just say it. ${nm(H)} has been on an idol hunt all day.`);
  if (s.voteHistory.length) lines.push(pick(['Last vote showed us exactly who is running this game.', 'The last vote changed everything.']));
  lines.push(pick(["It's a numbers game. Simple as that.", 'Whatever happens, I came here to play.', 'I just hope people vote with their gut.']));
  return pick(lines);
}

export function applyTribalLine(lineId, target) {
  const s = S(), bots = aliveBots();
  const reactor = pick(bots.filter((b) => b.id !== target)) || pick(bots);
  let reaction = null;
  switch (lineId) {
    case 'threat':
      for (const b of bots) if (b.id !== target) s.influence[b.id][target] += 0.15 + Math.max(0, s.trust[b.id][H]) * 0.3;
      if (target) { adjTrust(target, H, -0.3); s.threat[target] += 0.05; reaction = { who: target, text: pick(["Wow. Okay. I'll remember that.", "That's rich, coming from you."]) }; }
      break;
    case 'simple':
      for (const b of bots) if (b.id !== target) s.influence[b.id][target] += s.trust[b.id][H] > 0.2 ? 0.4 : 0.12;
      if (target) { adjTrust(target, H, -0.35); reaction = { who: target, text: pick(['Saying my name out loud? Bold move.', '*stares into the fire*']) }; }
      break;
    case 'liar':
      for (const b of bots) if (b.id !== target) adjTrust(b.id, target, -(0.08 + Math.max(0, s.trust[b.id][H]) * 0.2));
      if (target) { adjTrust(target, H, -0.3); reaction = { who: target, text: 'Funny, I was going to say the same about you.' }; }
      break;
    case 'loyal': {
      const broke = s.players[H].stats.betrayals > 0;
      for (const b of bots) adjTrust(b.id, H, broke ? -0.04 : 0.04);
      if (reactor) reaction = { who: reactor.id, text: broke ? '*eye roll* Sure you have.' : 'I can vouch for that.' };
      break;
    }
    case 'idolwarn': {
      const top = s.idolSusp.indexOf(Math.max(...s.idolSusp));
      for (const b of bots) for (const c of alive()) s.noise[b.id][c.id] += rand(-0.1, 0.1);
      if (s.idolSusp[top] > 0.1 && top !== H) for (const b of bots) s.influence[b.id][top] -= 0.15;
      if (reactor) reaction = { who: reactor.id, text: pick(["Now I'm nervous.", 'Then maybe we should split the votes.', 'Who? Say a name.']) };
      break;
    }
    case 'plead':
      for (const b of bots) s.influence[b.id][H] -= 0.12;
      s.threat[H] = Math.max(0, s.threat[H] - 0.03);
      if (reactor) reaction = { who: reactor.id, text: pick(['That is exactly what a threat would say.', 'Noted.']) };
      break;
  }
  computePlans();
  return reaction;
}

// ------------------------------------------------------------------
// Votes, idols, learning
// ------------------------------------------------------------------
export function botVote(botId, cands) {
  const s = S();
  if (cands.includes(s.plan[botId]) && chance(0.93)) return s.plan[botId];
  return cands.slice().sort((x, y) => rawScore(botId, y) - rawScore(botId, x))[0];
}

export function botIdolChoice(botId, lastChance) {
  if (P(botId).idols <= 0) return null;
  const d = perceivedDanger(botId);
  if (d > (lastChance ? 0.18 : 0.38)) return botId;
  // Rarely, a loyal bot burns its idol on a close ally in danger.
  const s = S();
  const ally = aliveBots().find((k) => k.id !== botId && s.allied[botId][k.id] && perceivedDanger(k.id) > 0.6);
  if (ally && P(botId).t.loyal > 0.8 && chance(0.25)) return ally.id;
  return null;
}

export function learnFromVote(votes, outId) {
  const s = S();
  const hv = votes[H];
  for (const [botId, promised] of Object.entries(s.promises)) {
    const id = +botId;
    if (!P(id).alive || hv == null) continue;
    if (hv !== promised && chance(0.75)) {
      adjTrust(id, H, -0.35);
      s.players[H].stats.betrayals++;
    } else if (hv === promised) adjTrust(id, H, 0.08);
  }
  for (const [v, t] of Object.entries(votes)) {
    const voter = +v;
    if (t === outId) P(voter).stats.correctVotes++;
    if (P(t).alive && t !== voter && chance(0.5)) adjTrust(t, voter, -0.2);
    for (const [v2, t2] of Object.entries(votes)) if (+v2 !== voter && t2 === t) adjTrust(voter, +v2, 0.06);
  }
}

// ------------------------------------------------------------------
// Finale
// ------------------------------------------------------------------
export function juryScore(jurorId, f, ftcBonus = 0) {
  const s = S(), fp = P(f), jt = P(jurorId).t;
  let sc = s.trust[jurorId][f] * 1.0;
  sc += (fp.stats.wins * 0.22 + fp.stats.idolSaves * 0.35 + fp.stats.correctVotes * 0.08) * (0.4 + jt.strategic);
  for (const vh of s.voteHistory) if (vh.out === jurorId && vh.votes[f] === jurorId) sc -= 0.35 * (1 - jt.strategic * 0.5);
  sc -= fp.stats.betrayals * 0.08 * jt.loyal;
  return sc + ftcBonus;
}

export function juryVote(jurorId, finalists, bonus = {}) {
  const sc = finalists.map((f) => juryScore(jurorId, f, (bonus[f] || 0)) + rand(0, 0.35));
  return finalists[sc[0] >= sc[1] ? 0 : 1];
}

export function finalChoice(winnerId, others) {
  const s = S(), w = P(winnerId);
  const ally = others.find((o) => s.allied[winnerId][o]);
  if (ally != null && w.t.loyal > 0.7 && chance(0.7)) return ally;
  // Otherwise take the person you think you can beat.
  const jury = s.jury;
  const margin = (o) => jury.reduce((sum, j) => sum + juryScore(j, winnerId) - juryScore(j, o), 0);
  return others.slice().sort((a, b) => margin(b) - margin(a))[0];
}

export const JURY_QUESTIONS = [
  { tone: 'strategic', q: 'Name one move you made that changed this game.' },
  { tone: 'loyal', q: 'Did you ever lie to my face? Be honest.' },
  { tone: 'social', q: "Why do you deserve this more than the person next to you?" },
];

export const FTC_ANSWERS = [
  { id: 'own', label: 'Own it: "I played hard and I played to win."', fit: 'strategic' },
  { id: 'loyal', label: 'Loyalty: "I kept my word whenever I could."', fit: 'loyal' },
  { id: 'humble', label: 'Humble: "I built real bonds with every one of you."', fit: 'social' },
];

export function ftcEffect(answerId) {
  const s = S(), me = P(H), bonus = {};
  for (const j of s.jury) {
    const jt = P(j).t;
    let d = 0;
    if (answerId === 'own') d = (jt.strategic - 0.45) * 0.5 + (me.stats.wins + me.stats.idolSaves) * 0.04;
    if (answerId === 'loyal') d = me.stats.betrayals > 1 ? -0.15 * jt.loyal : (jt.loyal - 0.45) * 0.5;
    if (answerId === 'humble') d = (jt.social - 0.45) * 0.45 + s.trust[j][H] * 0.1;
    bonus[j] = d;
  }
  return bonus;
}

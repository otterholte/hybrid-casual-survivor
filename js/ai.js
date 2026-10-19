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

// A bot's reply is { text, options? }. Options are quick replies; each fx returns another reply (or a string).
function backingVote(botId, X) {
  const s = S();
  s.promises[botId] = X;
  adjTrust(botId, H, 0.08);
  s.influence[botId][X] += 0.25;
  computePlans();
}

function namesOptions(botId, exclude, onPick) {
  const opts = shuffle(candidates(botId, [H, ...exclude])).slice(0, 3);
  return opts.map((c) => ({ label: nm(c), fx: () => onPick(c) }));
}

function askedWho(botId, exclude = []) {
  return namesOptions(botId, exclude, (c) => {
    const s = S();
    s.promises[botId] = c;
    if (s.plan[botId] === c) { adjTrust(botId, H, 0.1); return 'Same. Good, we’re on the same page.'; }
    if (s.allied[botId][c]) { adjTrust(botId, H, -0.15); return `${nm(c)}? Oh. I can’t do that one.`; }
    s.influence[botId][c] += 0.25 + Math.max(0, s.trust[botId][H]) * 0.5;
    computePlans();
    return s.plan[botId] === c ? `Okay. ${nm(c)} it is. I’m with you.` : `${nm(c)}... I’ll think about it.`;
  }).concat([{ label: 'No idea yet', fx: () => { adjTrust(botId, H, -0.02); return 'Okay. Let me know before Tribal.'; } }]);
}

function namedTarget(botId, X, lead) {
  const s = S();
  s.botTold[botId] = X;
  return {
    text: `${lead} ${nm(X)}. You good with that?`,
    options: [
      { label: 'Yes, I’m in', fx: () => { backingVote(botId, X); return pick(['Good. Keep it quiet.', 'Perfect. We’re locked in.']); } },
      { label: 'Maybe', fx: () => 'Okay. Don’t wait too long to decide.' },
      { label: `Not ${nm(X)}`, fx: () => {
        adjTrust(botId, H, -0.03);
        s.influence[botId][X] -= 0.15;
        computePlans();
        return { text: 'Then who?', options: askedWho(botId, [X]) };
      } },
    ],
  };
}

export function replyTo(botId, presetId, target, freeText) {
  const s = S(), b = P(botId), tr = s.trust[botId][H], bt = b.t;
  const plan = s.plan[botId];
  switch (presetId) {
    case 'who': {
      const honest = tr + bt.honesty * 0.5 > 0.45;
      if (plan === H) {
        if (bt.honesty > 0.85 && tr > 0.3) {
          return {
            text: 'Honestly? Your name came up. I’m not happy about it either.',
            options: [
              { label: 'Who’s pushing it?', fx: () => {
                const k = aliveBots().find((x) => x.id !== botId && s.plan[x.id] === H);
                adjTrust(botId, H, 0.05);
                return k ? `Mostly ${k.name}. You didn’t hear it from me.` : 'I don’t know exactly. It’s just going around.';
              } },
              { label: 'Help me flip it', fx: () => {
                if (s.trust[botId][H] > 0.25) { s.influence[botId][H] -= 0.5; computePlans(); return 'I’ll see what I can do. Give me a name to push instead.'; }
                return 'I don’t know if I can. I’m sorry.';
              } },
            ],
          };
        }
        return namedTarget(botId, pick(candidates(botId, [H])) ?? plan, pick(['I’m thinking', 'Probably', 'Between us?']));
      }
      if (honest && plan != null) return namedTarget(botId, plan, pick(['Between us?', 'I’m leaning', 'Probably']));
      const lie = pick(candidates(botId, [H, plan]));
      if (lie != null && chance(0.55)) return namedTarget(botId, lie, pick(['Uh... maybe', 'I guess']));
      return { text: 'Not sure yet. Who are you thinking?', options: askedWho(botId) };
    }
    case 'ally': {
      if (s.allied[botId][H]) { adjTrust(botId, H, 0.03); return { text: 'We already are. Don’t make it weird.' }; }
      const accept = tr + bt.social * 0.3 + rand(0, 0.3) > 0.4;
      if (accept) {
        s.allied[botId][H] = s.allied[H][botId] = true;
        if (bt.honesty > 0.3 || tr > 0.2) adjTrust(botId, H, 0.25);
        s.threat[H] += 0.03;
        return { text: pick(['I’m in. You and me, all the way.', 'Deal. I was hoping someone would ask.', 'Yes. Let’s keep it quiet though.']) };
      }
      adjTrust(botId, H, 0.05);
      return { text: pick(['Let’s see how tonight’s vote goes first.', 'I like you, but it’s early. Show me something.']) };
    }
    case 'voteout': {
      if (target == null) return { text: 'Who?' };
      if (target === botId) { adjTrust(botId, H, -0.4); return { text: pick(['...Me? Wow. Good to know.', 'You’re telling ME to vote myself out. Bold.']) }; }
      s.promises[botId] = target;
      const pull = 0.25 + Math.max(0, tr) * 0.9;
      if (plan === target) { s.influence[botId][target] += pull; adjTrust(botId, H, 0.1); computePlans(); return { text: pick([`Same page. ${nm(target)} has to go.`, 'Yes. I was going to say the same thing.', `${nm(target)}. Locked in.`]) }; }
      if (s.allied[botId][target] || s.trust[botId][target] > 0.45) {
        s.influence[botId][target] += pull * 0.3;
        adjTrust(botId, H, -0.05);
        computePlans();
        return {
          text: `${nm(target)}? No way. ${nm(target)} is with me.`,
          options: [
            { label: 'Okay, forget it', fx: () => { adjTrust(botId, H, 0.04); delete s.promises[botId]; return 'Thanks. We’re good.'; } },
            { label: `${nm(target)} is playing you`, fx: () => { adjTrust(botId, target, -0.12 - Math.max(0, tr) * 0.2); adjTrust(botId, H, -0.03); s.influence[botId][target] += 0.15; computePlans(); return 'I’ll keep my eyes open. That’s all I’m promising.'; } },
          ],
        };
      }
      s.influence[botId][target] += pull;
      computePlans();
      return {
        text: pick([`Hmm, ${nm(target)}... I could see it.`, `${nm(target)}. Interesting.`]),
        options: [
          { label: 'So you’re in?', fx: () => {
            if (s.plan[botId] !== target) return 'Maybe. Let me see where the numbers are first.';
            backingVote(botId, target);
            return `Yeah. I’m in on ${nm(target)}.`;
          } },
          { label: 'Think it over', fx: () => 'I will.' },
        ],
      };
    }
    case 'trust': {
      adjTrust(botId, H, 0.04);
      if (tr > 0.35) return { text: pick(['100%. I’ve got your back.', 'Absolutely. You’re one of my people.']) };
      if (tr > 0) return { text: pick(['Yeah. I think we’re good.', 'I mean, as much as anyone out here.']) };
      return { text: pick(['Of course...', '...Yeah. Totally.']) };
    }
    case 'idol': {
      adjTrust(botId, H, 0.15);
      s.idolSusp[H] = clamp(s.idolSusp[H] + 0.3, 0, 1);
      s.influence[botId][H] -= 0.7;
      if (chance((1 - bt.loyal) * 0.7)) s.leaks.push({ from: botId, about: H, kind: 'idol' });
      computePlans();
      return { text: pick(['Whoa. Your secret’s safe with me.', 'Seriously? Okay. I won’t tell a soul.', 'That changes things. Thanks for trusting me.']) };
    }
    case 'split': {
      adjTrust(botId, H, 0.05);
      const opts = candidates(botId, [H]).sort((x, y) => rawScore(botId, y) - rawScore(botId, x));
      if (opts.length < 2) return { text: 'Not enough of us left to split.' };
      return {
        text: `Smart, in case of an idol. We split between ${nm(opts[0])} and ${nm(opts[1])}. Which one are you taking?`,
        options: [
          { label: nm(opts[0]), fx: () => { backingVote(botId, opts[0]); return `Okay. I’ll take ${nm(opts[1])} then.`; } },
          { label: nm(opts[1]), fx: () => { backingVote(botId, opts[1]); return `Okay. I’ll take ${nm(opts[0])} then.`; } },
          { label: 'All on one instead', fx: () => 'Your call. Just don’t get blindsided.' },
        ],
      };
    }
    case 'warn': {
      if (target == null || target === botId) return { text: 'Who?' };
      const real = s.plan[target] === botId;
      const closeness = s.trust[botId][target];
      adjTrust(botId, target, -(0.2 + Math.max(0, tr) * 0.3));
      s.influence[botId][target] += 0.3;
      computePlans();
      if (real) { adjTrust(botId, H, 0.15); return { text: pick([`I KNEW it. ${nm(target)} has been acting weird.`, `Thank you. ${nm(target)} just made a big mistake.`]) }; }
      if (closeness > 0.4) { adjTrust(botId, H, -0.12); return { text: pick([`${nm(target)}? I don’t buy that.`, `That doesn’t sound like ${nm(target)} at all.`]) }; }
      return { text: pick([`Really. Okay. I’ll keep an eye on ${nm(target)}.`, `Noted. ${nm(target)} better watch it.`]) };
    }
    default: return freeReply(botId, freeText || '');
  }
}

function freeReply(botId, text) {
  const low = text.toLowerCase();
  const named = alive().find((p) => !p.human && p.id !== botId && low.includes(p.name.toLowerCase()));
  if (/idol/.test(low)) return replyTo(botId, 'idol');
  if (named && /(vote|out|go home|target|get rid|blindside)/.test(low)) return replyTo(botId, 'voteout', named.id);
  if (/(alliance|work together|team up|final (two|2|three|3)|deal)/.test(low)) return replyTo(botId, 'ally');
  if (/trust/.test(low)) return replyTo(botId, 'trust');
  if (/(who|what).*(vot|think)/.test(low)) return replyTo(botId, 'who');
  if (named) return { text: pick([`${named.name}? I’ve been watching them too.`, `Careful talking about ${named.name} out loud.`]) };
  adjTrust(botId, H, 0.02);
  return { text: pick(['Ha, yeah.', 'Totally. It’s brutal out here.', 'I hear you.', 'Mm-hm. Interesting.']) };
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
// Host-led questions. Each question is aimed at one castaway.
export function buildQuestions(count) {
  const s = S(), al = alive();
  const immune = al.find((p) => p.immune && !p.human);
  const bots = shuffle(aliveBots().filter((b) => !b.immune));
  const types = shuffle(['safe', 'threat', 'trust', 'idol', 'decide']);
  const qs = [];
  if (immune) qs.push({ to: immune.id, type: 'immune' });
  for (const b of bots) {
    if (qs.length >= count - (P(H).alive ? 1 : 0)) break;
    qs.push({ to: b.id, type: types[qs.length % types.length] });
  }
  if (P(H).alive) {
    const myType = pick(['safe', 'threat', 'trust', 'idol', 'decide'].filter((t) => !qs.some((q) => q.type === t)) .concat(['decide']));
    qs.splice(Math.min(qs.length, 1 + Math.floor(Math.random() * 2)), 0, { to: H, type: myType });
  }
  return qs.map((q) => ({ ...q, text: questionText(q.to, q.type) }));
}

function questionText(id, type) {
  const n = nm(id);
  return {
    safe: `${n}, how safe do you feel tonight?`,
    threat: `${n}, who is the biggest threat left in this game?`,
    trust: `${n}, is there anyone sitting here you don’t trust?`,
    idol: `${n}, are you worried about a hidden immunity idol tonight?`,
    decide: `${n}, what decides your vote tonight?`,
    immune: `${n}, you’re wearing the necklace. Does that change anything tonight?`,
  }[type];
}

/** A bot's public answer, with its effect already applied. May include a reaction from someone named. */
export function botAnswer(botId, type) {
  const s = S(), b = P(botId), others = alive().filter((p) => p.id !== botId);
  const nudge = (x, amt) => { for (const k of aliveBots()) if (k.id !== botId && k.id !== x) s.influence[k.id][x] += amt; computePlans(); };
  switch (type) {
    case 'safe': {
      const d = perceivedDanger(botId), plan = s.plan[botId];
      if (d > 0.45 && plan != null) { nudge(plan, 0.06); return { text: `Honestly? No. I know my name has been thrown around. But ${nm(plan)} is the one you should all be worried about.`, reaction: plan !== H ? { who: plan, text: pick(['Here we go.', 'Nice try.']) } : null }; }
      if (d < 0.25) return { text: pick(['I feel good. I trust my people.', 'Calm. I know exactly where I stand.']) };
      return { text: 'Nobody is safe out here. I’m just trying to keep my head down.' };
    }
    case 'threat': {
      const top = others.slice().sort((x, y) => s.threat[y.id] - s.threat[x.id])[0];
      if (b.t.strategic > 0.45 && top) {
        nudge(top.id, 0.06);
        const why = top.stats.wins ? `${top.stats.wins} immunity win${top.stats.wins > 1 ? 's' : ''}. Do the math.` : 'Everyone likes them. That’s exactly the problem.';
        return { text: `Easy. ${top.name}. ${why}`, reaction: top.human ? null : { who: top.id, text: pick(['I’ll take that as a compliment.', 'Wow. Okay.']) } };
      }
      return { text: 'At this point everyone is a threat. That’s the game.' };
    }
    case 'trust': {
      const low = others.slice().sort((x, y) => s.trust[botId][x.id] - s.trust[botId][y.id])[0];
      if (low && s.trust[botId][low.id] < 0) {
        adjTrust(low.id, botId, -0.15);
        nudge(low.id, 0.03);
        return { text: `${low.name}. I just get a weird feeling.`, reaction: low.human ? null : { who: low.id, text: pick(['Good to know.', 'The feeling is mutual.']) } };
      }
      return { text: 'I trust my people. That’s all I’ll say.' };
    }
    case 'idol': {
      if (b.idols) return { text: pick(['Nope. Not worried at all.', 'Worried? No. Should I be?']) };
      const sus = others.slice().sort((x, y) => s.idolSusp[y.id] - s.idolSusp[x.id])[0];
      if (sus && s.idolSusp[sus.id] > 0.3) { s.idolSusp[sus.id] = Math.min(1, s.idolSusp[sus.id] + 0.05); return { text: `If anyone has one, it’s ${sus.name}. Way too much time in the jungle.` }; }
      return { text: 'Always. That’s why you never put every vote on one name.' };
    }
    case 'decide': {
      const t = b.t;
      if (t.loyal >= t.strategic && t.loyal >= t.social) return { text: 'Loyalty. I’m voting with the people who’ve been loyal to me.' };
      if (t.strategic >= t.social) return { text: 'Strategy. Who is the biggest threat to win at the end.' };
      return { text: 'My gut. Who’s been honest with me and who hasn’t.' };
    }
    case 'immune': return { text: pick(['It means I get to vote with a clear head. Somebody here should be nervous.', 'It means tonight I’m the one making decisions.']) };
  }
  return { text: '...' };
}

/** Multiple-choice answers for the human. Choices with `pick` ask for a name first. */
export function humanChoices(type) {
  const s = S();
  const lead = (lineId) => (target) => applyTribalLine(lineId, target);
  switch (type) {
    case 'safe': return [
      { label: 'I feel good. I trust my people.', fx: lead('loyal') },
      { label: 'Nobody is safe tonight.', fx: lead('idolwarn') },
      { label: 'Honestly? I’m nervous.', fx: lead('plead') },
    ];
    case 'threat': return [
      { label: '{X}. It’s obvious.', pick: true, fx: lead('threat') },
      { label: 'Everyone is a threat now.', fx: () => null },
    ];
    case 'trust': return [
      { label: '{X}. I don’t buy a word they say.', pick: true, fx: lead('liar') },
      { label: 'I trust everyone here.', fx: lead('loyal') },
    ];
    case 'idol': return [
      { label: 'Somebody definitely has one.', fx: lead('idolwarn') },
      { label: 'Not really.', fx: () => null },
      { label: 'If I had one, I wouldn’t tell you.', fx: () => { s.idolSusp[H] = clamp(s.idolSusp[H] + 0.2, 0, 1); for (const b of aliveBots()) s.influence[b.id][H] -= 0.12; computePlans(); return { who: pick(aliveBots()).id, text: '...Noted.' }; } },
    ];
    case 'decide': return [
      { label: 'Loyalty. I’m sticking with my people.', fx: lead('loyal') },
      { label: 'Keeping it simple tonight: {X}.', pick: true, fx: lead('simple') },
      { label: 'Taking out whoever I can’t beat at the end.', fx: () => { s.threat[H] += 0.04; computePlans(); return null; } },
    ];
  }
  return [{ label: 'I’ll let my vote speak for me.', fx: () => null }];
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

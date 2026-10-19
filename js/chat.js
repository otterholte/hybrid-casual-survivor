// Understands typed messages and answers from the bot's real game state.
// The reply also records what the bot "said" it would do, and that commitment feeds its vote.
import { game, P, nm, alive, aliveBots, adjTrust } from './state.js';
import { candidates, computePlans, replyTo, backingVote, perceivedDanger } from './ai.js';
import { pick, chance, shuffle } from './util.js';

const H = 0;
const S = () => game.S;

const VOICE = {
  strategist: ['Look,', 'Here’s the thing:', 'Strategically?'],
  beast: ['Honestly?', 'Straight up,', 'Real talk,'],
  social: ['Okay so,', 'Aw,', 'Listen,'],
  schemer: ['Between you and me,', 'Hmm.', 'Interesting...'],
  loyalist: ['Real talk,', 'I’ll be straight with you.', 'Honestly,'],
  wildcard: ['Ha.', 'Okay, wild.', 'Hm.'],
  puzzler: ['Logically,', 'If you think about it,', 'So,'],
  underdog: ['I mean,', 'Okay,', 'Look,'],
};
const SOFT_START = /^(whoa|okay|ok|hm+|yes|no|same|honestly|between|we|you|that|this|it|the|maybe|let's|let’s|not|ha|sure|thanks|stop|relax|good|perfect|absolutely|still|always|nobody|everyone|easy|interesting|really|wow|cool|fine|what|why|deal|of|as|just)\b/i;
const voice = (b, text) => {
  if (!chance(0.35)) return text;
  const lead = pick(VOICE[P(b).arch] || ['Hm.']);
  const body = SOFT_START.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return `${lead} ${body}`;
};

/** Finds every living castaway named in the text (other than the bot being spoken to, unless that's the only name). */
function namesIn(text, botId) {
  const low = ` ${text.toLowerCase()} `;
  const found = alive().filter((p) => !p.human && new RegExp(`[^a-z]${p.name.toLowerCase()}[^a-z]`).test(low)).map((p) => p.id);
  const others = found.filter((id) => id !== botId);
  return others.length ? others : found;
}

const has = (re, t) => re.test(t);

export function understand(text, botId) {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim();
  const names = namesIn(t, botId);
  const X = names[0] ?? null;
  const I = (intent) => ({ intent, X, names, t });
  if (has(/(you('re| are) (lying|a liar|a snake|fake)|\bliar\b|\bsnake\b|you voted (for )?me|backstab|betray)/, t)) return I('accuse');
  if (has(/\b(stupid|idiot|dumb|you suck|hate you|shut up|loser|clown)\b/, t)) return I('insult');
  if (has(/(don't vote (for )?me|keep me|save me|spare me|please don't|don't want to go home|don't send me home)/, t)) return I('dont_vote_me');
  if (has(/(who('s| is) (targeting|after|coming for|gunning for) me|who wants me (out|gone)|any(one|body) (targeting|after|coming (for|after)|gunning for) me|someone (after|coming for) me|is my name out|heard my name)/, t)) return I('ask_target_me');
  if (has(/(are you (voting|writing|going) (for |after )?me|am i (safe|going home|the target|in danger|good)|is my name|vote me out)/, t)) return I('ask_vote_me');
  if (has(/(i (have|found|got) (an|the|a) (hidden )?idol|i'm holding (an|the) idol)/, t)) return I('idol_claim');
  if (has(/(do you have (an|the|a) idol|did you find (an|the|a) idol|who (has|found) (an|the|a) idol|anyone (find|found|have) (an|the|a) idol|got an idol)/, t)) return I('ask_idol');
  if (X != null && has(/(coming for you|targeting you|after you|said your name|wants you (out|gone)|gunning for you|voting (for )?you|wrote your name|out to get you)/, t)) return I('warn');
  if (X != null && has(/(i'm voting|i will vote|i'll vote|my vote is|i'm writing|i'm going with|i'm putting my vote)/, t)) return I('declare_vote');
  if (X != null && has(/(what (do|did) you think (of|about)|how do you feel about|thoughts on|do you trust|opinion|what about|is \w+ (with you|trustworthy|a threat|loyal|safe)|how('s| is) \w+ playing)/, t)) return I('opinion');
  if (X != null && has(/(vote|out|go home|has to go|needs to go|blindside|get rid|target|cut|boot|send .* home|eliminate|take .* out|flip on)/, t)) return I('propose_vote');
  if (has(/(who (are|r) (you|u) (voting|writing|thinking|going)|who('s| is) going home|who should go|your (vote|plan|target)|what('s| is) the plan|who do you want (out|gone)|who are we voting|who('s| is) the target|plan tonight)/, t)) return I('ask_vote');
  if (has(/(who are you (working|close|closest|aligned|tight|tightest|allied) with|who('s| is) your closest|who('s| is) in your alliance|who do you trust|who are your people|who('s| is) your (ally|alliance|number one))/, t)) return I('ask_allies');
  if (has(/(alliance|work together|team up|final (two|2|three|3)|ride or die|partner up|stick together|join forces)/, t)) return I('ally');
  if (has(/(can i trust you|are we good|are you with me|you got my back|do you trust me|we cool)/, t)) return I('trust_q');
  if (has(/(i('ve| have) got your back|i('ll| will) protect you|you('re| are) safe with me|i won't vote (for )?you|i trust you|i'm with you|i'm loyal|you can trust me)/, t)) return I('loyalty');
  if (has(/\bsplit\b/, t)) return I('split');
  if (has(/^why\b|\bwhy (him|her|them|that)\b|why (would|do) you/, t)) return I('why');
  if (has(/((nice|great|good) (job|game|work|win|move)|you('re| are) (great|awesome|amazing|killing it|smart)|well played|respect)/, t)) return I('compliment');
  if (has(/^(hi|hey|hello|yo|sup|what's up|howdy|hiya)\b/, t)) return I('greeting');
  if (has(/(challenge|immunity|necklace|won today|lost today)/, t)) return I('challenge_talk');
  if (has(/(food|hungry|rice|fish|rain|sleep|tired|fire|shelter|water|starving|cold|bugs|sand)/, t)) return I('camp_talk');
  if (X != null) return I('opinion');
  return I('unknown');
}

export const FLAVOR_INTENTS = new Set(['greeting', 'compliment', 'insult', 'camp_talk', 'challenge_talk', 'unknown']);

/** Commits the bot to a vote it announced (only when it was telling the truth). */
function commit(botId, X) {
  const s = S();
  s.botTold[botId] = X;
  s.influence[botId][X] += 0.3;
  computePlans();
}

function reasonFor(botId, X) {
  const s = S(), p = P(X);
  if (p.stats.wins >= 1) return `${p.name} keeps winning. If we don’t take the shot now, we never will.`;
  if (s.trust[botId][X] < -0.1) return `I just don’t trust ${p.name}. Something’s off.`;
  if (s.idolSusp[X] > 0.3) return `${p.name} has been running around the jungle. I think they’re dangerous.`;
  return `${p.name} is too well-liked. That person wins at the end if we let them.`;
}

export function chatReply(botId, text) {
  const s = S(), b = P(botId), tr = s.trust[botId][H], plan = s.plan[botId];
  const { intent, X } = understand(text, botId);
  const honest = tr + b.t.honesty * 0.5 > 0.45;
  const R = (t, options) => ({ text: voice(botId, t), options });
  switch (intent) {
    case 'accuse': {
      adjTrust(botId, H, -0.1);
      const last = s.voteHistory.at(-1);
      if (last && last.votes[botId] === H) {
        if (b.t.honesty > 0.6) return R('...Okay. Yes. It was a numbers thing. I’m sorry. I’m with you now.');
        return R('What? No. I don’t know who wrote your name, but it wasn’t me.');
      }
      return R(pick(['Whoa. Where is this coming from? I’ve been nothing but straight with you.', 'That’s a big accusation. I haven’t done anything to you.']));
    }
    case 'insult':
      adjTrust(botId, H, -0.18);
      s.influence[botId][H] += 0.15;
      computePlans();
      return R(pick(['Wow. Okay. Noted.', 'Cool. Remember you said that.', 'That’s how you want to play it? Fine.']));
    case 'dont_vote_me': {
      const was = plan;
      s.influence[botId][H] -= 0.15 + Math.max(0, tr) * 0.4;
      computePlans();
      if (was === H && s.plan[botId] !== H) return R('...Okay. I hear you. I’ll look at other options. No promises.');
      if (was === H) return R(pick(['I’m not making any promises right now.', 'It’s not personal. Let me think.']));
      return R('Relax. I’m not voting for you.');
    }
    case 'ask_vote_me': {
      if (plan === H) {
        if (b.t.honesty > 0.8 && tr > 0.3) return R('...Honestly? Your name came up. I don’t love it either.');
        const decoy = pick(candidates(botId, [H]));
        if (decoy != null) s.botTold[botId] = decoy;
        return R(`No! Why would I? I’m thinking ${decoy != null ? nm(decoy) : 'someone else'}.`);
      }
      if (honest && plan != null) { commit(botId, plan); return R(`No. You’re good tonight. I’m going ${nm(plan)}.`); }
      return R('No. You’re fine. Relax.');
    }
    case 'ask_target_me': {
      const enemies = aliveBots().filter((k) => k.id !== botId && s.plan[k.id] === H);
      if (enemies.length && honest) { adjTrust(botId, H, 0.03); return R(`I’ll tell you because I like you. ${pick(enemies).name} has been saying your name.`); }
      if (enemies.length && chance(0.4)) { const lie = pick(aliveBots().filter((k) => k.id !== botId)); return R(`I heard ${lie.name} mention you. Could be nothing.`); }
      return R('I haven’t heard your name. Honestly.');
    }
    case 'idol_claim': return replyTo(botId, 'idol');
    case 'ask_idol': {
      if (b.idols) return b.t.honesty > 0.8 && tr > 0.4 ? R('...Maybe. And that stays between us.') : R(pick(['No. I wish.', 'Ha. No. I’ve looked though.']));
      const sus = alive().filter((p) => p.id !== botId && p.id !== H).sort((x, y) => s.idolSusp[y.id] - s.idolSusp[x.id])[0];
      if (sus && s.idolSusp[sus.id] > 0.25) return R(`Not me. But I’d bet ${sus.name} has one. They keep disappearing.`);
      return R('Not me. I haven’t heard of anyone finding one yet.');
    }
    case 'warn': return replyTo(botId, 'warn', X);
    case 'declare_vote': {
      if (X === botId) { adjTrust(botId, H, -0.4); return R('You’re voting for ME? Good to know.'); }
      s.promises[botId] = X;
      if (plan === X) { adjTrust(botId, H, 0.1); commit(botId, X); return R(`Good. Then we’re together on ${nm(X)}. That’s my vote too.`); }
      if (s.allied[botId][X] || s.trust[botId][X] > 0.45) { adjTrust(botId, H, -0.08); return R(`Wow. ${nm(X)} is my person, so... noted.`); }
      s.influence[botId][X] += 0.25 + Math.max(0, tr) * 0.6;
      computePlans();
      if (s.plan[botId] === X) { commit(botId, X); return R(`You know what? I could do ${nm(X)}. Count me in.`); }
      return R(`${nm(X)}. Interesting. I’m not there yet, but keep talking.`);
    }
    case 'propose_vote': {
      const r = replyTo(botId, 'voteout', X);
      if (s.plan[botId] === X) commit(botId, X);
      return r;
    }
    case 'opinion': {
      if (X === botId) return R('Me? I think I’m playing a pretty good game, thanks.');
      const t = s.trust[botId][X];
      if (plan === X && (honest || chance(0.3))) return R(`Honestly? ${nm(X)} needs to go. ${reasonFor(botId, X)}`);
      if (s.allied[botId][X]) return R(`${nm(X)} is solid. That’s one of my people.`);
      if (t > 0.3) return R(pick([`I like ${nm(X)}. Good person, decent player.`, `${nm(X)}? We’re good. I trust them.`]));
      if (t < -0.1) return R(pick([`I don’t trust ${nm(X)} as far as I can throw them.`, `${nm(X)} is playing everyone. Watch them.`]));
      if (P(X).stats.wins) return R(`${nm(X)} is a challenge threat. That’s all I know for sure.`);
      return R(`${nm(X)} is hard to read. I haven’t figured them out yet.`);
    }
    case 'ask_vote': return replyTo(botId, 'who');
    case 'ask_allies': {
      const close = aliveBots().filter((k) => k.id !== botId).sort((x, y) => s.trust[botId][y.id] - s.trust[botId][x.id]).slice(0, 2);
      if (honest && close.length) return R(`I’m closest with ${close.map((k) => k.name).join(' and ')}. And you, if you want in.`);
      return R('I’m keeping it loose. Talking to everyone. It’s safer that way.');
    }
    case 'ally': return replyTo(botId, 'ally');
    case 'trust_q': return replyTo(botId, 'trust');
    case 'loyalty':
      adjTrust(botId, H, 0.05 + b.t.loyal * 0.05);
      return R(tr > 0.1 ? pick(['Same. I’ve got yours.', 'That means a lot out here. Same to you.']) : pick(['We’ll see. Actions matter more than words.', 'Okay. Prove it at Tribal.']));
    case 'split': return replyTo(botId, 'split');
    case 'why': {
      const told = s.botTold[botId] ?? plan;
      if (told == null || told === H) return R('Just a feeling. It’s a game of instincts.');
      return R(reasonFor(botId, told));
    }
    case 'compliment':
      adjTrust(botId, H, 0.04);
      return R(pick(['Ha, thanks. You too.', 'Appreciate that. Don’t tell anyone I’m good though.', 'Stop, you’re going to make me a target.']));
    case 'greeting':
      adjTrust(botId, H, 0.02);
      return R(pick(['Hey! What’s up?', 'Oh hey. Walk with me.', 'Hey. Got a minute? We should talk.']), [
        { label: 'Who are you voting for?', fx: () => replyTo(botId, 'who') },
        { label: 'Want to work together?', fx: () => replyTo(botId, 'ally') },
      ]);
    case 'challenge_talk': {
      const w = s.lastWinner != null ? P(s.lastWinner) : null;
      if (w && w.id === botId) return R('Feels good to have the necklace. Now I get to watch everyone scramble.');
      if (w && w.id === H) return R('You were a beast today. People noticed, though. Be careful.');
      return R(w ? `${w.name} was unreal today. That’s a problem for all of us.` : 'Brutal challenge. My arms are dead.');
    }
    case 'camp_talk':
      adjTrust(botId, H, 0.02);
      return R(pick(['I’m so hungry I’d eat a hermit crab raw.', 'The rain last night was brutal. I didn’t sleep at all.', 'If I see one more grain of rice I’m going to lose it.']));
    default: {
      const d = perceivedDanger(botId);
      const lead = d > 0.45 ? 'Sorry, I’m distracted. I think my name is out there.' : pick(['I’m not sure I follow.', 'Hm. What are you getting at?', 'Okay... what do you mean?']);
      return R(lead, [
        { label: 'Who are you voting for?', fx: () => replyTo(botId, 'who') },
        { label: 'Want to work together?', fx: () => replyTo(botId, 'ally') },
        { label: 'Can I trust you?', fx: () => replyTo(botId, 'trust') },
      ]);
    }
  }
}

/** If the bot just asked a question with quick replies, a typed yes/no/maybe/name answers it. */
export function matchOption(text, options) {
  if (!options?.length) return null;
  const t = text.toLowerCase().trim();
  const byLabel = options.find((o) => t.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(t));
  if (byLabel && t.length > 1) return byLabel;
  const named = options.find((o) => alive().some((p) => p.name.toLowerCase() === o.label.toLowerCase() && t.includes(p.name.toLowerCase())));
  if (named) return named;
  if (/^(yes|yeah|yep|yup|sure|ok|okay|deal|i'?m in|in|absolutely|definitely|for sure|sounds good|let'?s do it)\b/.test(t)) return options.find((o) => /yes|in\b|deal/i.test(o.label)) || options[0];
  if (/^(maybe|not sure|idk|i don'?t know|possibly|let me think|we'?ll see)\b/.test(t)) return options.find((o) => /maybe|not sure|let'?s see|think/i.test(o.label)) || null;
  if (/^(no|nope|nah|no way|not)\b/.test(t)) return options.find((o) => /^no|not /i.test(o.label)) || null;
  return null;
}


// ------------------------------------------------------------------
// Group chats: everyone in the group hears everything.
// ------------------------------------------------------------------
export const GROUP_PRESETS = [
  { id: 'g_who', text: 'Who are we voting for tonight?' },
  { id: 'g_vote', text: 'Let’s all vote {X}.', needs: 'target' },
  { id: 'g_ally', text: 'Are we a team? All the way to the end?' },
  { id: 'g_trust', text: 'Can we all trust each other?' },
];

const plain = (r) => (typeof r === 'string' ? r : r?.text || '...').replace(/\s*You good with that\?$/, '.').replace(/\s*Which one are you taking\?$/, '');

/** Returns [{from, text}] in speaking order. Effects on trust and plans are applied. */
export function groupReply(members, presetId, target, text) {
  const s = S();
  const out = [];
  const raw = [];
  const say = (from, t) => {
    // Nobody repeats the person before them word for word.
    const dup = raw.findIndex((x) => x.t === t);
    if (dup >= 0) t = pick([`What ${nm(raw[dup].from)} said.`, 'Same, honestly.', `I’m with ${nm(raw[dup].from)} on that.`]);
    raw.push({ from, t });
    out.push({ from, text: voice(from, t) });
  };
  const ids = shuffle(members.filter((m) => P(m).alive));
  switch (presetId) {
    case 'g_who':
      for (const m of ids) {
        const plan = s.plan[m];
        if (plan == null || plan === H || members.includes(plan)) say(m, pick(['Let’s figure it out together.', 'I’m open. Who are you two thinking?', 'I don’t want to say it out loud yet.']));
        else if (s.trust[m][H] + P(m).t.honesty * 0.5 > 0.35) { say(m, `I’m thinking ${nm(plan)}.`); s.botTold[m] = plan; }
        else say(m, 'Still deciding. I want to hear everyone first.');
      }
      break;
    case 'g_vote': {
      if (members.includes(target)) {
        adjTrust(target, H, -0.45);
        say(target, pick(['Uh, I’m RIGHT HERE.', 'Wow. In front of me? Really?']));
        for (const m of ids) if (m !== target) say(m, pick(['...Awkward.', 'Okay, that was bold.']));
        break;
      }
      let yes = 0;
      for (const m of ids) {
        s.promises[m] = target;
        const r = plain(replyTo(m, 'voteout', target));
        say(m, r);
        if (s.plan[m] === target) yes++;
      }
      // Hearing the group agree pulls everyone in.
      if (yes >= Math.ceil(ids.length / 2)) {
        for (const m of ids) { s.influence[m][target] += 0.25; for (const k of ids) if (k !== m) adjTrust(m, k, 0.05); }
        computePlans();
        const holdouts = ids.filter((m) => s.plan[m] !== target);
        for (const m of holdouts) say(m, `Fine. If everyone’s on ${nm(target)}, I’m in.`);
        for (const m of ids) if (s.plan[m] === target) backingVote(m, target);
      }
      break;
    }
    case 'g_ally':
      for (const m of ids) {
        const r = plain(replyTo(m, 'ally'));
        say(m, r);
        if (s.allied[m][H]) for (const k of ids) if (k !== m && s.allied[k][H]) { s.allied[m][k] = s.allied[k][m] = true; adjTrust(m, k, 0.1); }
      }
      break;
    case 'g_trust':
      for (const m of ids) say(m, plain(replyTo(m, 'trust')));
      break;
    default:
      for (const m of ids.slice(0, 2)) say(m, plain(chatReply(m, text || '')));
      if (ids.length > 2) say(ids[2], pick(['Agreed.', 'Same.', 'Mm-hm.', 'Yeah, I’m with that.']));
  }
  return out;
}

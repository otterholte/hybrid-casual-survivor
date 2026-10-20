// Understands typed messages and answers from the bot's real game state and memory (mind.js).
// The reply also records what the human said, and what the bot "said" it would do; both feed votes.
import { game, P, nm, alive, aliveBots, adjTrust } from './state.js';
import { candidates, computePlans, replyTo, backingVote, perceivedDanger } from './ai.js';
import { mind, note, facts, thisRound, fresh, reasonsAgainst, reasonsToKeep, recordHuman, humanSaidVote, markAsked, wasAsked, pronoun, partnerOf } from './mind.js';
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
export const voice = (b, text) => {
  if (!chance(0.3) || /^(Honestly|Look|Okay|Real talk|Hm|Ha|Between|Listen|Logically|I mean|So,)\b/.test(text)) return text;
  const lead = pick(VOICE[P(b).arch] || ['Hm.']);
  // After "Okay so," the sentence continues, so drop its capital (but not for "I" or a name).
  const keepCap = /^I\b|^I[’']/.test(text) || alive().some((p) => text.startsWith(p.name));
  const body = /[,:]$/.test(lead) && !keepCap ? text[0].toLowerCase() + text.slice(1) : text;
  return `${lead} ${body}`;
};

/** Finds every living castaway named in the text (other than the bot being spoken to, unless that's the only name). */
export function namesIn(text, botId) {
  const low = ` ${text.toLowerCase()} `;
  const found = alive().filter((p) => !p.human && new RegExp(`[^a-z]${p.name.toLowerCase()}[^a-z]`).test(low)).map((p) => p.id);
  const others = found.filter((id) => id !== botId);
  return others.length ? others : found;
}

const has = (re, t) => re.test(t);

/** The castaway this conversation is currently about: the last one named in the recent thread, else whoever the bot pitched. */
function topicOf(thread, botId, gender = null) {
  for (const m of (thread || []).slice(-6).reverse()) {
    const id = namesIn(m.text || '', botId).find((k) => k !== botId && (!gender || P(k).look?.gender === gender));
    if (id != null) return id;
  }
  if (gender) return topicOf(thread, botId);
  const told = S().botTold[botId];
  return told != null && told !== H && P(told).alive ? told : null;
}

const PRONOUN = /\b(him|her|them|he|she|they|that one|that person|that guy|that girl)\b/;
const NUMBERS = /((have|got|has|get) (the|enough|any|other|more|any other) (votes|numbers|people)|enough (votes|people|numbers)|(the )?numbers (there|good|on your side|looking)|are the numbers|how are the numbers|do we have (it|enough|them|the votes|the numbers)|make sure we have|is it (locked|locked in|happening|going down|a done deal)|who('s| is) (with|voting with|on board with|on) you\b|who('s| is) on your side|who('s| is) in( on (it|this|that))?\??$|who('s| is) on board|who else|who('s| is| are) (all )?voting (for|with)|how many (votes|people|of us)|who all is in|count(ing)? (votes|heads)|other votes|more votes)/;
const BADMOUTH = /(cagey|sketchy|shady|wild ?card|snake|dangerous|can't (be )?trust|cannot trust|untrustworthy|lying|\bliar\b|playing (everyone|both sides|us)|too close|power couple|annoying|lazy|\bweak\b|has an idol|sneaky|\bfake\b|two[- ]faced|running (things|the game|this)|in control|big threat|a threat|so strong|too strong|keeps winning|can't be trusted|is bad news|is trouble|is a problem|is playing hard|bossy)/;

/** Strategy talk the small-talk model must never answer (it isn't allowed to mention votes). */
export const isGameTalk = (text) => /\b(vot\w*|numbers|target\w*|blindside\w*|flip\w*|idol\w*|alliance\w*|majority|on board|go(ing)? home|send \w+ home|boot\w*|threat|tribal|final (two|2|three|3)|trust)\b/i.test(text)
  || namesIn(text, -1).length > 0;

export function understand(text, botId, thread) {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim();
  const names = namesIn(t, botId);
  // "vote for her", "what about him": follow-ups refer to whoever was just being discussed.
  const g = /\b(her|she)\b/.test(t) ? 'f' : /\b(him|he|his)\b/.test(t) ? 'm' : null;
  const X = names[0] ?? (PRONOUN.test(t) ? topicOf(thread, botId, g) : null);
  const I = (intent) => ({ intent, X, names, t, topic: X ?? topicOf(thread, botId) });
  if (has(/(you('re| are) (lying|a liar|a snake|fake|two[- ]faced)|you voted (for )?me|you wrote my name|backstab|betray)/, t) || (X == null && has(/\b(liar|snake)\b/, t))) return I('accuse');
  if (has(/\b(stupid|idiot|dumb|you suck|hate you|shut up|loser|clown)\b/, t)) return I('insult');
  if (has(/(don't vote (for )?me|keep me|save me|spare me|please don't|don't want to go home|don't send me home)/, t)) return I('dont_vote_me');
  if (has(/(who('s| is) (targeting|after|coming for|gunning for) me|who wants me (out|gone)|any(one|body) (targeting|after|coming (for|after)|gunning for) me|someone (after|coming for) me|is my name out|heard my name|my name (come|came) up)/, t)) return I('ask_target_me');
  if (has(/(are you (voting|writing|going) (for |after )?me|am i (safe|going home|the target|in danger|good)|is my name|vote me out)/, t)) return I('ask_vote_me');
  if (has(/(i (have|found|got) (an|the|a) (hidden )?idol|i'm holding (an|the) idol)/, t)) return I('idol_claim');
  if (has(/(do you have (an|the|a) idol|did you find (an|the|a) idol|who (has|found) (an|the|a) idol|anyone (find|found|have) (an|the|a) idol|got an idol)/, t)) return I('ask_idol');
  if (has(NUMBERS, t)) return I('ask_numbers');
  if (has(/(what have you heard|heard anything|what('s| is) (going on|the word|the latest|the gossip|the tea)|any (gossip|news|intel|info|tea)|anything i should know|what are (people|they) saying|what('s| is) everyone saying|what did \w+ (say|tell)|did \w+ say|has \w+ said|what('s| is) \w+ (saying|planning|thinking)|who('s| is) saying)/, t)) return I('ask_info');
  if (X != null && has(/(coming for you|targeting you|after you|said your name|wants you (out|gone)|gunning for you|voting (for )?you|wrote your name|out to get you)/, t)) return I('warn');
  if (X != null && has(/(i'm voting|i will vote|i'll vote|my vote is|i'm writing|i'm going with|i'm putting my vote|i'm in on|count me in|i'm still in|i'm with you on|i'll write)/, t)) return I('declare_vote');
  if (X == null && has(/^(i'm in|count me in|i'm still in|still in|i'm with you|deal|let's do it)\b/, t)) return { ...I('declare_vote'), X: topicOf(thread, botId) };
  if (X != null && has(/(^why\b|\bwhy (him|her|them|that|not)\b|why (would|do) you)/, t)) return I('why');
  if (X != null && has(/(keep \w+|rather not|leave \w+ alone|not \w+ (tonight|yet)|don't (want to )?vote \w+|protect \w+|\w+ is (with us|my person|solid|good)|i like \w+|i trust \w+)/, t) && !has(/(get \w+ out|vote \w+ out)/, t)) return I('protect');
  if (X != null && has(BADMOUTH, t)) return I('badmouth');
  if (X != null && has(/(what (do|did) you think (of|about)|how do you feel about|thoughts on|do you trust|opinion|what about|is \w+ (with you|trustworthy|a threat|loyal|safe)|how('s| is) \w+ playing)/, t)) return I('opinion');
  if (X != null && has(/(vote|out\b|go home|has to go|needs to go|blindside|get rid|target|cut|boot|send .* home|eliminate|take .* out|flip on|instead)/, t)) return I('propose_vote');
  if (has(/(who (are|r) (you|u) (voting|writing|thinking|going)|who('s| is) going home|who should go|your (vote|plan|target)|what('s| is) the plan|who do you want (out|gone)|who are we voting|who('s| is) the target|plan tonight|thinking tonight)/, t)) return I('ask_vote');
  if (has(/(who are you (working|close|closest|aligned|tight|tightest|allied) with|who('s| is) your closest|who('s| is) in your alliance|who do you trust|who are your people|who('s| is) your (ally|alliance|number one))/, t)) return I('ask_allies');
  if (has(/(alliance|work together|team up|final (two|2|three|3)|ride or die|partner up|stick together|join forces)/, t)) return I('ally');
  if (has(/(can i trust you|are we good|are you with me|you got my back|do you trust me|we cool)/, t)) return I('trust_q');
  if (has(/(i('ve| have) got your back|i('ll| will) protect you|you('re| are) safe with me|i won't vote (for )?you|i trust you|i'm with you|i'm loyal|you can trust me)/, t)) return I('loyalty');
  if (has(/\bsplit\b/, t)) return I('split');
  if (has(/^why\b|\bwhy (him|her|them|that)\b|why (would|do) you/, t)) return I('why');
  if (has(/((nice|great|good) (job|game|work|win|move)|you('re| are) (great|awesome|amazing|killing it|smart)|well played|respect)/, t)) return I('compliment');
  if (has(/^(hi|hey|hello|yo|sup|what's up|howdy|hiya)\b/, t)) return I('greeting');
  if (has(/(challenge|immunity|necklace|won today|lost today)/, t)) return I('challenge_talk');
  if (has(/(nervous|scared|worried|anxious|stressed|freaking out|bad feeling)/, t)) return I('nerves');
  if (has(/(how are you|how're you|how's it going|holding up|you ok\b|you okay|you good\b|how you doing|how are things|how's camp|how have you been|how you been)/, t)) return I('how_are_you');
  if (has(/(food|hungry|rice|fish|rain|sleep|tired|fire|shelter|water|starving|cold|bugs|sand)/, t)) return I('camp_talk');
  if (X != null) return I('opinion');
  return I('unknown');
}

export const FLAVOR_INTENTS = new Set(['greeting', 'compliment', 'insult', 'camp_talk', 'challenge_talk', 'nerves', 'how_are_you', 'unknown']);

/** Commits the bot to a vote it announced (only when it was telling the truth). */
function commit(botId, X) {
  const s = S();
  s.botTold[botId] = X;
  s.influence[botId][X] += 0.3;
  computePlans();
}

const top = (botId, X) => reasonsAgainst(botId, X)[0].text;
const honestWith = (botId) => S().trust[botId][H] + P(botId).t.honesty * 0.5 > 0.45;

/** What the bot tells you it has heard this round. Honest bots share real intel; others are vaguer. */
function shareIntel(botId, about) {
  const s = S(), honest = honestWith(botId);
  if (about != null && about !== H) {
    const said = facts(botId, (f) => thisRound(f) && f.src === about && f.kind === 'b_pitch').at(-1);
    if (said && honest) return `${nm(about)} told me ${pronoun(about)} wants ${said.target === H ? 'you' : nm(said.target)} out.`;
    if (said) return `${nm(about)} has been throwing names around. I’m not sure ${pronoun(about)} means any of them.`;
    const plan = s.plan[about];
    if (honest && plan != null && s.trust[about][botId] > 0.3) return `${nm(about)} hasn’t said it to me directly, but my read is ${plan === H ? 'you' : plan === botId ? 'me' : nm(plan)}.`;
    return `${nm(about)} has been quiet with me. That worries me more than if ${pronoun(about)} talked.`;
  }
  const enemies = aliveBots().filter((k) => k.id !== botId && s.plan[k.id] === H);
  if (enemies.length && honest) return `Your name is out there. ${pick(enemies).name} has been pushing it.`;
  const heard = facts(botId, (f) => thisRound(f) && f.kind === 'b_pitch' && f.target !== botId && f.src !== H && P(f.src).alive);
  if (heard.length && (honest || chance(0.5))) { const f = pick(heard); return `${nm(f.src)} pulled me aside earlier. ${cap(pronoun(f.src))} wants ${f.target === H ? 'you' : nm(f.target)} out.`; }
  const hunter = alive().filter((p) => p.id !== botId && p.id !== H).sort((x, y) => s.idolSusp[y.id] - s.idolSusp[x.id])[0];
  if (hunter && s.idolSusp[hunter.id] > 0.3) return `${hunter.name} keeps sneaking off. I’d bet on an idol.`;
  const pair = alive().map((p) => [p.id, partnerOf(p.id)]).find(([a, b]) => b != null && a !== H && b !== H && a !== botId && b !== botId);
  if (pair) return `${nm(pair[0])} and ${nm(pair[1])} are getting really tight. Keep an eye on that.`;
  return fresh(botId, ['Honestly? Quiet. Everybody’s playing it close today.', 'Nothing solid yet. People are scared to say names.']);
}
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * The reply to one typed message, as { text, options }.
 * Reads the whole situation: what you've told this castaway before, what it has heard from others,
 * the vote board, challenge wins and idol sightings.
 */
export function chatReply(botId, text, thread) {
  const u = understand(text, botId, thread);
  const r = asObj(coreReply(botId, text, thread, u));
  r.text = r.text.replace(/\s+/g, ' ').trim();
  if (r.about === undefined) r.about = u.X ?? (FLAVOR_INTENTS.has(u.intent) ? null : u.topic);
  if (!r.options?.length) r.options = followUps(botId, r, u);
  return r;
}

const asObj = (r) => (typeof r === 'string' ? { text: r } : { ...r });

function coreReply(botId, text, thread, u) {
  const s = S(), b = P(botId), tr = s.trust[botId][H], plan = s.plan[botId];
  const { intent, X, topic } = u;
  const honest = honestWith(botId);
  const R = (t, options) => ({ text: voice(botId, t), options, about: X ?? (FLAVOR_INTENTS.has(intent) ? null : topic) });
  const F = (lines) => fresh(botId, lines);
  note(botId, { src: H, kind: `h_asked_${intent}`, about: H, target: X });
  switch (intent) {
    case 'accuse': {
      adjTrust(botId, H, -0.1);
      const last = s.voteHistory.at(-1);
      if (last && last.votes[botId] === H) {
        if (b.t.honesty > 0.6) return R('...Okay. Yes. It was a numbers thing. I’m sorry. I’m with you now.');
        return R('What? No. I don’t know who wrote your name, but it wasn’t me.');
      }
      return R(F(['Whoa. Where is this coming from? I’ve been nothing but straight with you.', 'That’s a big accusation. I haven’t done anything to you.']));
    }
    case 'insult':
      adjTrust(botId, H, -0.18);
      s.influence[botId][H] += 0.15;
      computePlans();
      return R(F(['Wow. Okay. Noted.', 'Cool. Remember you said that.', 'That’s how you want to play it? Fine.']));
    case 'dont_vote_me': {
      const was = plan;
      s.influence[botId][H] -= 0.15 + Math.max(0, tr) * 0.4;
      computePlans();
      if (was === H && s.plan[botId] !== H) return R('...Okay. I hear you. Give me another name and I’ll push it.');
      if (was === H) return R(F(['I’m not making any promises right now.', 'It’s not personal. Let me think.']));
      return R('Relax. I’m not voting for you.');
    }
    case 'ask_vote_me': {
      if (plan === H) {
        if (b.t.honesty > 0.8 && tr > 0.3) return R(`...Honestly? Your name came up. ${top(botId, H)}`);
        const decoy = pick(candidates(botId, [H]));
        if (decoy != null) s.botTold[botId] = decoy;
        return R(`No! Why would I? I’m thinking ${decoy != null ? nm(decoy) : 'someone else'}.`);
      }
      if (honest && plan != null) { commit(botId, plan); return R(`No. You’re good tonight. I’m going ${nm(plan)}. ${top(botId, plan)}`); }
      return R('No. You’re fine. Relax.');
    }
    case 'ask_target_me': {
      const enemies = aliveBots().filter((k) => k.id !== botId && s.plan[k.id] === H);
      if (enemies.length && honest) { adjTrust(botId, H, 0.03); const k = pick(enemies); return R(`I’ll tell you because I like you. ${k.name} has been saying your name. ${reasonWhyTheyWant(k.id)}`); }
      if (enemies.length && chance(0.4)) { const lie = pick(aliveBots().filter((k) => k.id !== botId)); return R(`I heard ${lie.name} mention you. Could be nothing.`); }
      return R('I haven’t heard your name. Honestly.');
    }
    case 'ask_info': return R(shareIntel(botId, X));
    case 'idol_claim': return replyTo(botId, 'idol');
    case 'ask_idol': {
      if (b.idols) return b.t.honesty > 0.8 && tr > 0.4 ? R('...Maybe. And that stays between us.') : R(F(['No. I wish.', 'Ha. No. I’ve looked though.']));
      const sus = alive().filter((p) => p.id !== botId && p.id !== H).sort((x, y) => s.idolSusp[y.id] - s.idolSusp[x.id])[0];
      if (sus && s.idolSusp[sus.id] > 0.25) return R(`Not me. But I’d bet ${sus.name} has one. ${cap(pronoun(sus.id))} keeps disappearing.`);
      return R('Not me. I haven’t heard of anyone finding one yet.');
    }
    case 'warn': {
      note(botId, { src: H, kind: 'targeting_me', about: X });
      return replyTo(botId, 'warn', X);
    }
    case 'declare_vote': {
      if (X == null) return R('In on what? Give me a name.');
      if (X === botId) { adjTrust(botId, H, -0.4); return R('You’re voting for ME? Good to know.'); }
      if (X === H) return R('Ha. Okay, funny.');
      const flip = recordHuman(botId, 'h_vote', X);
      s.promises[botId] = X;
      const callout = flip && flip.flipped !== X ? `Earlier you said ${nm(flip.flipped)}. Now it’s ${nm(X)}? ` : '';
      if (callout) adjTrust(botId, H, -0.04);
      if (plan === X) { adjTrust(botId, H, 0.1); commit(botId, X); return R(`${callout}Good. Then we’re together on ${nm(X)}. That’s my vote too.`); }
      if (s.allied[botId][X] || s.trust[botId][X] > 0.45) { adjTrust(botId, H, -0.08); return R(`${callout}Wow. ${nm(X)} is my person, so... noted.`); }
      s.influence[botId][X] += 0.25 + Math.max(0, tr) * 0.6;
      computePlans();
      if (s.plan[botId] === X) { commit(botId, X); return R(`${callout}You know what? I could do ${nm(X)}. ${top(botId, X)} Count me in.`); }
      return R(`${callout}${nm(X)}. Interesting. I’m leaning ${plan != null && plan !== H ? nm(plan) : 'elsewhere'}, but keep talking.`);
    }
    case 'propose_vote': {
      if (X === H) return R('Vote YOU out? Bold pitch.');
      recordHuman(botId, 'h_pitch', X);
      const r = replyTo(botId, 'voteout', X);
      if (s.plan[botId] === X) { commit(botId, X); return { ...r, text: `${r.text} ${top(botId, X)}` }; }
      return r;
    }
    case 'badmouth': {
      recordHuman(botId, 'h_pitch', X);
      if (X === botId) return R('Wow. Okay. You know I can hear you, right?');
      const keep = reasonsToKeep(botId, X);
      if (keep.length && (s.allied[botId][X] || s.trust[botId][X] > 0.4)) {
        s.influence[botId][X] += 0.05;
        computePlans();
        return R(`I don’t see it. ${keep[0]}`);
      }
      s.influence[botId][X] += 0.15 + Math.max(0, tr) * 0.3;
      computePlans();
      const why = reasonsAgainst(botId, X)[0];
      if (s.plan[botId] === X || why.w > 0.5) return R(`Agreed. ${why.text} Want to write ${pronoun(X, 'obj')} down tonight?`, [
        { label: `Yes, ${nm(X)} tonight`, fx: () => chatReply(botId, `I'm in on ${nm(X)}`, thread) },
        { label: 'Who else is on board?', fx: () => chatReply(botId, 'Who else is on board?', thread) },
        { label: 'Not yet', fx: () => 'Okay. Just don’t wait too long.' },
      ]);
      return R(why.w > 0.3 ? `Maybe. ${why.text}` : `Huh. I haven’t seen that from ${nm(X)}. What makes you say it?`);
    }
    case 'protect': {
      recordHuman(botId, 'h_protect', X);
      if (X === botId) return R('Thanks. I like being kept.');
      s.influence[botId][X] -= 0.15 + Math.max(0, tr) * 0.3;
      computePlans();
      if (plan === X && s.plan[botId] !== X) {
        const next = s.plan[botId];
        return R(next != null && next !== H ? `Okay, I’ll lay off ${nm(X)}. Then I’m looking at ${nm(next)}. ${top(botId, next)}` : `Okay. Then who? I need a name.`);
      }
      if (plan === X) return R(`I hear you, but ${top(botId, X).replace(/^./, (c) => c.toLowerCase())}`);
      return R(`${nm(X)}? Yeah, I’m not coming for ${pronoun(X, 'obj')}. ${plan != null && plan !== H ? `I’m on ${nm(plan)}.` : ''}`);
    }
    case 'opinion': {
      if (X === botId) return R('Me? I think I’m playing a pretty good game, thanks.');
      if (X === H) return R(tr > 0.3 ? 'You? You’re one of the few people I actually trust.' : 'You’re hard to read. I’m still figuring you out.');
      const t = s.trust[botId][X];
      const why = reasonsAgainst(botId, X)[0];
      if (plan === X && (honest || chance(0.3))) return R(`Honestly? ${nm(X)} needs to go. ${why.text}`);
      if (s.allied[botId][X]) return R(`${nm(X)} is solid. That’s one of my people.`);
      if (t > 0.3) return R(F([`I like ${nm(X)}. Good person, decent player.`, `${nm(X)}? We’re good. I trust ${pronoun(X, 'obj')}.`]));
      if (why.w >= 0.4) return R(`${nm(X)}? ${why.text}`);
      if (t < -0.1) return R(F([`I don’t trust ${nm(X)} as far as I can throw ${pronoun(X, 'obj')}.`, `${nm(X)} is playing everyone. Watch ${pronoun(X, 'obj')}.`]));
      return R(`${nm(X)} is hard to read. I haven’t figured ${pronoun(X, 'obj')} out yet.`);
    }
    case 'ask_vote': return replyTo(botId, 'who');
    case 'ask_numbers': return replyTo(botId, 'numbers', X);
    case 'ask_allies': {
      const close = aliveBots().filter((k) => k.id !== botId).sort((x, y) => s.trust[botId][y.id] - s.trust[botId][x.id]).slice(0, 2);
      if (honest && close.length) return R(`I’m closest with ${close.map((k) => k.name).join(' and ')}. And you, if you want in.`);
      return R('I’m keeping it loose. Talking to everyone. It’s safer that way.');
    }
    case 'ally': return replyTo(botId, 'ally');
    case 'trust_q': return replyTo(botId, 'trust');
    case 'loyalty':
      recordHuman(botId, 'h_loyal', botId);
      adjTrust(botId, H, 0.05 + b.t.loyal * 0.05);
      return R(tr > 0.1 ? F(['Same. I’ve got yours.', 'That means a lot out here. Same to you.']) : F(['We’ll see. Actions matter more than words.', 'Okay. Prove it at Tribal.']));
    case 'split': return replyTo(botId, 'split');
    case 'why': {
      const who = X ?? s.botTold[botId] ?? plan;
      if (who == null || who === H) return R('Just a feeling. It’s a game of instincts.');
      if (X != null && plan !== X && s.botTold[botId] !== X) {
        const keep = reasonsToKeep(botId, X);
        return R(keep.length ? keep[0] : `I’m not set on ${nm(X)}. ${plan != null && plan !== H ? `I’m more worried about ${nm(plan)}. ${top(botId, plan)}` : 'I’m still working out where everyone is.'}`);
      }
      const rs = reasonsAgainst(botId, who);
      return R(rs.slice(0, rs[1]?.w > 0.35 ? 2 : 1).map((x, i) => (i ? x.text[0].toLowerCase() + x.text.slice(1) : x.text)).join(' Plus, '));
    }
    case 'compliment':
      adjTrust(botId, H, 0.04);
      return R(F(['Ha, thanks. You too.', 'Appreciate that. Don’t tell anyone I’m good though.', 'Stop, you’re going to make me a target.']));
    case 'greeting':
      adjTrust(botId, H, 0.02);
      return R(F(['Hey! What’s up?', 'Oh hey. Walk with me.', 'Hey. Got a minute? We should talk.']));
    case 'challenge_talk': {
      const w = s.lastWinner != null ? P(s.lastWinner) : null;
      if (w && w.id === botId) return R('Feels good to have the necklace. Now I get to watch everyone scramble.');
      if (w && w.id === H) return R('You were a beast today. People noticed, though. Be careful.');
      return R(w ? `${w.name} was unreal today. ${w.stats.wins > 1 ? `That’s ${w.stats.wins} wins. ` : ''}That’s a problem for all of us.` : 'Brutal challenge. My arms are dead.');
    }
    case 'nerves': {
      const d = perceivedDanger(botId);
      if (d > 0.45) return R(F(['Honestly? Yeah. I think my name is out there.', 'Very. Something feels off for me today.']));
      return R(F(['Everybody’s nervous. Anyone who says they’re not is lying.', 'A little. Tribal always makes my stomach flip.', 'I’m okay. I just want tonight to be over.']));
    }
    case 'how_are_you': {
      adjTrust(botId, H, 0.02);
      const d = perceivedDanger(botId);
      if (b.immune) return R(F(['Honestly? Great. Nobody can touch me tonight.', 'Best I’ve felt all game. This necklace is heavy in the best way.']));
      if (d > 0.5) return R(F(['Not great. I’ve got a bad feeling my name is out there.', 'Honestly? Nervous. People have been weird with me today.']));
      if (s.lastWinner === botId) return R('Tired, but winning that challenge helped.');
      return R(F(['Hungry, tired, still here. That’s a win out here.', 'Surviving. My back hates that shelter.', 'Pretty good actually. The ocean fixes everything.', 'Rough night, but I’m hanging in.']));
    }
    case 'camp_talk':
      adjTrust(botId, H, 0.02);
      return R(F(['I’m so hungry I’d eat a hermit crab raw.', 'The rain last night was brutal. I didn’t sleep at all.', 'If I see one more grain of rice I’m going to lose it.']));
    default: {
      // Strategy we couldn't parse: answer with where this castaway actually stands, not a shrug.
      if (isGameTalk(text)) {
        if (topic != null && topic !== H && topic !== botId) {
          const why = reasonsAgainst(botId, topic)[0];
          if (plan === topic) return R(`If you’re asking about ${nm(topic)}: I’m on ${pronoun(topic, 'obj')}. ${why.text}`);
          return R(`If you’re asking about ${nm(topic)}: ${why.w > 0.4 ? why.text : `I’m not there yet.`} ${plan != null && plan !== H ? `Right now I’m leaning ${nm(plan)}.` : ''}`);
        }
        const r = replyTo(botId, 'who');
        return { ...r, text: `${F(['Here’s where I’m at.', 'Okay, real talk.', 'Let me be clear.'])} ${r.text}` };
      }
      const d = perceivedDanger(botId);
      return R(d > 0.45 ? 'Sorry, I’m distracted. I think my name is out there.' : F(['I’m not sure I follow.', 'Hm. What are you getting at?', 'Okay... what do you mean?']));
    }
  }
}

/** Why bot k wants the human out, as the bot telling you would put it. */
function reasonWhyTheyWant(k) {
  const r = reasonsAgainst(k, H)[0];
  if (r.text.startsWith('Honestly')) return '';
  return `From what I hear, it’s ${/won/.test(r.text) ? 'your challenge wins' : /jungle/.test(r.text) ? 'all your trips into the jungle' : /likes you/.test(r.text) ? 'that everyone likes you' : /too close/.test(r.text) ? 'who you’re close with' : /wrote my name|coming for/.test(r.text) ? 'payback' : 'trust'}.`;
}

/**
 * Quick replies that fit whatever was just said: the castaway being discussed, what you haven't
 * asked yet this round, and where the conversation is going. Each is a full sentence the engine
 * understands, so picking one is the same as typing it.
 */
export function followUps(botId, reply, u) {
  const s = S(), plan = s.plan[botId];
  const thread = s.threads?.[botId];
  const say = (label) => ({ label, fx: () => chatReply(botId, label, s.threads?.[botId] ?? thread) });
  const mentioned = namesIn(reply.text || '', botId).filter((k) => k !== botId && P(k).alive && !P(k).human);
  const about = reply.about != null && reply.about !== H && reply.about !== botId && P(reply.about).alive ? reply.about : null;
  const X = about ?? mentioned[0] ?? null;
  const asked = (intent) => facts(botId, (f) => thisRound(f) && f.kind === `h_asked_${intent}`).length > 0;
  const out = [];
  if (X != null) {
    const iSaid = humanSaidVote(botId);
    if (plan === X || s.botTold[botId] === X) {
      if (iSaid !== X) out.push(say(`I'm in on ${nm(X)}`));
      out.push(say('Who else is on board?'));
      out.push(say(`Why ${nm(X)}?`));
    } else {
      out.push(say(`Let's vote ${nm(X)} out`));
      out.push(say(`Why not ${nm(X)}?`));
      if (plan != null && plan !== H && plan !== X) out.push(say(`What about ${nm(plan)}?`));
      else out.push(say('Who are you thinking tonight?'));
    }
  }
  const generic = [
    !asked('ask_vote') && 'Who are you thinking tonight?',
    !asked('ask_numbers') && 'Do you have the votes?',
    !asked('ask_info') && 'What have you heard?',
    !asked('ask_target_me') && 'Is anyone coming for me?',
    !asked('trust_q') && 'Can I trust you?',
    !s.allied[botId][H] && !asked('ally') && 'Want to work together?',
  ].filter(Boolean);
  for (const g of generic) if (out.length < 3 && !out.some((o) => o.label === g)) out.push(say(g));
  return out.slice(0, 3);
}

/** What a group chat member takes in, even if they don't reply. */
export function hear(botId, text, thread) {
  const u = understand(text, botId, thread);
  if (u.intent === 'declare_vote' && u.X != null && u.X !== botId) { recordHuman(botId, 'h_vote', u.X); S().promises[botId] = u.X; }
  if ((u.intent === 'propose_vote' || u.intent === 'badmouth') && u.X != null) recordHuman(botId, 'h_pitch', u.X);
  return u;
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
export function groupReply(members, presetId, target, text, thread) {
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
    default: {
      // Everyone hears it; the two with the most to say answer, and they answer from their own heads.
      for (const m of ids) hear(m, text || '', thread);
      const talkers = ids.slice().sort((a, b) => Math.abs(s.trust[b][H]) + P(b).t.social - Math.abs(s.trust[a][H]) - P(a).t.social).slice(0, 2);
      for (const m of talkers) say(m, plain(chatReply(m, text || '', thread)));
      if (ids.length > 2) {
        const rest = ids.find((m) => !talkers.includes(m));
        const r = plain(chatReply(rest, text || '', thread));
        say(rest, r.length < 90 ? r : pick(['Mm-hm.', 'Yeah, I’m with that.', 'I want to think about it.']));
      }
    }
  }
  return out;
}

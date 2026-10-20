// Final Tribal Council: the jury's questions, answer options written from your actual game, and a
// judge that scores any answer (picked or typed) against what really happened.
import { game, P, nm } from './state.js';
import { facts } from './mind.js';
import { pick, shuffle, clamp } from './util.js';

const S = () => game.S;
const H = 0;

// ------------------------------------------------------------------
// Your record, as the jury remembers it
// ------------------------------------------------------------------
export function record() {
  const s = S(), me = P(H);
  const votes = s.voteHistory.filter((v) => v.votes[H] != null).map((v) => ({ day: v.day, target: v.votes[H], out: v.out }));
  const hits = votes.filter((v) => v.target === v.out);
  // Your best move: the biggest threat you helped vote out.
  const weight = (id) => P(id).stats.wins * 2 + P(id).stats.correctVotes + (P(id).idols ? 2 : 0) + (P(id).t.strategic > 0.7 ? 1 : 0);
  const bigMove = hits.slice().sort((a, b) => weight(b.out) - weight(a.out))[0] || null;
  const liedTo = s.players.filter((p) => !p.human && facts(p.id, (f) => f.kind === 'lied_to_me' && f.about === H).length).map((p) => p.id);
  const allies = s.players.filter((p) => !p.human && s.allied[H][p.id]).map((p) => p.id);
  return { me, votes, hits, bigMove, liedTo, allies, wins: me.stats.wins, idolSaves: me.stats.idolSaves, idolsFound: me.stats.idolsFound, betrayals: me.stats.betrayals, votesAgainst: me.stats.votesAgainst };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------
// Questions: jurors ask about their own experience with you first
// ------------------------------------------------------------------
export function juryQuestion(j, target, finalists) {
  const s = S(), rec = target === H ? record() : null;
  const other = finalists.find((f) => f !== target);
  const qs = [];
  if (target === H) {
    const votedMe = s.voteHistory.some((v) => v.out === j && v.votes[H] === j);
    if (rec.liedTo.includes(j)) qs.push({ kind: 'betrayal', w: 3, q: 'You told me you were with me, then you wrote a different name. Why should I reward that?' });
    if (votedMe) qs.push({ kind: 'why_me', w: 2.6, q: 'You wrote my name down. Tell me why.' });
    if (rec.wins >= 2) qs.push({ kind: 'challenges', w: 1.2, q: `You won ${plural(rec.wins, 'immunity')}. Was that your whole game?` });
    if (rec.wins === 0) qs.push({ kind: 'no_wins', w: 1, q: 'You never won immunity. How did you survive this long?' });
    if (rec.idolSaves || rec.idolsFound) qs.push({ kind: 'idol', w: 1.3, q: 'Tell me about that idol. Was it luck or strategy?' });
  }
  qs.push({ kind: 'move', w: 1, q: 'Name one move you made that changed this game.' });
  qs.push({ kind: 'lie', w: 0.9, q: 'Did you ever lie to my face? Be honest.' });
  qs.push({ kind: 'deserve', w: 1, q: `Why do you deserve this more than ${other != null ? nm(other) : 'the person next to you'}?` });
  qs.push({ kind: 'threat', w: 0.8, q: 'Who was your biggest threat, and what did you do about it?' });
  qs.push({ kind: 'low', w: 0.6, q: 'What was your lowest moment out here?' });
  qs.push({ kind: 'regret', w: 0.6, q: 'If you could take back one thing from this game, what would it be?' });
  const total = qs.reduce((a, q) => a + q.w * (0.6 + Math.random()), 0);
  return qs.map((q) => ({ ...q, r: q.w * (0.6 + Math.random()) })).sort((a, b) => b.r - a.r)[0] || qs[0] || { kind: 'move', q: 'Make your case.', total };
}

// ------------------------------------------------------------------
// Answer options, written from your record for the exact question
// ------------------------------------------------------------------
export function ftcOptions(kind, ctx = {}) {
  const rec = record(), s = S();
  const j = ctx.asker, other = ctx.other;
  const jn = j != null ? nm(j) : 'you';
  const move = rec.bigMove ? `voting out ${nm(rec.bigMove.out)} on Day ${rec.bigMove.day}` : null;
  const winsLine = rec.wins ? `I won ${plural(rec.wins, 'immunity')}` : null;
  const opts = [];
  const o = (tag, text) => opts.push({ label: `${tag}: "${text}"`, text });
  switch (kind) {
    case 'opening':
      o('Own it', `${move ? `I made the moves. ${cap(move)} was mine.` : 'I played hard every single day.'} ${winsLine ? `${winsLine} when it counted.` : ''} I didn’t ride anyone’s coattails.`.replace(/\s+/g, ' '));
      o('Loyalty', rec.betrayals ? 'I made some hard calls, but the people I was truly with, I never turned on.' : 'I kept my word to the people I was with, every single vote.');
      o('Bonds', `I built real relationships out here${rec.allies.length ? `, with ${rec.allies.slice(0, 2).map(nm).join(' and ')} most of all` : ''}. That’s why I’m sitting here.`);
      break;
    case 'why_me':
      o('Strategy', `You were a threat, ${jn}. If I didn’t make that move when I did, you’d have taken me out next.`);
      o('Apologize', `I’m sorry, ${jn}. It was one of the hardest votes I cast. It was never personal.`);
      o('Numbers', 'The numbers were already against you. I could join them or go home with you.');
      break;
    case 'betrayal':
      o('Own it', `I did tell you that, and I changed my vote. The game shifted and I had to protect myself. I own that.`);
      o('Apologize', `You’re right, ${jn}, and I’m sorry. You deserved the truth from me, and I didn’t give it to you.`);
      o('Deflect', 'Everyone was making promises out here. I just did what I had to do.');
      break;
    case 'move':
      if (move) o('Big move', `${cap(move)}. ${P(rec.bigMove.out).stats.wins ? `${nm(rec.bigMove.out)} had ${plural(P(rec.bigMove.out).stats.wins, 'immunity win')} and would’ve won this.` : 'Nobody saw it coming until the votes were read.'}`);
      if (rec.idolSaves) o('Idol', 'Playing my idol at exactly the right Tribal. That saved my game.');
      if (rec.wins) o('Challenges', `${winsLine}. Every one came when I was on the chopping block.`);
      o('Social', 'Keeping everyone comfortable with me. People told me things because they trusted me.');
      if (rec.hits.length >= 2) o('Numbers', `I was on the right side of ${rec.hits.length} of ${rec.votes.length} votes. That’s not luck.`);
      break;
    case 'lie':
      if (rec.betrayals) {
        o('Admit it', `Yes. I lied ${rec.liedTo.length ? `to ${rec.liedTo.slice(0, 2).map(nm).join(' and ')}` : 'more than once'}. It was strategy, never personal.`);
        o('Partly', 'Once or twice, when my back was against the wall. I’m not proud of it.');
        o('Deny', 'No. I never lied to anyone out here.');
      } else {
        o('Honest', 'No. Every promise I made out here, I kept.');
        o('Nuance', 'I kept things from people sometimes, but I never told anyone a straight lie.');
        o('Joke', 'Only about how much rice I ate.');
      }
      break;
    case 'deserve': {
      const op = other != null ? P(other) : null;
      if (op && rec.wins > op.stats.wins) o('Challenges', `I won ${plural(rec.wins, 'immunity')}; ${op.name} won ${op.stats.wins}. I earned my seat.`);
      if (op && rec.hits.length > op.stats.correctVotes) o('Strategy', `I was on the right side of more votes than ${op.name}. I was running this, not following.`);
      if (op && op.stats.betrayals > rec.betrayals) o('Integrity', `I kept my word more than ${op.name} did. You all know that.`);
      o('Own game', `I made my own decisions${op ? `. ${op.name} rode other people’s plans` : ''}.`);
      o('Bonds', 'Because I actually connected with every one of you, and I played a game I can be proud of.');
      break;
    }
    case 'threat': {
      const t = rec.bigMove?.out;
      if (t != null) o('Took the shot', `${nm(t)}. I got ${pronounObj(t)} out on Day ${rec.bigMove.day} before ${pronounSubj(t)} could take over.`);
      const champ = s.players.filter((p) => !p.human).sort((a, b) => b.stats.wins - a.stats.wins)[0];
      if (champ && champ.id !== t) o('Respect', `${champ.name}. ${champ.stats.wins ? `${plural(champ.stats.wins, 'immunity win')}.` : ''} I kept ${pronounObj(champ.id)} close until I couldn’t.`);
      o('Myself', 'Honestly? Myself. My biggest threat was getting paranoid and making a dumb move.');
      break;
    }
    case 'challenges':
      o('More than that', `The wins kept me safe, but I was also on the right side of ${rec.hits.length} votes. I was playing every angle.`);
      o('Proud', 'Yes, and I’m proud of it. When my back was against the wall, I won.');
      o('Social', 'No. Winning just gave me the freedom to build relationships without fear.');
      break;
    case 'no_wins':
      o('Social', 'By making sure nobody ever wanted me gone. That’s a skill too.');
      if (rec.hits.length >= 2) o('Strategy', `By always knowing where the votes were. I was right on ${rec.hits.length} of ${rec.votes.length}.`);
      else o('Under the radar', 'By never giving anyone a reason to write my name. That was the plan from day one.');
      if (rec.idolSaves) o('Idol', 'The idol. I found it, I played it at the right time, and I’m still here.');
      o('Grit', 'I fought every single day. Not winning a necklace doesn’t mean I didn’t compete.');
      break;
    case 'idol':
      o('Strategy', 'Strategy. I went looking when nobody was watching and played it at exactly the right Tribal.');
      o('Luck', 'Some luck, sure. But knowing when to play it, that was all me.');
      o('Humble', 'Honestly? Mostly luck. I just didn’t waste it.');
      break;
    case 'low':
      o('Votes', rec.votesAgainst ? `Hearing my name read ${plural(rec.votesAgainst, 'time')} at Tribal. I thought I was done.` : 'The night I thought my name was coming up. I didn’t sleep at all.');
      o('Hunger', 'Day after day of rice and rain. Some nights I just wanted to go home.');
      if (rec.betrayals) o('Guilt', 'The first time I broke my word to someone. That one stuck with me.');
      break;
    case 'regret':
      if (rec.liedTo.length) o('Apologize', `How I treated ${nm(rec.liedTo[0])}. ${cap(pronounSubj(rec.liedTo[0]))} deserved better from me.`);
      o('No regrets', 'Nothing. Every move got me to this seat.');
      o('Bigger', 'Not making a bigger move sooner. I played it too safe at times.');
      break;
    default:
      o('Own it', 'I played hard and I played to win.');
      o('Loyalty', 'I kept my word whenever I could.');
      o('Bonds', 'I built real bonds with every one of you.');
  }
  // Always three choices: top up with general answers that still fit any question.
  const extra = [['Own it', 'I played hard and I played to win, and every move I made got me to this seat.'], ['Bonds', 'I built real bonds with every one of you, even the people I had to vote out.'], ['Honest', 'I made mistakes out here, but I own every one of them.']];
  for (const [tag, text] of extra) if (opts.length < 3 && !opts.some((x) => x.label.startsWith(tag))) o(tag, text);
  return shuffle(opts).slice(0, 3);
}

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const pronounObj = (id) => (P(id).look?.gender === 'f' ? 'her' : 'him');
const pronounSubj = (id) => (P(id).look?.gender === 'f' ? 'she' : 'he');

// ------------------------------------------------------------------
// The judge: how each juror takes an answer (picked or typed)
// ------------------------------------------------------------------
const TONES = {
  strategic: /\b(move|moves|blindside\w*|strateg\w*|plan\w*|numbers|vot\w*|flip\w*|idol|outplay\w*|control\w*|orchestrat\w*|threat|play(ed)? (hard|to win)|took (the )?shot|my decision|calculated)\b/,
  loyal: /\b(loyal\w*|my word|promise\w*|honest\w*|kept|never lied|truth|ride or die|stuck with|integrity)\b/,
  social: /\b(friend\w*|bond\w*|relationship\w*|connect\w*|care\w*|family|trust\w*|love|respect|together|every one of you|people)\b/,
  humble: /\b(sorry|apologi\w*|regret\w*|mistake\w*|not proud|hurt|deserved better|my fault|forgive)\b/,
  hostile: /\b(stupid|idiot|dumb|bitter|deserved it|your own fault|get over it|whatever|shut up|loser|pathetic|clown)\b/,
};

export function judgeSpeech(text, ctx = {}) {
  const s = S(), rec = record();
  const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, "'")} `;
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  const has = (re) => re.test(t);
  const tone = Object.fromEntries(Object.entries(TONES).map(([k, re]) => [k, has(re)]));
  // Claims the jury knows are false.
  const lies = [];
  if (has(/\b(never lied|kept (my|every) (word|promise)|every promise|never broke)\b/) && rec.betrayals > 0) lies.push('loyal');
  if (has(/\bwon (\d+ |a |an |every |the )?(immunit\w*|challenge\w*|necklace\w*)\b/) && rec.wins === 0) lies.push('wins');
  if (has(/\b(played|found) (my|an|the) idol\b/) && !rec.idolsFound) lies.push('idol');
  const admits = has(/\b(yes|i did|i lied|i admit|i own|guilty|once or twice|i'm not proud|you're right|i'm sorry|i changed my vote)\b/);
  const deflects = has(/\b(everyone was|everybody was|did what i had to|it's (just )?a game|that's the game|it's survivor|you would have done the same)\b/);
  const denies = has(/\b(no|never)\b/) && !admits;
  const names = s.players.filter((p) => !p.human && new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(t)).map((p) => p.id);
  const specifics = names.length + (has(/\bday \d+\b|\b\d+\b/) ? 1 : 0);

  const bonus = {};
  for (const j of s.jury) {
    const jt = P(j).t;
    let d = 0;
    if (tone.strategic) d += (jt.strategic - 0.45) * 0.45 + (rec.wins + rec.idolSaves) * 0.02;
    if (tone.loyal) d += (jt.loyal - 0.45) * 0.4;
    if (tone.social) d += (jt.social - 0.45) * 0.4 + s.trust[j][H] * 0.08;
    if (tone.humble) d += 0.05 + (jt.social + jt.loyal - 0.9) * 0.15;
    if (tone.hostile) d -= 0.3;
    if (lies.includes('loyal')) d -= 0.22 * (0.5 + jt.loyal);
    if (lies.includes('wins') || lies.includes('idol')) d -= 0.18;
    d += Math.min(0.15, specifics * 0.05);
    if (words < 5) d -= 0.12; else if (words >= 12 && words <= 80) d += 0.05;
    // Answering the actual question.
    if (ctx.kind === 'lie' || ctx.kind === 'betrayal') {
      if (rec.betrayals && admits) d += 0.08 + jt.honesty * 0.1;
      if (rec.betrayals && denies) d -= 0.15 + jt.loyal * 0.15;
    }
    if (ctx.kind === 'move' && !(tone.strategic || names.length)) d -= 0.06;
    if (ctx.kind === 'deserve' && ctx.other != null && !(names.includes(ctx.other) || has(/\bmore than|than (him|her|them)\b/))) d -= 0.03;
    // The juror who asked cares most; being named with an apology or respect lands with them.
    if (j === ctx.asker) {
      d *= 1.6;
      if (names.includes(j) && (tone.humble || tone.social)) d += 0.1;
      if (ctx.kind === 'why_me' || ctx.kind === 'betrayal') d += tone.humble ? 0.12 * (0.5 + jt.social) : tone.strategic ? (jt.strategic - 0.5) * 0.3 : -0.05;
      if ((ctx.kind === 'why_me' || ctx.kind === 'betrayal') && deflects && !admits) d -= 0.18 * (1.2 - jt.strategic);
    }
    bonus[j] = clamp(d, -0.6, 0.6);
  }
  return { bonus, lies, tone, words, admits, deflects };
}

/** What the juror who asked says back. */
export function jurorReaction(j, judged, ctx = {}) {
  const rec = record();
  const d = judged.bonus[j] ?? 0;
  if (judged.lies.includes('wins')) return 'You never won a single challenge. Don’t rewrite history.';
  if (judged.lies.includes('loyal')) return pick(['You broke your word. We all saw the votes.', 'Kept your word? That’s not how I remember it.']);
  if (judged.lies.includes('idol')) return 'What idol? Come on.';
  if (judged.tone.hostile) return 'Wow. And you want my vote?';
  if (judged.words < 5) return pick(['That’s it?', 'I needed more than that.']);
  if ((ctx.kind === 'lie' || ctx.kind === 'betrayal') && judged.deflects && !judged.admits) return pick(['So it’s my fault for believing you?', 'Everyone else did it too. Great answer.']);
  if ((ctx.kind === 'lie' || ctx.kind === 'betrayal') && rec.betrayals && judged.admits && d > 0.05) return 'Thank you for finally being honest.';
  if (d > 0.2) return pick(['That’s exactly what I needed to hear.', 'Okay. That actually means a lot.', 'I respect that answer.']);
  if (d > 0.05) return pick(['...Okay. I respect that.', 'Fair enough.']);
  if (d > -0.08) return pick(['Hm. We’ll see.', 'Not sure I buy it, but okay.']);
  return pick(['Not convinced.', 'That’s not what happened, and you know it.', 'I don’t believe you.']);
}


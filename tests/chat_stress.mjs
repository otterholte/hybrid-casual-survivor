// Chat stress test: ~155 kinds of realistic player messages sent to castaways mid-season.
// Checks intent, broken text, shrugs on clear questions, phantom names and missing quick replies.
//   node tests/chat_stress.mjs
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { newSeason, P, nm, alive, aliveBots } = await import(root + 'state.js');
const ai = await import(root + 'ai.js');
const { chatReply, understand } = await import(root + 'chat.js');

// [message, acceptable intents]. {A} = another castaway, {B} = a second one, {T} = whoever was just discussed.
const CASES = [
  // votes / plans
  ['who are you voting for', 'ask_vote'], ['whos ur vote tonight', 'ask_vote'], ['who are we voting tonight?', 'ask_vote'], ['whats the plan', 'ask_vote'],
  ['who do you want gone', 'ask_vote'], ['who should go home tonight', 'ask_vote'], ['who is the target', 'ask_vote'], ['what are you thinking for tonight', 'ask_vote|ask_info'],
  ['do you have the votes?', 'ask_numbers'], ['do we have the numbers', 'ask_numbers'], ['who else is on board', 'ask_numbers'], ['whos with you', 'ask_numbers'],
  ['how many votes do we have', 'ask_numbers'], ['is it locked in?', 'ask_numbers'], ['do you have any other votes for {A}?', 'ask_numbers'], ['whos the 1 more', 'ask_numbers'],
  ['who are the others', 'ask_numbers'], ['name them', 'ask_numbers'], ['how are the numbers looking', 'ask_numbers'], ['who all is voting with you', 'ask_numbers'],
  ['who else can we swing', 'ask_info'], ['who could we bring over', 'ask_info'], ['whos the swing vote', 'ask_info'], ['who is on the fence', 'ask_info'],
  ["i'm voting {A}", 'declare_vote'], ['im voting {A} tonight', 'declare_vote'], ['my vote is {A}', 'declare_vote'], ["i'm in on {A}", 'declare_vote'], ['count me in', 'declare_vote'],
  ["let's vote {A} out", 'propose_vote'], ['we should get rid of {A}', 'propose_vote'], ['{A} needs to go', 'propose_vote'], ['lets blindside {A}', 'propose_vote'], ['can we target {A}', 'propose_vote|errand'],
  ['what about {A} instead', 'propose_vote|opinion'], ['vote {A} out with me', 'propose_vote'], ['we need to take {A} out tonight', 'propose_vote'],
  ['would you be down to vote for them', 'propose_vote'], ['are you willing to vote for him', 'propose_vote'], ['should we split the votes', 'split'], ["let's split the vote between {A} and {B}", 'split'],
  // opinions / badmouth / protect
  ['what do you think of {A}', 'opinion'], ['thoughts on {A}?', 'opinion'], ['do you trust {A}', 'opinion'], ['how is {A} playing', 'opinion'], ['is {A} a threat', 'opinion|badmouth'],
  ['{A} seems sketchy', 'badmouth'], ['{A} is a snake', 'badmouth'], ['i dont trust {A}', 'badmouth|opinion'], ['{A} is running this game', 'badmouth'], ['{A} is playing both sides', 'badmouth'],
  ["i'd rather keep {A}", 'protect'], ['not {A} tonight', 'protect'], ['leave {A} alone', 'protect'], ['{A} is with us', 'protect'], ['i like {A}', 'protect'],
  ['why {A}?', 'why'], ['why not {A}?', 'why'], ['why do you want {A} gone', 'why|propose_vote'], ['why', 'why'],
  // about me
  ['am i safe tonight?', 'ask_vote_me'], ['are you voting for me', 'ask_vote_me'], ['is my name out there', 'ask_vote_me|ask_target_me'], ['is anyone coming for me', 'ask_target_me'], ['whos targeting me', 'ask_target_me'],
  ["please don't vote for me", 'dont_vote_me'], ['save me tonight', 'dont_vote_me'],
  // alliances / trust
  ['want to work together?', 'ally'], ['final two?', 'ally'], ['wanna be in an alliance', 'ally'], ['can i trust you', 'trust_q'], ['are we good', 'trust_q'], ['do you trust me', 'trust_q'],
  ["i've got your back", 'loyalty'], ['i promise im with you', 'loyalty'], ['who are you closest with', 'ask_allies'], ['whos in your alliance', 'ask_allies'], ['who do you trust', 'ask_allies'],
  // info
  ['what have you heard', 'ask_info'], ['any gossip?', 'ask_info'], ['anything i should know', 'ask_info'], ['what is {A} saying', 'ask_info'], ['what did {A} say', 'ask_info'], ['whats going on at camp', 'ask_info'],
  // warnings
  ['{A} is targeting you', 'warn'], ['i heard {A} is coming for you', 'warn'], ['{A} said your name', 'warn'], ['{A} wants you out', 'warn'],
  // idols
  ['do you have an idol', 'ask_idol'], ['did u find the idol', 'ask_idol'], ['got an idol?', 'ask_idol'], ['who has the idol', 'idol_who'], ['does {A} have an idol', 'idol_who'],
  ['do you think {A} has an idol?', 'idol_who'], ['{A} has an idol', 'idol_accuse'], ['i think {A} found the idol', 'idol_accuse|idol_who'], ['is the idol still out there', 'idol_who'],
  ['where did you go this morning', 'idol_who'], ['have you been looking for it', 'idol_who'], ['i found the idol', 'idol_claim'], ['i have an idol dont tell anyone', 'idol_claim'],
  ['should i play my idol', 'idol_mine'], ['would you play your idol for me', 'idol_play'], ['are you going to play it?', 'idol_play'], ['any idol clues?', 'idol_who'],
  // errands
  ['can you talk to {A}', 'errand'], ['go talk to {A} for me', 'errand'], ['find out what {A} is thinking', 'errand'], ['can you ask {A} who theyre voting for', 'errand'],
  ['convince {A} to vote {B}', 'errand'], ['can you get {A} on board with {B}', 'errand'], ['tell {A} im with them', 'errand'], ['let {A} know i have their back', 'errand'],
  ['tell {A} that {B} is after them', 'errand'], ['could you feel out {A}', 'errand'], ['i need you to talk to {A}', 'errand'], ['work on {A} about {B}', 'errand'], ['see if {A} is with us', 'errand'],
  // accusations
  ['you lied to me', 'accuse'], ['you voted for me last time', 'accuse'], ['youre a snake', 'accuse'], ['why did you write my name', 'accuse|why'],
  // small talk
  ['hey', 'greeting'], ['hi!', 'greeting'], ['how are you', 'how_are_you'], ['how are you holding up', 'how_are_you'], ['you good?', 'how_are_you'], ['im so hungry', 'camp_talk'],
  ['the rain was brutal last night', 'camp_talk'], ['you nervous about tonight?', 'nerves'], ['im scared', 'nerves'], ['nice job in the challenge', 'compliment|challenge_talk'], ['that challenge was crazy', 'challenge_talk'],
  ['you played great today', 'compliment'], ['what do you miss from home', 'unknown'], ['tell me about yourself', 'unknown'], ['whats your job back home', 'unknown'], ['lol', 'ack'], ['ok', 'ack'], ['thanks', 'ack'], ['cool', 'ack'], ['nah', 'ack|protect'], ['what about you?', 'how_are_you|ask_vote'], ['wbu', 'how_are_you|ask_vote'],
  ['yes', 'declare_vote|ack|ally'], ['yeah im in', 'declare_vote|ack'], ['no', 'protect|ack'],
  ['convince {B} to vote {A}', 'errand'], ['go tell {A} that {B} wants her out', 'errand'], ['pls talk to {A}', 'errand'], ['go see what {A} thinks', 'errand'],
  ['what are u thinking for tn', 'ask_vote'], ['r u with me', 'trust_q'], ['who r u voting 4', 'ask_vote'], ['can u find out who {A} is voting for', 'errand'],
];
const SMALLTALK = new Set(['ack', 'unknown', 'greeting', 'how_are_you', 'camp_talk', 'nerves', 'compliment', 'challenge_talk']);
const BAD = /undefined|null|NaN|\[object|\$\{/;
const SHRUG = /not sure i follow|what are you getting at|what do you mean/i;

let total = 0, fails = 0;
const misses = [];
for (let season = 0; season < 4; season++) {
  const S = newSeason({ name: 'Janice', castSize: 8, look: { gender: 'f' }, job: 'Student' });
  S.threads = {};
  // Mid-season: one vote has happened, someone won twice, someone is idol-hunting.
  S.round = 1; ai.beginRoundAI();
  const bots0 = aliveBots();
  S.voteHistory.push({ day: 3, votes: Object.fromEntries(alive().map((p) => [p.id, bots0[6].id])), out: bots0[6].id, protected: [] });
  bots0[6].alive = false; bots0[6].juror = true; S.jury.push(bots0[6].id);
  bots0[1].stats.wins = 2; S.idolSusp[bots0[2].id] = 0.5; bots0[2].idols = 1;
  S.round = 2; S.day = 4; ai.beginRoundAI();
  const bots = aliveBots();
  for (const b of bots.slice(0, 4)) {
    const others = bots.filter((k) => k.id !== b.id);
    const A = others[0], B = others[1];
    for (const [tmpl, expect] of CASES) {
      const th = (S.threads[b.id] = [{ from: b.id, text: ai.botOpener(b.id).text }]);
      const msg = tmpl.replaceAll('{A}', A.name.toLowerCase()).replaceAll('{B}', B.name);
      th.push({ from: 0, text: msg });
      total++;
      let u, r;
      try { u = understand(msg, b.id, th); r = chatReply(b.id, msg, th); } catch (e) { fails++; misses.push(`CRASH ${msg}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); continue; }
      const problems = [];
      if (!expect.split('|').includes(u.intent)) problems.push(`intent ${u.intent} (want ${expect})`);
      if (!r?.text || BAD.test(r.text)) problems.push(`bad text`);
      if (!SMALLTALK.has(expect) && SHRUG.test(r.text)) problems.push('shrug');
      for (const o of r.options || []) if (!o.label || BAD.test(o.label)) problems.push(`bad option ${o.label}`);
      if (!(r.options || []).length) problems.push('no quick replies');
      const named = S.players.filter((p) => new RegExp(`\\b${p.name}\\b`).test(r.text) && !p.alive && !p.juror);
      if (named.length) problems.push(`names non-player ${named.map((p) => p.name)}`);
      if (problems.length) { fails++; misses.push(`[${b.name}] "${msg}" → ${problems.join('; ')}\n      reply: ${r?.text}`); }
    }
  }
}
const seen = new Set();
for (const m of misses) { const k = m.split('→')[0].replace(/^\[\w+\] /, ''); if (!seen.has(k)) { seen.add(k); console.log(m); } }
console.log(`\n${total - fails}/${total} passed (${fails} problems, ${seen.size} distinct messages)`);

// Static content: the bot cast pool, archetypes, message presets and idol search spots.

export const ARCHETYPES = {
  strategist: { label: 'Mastermind', emoji: '🧠', t: { strategic: 0.9, loyal: 0.4, social: 0.6, honesty: 0.35, paranoia: 0.5, physical: 0.4, puzzle: 0.8, endurance: 0.5 } },
  beast: { label: 'Challenge Beast', emoji: '💪', t: { strategic: 0.35, loyal: 0.7, social: 0.5, honesty: 0.7, paranoia: 0.3, physical: 0.9, puzzle: 0.4, endurance: 0.85 } },
  social: { label: 'Social Player', emoji: '🤝', t: { strategic: 0.55, loyal: 0.6, social: 0.95, honesty: 0.6, paranoia: 0.3, physical: 0.4, puzzle: 0.5, endurance: 0.5 } },
  schemer: { label: 'Schemer', emoji: '🐍', t: { strategic: 0.8, loyal: 0.2, social: 0.55, honesty: 0.15, paranoia: 0.6, physical: 0.5, puzzle: 0.6, endurance: 0.5 } },
  loyalist: { label: 'Loyal Soldier', emoji: '🛡️', t: { strategic: 0.3, loyal: 0.95, social: 0.6, honesty: 0.85, paranoia: 0.4, physical: 0.6, puzzle: 0.5, endurance: 0.65 } },
  wildcard: { label: 'Wildcard', emoji: '🃏', t: { strategic: 0.5, loyal: 0.35, social: 0.45, honesty: 0.45, paranoia: 0.75, physical: 0.6, puzzle: 0.55, endurance: 0.55 } },
  puzzler: { label: 'Puzzle Whiz', emoji: '🧩', t: { strategic: 0.65, loyal: 0.6, social: 0.4, honesty: 0.65, paranoia: 0.45, physical: 0.3, puzzle: 0.95, endurance: 0.45 } },
  underdog: { label: 'Underdog', emoji: '🐢', t: { strategic: 0.5, loyal: 0.7, social: 0.7, honesty: 0.7, paranoia: 0.55, physical: 0.35, puzzle: 0.45, endurance: 0.7 } },
};

// Hair style indices: 0 buzz, 1 crop, 2 side part, 3 curls, 4 afro, 5 undercut, 6 long, 7 waves, 8 bun, 9 ponytail, 10 braids, 11 pixie, 12 bald
export const CAST_POOL = [
  { name: 'Maya', job: 'Surf instructor', arch: 'beast', look: { gender: 'f', skin: 2, hair: 4, style: 7, shirt: 1, eyes: 0, face: 0, mouth: 4 } },
  { name: 'Jordan', job: 'Bartender', arch: 'social', look: { gender: 'm', skin: 5, hair: 0, style: 0, shirt: 0, eyes: 1, face: 2, facial: 1 } },
  { name: 'Alex', job: 'Lawyer', arch: 'strategist', look: { gender: 'm', skin: 0, hair: 3, style: 2, shirt: 4, eyes: 2, face: 4 } },
  { name: 'Ben', job: 'Firefighter', arch: 'loyalist', look: { gender: 'm', skin: 1, hair: 2, style: 12, shirt: 2, face: 2, facial: 2 } },
  { name: 'Priya', job: 'Med student', arch: 'puzzler', look: { gender: 'f', skin: 3, hair: 0, style: 10, shirt: 5, eyes: 0 } },
  { name: 'Marcus', job: 'Ex-quarterback', arch: 'beast', look: { gender: 'm', skin: 6, hair: 0, style: 5, shirt: 3, face: 2, facial: 3 } },
  { name: 'Zoe', job: 'Poker dealer', arch: 'schemer', look: { gender: 'f', skin: 0, hair: 5, style: 11, shirt: 6, eyes: 3, mouth: 2 } },
  { name: 'Tyler', job: 'Youth pastor', arch: 'underdog', look: { gender: 'm', skin: 1, hair: 4, style: 1, shirt: 2, eyes: 1, mouth: 1 } },
  { name: 'Leilani', job: 'Fisher', arch: 'loyalist', look: { gender: 'f', skin: 3, hair: 0, style: 6, shirt: 0, face: 1 } },
  { name: 'Diego', job: 'Chef', arch: 'wildcard', look: { gender: 'm', skin: 2, hair: 1, style: 3, shirt: 5, facial: 4 } },
  { name: 'Hana', job: 'Game designer', arch: 'strategist', look: { gender: 'f', skin: 1, hair: 0, style: 8, shirt: 1, eyes: 2, face: 3 } },
  { name: 'Rex', job: 'Car salesman', arch: 'schemer', look: { gender: 'm', skin: 0, hair: 6, style: 2, shirt: 3, mouth: 2, facial: 1 } },
  { name: 'Nia', job: 'Kindergarten teacher', arch: 'social', look: { gender: 'f', skin: 5, hair: 0, style: 4, shirt: 2, mouth: 1, face: 1 } },
  { name: 'Owen', job: 'Park ranger', arch: 'wildcard', look: { gender: 'm', skin: 0, hair: 2, style: 3, shirt: 1, facial: 2, eyeColor: 3 } },
  { name: 'Sofia', job: 'Architect', arch: 'puzzler', look: { gender: 'f', skin: 2, hair: 1, style: 9, shirt: 0, eyes: 4 } },
  { name: 'Gus', job: 'Retired plumber', arch: 'underdog', look: { gender: 'm', skin: 1, hair: 7, style: 12, shirt: 6, facial: 4, face: 1 } },
];

export const PLAYER_JOBS = ['Mystery castaway', 'Superfan', 'Student', 'Designer', 'Engineer', 'Nurse', 'Musician', 'Barista'];

// Presets the human can send at camp. `needs: 'target'` asks for a name.
export const PRESETS = [
  { id: 'who', text: 'Who are you thinking of voting for?' },
  { id: 'numbers', text: 'Do you have the votes?' },
  { id: 'ally', text: 'Want to work together?' },
  { id: 'voteout', text: 'I think we should vote out {X}.', needs: 'target' },
  { id: 'trust', text: 'Can I trust you?' },
  { id: 'idol', text: "I have an idol. Don't tell anyone." },
  { id: 'split', text: "Let's split the votes." },
  { id: 'warn', text: 'I heard {X} is targeting you.', needs: 'target' },
];

// Idol search: each location has 8 spots laid out 4 x 2.
export const ZONES = [
  { id: 'beach', name: 'The Beach', icon: '🏖️', spots: [['🪵', 'Driftwood log'], ['🪨', 'Big rock'], ['🥥', 'Coconut pile'], ['🦀', 'Crab burrow'], ['🐚', 'Tide pool'], ['🕸️', 'Old fishing net'], ['📦', 'Washed-up crate'], ['🌿', 'Sea grape bush']] },
  { id: 'jungle', name: 'The Jungle', icon: '🌴', spots: [['🌳', 'Hollow tree'], ['🪨', 'Mossy boulder'], ['🌿', 'Fern patch'], ['🍂', 'Leaf pile'], ['🪵', 'Fallen palm'], ['🐜', 'Termite mound'], ['🌱', 'Root tangle'], ['🍃', 'Vine curtain']] },
  { id: 'falls', name: 'The Waterfall', icon: '💧', spots: [['💦', 'Behind the falls'], ['🪨', 'Rock ledge'], ['🌾', 'Reeds'], ['🕳️', 'Cave mouth'], ['🎋', 'Bamboo stand'], ['🐸', 'Lily pads'], ['🪨', 'Stepping stones'], ['🌊', 'Pool bottom']] },
];

export const SEARCH_DUDS = [
  'Just a hermit crab. It pinched you.',
  'A rotten coconut. Gross.',
  'Nothing but bugs. So many bugs.',
  'An old flip-flop from a previous season?',
  'A very startled lizard.',
  'Sand. Only sand.',
  'A bird took off and nearly gave you a heart attack.',
];

// Advantages won in challenges. Big ones go to 1st place, small ones to 2nd.
export const ADVANTAGES = {
  extraVote: { name: 'Extra Vote', icon: '🗳️', tier: 'big', when: 'tribal', desc: 'Cast two votes at a Tribal Council of your choice.' },
  voteBlock: { name: 'Vote Blocker', icon: '🚫', tier: 'big', when: 'tribal', desc: 'Before the vote, stop one castaway from voting.' },
  intel: { name: 'Secret Intel', icon: '🔍', tier: 'small', when: 'camp', desc: 'At camp, learn who one castaway is really voting for.' },
  idolClue: { name: 'Idol Clue', icon: '📜', tier: 'small', when: 'camp', desc: 'At camp, go straight to the hidden idol’s location (if it’s still out there).' },
  extraTrip: { name: 'Extra Excursion', icon: '🧭', tier: 'small', when: 'camp', desc: 'Take a second excursion at camp.' },
};

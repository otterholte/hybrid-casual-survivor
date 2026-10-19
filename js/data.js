// Static content: the bot cast pool, archetypes, and message presets.

export const ARCHETYPES = {
  strategist: { label: 'Mastermind', emoji: '🧠', t: { strategic: 0.9, loyal: 0.4, social: 0.6, honesty: 0.35, paranoia: 0.5, physical: 0.4, puzzle: 0.8, endurance: 0.5 } },
  beast: { label: 'Challenge Beast', emoji: '💪', t: { strategic: 0.35, loyal: 0.7, social: 0.5, honesty: 0.7, paranoia: 0.3, physical: 0.9, puzzle: 0.4, endurance: 0.85 } },
  social: { label: 'Social Butterfly', emoji: '🦋', t: { strategic: 0.55, loyal: 0.6, social: 0.95, honesty: 0.6, paranoia: 0.3, physical: 0.4, puzzle: 0.5, endurance: 0.5 } },
  schemer: { label: 'Schemer', emoji: '🐍', t: { strategic: 0.8, loyal: 0.2, social: 0.55, honesty: 0.15, paranoia: 0.6, physical: 0.5, puzzle: 0.6, endurance: 0.5 } },
  loyalist: { label: 'Loyal Soldier', emoji: '🛡️', t: { strategic: 0.3, loyal: 0.95, social: 0.6, honesty: 0.85, paranoia: 0.4, physical: 0.6, puzzle: 0.5, endurance: 0.65 } },
  wildcard: { label: 'Wildcard', emoji: '🃏', t: { strategic: 0.5, loyal: 0.35, social: 0.45, honesty: 0.45, paranoia: 0.75, physical: 0.6, puzzle: 0.55, endurance: 0.55 } },
  puzzler: { label: 'Puzzle Whiz', emoji: '🧩', t: { strategic: 0.65, loyal: 0.6, social: 0.4, honesty: 0.65, paranoia: 0.45, physical: 0.3, puzzle: 0.95, endurance: 0.45 } },
  underdog: { label: 'Underdog', emoji: '🐢', t: { strategic: 0.5, loyal: 0.7, social: 0.7, honesty: 0.7, paranoia: 0.55, physical: 0.35, puzzle: 0.45, endurance: 0.7 } },
};

export const CAST_POOL = [
  { name: 'Maya', job: 'Surf instructor', arch: 'beast', look: { skin: 2, hair: 0, style: 1, buff: 1 } },
  { name: 'Jordan', job: 'Bartender', arch: 'social', look: { skin: 4, hair: 5, style: 3, buff: 0 } },
  { name: 'Alex', job: 'Lawyer', arch: 'strategist', look: { skin: 0, hair: 3, style: 0, buff: 4 } },
  { name: 'Ben', job: 'Firefighter', arch: 'loyalist', look: { skin: 1, hair: 2, style: 7, buff: 2, headband: true } },
  { name: 'Priya', job: 'Med student', arch: 'puzzler', look: { skin: 3, hair: 0, style: 5, buff: 5 } },
  { name: 'Marcus', job: 'Ex-quarterback', arch: 'beast', look: { skin: 5, hair: 5, style: 0, buff: 3 } },
  { name: 'Zoe', job: 'Poker dealer', arch: 'schemer', look: { skin: 0, hair: 4, style: 2, buff: 4 } },
  { name: 'Tyler', job: 'Youth pastor', arch: 'underdog', look: { skin: 1, hair: 3, style: 4, buff: 2 } },
  { name: 'Leilani', job: 'Fisher', arch: 'loyalist', look: { skin: 3, hair: 0, style: 1, buff: 0, headband: true } },
  { name: 'Diego', job: 'Chef', arch: 'wildcard', look: { skin: 2, hair: 1, style: 6, buff: 5 } },
  { name: 'Hana', job: 'Game designer', arch: 'strategist', look: { skin: 1, hair: 5, style: 2, buff: 1 } },
  { name: 'Rex', job: 'Car salesman', arch: 'schemer', look: { skin: 0, hair: 6, style: 0, buff: 3 } },
  { name: 'Nia', job: 'Kindergarten teacher', arch: 'social', look: { skin: 4, hair: 0, style: 3, buff: 2 } },
  { name: 'Owen', job: 'Park ranger', arch: 'wildcard', look: { skin: 0, hair: 2, style: 3, buff: 1, headband: true } },
  { name: 'Sofia', job: 'Architect', arch: 'puzzler', look: { skin: 2, hair: 1, style: 5, buff: 0 } },
  { name: 'Gus', job: 'Retired plumber', arch: 'underdog', look: { skin: 1, hair: 7, style: 7, buff: 3 } },
];

export const PLAYER_JOBS = ['Mystery castaway', 'Superfan', 'Student', 'Designer', 'Engineer', 'Nurse', 'Musician', 'Barista'];

// Presets the human can send at camp. `needs: 'target'` asks for a name.
export const PRESETS = [
  { id: 'who', text: 'Who are you thinking of voting for?' },
  { id: 'ally', text: 'Want to work together?' },
  { id: 'voteout', text: 'I think we should vote out {X}.', needs: 'target' },
  { id: 'trust', text: 'Can I trust you?' },
  { id: 'idol', text: "I have an idol. Don't tell anyone." },
  { id: 'split', text: "Let's split the votes." },
  { id: 'warn', text: 'I heard {X} is targeting you.', needs: 'target' },
];

// Things you can say out loud at Tribal Council.
export const TRIBAL_LINES = [
  { id: 'threat', text: '{X} is the biggest threat out here.', needs: 'target' },
  { id: 'loyal', text: "I've been loyal to my word. Everyone knows that." },
  { id: 'idolwarn', text: 'Somebody here has an idol. Be careful.' },
  { id: 'simple', text: 'Let’s keep it simple tonight: {X}.', needs: 'target' },
  { id: 'liar', text: "Don't believe a word {X} says.", needs: 'target' },
  { id: 'plead', text: "I'm no threat. Keep me and I'll ride with you." },
];

export const ZONES = [
  { id: 'beach', name: 'Beach Rocks', icon: '🐚', tile: '#f4d58d', dug: '#d9b46a' },
  { id: 'jungle', name: 'Jungle Roots', icon: '🌿', tile: '#4c8a3f', dug: '#335f2a' },
  { id: 'falls', name: 'Waterfall Pool', icon: '💧', tile: '#7aa6a8', dug: '#4f7c7e' },
];

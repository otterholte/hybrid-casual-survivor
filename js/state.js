// Season state: players, relationships, idols, and vote history.
import { ARCHETYPES, CAST_POOL } from './data.js';
import { shuffle, rand, clamp } from './util.js';

export const game = { S: null };

export function newSeason(settings) {
  const n = settings.castSize;
  const bots = shuffle(CAST_POOL).slice(0, n - 1);
  const players = [
    {
      id: 0, human: true, name: settings.name || 'You', job: settings.job || 'Superfan', arch: null,
      look: settings.look, t: { strategic: 0.6, loyal: 0.6, social: 0.6, honesty: 0.6, paranoia: 0.4, physical: 0.5, puzzle: 0.5, endurance: 0.5 },
    },
    ...bots.map((b, i) => {
      const base = ARCHETYPES[b.arch].t;
      const t = {};
      for (const k in base) t[k] = clamp(base[k] + rand(-0.12, 0.12), 0.05, 0.98);
      return { id: i + 1, human: false, name: b.name, job: b.job, arch: b.arch, look: b.look, t };
    }),
  ];
  for (const p of players) {
    Object.assign(p, {
      alive: true, immune: false, idols: 0, juror: false, placement: null, outDay: null,
      stats: { wins: 0, votesAgainst: 0, idolsFound: 0, idolsPlayed: 0, idolSaves: 0, correctVotes: 0, betrayals: 0 },
    });
  }
  const mat = (fn) => players.map((a) => players.map((b) => fn(a, b)));
  const S = {
    settings,
    players,
    trust: mat((a, b) => (a.id === b.id ? 1 : rand(-0.15, 0.25) + (a.t.social - 0.5) * 0.2)),
    allied: mat(() => false),
    influence: mat(() => 0),
    noise: mat(() => 0),
    threat: players.map((p) => 0.15 + p.t.physical * 0.15 + p.t.strategic * 0.1),
    idolSusp: players.map(() => 0),
    plan: players.map(() => null),
    promises: {}, // botId -> who the human said they'd vote for
    botTold: {}, // botId -> who the bot told the human it would vote for
    leaks: [], // pending gossip about the human, consumed by camp convos
    day: 1,
    round: 0,
    idolsLeft: 2,
    hiddenIdol: null,
    voteHistory: [],
    convos: [],
    feed: [],
    usedChallenges: [],
    jury: [],
    lastWinner: null,
    humanOut: false,
  };
  game.S = S;
  return S;
}

export const P = (id) => game.S.players[id];
export const nm = (id) => game.S.players[id].name;
export const alive = () => game.S.players.filter((p) => p.alive);
export const aliveBots = () => game.S.players.filter((p) => p.alive && !p.human);
export const human = () => game.S.players[0];

export function adjTrust(a, b, d) {
  const S = game.S;
  S.trust[a][b] = clamp(S.trust[a][b] + d, -1, 1);
}

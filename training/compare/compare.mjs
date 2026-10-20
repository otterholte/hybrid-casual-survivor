// Side-by-side check of the castaway chat models with the exact prompts and filters js/llm.js uses.
//   node compare.mjs                      # all models, CPU (onnxruntime-node)
//   node compare.mjs tuned:q4 tuned:int8  # just some, as key:dtype
// Writes results.json next to this file.
import { pipeline, env } from '@huggingface/transformers';
import { writeFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MODELS, buildMessages, vetReply, GEN_OPTS } from '../../js/llm.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// The game now ships only Island AI; the off-the-shelf models from REPORT.md stay here for comparisons
// (they get the same short persona prompt the game uses).
const BASELINES = {
  light: { remote: 'onnx-community/SmolLM2-135M-Instruct-ONNX-GQA' },
  best: { remote: 'onnx-community/LFM2.5-350M-ONNX' },
};
env.localModelPath = join(HERE, '../../models/');

// Held out of training (training/camp_lines.py EVAL_QUESTIONS).
const QUESTIONS = [
  'how are you holding up out here?',
  "what's the first thing you'll eat when you get home",
  'that storm last night was wild',
  'do you think the next challenge will be a puzzle?',
  'are you nervous about tribal tonight?',
  "who's the most dangerous person here?",
  'what do you think the jury will care about?',
  "i'm bored, entertain me",
  'be honest, are you a robot?',
  "what's your favorite thing about the island?",
];
const BOTS = [
  { name: 'Zoe', job: 'Poker dealer', arch: 'schemer' },
  { name: 'Ben', job: 'Firefighter', arch: 'loyalist' },
];
const ALL_NAMES = ['Maya', 'Jordan', 'Alex', 'Ben', 'Priya', 'Marcus', 'Zoe', 'Tyler', 'Leilani', 'Diego', 'Hana', 'Rex', 'Nia', 'Owen', 'Sofia', 'Gus', 'Sam'];

const runs = process.argv.slice(2).length ? process.argv.slice(2) : ['tuned:q4', 'light:int8', 'best:q4'];
const results = [];
for (const run of runs) {
  const [key, dtype] = run.split(':');
  const m = MODELS[key] ?? BASELINES[key];
  const local = !!m.local;
  env.allowLocalModels = local;
  env.allowRemoteModels = !local;
  const t0 = performance.now();
  const gen = await pipeline('text-generation', local ? m.local : m.remote, { device: 'cpu', dtype });
  const loadMs = performance.now() - t0;
  let bytes = null;
  if (local) {
    const dir = join(HERE, '../../models', m.local, 'onnx');
    bytes = readdirSync(dir).filter((f) => f.startsWith(`model_${dtype}.onnx`)).reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  }
  const replies = [];
  for (const bot of BOTS) {
    for (const q of QUESTIONS) {
      const t = performance.now();
      const out = await gen(buildMessages(key, { bot, message: q, mood: '' }), GEN_OPTS);
      const ms = performance.now() - t;
      const raw = out[0].generated_text.at(-1).content;
      const kept = vetReply(raw, { bot, playerName: 'Sam', allNames: ALL_NAMES });
      replies.push({ bot: bot.name, q, raw, kept, ms: Math.round(ms) });
      console.log(`[${run}] ${bot.name} | ${q}\n    ${kept ?? `(rejected) ${raw}`}  ${Math.round(ms)}ms`);
    }
  }
  const ms = replies.map((r) => r.ms).sort((a, b) => a - b);
  results.push({
    run, loadMs: Math.round(loadMs), bytes,
    medianMs: ms[Math.floor(ms.length / 2)], meanMs: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    rejected: replies.filter((r) => !r.kept).length, replies,
  });
  await gen.dispose?.();
}
writeFileSync(join(HERE, 'results.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(`${r.run}: load ${r.loadMs}ms, median ${r.medianMs}ms, mean ${r.meanMs}ms, rejected ${r.rejected}/${r.replies.length}`);

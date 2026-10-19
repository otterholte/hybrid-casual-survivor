// Optional on-device language model that gives castaways their own voice in chat.
// The game's rules engine still decides what a castaway thinks and does; the model only
// handles small talk, and we fall back to the rules answer if it drifts or is slow.
import { ARCHETYPES } from './data.js';
import { store } from './util.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
export const MODELS = {
  light: { id: 'onnx-community/SmolLM2-135M-Instruct-ONNX-GQA', size: '~120 MB', dtype: 'int8', gpuDtype: 'q4f16', label: 'Light' },
  best: { id: 'onnx-community/LFM2.5-350M-ONNX', size: '~300 MB', dtype: 'q4', gpuDtype: 'q4f16', label: 'Best' },
};

export const llm = { status: 'off', progress: 0, error: null, gen: null, model: null, listeners: new Set() };
const emit = () => llm.listeners.forEach((fn) => fn(llm));

/** 'off' | 'light' | 'best' */
export const llmChoice = () => {
  const v = store.get('ic_llm', 'off');
  return v === true ? 'best' : v || 'off';
};
export const llmEnabled = () => llmChoice() !== 'off';
export const setLlmChoice = (v) => store.set('ic_llm', v);

export async function loadLLM() {
  const choice = llmChoice();
  if (choice === 'off') return;
  if ((llm.status === 'ready' || llm.status === 'loading') && llm.model === choice) return;
  const m = MODELS[choice];
  llm.status = 'loading';
  llm.model = choice;
  llm.progress = 0;
  emit();
  try {
    const { pipeline, env } = await import(/* @vite-ignore */ `${LIB}/dist/transformers.min.js`);
    env.allowLocalModels = true; // a packaged app can ship the weights under /models
    const gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    const files = {};
    const gen = await pipeline('text-generation', m.id, {
      device: gpu ? 'webgpu' : 'wasm',
      dtype: gpu && m.gpuDtype ? m.gpuDtype : m.dtype,
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const all = Object.values(files);
          llm.progress = all.reduce((s, [l]) => s + l, 0) / all.reduce((s, [, t]) => s + t, 0);
          emit();
        }
      },
    });
    if (llm.model !== choice) return; // switched while loading
    llm.gen = gen;
    llm.device = gpu ? 'webgpu' : 'wasm';
    llm.status = 'ready';
  } catch (e) {
    console.warn('On-device model failed to load', e);
    llm.status = 'error';
    llm.error = String(e.message || e);
  }
  emit();
}

const namesIn = (text, names) => names.filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));

// A few example exchanges teach a tiny model what camp talk on a survival show sounds like.
const EXAMPLES = [
  ['how is camp treating you?', 'Rough. Rice for breakfast, rice for dinner. But I’m hanging in there.'],
  ['you nervous about tonight?', 'Everybody’s nervous. Anyone who says they’re not is lying to you.'],
  ['what do you miss most from home?', 'A real bed. And coffee. I’d trade my torch for a coffee right now.'],
  ['that challenge was crazy', 'I’m still shaking. My arms are completely gone.'],
];

function tidy(text) {
  let t = String(text || '')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  t = t.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim();
  const sentences = t.match(/[^.!?]+[.!?]+/g) || [t];
  t = sentences.slice(0, 2).join(' ').trim();
  if (t.length > 160) t = (sentences[0] || '').trim();
  return t;
}

/**
 * Free-form, in-character reply to small talk and off-script questions.
 * Game-changing replies (votes, alliances, warnings) never go through here; they come
 * straight from the rules engine so what a castaway says always matches what they do.
 * Resolves to `fallback` if the model isn't ready, is slow, or strays into strategy.
 */
export async function chatter({ bot, playerName, message, fallback, allNames, mood }) {
  // A timed-out generation keeps running on the device, so never queue behind it.
  if (llm.status !== 'ready' || llm.busy) return fallback;
  const arch = ARCHETYPES[bot.arch];
  const messages = [
    { role: 'system', content: `You are ${bot.name}, a ${bot.job.toLowerCase()} and a contestant on a TV survival game where castaways live on an island, win immunity challenges, and vote each other out at Tribal Council. Personality: ${arch?.label || 'castaway'}. ${mood || ''} You are chatting privately at camp. Answer in one short, casual sentence, like a real contestant. Stay on the island: talk about camp life, hunger, weather, challenges, nerves, and the game. Never mention anyone by name and never say who you will vote for.` },
    ...EXAMPLES.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: a }]),
    { role: 'user', content: message },
  ];
  try {
    llm.busy = true;
    const job = llm.gen(messages, { max_new_tokens: 36, do_sample: true, temperature: 0.7, top_p: 0.9, repetition_penalty: 1.15 });
    job.finally(() => { llm.busy = false; });
    const out = await Promise.race([job, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    const text = tidy(out?.[0]?.generated_text?.at?.(-1)?.content);
    if (text.length < 4) return fallback;
    if (/\b(vote|voting|idol|alliance|blindside|as an ai|language model)\b/i.test(text)) return fallback;
    const allowed = new Set([playerName.toLowerCase(), bot.name.toLowerCase()]);
    if (namesIn(text, allNames).some((n) => !allowed.has(n.toLowerCase()))) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

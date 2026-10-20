// On-device language model that gives castaways their own voice in chat: Island AI, our own
// fine-tune (training/), bundled with the game. The rules engine still decides what a castaway
// thinks and does; the model only handles small talk, and we fall back to the rules answer if it
// drifts, is slow, or can't load on this device.
import { ARCHETYPES } from './data.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
// Ships under /models/<local>; set `remote` to a Hugging Face repo id to download it instead.
// The q4 file is used on GPU too: fp16 activations (q4f16) garble a model this small.
export const MODELS = {
  tuned: { local: 'island-chat', remote: null, size: '~87 MB', dtype: 'q4', gpuDtype: 'q4', label: 'Island', tuned: true },
};

export const llm = { status: 'off', progress: 0, error: null, gen: null, model: null, listeners: new Set() };
const emit = () => llm.listeners.forEach((fn) => fn(llm));

export const llmChoice = () => 'tuned';

export async function loadLLM() {
  const choice = llmChoice();
  if ((llm.status === 'ready' || llm.status === 'loading') && llm.model === choice) return;
  const m = MODELS[choice];
  llm.status = 'loading';
  llm.model = choice;
  llm.progress = 0;
  emit();
  try {
    const { pipeline, env } = await import(/* @vite-ignore */ `${LIB}/dist/transformers.min.js`);
    // A packaged app ships the weights here. Path only: Transformers.js 4.2 skips its file-exists
    // check for full http URLs and would then think the bundled tokenizer is missing.
    env.localModelPath = new URL('models/', document.baseURI).pathname;
    const gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    const files = {};
    const opts = {
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
    };
    let gen = null;
    if (m.local) {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      gen = await pipeline('text-generation', m.local, opts).catch((e) => {
        if (!m.remote) throw e;
        console.info('Bundled model not found, downloading instead', e);
        return null;
      });
    }
    if (!gen) {
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      gen = await pipeline('text-generation', m.remote, opts);
    }
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

/** The persona prompt the Island model was trained on (training/gen_dataset.py system_prompt). */
const tunedSystem = (bot, mood) =>
  `You are ${bot.name}, a ${bot.job.toLowerCase()} on an island survival game show. Personality: ${ARCHETYPES[bot.arch]?.label || 'Castaway'}. ${mood || ''}`.trim();

/** Chat messages for one reply: just the persona the model was trained with, then the message. */
export function buildMessages(modelKey, { bot, message, mood }) {
  return [{ role: 'system', content: tunedSystem(bot, mood) }, { role: 'user', content: message }];
}

export const GEN_OPTS = { max_new_tokens: 40, do_sample: true, temperature: 0.7, top_p: 0.9, repetition_penalty: 1.15 };

/** First line, no stage directions, at most a couple of short sentences. */
export function tidy(text) {
  let t = String(text || '')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  t = t.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim();
  const sentences = (t.match(/[^.!?]+[.!?]+/g) || [t]).map((s) => s.trim());
  // Short punchy fragments ("Rough. Rice again.") count together; stop once it gets long.
  let out = sentences[0] || '';
  for (const s of sentences.slice(1)) {
    if ((out + ' ' + s).length > 130) break;
    out += ' ' + s;
  }
  return out.length > 160 ? out.slice(0, out.lastIndexOf(' ', 157)) + '...' : out;
}

/** The tidied reply, or null if it strays into strategy, breaks character or names another castaway. */
export function vetReply(raw, { bot, playerName, allNames }) {
  const text = tidy(raw);
  if (text.length < 4) return null;
  if (/\b(vote|voting|idol|alliance|blindside|ai|chatbot|language model)\b/i.test(text)) return null;
  const allowed = new Set([playerName.toLowerCase(), bot.name.toLowerCase()]);
  if (namesIn(text, allNames).some((n) => !allowed.has(n.toLowerCase()))) return null;
  return text;
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
  try {
    llm.busy = true;
    const job = llm.gen(buildMessages(llm.model, { bot, message, mood }), GEN_OPTS);
    job.finally(() => { llm.busy = false; }).catch(() => {});
    const out = await Promise.race([job, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    return vetReply(out?.[0]?.generated_text?.at?.(-1)?.content, { bot, playerName, allNames }) ?? fallback;
  } catch {
    return fallback;
  }
}

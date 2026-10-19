// Optional on-device language model that gives castaways their own voice in chat.
// The game's rules engine still decides what a castaway thinks and does; the model only
// rewrites that reply in character, and we fall back to the original if it drifts.
import { ARCHETYPES } from './data.js';
import { store } from './util.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
export const MODEL = 'onnx-community/LFM2.5-350M-ONNX';
export const MODEL_SIZE = '~300 MB';

export const llm = { status: 'off', progress: 0, error: null, gen: null, listeners: new Set() };
const emit = () => llm.listeners.forEach((fn) => fn(llm));

export const llmEnabled = () => store.get('ic_llm', false);
export const setLlmEnabled = (on) => store.set('ic_llm', on);

export async function loadLLM() {
  if (llm.status === 'ready' || llm.status === 'loading') return;
  llm.status = 'loading';
  llm.progress = 0;
  emit();
  try {
    const { pipeline, env } = await import(/* @vite-ignore */ `${LIB}/dist/transformers.min.js`);
    env.allowLocalModels = true; // a packaged app can ship the weights under /models
    const gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    const files = {};
    llm.gen = await pipeline('text-generation', MODEL, {
      device: gpu ? 'webgpu' : 'wasm',
      dtype: gpu ? 'q4f16' : 'q4',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const all = Object.values(files);
          llm.progress = all.reduce((s, [l]) => s + l, 0) / all.reduce((s, [, t]) => s + t, 0);
          emit();
        }
      },
    });
    llm.device = gpu ? 'webgpu' : 'wasm';
    llm.status = 'ready';
  } catch (e) {
    console.warn('On-device model failed to load', e);
    llm.status = 'error';
    llm.error = String(e.message || e);
  }
  emit();
}

const namesIn = (text, names) => names.filter((n) => new RegExp(`\b${n}\b`, 'i').test(text));

/**
 * Free-form, in-character reply to small talk and off-script questions.
 * Game-changing replies (votes, alliances, warnings) never go through here; they come
 * straight from the rules engine so what a castaway says always matches what they do.
 * Resolves to `fallback` if the model isn't ready, is slow, or strays into strategy.
 */
export async function chatter({ bot, playerName, message, fallback, allNames, mood }) {
  if (llm.status !== 'ready') return fallback;
  const arch = ARCHETYPES[bot.arch];
  const messages = [
    { role: 'system', content: `You are ${bot.name}, a ${bot.job.toLowerCase()} on a reality survival game set on a tropical island. Personality: ${arch?.label || 'castaway'}. ${mood || ''} You are chatting privately with ${playerName} at camp. Reply naturally to what they said, in one or two short casual sentences, like a real contestant. Do not reveal or promise who you will vote for, do not mention idols, and do not mention anyone by name except ${playerName}. No emojis.` },
    { role: 'user', content: message },
  ];
  try {
    const out = await Promise.race([
      llm.gen(messages, { max_new_tokens: 48, do_sample: true, temperature: 0.85, top_p: 0.92, repetition_penalty: 1.1 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    let text = out?.[0]?.generated_text?.at?.(-1)?.content ?? '';
    text = text.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
    text = (text.match(/[^.!?]+[.!?]*/g) || []).slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 220) return fallback;
    if (/\b(vote|voting|idol|alliance|blindside)\b/i.test(text)) return fallback;
    const allowed = new Set([playerName.toLowerCase(), bot.name.toLowerCase()]);
    if (namesIn(text, allNames).some((n) => !allowed.has(n.toLowerCase()))) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

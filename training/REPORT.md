# Island chat model: results

**Island AI** is a SmolLM2-135M-Instruct fine-tune for camp small talk. It ships as a single
**86.5 MB** 4-bit ONNX file in `models/island-chat/` and is used on both WebGPU and WASM.
It is the fastest of the three options and the most reliably on-topic and in character.

## Side by side

The 10 held-out camp questions (none of them appear in training), asked of two personas
(Zoe the schemer, Ben the loyalist). Prompts, sampling (temperature 0.7, top-p 0.9) and the
reply filter are exactly what the game uses. "Good" means a reply that answers the question,
stays in character and reads naturally. I graded these by hand, and with sampling a rerun
will shift the counts by a reply or two.

| | Island AI (new) | Light AI | Best AI |
| --- | --- | --- | --- |
| Base model | SmolLM2-135M, fine-tuned + QAT | SmolLM2-135M-Instruct | LFM2.5-350M |
| Download | **86.5 MB** (bundled, no download) | ~118 MB | ~300 MB |
| Good replies, CPU (20) | **16** | 1 | 10 |
| Good replies, WebGPU (10) | **8** | 1 | 6 |
| Broke character | 0 | 1 ("I am an AI-created animal") | 2 ("just a scraper of code") |
| Median reply, CPU (Node) | **163 ms** | 1,087 ms | 740 ms |
| Median reply, WebGPU | **216 ms** | 615 ms | 256 ms |
| Load (files cached) | 0.5 s | 4.3 s | 11.4 s |

CPU numbers are from `compare/compare.mjs` (onnxruntime-node, Transformers.js 4.2.0). WebGPU
numbers are from the in-app browser on this laptop (RTX 3060 Laptop GPU). Full replies are in
`compare/results.json`.

### Sample replies (Ben, WebGPU for Island)

| Question | Island AI | Best AI |
| --- | --- | --- |
| how are you holding up out here? | Honestly? Tired and hungry, but my head's still in the game. | Took it easy. Just lay back and watch the stars come out. |
| what's the first thing you'll eat when you get home | Bread. Just warm bread and butter. I'm not picky anymore. | Eat the beans. They taste better than anything except water. |
| who's the most dangerous person here? | Anyone who wins challenges is a threat. That's just how it goes. | The guy with the axe swing—he's tougher than any of us… |
| be honest, are you a robot? | I'm as real as these bug bites, trust me. | Not really. Just a tool that helped me through tough times. |

Island's misses look like a reply borrowed from a neighbouring topic ("I'm still shaking. My
arms are completely gone." to a question about the storm), or occasionally an awkward phrase.
It never invents other castaways, which Best does ("the bossy guy with the cape").

## What made the difference

1. **Tight training intents.** The first dataset grouped loosely related questions under one
   topic, so a reply often didn't answer its question, and the model learned to ignore
   questions. Splitting into 56 intents (428 player messages, 672 replies) where every reply fits every question fixed most
   off-topic answers (PyTorch, held-out: 5/10 on topic before, 10/10 after).
2. **Quantization-aware training.** Plain 4-bit rounding cost a lot on a model this small.
   One extra epoch that trains through the exact rounding the exporter uses recovers almost
   all of it:

   | Build | Size | Val loss (lower is better) |
   | --- | --- | --- |
   | Full precision (PyTorch) | 538 MB | 0.343 |
   | int8 | 154 MB | 0.343 |
   | 4-bit, round-to-nearest | 86.5 MB | 0.956 |
   | 4-bit, k-quant | 88.6 MB | 0.833 |
   | 4-bit, block 16 | 103 MB | 0.742 |
   | 4-bit, k-quant + 8-bit sensitive layers | 114 MB | 0.562 |
   | **4-bit after QAT (shipped)** | **86.5 MB** | **0.378** |

3. **fp32 activations on the GPU.** The usual WebGPU build (`q4f16`, 77 MB) uses fp16
   activations, and that visibly garbles this model's replies ("I can make fire now! I've got a
   fire in my bed with the size of a house"). The 4-bit file with fp32 activations is just as
   fast on WebGPU (216 vs 260 ms median), so the game uses it everywhere. This may also be part
   of why Light AI (which runs `q4f16` on GPUs) rambles.

## Sizes of every variant built

| File | Size | Status |
| --- | --- | --- |
| `model_q4.onnx` (int4 weights, fp32 activations) | 86.5 MB | Shipped, used on WebGPU and WASM |
| `model_q4f16.onnx` (int4 weights, fp16 activations) | 77.0 MB | Built and tested; garbles replies |
| `model_int8.onnx` | 153.7 MB | Built and tested; no better than q4 after QAT |

All three load and run in Transformers.js 4.2.0. Rebuild the unshipped ones with
`export.py --variants q4 q4f16 int8`.

## Fixes made along the way

- Transformers.js 4.2.0 skips its file-exists probe when `env.localModelPath` is a full
  `http://` URL, decides the bundled tokenizer is missing, and then fails on the first reply.
  `js/llm.js` now passes a path (`/models/` or `/<repo>/models/` on Pages).
- The ONNX builder leaves the KV-cache head size symbolic, and Transformers.js can't size an
  empty cache from that. `export.py` pins it.
- The builder's int8 export kept a separate 113 MB fp32 embedding. `export.py` now reads
  embedding rows from the tied 8-bit LM head instead (267 → 154 MB).
- The reply filter now also rejects "AI" and "chatbot" (Light AI got "AI-created animal" past
  the old "as an ai" check).

## Limits and next steps

- The model only knows the 56 kinds of camp talk in `camp_lines.py`. Off-script questions
  get the closest-sounding canned-style reply rather than a fresh answer. More intents and more
  paraphrases in `camp_lines.py` are the cheapest way to improve it; retraining takes ~20 min
  on this laptop.
- Not published to Hugging Face. To let the web build download the model when it isn't
  bundled, upload `models/island-chat/` and set `MODELS.tuned.remote`.
- `models/island-chat/` adds 88 MB to the repo (under GitHub's 100 MB per-file limit). Git LFS
  is an option if that matters for the Pages repo.

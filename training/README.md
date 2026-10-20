# Island chat model

A small fine-tuned model that voices castaway small talk in Island Council's camp chat,
fully on-device through Transformers.js. It ships with the game under `models/island-chat/`
(one 86.5 MB 4-bit file, used on WebGPU and WASM) and shows up in setup as
**Castaway chat → Island AI**. See [REPORT.md](REPORT.md) for how it compares to Light and Best.

The model only ever handles small talk. Anything that changes the game (votes, alliances,
warnings) is still answered by the rules engine in `js/chat.js` / `js/ai.js`, and
`vetReply()` in `js/llm.js` still throws out any reply that mentions votes, idols or other
castaways' names.

## Pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `camp_lines.py` | Hand-written camp talk: 56 tight intents of player messages and castaway replies, with per-archetype and per-mood variants. Edit this to change how castaways talk. |
| 2 | `gen_dataset.py` | Samples persona × topic × phrasing into `data/train.jsonl` / `data/val.jsonl` (8,000 chats by default). Fails if any reply is too long, names another castaway, uses a filtered word, or breaks character. |
| 3 | `train.py` | Full fine-tune of `HuggingFaceTB/SmolLM2-135M-Instruct`, loss on the reply only (3 epochs, ~12 min). |
| 4 | `train.py --qat` | One more epoch training through the exact 4-bit rounding the exporter uses, then saves weights already on that grid (~7 min). Without it, 4-bit costs a lot of quality. |
| 5 | `export.py` | ONNX export with the onnxruntime-genai builder into `../models/island-chat/onnx/model_q4.onnx`. |
| 6 | `quant_eval.py` | Val loss of any exported ONNX file, to compare quantization settings against PyTorch. |
| 7 | `compare/compare.mjs` | Runs the same prompts and filters as the game against every model with Transformers.js 4.2.0 and writes `compare/results.json`. |

The system prompt the model is trained on lives in two places that must match:
`system_prompt()` in `gen_dataset.py` and `tunedSystem()` in `js/llm.js`.

## Running it

Two Python environments, because the training stack pins transformers 4.x and the ONNX
builder needs transformers 5.

```bash
# training env (CUDA build of torch; use the CPU index URL if you have no NVIDIA GPU)
python -m venv .venv
.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv/Scripts/python -m pip install "transformers<5" accelerate
.venv/Scripts/python gen_dataset.py
.venv/Scripts/python train.py
.venv/Scripts/python train.py --qat

# export env
python -m venv .venv-export
.venv-export/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv-export/Scripts/python -m pip install "transformers>=5" onnxruntime-genai onnx onnxruntime
.venv-export/Scripts/python export.py
.venv-export/Scripts/python quant_eval.py ../models/island-chat/onnx/model_q4.onnx

# compare (Node 20+)
cd compare && npm install && node compare.mjs
```

On macOS/Linux use `.venv/bin/python`. Both training passes together take about 20 minutes on
a 6 GB laptop GPU (RTX 3060). On CPU it works but takes much longer; on Colab or Kaggle, upload
this folder, `pip install "transformers<5" accelerate`, run `gen_dataset.py`, `train.py` and
`train.py --qat`, then download `out/island-chat-qat/` and run `export.py` locally.

Disk: the CUDA training env is ~5 GB and each checkpoint ~0.5 GB.

Keep the GPU build at fp32 activations (`q4`). The `q4f16` build is smaller (77 MB) but its
fp16 activations garble a model this small.

## Publishing to Hugging Face (optional)

The game loads `models/island-chat/` first. To also let the web build download the model
when it isn't bundled, upload that folder to a Hugging Face model repo and set
`MODELS.tuned.remote` in `js/llm.js` to the repo id.

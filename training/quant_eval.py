"""Scores exported ONNX variants by loss on the validation replies (lower is better).

    python quant_eval.py ../models/island-chat/onnx/model_q4.onnx ../models/island-chat/onnx/model_int8.onnx

Compare against the PyTorch val loss train.py prints to see how much quantization costs.
Runs on the CPU execution provider, so fp16 (q4f16) graphs are not supported here.
"""
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

HERE = Path(__file__).parent


def main():
    tok = AutoTokenizer.from_pretrained(HERE / "out" / "island-chat")
    rows = [json.loads(l)["messages"] for l in open(HERE / "data" / "val.jsonl", encoding="utf-8")][:200]
    for path in sys.argv[1:]:
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        pasts = [i for i in sess.get_inputs() if i.name.startswith("past_key_values")]
        tot, cnt = 0.0, 0
        for m in rows:
            prompt = tok.apply_chat_template(m[:-1], tokenize=False, add_generation_prompt=True)
            full = tok.apply_chat_template(m, tokenize=False)
            p = tok(prompt, add_special_tokens=False)["input_ids"]
            f = tok(full, add_special_tokens=False)["input_ids"]
            ids = np.array([f], dtype=np.int64)
            feeds = {"input_ids": ids, "attention_mask": np.ones_like(ids)}
            for i in pasts:
                feeds[i.name] = np.zeros((1, i.shape[1], 0, i.shape[3]), dtype=np.float32)
            logits = sess.run(["logits"], feeds)[0][0].astype(np.float64)
            logp = logits - np.log(np.exp(logits - logits.max(-1, keepdims=True)).sum(-1, keepdims=True)) - logits.max(-1, keepdims=True)
            end = len(f) - 1  # skip the trailing newline after <|im_end|>, like train.py
            for t in range(len(p), end):
                tot -= logp[t - 1, f[t]]
                cnt += 1
        size = Path(path).stat().st_size / 1e6
        print(f"{Path(path).name}: val loss {tot / cnt:.3f}  ({size:.1f} MB)")


if __name__ == "__main__":
    main()

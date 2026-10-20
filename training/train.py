"""Full fine-tune of a small chat model on the camp-chat set.

    python train.py                                   # SmolLM2-135M-Instruct -> out/island-chat
    python train.py --base HuggingFaceTB/SmolLM2-135M-Instruct --epochs 3 --lr 5e-5
    python train.py --qat                             # out/island-chat -> out/island-chat-qat (4-bit aware)

--qat continues from the fine-tuned model while every matrix is rounded exactly the way the
ONNX export rounds it (symmetric int4, blocks of 32), then saves weights already on that grid,
so the 4-bit build behaves like the full-precision one instead of losing a lot to rounding.

Loss is computed on the castaway reply only. Fits in ~3 GB of GPU memory; also runs
(slowly) on CPU. Prints sample replies for a few held-out questions at the end.
"""
import argparse
import json
import math
import random
import time
from pathlib import Path

import torch
from torch.func import functional_call
from transformers import AutoModelForCausalLM, AutoTokenizer, get_cosine_schedule_with_warmup

HERE = Path(__file__).parent


BLOCK = 32


def fake_int4(w):
    """Round like onnxruntime's MatMulNBits RTN (symmetric): per block of 32 along the input dim,
    scale = (value with the largest magnitude) / -8, q = clip(round(w / scale), -8, 7).
    Straight-through: the forward pass sees the rounded weight, gradients flow to w unchanged."""
    b = w.float().reshape(*w.shape[:-1], w.shape[-1] // BLOCK, BLOCK)
    ext = b.gather(-1, b.abs().argmax(-1, keepdim=True))
    scale = torch.where(ext == 0, torch.ones_like(ext), ext / -8)
    q = (torch.clamp(torch.round(b / scale), -8, 7) * scale).reshape(w.shape).to(w.dtype)
    return w + (q - w).detach()


def quant_targets(model):
    """Every matrix the export stores in 4 bits: attention/MLP projections and the tied embedding/LM head."""
    return {n for n, p in model.named_parameters() if p.dim() == 2 and p.shape[-1] % BLOCK == 0}


def forward(model, targets, **kw):
    if not targets:
        return model(**kw)
    params = {n: fake_int4(p) if n in targets else p for n, p in model.named_parameters()}
    return functional_call(model, params, args=(), kwargs=kw, tie_weights=True)


def load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line)["messages"] for line in f]


def encode(tok, messages, max_len):
    """Token ids for the whole chat, with labels masked to the assistant reply (+ its end token)."""
    prompt = tok.apply_chat_template(messages[:-1], tokenize=False, add_generation_prompt=True)
    full = tok.apply_chat_template(messages, tokenize=False)
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    f_ids = tok(full, add_special_tokens=False)["input_ids"][:max_len]
    labels = [-100] * len(p_ids) + f_ids[len(p_ids):]
    # drop the trailing newline after <|im_end|> from the loss so the model learns to stop on im_end
    if tok.decode(f_ids[-1:]).strip() == "":
        labels[-1] = -100
    return f_ids, labels[: len(f_ids)]


def batches(rows, bs, pad_id, shuffle, rng):
    idx = list(range(len(rows)))
    if shuffle:
        rng.shuffle(idx)
    for i in range(0, len(idx), bs):
        chunk = [rows[j] for j in idx[i:i + bs]]
        n = max(len(x) for x, _ in chunk)
        ids = torch.full((len(chunk), n), pad_id)
        lab = torch.full((len(chunk), n), -100)
        att = torch.zeros((len(chunk), n), dtype=torch.long)
        for k, (x, y) in enumerate(chunk):
            ids[k, : len(x)] = torch.tensor(x)
            lab[k, : len(y)] = torch.tensor(y)
            att[k, : len(x)] = 1
        yield ids, lab, att


@torch.no_grad()
def evaluate(model, rows, bs, pad_id, device, targets=()):
    model.eval()
    tot, cnt = 0.0, 0
    for ids, lab, att in batches(rows, bs, pad_id, False, None):
        out = forward(model, targets, input_ids=ids.to(device), attention_mask=att.to(device), labels=lab.to(device))
        n = (lab[:, 1:] != -100).sum().item()
        tot += out.loss.item() * n
        cnt += n
    model.train()
    return tot / max(cnt, 1)


@torch.no_grad()
def samples(model, tok, device):
    from camp_lines import EVAL_QUESTIONS
    model.eval()
    sys = "You are Zoe, a poker dealer on an island survival game show. Personality: Schemer."
    for q in EVAL_QUESTIONS:
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": q}]
        ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to(device)
        out = model.generate(ids, max_new_tokens=40, do_sample=True, temperature=0.7, top_p=0.9,
                             repetition_penalty=1.1, eos_token_id=tok.convert_tokens_to_ids("<|im_end|>"))
        print(f"  > {q}\n    {tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip()}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="HuggingFaceTB/SmolLM2-135M-Instruct")
    ap.add_argument("--data", default=str(HERE / "data"))
    ap.add_argument("--out", default=str(HERE / "out" / "island-chat"))
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--max_len", type=int, default=128)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--qat", action="store_true", help="4-bit-aware pass on top of an already fine-tuned model")
    args = ap.parse_args()
    if args.qat:  # sensible defaults for the short second pass, unless overridden
        if args.base == ap.get_default("base"):
            args.base = str(HERE / "out" / "island-chat")
        if args.out == ap.get_default("out"):
            args.out = str(HERE / "out" / "island-chat-qat")
        if args.epochs == ap.get_default("epochs"):
            args.epochs = 1
        if args.lr == ap.get_default("lr"):
            args.lr = 2e-5

    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" and torch.cuda.is_bf16_supported() else torch.float32
    tok = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=torch.float32).to(device)
    pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    targets = quant_targets(model) if args.qat else set()

    train = [encode(tok, m, args.max_len) for m in load(Path(args.data) / "train.jsonl")]
    val = [encode(tok, m, args.max_len) for m in load(Path(args.data) / "val.jsonl")]
    steps_per_epoch = math.ceil(len(train) / args.bs)
    total = int(steps_per_epoch * args.epochs)
    print(f"{len(train)} train / {len(val)} val, {total} steps on {device} ({dtype})")
    print(f"val loss before: {evaluate(model, val, args.bs, pad_id, device, targets):.3f}" + (" (int4)" if targets else ""))

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01, betas=(0.9, 0.95))
    sched = get_cosine_schedule_with_warmup(opt, int(total * 0.05), total)
    step, t0 = 0, time.time()
    model.train()
    while step < total:
        for ids, lab, att in batches(train, args.bs, pad_id, True, rng):
            with torch.autocast(device_type=device, dtype=dtype, enabled=dtype != torch.float32):
                loss = forward(model, targets, input_ids=ids.to(device), attention_mask=att.to(device), labels=lab.to(device)).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            step += 1
            if step % 25 == 0:
                print(f"step {step}/{total} loss {loss.item():.3f} lr {sched.get_last_lr()[0]:.2e} {time.time() - t0:.0f}s")
            if step % steps_per_epoch == 0 or step == total:
                print(f"  val loss: {evaluate(model, val, args.bs, pad_id, device, targets):.3f}")
            if step >= total:
                break

    if targets:  # bake the rounding in, so the export's own rounding reproduces these weights exactly
        with torch.no_grad():
            for n, p in model.named_parameters():
                if n in targets:
                    p.copy_(fake_int4(p))
    model.save_pretrained(args.out, safe_serialization=True)
    tok.save_pretrained(args.out)
    print(f"saved to {args.out}")
    samples(model, tok, device)


if __name__ == "__main__":
    main()

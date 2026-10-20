"""Exports the fine-tuned checkpoint to ONNX for Transformers.js and installs it in ../models.

    python export.py                       # out/island-chat-qat -> ../models/island-chat/onnx/model_q4.onnx
    python export.py --variants q4 q4f16 int8   # also the variants we tested and don't ship

Uses the onnxruntime-genai model builder (the same tool behind the onnx-community "-GQA"
builds): fused GroupQueryAttention, rotary and norm ops, 4- or 8-bit MatMulNBits weights, and
the tied embedding / LM head stored once (GatherBlockQuantized), which is what keeps it small.
Export the --qat checkpoint: its weights already sit on the int4 grid, so 4-bit loses almost nothing.

  q4     int4 weights, fp32 activations   shipped; used on WebGPU and WASM (86.5 MB)
  q4f16  int4 weights, fp16 activations   77 MB, but fp16 activations garble replies on WebGPU
  int8   int8 weights, fp32 activations   154 MB, no better than q4 once the model is QAT-trained
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = Path(__file__).parent
VARIANTS = {"q4f16": ("int4", "webgpu"), "q4": ("int4", "cpu"), "int8": ("int8", "cpu")}
TOKENIZER_FILES = ["tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.json", "merges.txt",
                   "generation_config.json", "chat_template.jinja"]


def fix_kv_dims(model, head_dim):
    """Transformers.js sizes the empty first-step KV cache from the graph's static dims; the builder leaves head size symbolic."""
    for vi in list(model.graph.input) + list(model.graph.output):
        if vi.name.startswith(("past_key_values.", "present.")):
            d = vi.type.tensor_type.shape.dim[3]
            if d.dim_param:
                d.ClearField("dim_param")
                d.dim_value = head_dim


def share_int8_embedding(model):
    """GatherBlockQuantized is 4-bit only, so when the LM head is 8-bit the builder stores a separate
    full-precision embedding (56-113 MB). Look rows up in the tied 8-bit LM head instead:
    emb = (q - 128) * scale, per block, in the scales' dtype (fp32 or fp16)."""
    g = model.graph
    inits = {i.name: i for i in g.initializer}
    head = next((n for n in g.node if n.op_type == "MatMulNBits" and "lm_head" in n.name
                 and any(a.name == "bits" and a.i == 8 for a in n.attribute)), None)
    emb = next((n for n in g.node if n.op_type == "Gather" and n.input[0] in inits
                and len(inits[n.input[0]].dims) == 2 and inits[n.input[0]].dims[0] > 10000), None)
    if head is None or emb is None or len(head.input) > 3 and head.input[3]:
        return False
    w, scales = head.input[1], head.input[2]
    dtype = inits[scales].data_type
    hidden = inits[emb.input[0]].dims[1]
    ids, out, p = emb.input[1], emb.output[0], "/model/embed_tokens/int8"
    np_dtype = helper.tensor_dtype_to_np_dtype(dtype)
    consts = [
        numpy_helper.from_array(np.array(128, dtype=np_dtype), f"{p}/zp"),
        helper.make_tensor(f"{p}/axes", TensorProto.INT64, [1], [-1]),
        helper.make_tensor(f"{p}/shape", TensorProto.INT64, [3], [0, 0, hidden]),
    ]
    nodes = [
        helper.make_node("Gather", [w, ids], [f"{p}/q"], name=f"{p}/GatherQ", axis=0),
        helper.make_node("Gather", [scales, ids], [f"{p}/s"], name=f"{p}/GatherS", axis=0),
        helper.make_node("Cast", [f"{p}/q"], [f"{p}/qf"], name=f"{p}/Cast", to=dtype),
        helper.make_node("Sub", [f"{p}/qf", f"{p}/zp"], [f"{p}/c"], name=f"{p}/Sub"),
        helper.make_node("Unsqueeze", [f"{p}/s", f"{p}/axes"], [f"{p}/s3"], name=f"{p}/Unsqueeze"),
        helper.make_node("Mul", [f"{p}/c", f"{p}/s3"], [f"{p}/deq"], name=f"{p}/Mul"),
        helper.make_node("Reshape", [f"{p}/deq", f"{p}/shape"], [out], name=f"{p}/Reshape"),
    ]
    i = list(g.node).index(emb)
    g.node.remove(emb)
    for k, n in enumerate(nodes):
        g.node.insert(i + k, n)
    if not any(emb.input[0] in n.input for n in g.node):
        g.initializer.remove(inits[emb.input[0]])
    g.initializer.extend(consts)
    return True


def build(src, variant, dest, quant_opts=()):
    precision, ep = VARIANTS[variant]
    with tempfile.TemporaryDirectory() as tmp:
        cmd = [sys.executable, "-m", "onnxruntime_genai.models.builder", "-i", str(src), "-o", tmp,
               "-p", precision, "-e", ep, "-c", str(Path(tmp) / "cache"),
               "--extra_options", "block_size=32", "accuracy_level=4", *quant_opts]
        print(" ".join(cmd))
        subprocess.run(cmd, check=True)
        model = onnx.load(str(Path(tmp) / "model.onnx"), load_external_data=True)
        cfg = json.loads((Path(src) / "config.json").read_text())
        fix_kv_dims(model, cfg.get("head_dim") or cfg["hidden_size"] // cfg["num_attention_heads"])
        if share_int8_embedding(model):
            print(f"{variant}: embedding now reads the shared 8-bit LM head")
        out = dest / "onnx" / f"model_{variant}.onnx"
        out.parent.mkdir(parents=True, exist_ok=True)
        onnx.save_model(model, str(out), save_as_external_data=False)  # single file, < 2 GB
        print(f"{variant}: {out.stat().st_size / 1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(HERE / "out" / "island-chat-qat"))
    ap.add_argument("--dest", default=str(HERE.parent / "models" / "island-chat"))
    ap.add_argument("--variants", nargs="+", default=["q4"])
    ap.add_argument("--quant", nargs="*", default=[], help="extra builder options, e.g. algo_config=k_quant block_size=16")
    args = ap.parse_args()
    src, dest = Path(args.src), Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    for v in args.variants:
        build(src, v, dest, args.quant)
    for f in TOKENIZER_FILES:
        if (src / f).exists():
            shutil.copy(src / f, dest / f)
    # Transformers.js reads the chat template from tokenizer_config.json, not chat_template.jinja.
    tc_path, tpl = dest / "tokenizer_config.json", src / "chat_template.jinja"
    if tpl.exists():
        tc = json.loads(tc_path.read_text(encoding="utf-8"))
        tc["chat_template"] = tpl.read_text(encoding="utf-8")
        tc_path.write_text(json.dumps(tc, indent=2), encoding="utf-8")
        (dest / "chat_template.jinja").unlink(missing_ok=True)
    cfg = json.loads((src / "config.json").read_text())
    cfg["transformers.js_config"] = {"kv_cache_dtype": {"q4f16": "float16", "fp16": "float16"}}
    (dest / "config.json").write_text(json.dumps(cfg, indent=2))
    print(f"installed in {dest}")


if __name__ == "__main__":
    main()

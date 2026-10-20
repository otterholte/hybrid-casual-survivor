"""Builds the camp-chat fine-tuning set from camp_lines.py.

    python gen_dataset.py            # writes data/train.jsonl and data/val.jsonl

Each example is a chat in the exact format js/llm.js sends for the tuned model:
a short persona system prompt, one player message, one castaway reply.
Deterministic for a given --seed.
"""
import argparse
import json
import random
import re
from pathlib import Path

from camp_lines import EVAL_QUESTIONS, TOPICS, VOICE

# Mirrors CAST_POOL / ARCHETYPES in js/data.js (name, job, archetype).
CAST = [
    ("Maya", "Surf instructor", "beast"), ("Jordan", "Bartender", "social"), ("Alex", "Lawyer", "strategist"),
    ("Ben", "Firefighter", "loyalist"), ("Priya", "Med student", "puzzler"), ("Marcus", "Ex-quarterback", "beast"),
    ("Zoe", "Poker dealer", "schemer"), ("Tyler", "Youth pastor", "underdog"), ("Leilani", "Fisher", "loyalist"),
    ("Diego", "Chef", "wildcard"), ("Hana", "Game designer", "strategist"), ("Rex", "Car salesman", "schemer"),
    ("Nia", "Kindergarten teacher", "social"), ("Owen", "Park ranger", "wildcard"), ("Sofia", "Architect", "puzzler"),
    ("Gus", "Retired plumber", "underdog"),
]
# Extra made-up castaways so the model learns the persona slots rather than memorising 16 people.
EXTRA_NAMES = ["Kai", "Rosa", "Theo", "Imani", "Luca", "Mei", "Sam", "Ivy", "Nate", "Ava", "Omar", "Jess", "Ruby", "Cole", "Tess", "Raj"]
EXTRA_JOBS = ["Nurse", "Barista", "Electrician", "Accountant", "Yoga teacher", "Mechanic", "Paramedic", "Dentist",
              "Lifeguard", "Realtor", "Pilot", "Florist", "Mail carrier", "Farmer", "Welder", "Librarian"]
LABELS = {
    "strategist": "Mastermind", "beast": "Challenge Beast", "social": "Social Player", "schemer": "Schemer",
    "loyalist": "Loyal Soldier", "wildcard": "Wildcard", "puzzler": "Puzzle Whiz", "underdog": "Underdog",
}
MOODS = {"": "", "wary": "Privately you are wary of them.", "like": "You like them."}

# Words js/llm.js rejects, plus anything that breaks character.
BANNED = re.compile(r"\b(vote|votes|voting|voted|idol|idols|alliance|blindside\w*|ai|a\.i\.|bot|chatbot|language model|assistant)\b", re.I)


def system_prompt(name, job, arch, mood):
    """Keep in sync with tunedSystem() in js/llm.js."""
    s = f"You are {name}, a {job.lower()} on an island survival game show. Personality: {LABELS[arch]}."
    return f"{s} {MOODS[mood]}".strip()


def article_job(job):
    return job.lower()


def noisy(q, rng):
    """Players type casually: vary case, punctuation and filler."""
    if rng.random() < 0.35:
        q = q.lower()
    elif rng.random() < 0.3:
        q = q[0].upper() + q[1:]
    if rng.random() < 0.3:
        q = q.rstrip("?!.")
    if rng.random() < 0.08:
        q = q + " lol"
    if rng.random() < 0.08:
        q = "hey, " + q[0].lower() + q[1:]
    if rng.random() < 0.05:
        q = q + "??"
    return q


def fill(reply, job):
    return reply.replace("{job}", job.lower()).replace("{Job}", job)


def pick_reply(topic, arch, mood, rng):
    t = TOPICS[topic]
    if mood and t.get("mood", {}).get(mood) and rng.random() < 0.6:
        return rng.choice(t["mood"][mood]), False
    arch_lines = t.get("arch", {}).get(arch)
    if arch_lines and rng.random() < 0.4:
        return rng.choice(arch_lines), False
    return rng.choice(t["a"]), True


def with_voice(reply, arch, rng):
    lead = rng.choice(VOICE[arch])
    if lead.endswith((",", ":")):
        body = reply[0].lower() + reply[1:] if not reply.startswith("I ") and not reply.startswith("I'") else reply
    else:
        body = reply
    return f"{lead} {body}"


def persona(rng):
    if rng.random() < 0.7:
        return rng.choice(CAST)
    return rng.choice(EXTRA_NAMES), rng.choice(EXTRA_JOBS), rng.choice(list(LABELS))


def check(reply, name):
    assert not BANNED.search(reply), f"banned word in reply: {reply}"
    sentences = re.findall(r"[^.!?]+[.!?]+", reply)
    assert 1 <= len(sentences) <= 5 and len(reply) <= 170, f"reply too long: {reply}"
    others = {n for n, _, _ in CAST} | set(EXTRA_NAMES)
    for n in others - {name}:
        assert not re.search(rf"\b{n}\b", reply), f"names another castaway: {reply}"


def build(n, seed):
    rng = random.Random(seed)
    topics = list(TOPICS)
    weights = [TOPICS[t].get("weight", 1.0) for t in topics]
    held = {q.lower().rstrip("?!. ") for q in EVAL_QUESTIONS}
    seen, out = set(), []
    while len(out) < n:
        topic = rng.choices(topics, weights)[0]
        name, job, arch = persona(rng)
        mood = rng.choices(["", "wary", "like"], [0.6, 0.2, 0.2])[0]
        q = rng.choice(TOPICS[topic]["q"])
        if q.lower().rstrip("?!. ") in held:
            continue
        reply, generic = pick_reply(topic, arch, mood, rng)
        reply = fill(reply, job)
        if generic and rng.random() < 0.12:
            reply = with_voice(reply, arch, rng)
        check(reply, name)
        q = noisy(q, rng)
        key = (q.lower(), reply, arch, mood)
        if key in seen:
            continue
        seen.add(key)
        out.append({"topic": topic, "messages": [
            {"role": "system", "content": system_prompt(name, job, arch, mood)},
            {"role": "user", "content": q},
            {"role": "assistant", "content": reply},
        ]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--val", type=float, default=0.04)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=str(Path(__file__).parent / "data"))
    args = ap.parse_args()
    for t in TOPICS.values():  # validate every authored line once, not just the sampled ones
        for r in t["a"] + sum(t.get("arch", {}).values(), []) + sum(t.get("mood", {}).values(), []):
            check(fill(r, "Chef"), "")
    rows = build(args.n, args.seed)
    k = int(len(rows) * args.val)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, part in (("val", rows[:k]), ("train", rows[k:])):
        with open(out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for r in part:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    counts = {}
    for r in rows:
        counts[r["topic"]] = counts.get(r["topic"], 0) + 1
    print(f"{len(rows) - k} train / {k} val examples")
    print(", ".join(f"{t}:{c}" for t, c in sorted(counts.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()

# 🔥 Island Council

**Play it here: https://otterholte.github.io/hybrid-casual-survivor/**

A hybrid-casual, island-survival party game: a season of a reality competition squeezed into 20–40 minutes. You win quick, one-touch immunity challenges, scheme at camp, and try to survive the vote at Tribal Council. Right now you play solo against bot castaways who form alliances, lie, gossip, hunt idols and hold grudges on the jury.

## The loop

| Phase | Time | What happens |
| --- | --- | --- |
| 📿 **Immunity Challenge** | 30–90s | A one-action skill game. First to finish (or last one standing) wins the necklace and can't be voted out. |
| 🏝️ **Back at Camp** | ~1:45 | A timed phase. Hunt for a hidden immunity idol, message castaways (preset or typed), or spy on conversations. |
| 🔥 **Tribal Council** | ~1:30 + vote | Speak up, then cast a secret vote. Idols are played after votes are cast and before they're read. Then the vote reading. |
| ⚖️ **Final Tribal** | — | Everyone voted out sits on the jury. The final three plead their case and the jury crowns the **Island Champion**. |

## Immunity challenges

- 🥥 **Coconut Drop**: pull back the slingshot and lob coconuts into a swinging sack until the rope snaps.
- 🎱 **Spiral Catch**: balls roll down switchback ramps; tap when one hits the catch zone. Drop one and you're out.
- 🧩 **Slide Puzzle**: rebuild the scrambled tiki sun.
- 🗿 **Totem Stack**: drop sliding carved blocks; overhang is chopped off.
- ⚖️ **Ball Balance**: tilt a rope-held disc to keep every ball aboard as wind picks up.
- ⭕ **Ring Toss**: swipe to flick rope rings onto all four poles.

Every challenge has Easy / Normal / Hard tuning and a **Practice** mode with personal bests.

## Camp strategy

- **Strategy chats**: send preset messages ("Want to work together?", "I think we should vote out ___") or type your own. Bots answer based on how much they trust you, and they may lie. Each castaway only talks for so long per day.
- **Spying**: sneak up on someone, then overhear their conversations for 15 seconds. Some words are garbled, some recipients hidden, and you might get caught.
- **Idol hunting**: pick a spot and dig with hot/cold clues. It costs time you could spend talking, and people notice when you're gone.

Bots remember promises. If you tell someone you're voting one way and then don't, they'll know, and so will the jury.

## Tech

Plain HTML, CSS and JavaScript (ES modules) with no build step and no dependencies. All visuals are drawn with Canvas/SVG and all sound is synthesized live with the Web Audio API.

Run it locally:

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Roadmap

- 👥 Group play: a host screen plus phones joining with a room code, with real players messaging each other
- More challenges (Fire Making, Tilt Maze, Fill the Bucket...)
- More advantages once the core game is proven

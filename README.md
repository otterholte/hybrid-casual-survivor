# 🔥 Island Council

**Play it here: https://otterholte.github.io/hybrid-casual-survivor/**

A hybrid-casual, island-survival party game: a season of a reality competition squeezed into 20–40 minutes. You win quick, one-touch immunity challenges, scheme at camp, and try to survive the vote at Tribal Council. Right now you play solo against bot castaways who form alliances, lie, gossip, hunt idols and hold grudges on the jury.

## The loop

| Phase | Time | What happens |
| --- | --- | --- |
| 📿 **Immunity Challenge** | 30–90s | A one-action skill game. First to finish (or last one standing) wins the necklace and can't be voted out. |
| 🏝️ **Back at Camp** | your pace | Two actions per day: a private strategy talk, spying on one castaway, or searching for a hidden immunity idol. Messages castaways send you are free to answer. Optional time limit. |
| 🔥 **Tribal Council** | ~4 min | The host questions specific castaways (you answer by multiple choice), then everyone votes in secret. Idols are played before the votes are read on a big vote board. |
| ⚖️ **Final Tribal** | — | Everyone voted out sits on the jury. The final three plead their case and the jury crowns the **Island Champion**. |

## Immunity challenges

- 🥥 **Coconut Drop**: pull back the slingshot and lob coconuts into a swinging sack until the rope snaps.
- 🎱 **Spiral Catch**: balls zigzag down three lanes; tap the right lane when one reaches its catch zone. Caught balls come back down a random lane. Drop one and you're out.
- 🧩 **Slide Puzzle**: rebuild the scrambled tiki sun.
- 🗿 **Totem Stack**: drop sliding carved blocks; overhang is chopped off.
- ⚖️ **Ball Balance**: tilt a rope-held disc to keep every ball aboard as wind picks up.
- ⭕ **Ring Toss**: swipe to flick rope rings onto all four poles.

Every challenge has Easy / Normal / Hard tuning and a **Practice** mode with personal bests.

## Camp strategy

- **Strategy talks**: one private conversation per action. Send presets ("Want to work together?", "I think we should vote out ___") or type your own. When a castaway asks you something, you get quick replies (Yes / Maybe / Not them / pick a name). They may lie.
- **Spying**: sneak up on one castaway and overhear them for 15 seconds. Some words are garbled, some recipients hidden, and you might get caught.
- **Idol search**: pick an area and check three spots. Clues point you toward the right area and the right spot.

Bots remember promises. If you tell someone you're voting one way and then don't, they'll know, and so will the jury.

## Your castaway

Choose man or woman, then customize skin tone, face shape, eyes, eye color, brows, nose, mouth, hair style and color, facial hair and buff color. Immunity winners wear the necklace and glow gold everywhere until Tribal is over.

You can pause any time during a season (top-left button or Esc) and quit back to the menu.

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

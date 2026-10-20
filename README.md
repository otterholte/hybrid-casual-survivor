# 🔥 Island Council

**Play it here: https://otterholte.github.io/hybrid-casual-survivor/**

A hybrid-casual, island-survival party game: a season of a reality competition squeezed into 20–40 minutes. You win quick, one-touch immunity challenges, scheme at camp, and try to survive the vote at Tribal Council. Right now you play solo against bot castaways who form alliances, lie, gossip, hunt idols and hold grudges on the jury.

## The loop

| Phase | Time | What happens |
| --- | --- | --- |
| 📿 **Immunity Challenge** | 30–90s | A one-action skill game. The race keeps going until 1st and 2nd are decided: 1st wins immunity plus a big advantage, 2nd wins a smaller advantage. |
| 🏝️ **Back at Camp** | your pace | Talk to anyone, one-on-one or in groups, as much as you like. Plus one excursion per day: spy on a castaway or search for a hidden immunity idol. Optional time limit. |
| 🔥 **Tribal Council** | ~4 min | The host questions specific castaways (you answer by multiple choice), then everyone votes in secret. Idols are played before the votes are read on a big vote board. |
| ⚖️ **Final Tribal** | — | Everyone voted out sits on the jury. The final three plead their case and the jury crowns the **Island Champion**. |

## Immunity challenges

- 🥥 **Coconut Drop**: pull back the slingshot and lob coconuts into a swinging sack until the rope snaps.
- 🎱 **Spiral Catch**: balls zigzag down three lanes; tap the right lane when one reaches its catch zone. Caught balls come back down a random lane. Drop one and you're out.
- 🧩 **Slide Puzzle**: rebuild the scrambled tiki sun.
- 🗿 **Totem Stack**: drop sliding carved blocks; overhang is chopped off.
- ⚖️ **Ball Balance**: steer a rope-held disc with a control pad below it to keep every ball aboard as wind picks up.
- ⭕ **Ring Toss**: swipe to flick rope rings onto all four poles.
- 🌀 **Tilt Maze**: tilt a wooden maze with the control pad and roll three balls into the slot, dodging holes.
- 🪵 **Wobble Table**: slide a counterweight to keep a see-saw level as blocks keep landing on it.
- 🪣 **Fill the Bucket**: catch water from a swinging spout and carry it to the barrel. Coconuts knock water out.
- 🔥 **Fire Making**: strike the flint along the arrow, then feed and blow the fire until it burns through the rope. Often the final challenge.
- 🧱 **Shape Puzzle**: drag and rotate carved pieces to fill a silhouette.
- 🎳 **Ball Roll**: drag to aim, then stop a fast power meter in the green. A sliding blocker guards the 50 hole and pegs deflect sloppy shots; only slow balls drop in.

Every challenge has Easy / Normal / Hard tuning and a **Practice** mode with personal bests.

## Advantages

| Advantage | Won by | What it does |
| --- | --- | --- |
| 🗳️ Extra Vote | 1st place | Cast two votes at a Tribal Council of your choice. |
| 🚫 Vote Blocker | 1st place | Before the vote, stop one castaway from voting. |
| 🔍 Secret Intel | 2nd place | At camp, learn who one castaway is really voting for. |
| 📜 Idol Clue | 2nd place | At camp, go straight to the hidden idol's location. |
| 🧭 Extra Excursion | 2nd place | Take a second excursion at camp. |

Bots win and play advantages too, so watch the podium.

## Camp strategy

- **Messages**: an inbox of every castaway with a preview of their latest message. Unread conversations are highlighted, and when someone asks you something you can tap a quick reply (Yes / Maybe / Not them / a name) right from the list.
- **Group chats**: pick two or more castaways and talk to them together. Everyone hears everything, so a group agreeing on a vote pulls everyone in.
- **Typed messages**: castaways understand a wide range of free text ("are you voting for me?", "what do you think of Maya?", "I'm voting Alex", "do you have the votes?"), and follow-ups like "would you vote for her?" refer to whoever you were just discussing. When they say how they'll vote and mean it, that commitment carries into their actual vote. Ask "Do you have the votes?" (also a quick message) and an honest castaway tells you who is really on board; a schemer bluffs.
- **Spy** (excursion): sneak up on one castaway and overhear them for 15 seconds. Some words are garbled, and you might get caught.
- **Idol search** (excursion): a memory match. Find the two 📜 clue cards to learn where the idol is hidden, then race there before time runs out. Someone else might get there first.

Bots remember promises. If you tell someone you're voting one way and then don't, they'll know, and so will the jury.

### On-device AI chat

Castaways write their own small talk with **Island AI**, our SmolLM2-135M fine-tune trained on camp talk for every castaway archetype (~87 MB, bundled with the game). It runs entirely on your device via [Transformers.js](https://github.com/huggingface/transformers.js); nothing is sent to an API. If it can't load, castaways fall back to scripted small talk. Training pipeline and comparison with off-the-shelf models: [`training/`](training/REPORT.md).

Strategy replies (votes, alliances, warnings) always come from the game's rules engine, so a castaway's words match their actions.

## Your castaway

Choose man or woman, hit Randomize, and tweak skin tone, hair style, hair color and shirt. More options (face shape, eyes, eye color, nose, mouth, facial hair) are one tap away. Immunity winners wear the necklace and glow gold everywhere until Tribal is over.

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

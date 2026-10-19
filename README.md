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
- **Typed messages**: castaways understand a wide range of free text ("are you voting for me?", "what do you think of Maya?", "I'm voting Alex"). When they say how they'll vote and mean it, that commitment carries into their actual vote. They can still lie.
- **Spy** (excursion): sneak up on one castaway and overhear them for 15 seconds. Some words are garbled, and you might get caught.
- **Idol search** (excursion): a memory match. Find the two 📜 clue cards to learn where the idol is hidden, then race there before time runs out. Someone else might get there first.

Bots remember promises. If you tell someone you're voting one way and then don't, they'll know, and so will the jury.

### On-device AI chat (optional)

In setup, **Castaway chat** offers two on-device models that answer small talk and off-script questions in character. They run entirely on your device via [Transformers.js](https://github.com/huggingface/transformers.js), download once, then work offline; nothing is sent to an API.

- **Light AI** (~120 MB): [SmolLM2-135M-Instruct](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-GQA). Fast, sometimes rambly.
- **Best AI** (~300 MB): [LFM2.5-350M](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX). Noticeably more coherent.

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

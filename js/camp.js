// Back at Camp: a shared, timed phase. Hunt for idols, message castaways, or spy.
import { game, P, nm, alive, aliveBots, human, adjTrust } from './state.js';
import { replyTo, botOpener, botConvo, computePlans } from './ai.js';
import { PRESETS, ZONES } from './data.js';
import { h, rand, pick, chance, sleep, weightedPick, shuffle } from './util.js';
import { show, toast, banner, setScene, setMusic, Timer, timerRing, avatarChip, modal } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

const HUNT_COLS = 6, HUNT_ROWS = 5;

export function hideIdolIfNeeded() {
  const S = game.S;
  if (!S.hiddenIdol && S.idolsLeft > 0 && alive().length > 4) {
    S.idolsLeft--;
    S.hiddenIdol = { zone: pick(ZONES).id, idx: Math.floor(Math.random() * HUNT_COLS * HUNT_ROWS) };
    S.dug = {};
  }
}

function botIdolSearchTick(seconds) {
  const S = game.S;
  if (!S.hiddenIdol) return null;
  for (const b of shuffle(aliveBots())) {
    if (chance(0.0007 * (0.5 + b.t.strategic) * seconds)) {
      b.idols++;
      b.stats.idolsFound++;
      S.hiddenIdol = null;
      S.idolSusp[b.id] = Math.min(1, S.idolSusp[b.id] + 0.15);
      return b;
    }
  }
  return null;
}

const vibe = (id) => {
  const tr = game.S.trust[id][0] + (game.S.vibeNoise?.[id] ?? 0);
  if (tr > 0.35) return { e: '😊', t: 'Friendly' };
  if (tr > 0.05) return { e: '🙂', t: 'Warm' };
  if (tr > -0.2) return { e: '😐', t: 'Neutral' };
  return { e: '😒', t: 'Cold' };
};

/** The jury watches camp from the lounge: everything is visible, nothing is interactive. */
export function simulateCamp() {
  const S = game.S;
  const msgs = [];
  for (let i = 0; i < 5; i++) msgs.push(...botConvo());
  const finder = botIdolSearchTick(120);
  return { msgs, finder };
}

export function runCamp() {
  return new Promise((resolve) => {
    const S = game.S, me = human();
    const secs = S.settings.pace === 'blitz' ? 75 : 105;
    S.chats = S.chats || {};
    S.patience = {};
    S.vibeNoise = {};
    for (const b of aliveBots()) {
      S.chats[b.id] = S.chats[b.id] || [];
      S.patience[b.id] = 4;
      S.vibeNoise[b.id] = rand(-0.1, 0.1);
    }
    S.dug = S.dug || {};
    setScene('camp');
    setMusic('camp', 'beach');

    let view = 'hub', viewArg = null, finished = false, spyState = null, huntState = null;
    const unread = new Set();
    const feed = [];
    const pushFeed = (txt, icon = '🌴') => {
      feed.unshift({ txt, icon });
      if (feed.length > 12) feed.pop();
      if (view === 'hub') render();
    };

    const ring = timerRing();
    const body = h('div', { class: 'camp-body' });
    const nav = h('div', { class: 'camp-nav' });
    const scr = h('div', { class: 'screen camp' },
      h('div', { class: 'camp-head' },
        h('div', {}, h('div', { class: 'eyebrow' }, `DAY ${S.day}`), h('div', { class: 'display sm' }, 'BACK AT CAMP')),
        h('div', { class: 'camp-status' },
          me.immune ? h('span', { class: 'pill gold' }, '📿 Immune') : null,
          me.idols ? h('span', { class: 'pill idol' }, `🗿 Idol x${me.idols}`) : null),
        ring),
      body, nav);
    show(scr);

    const timer = new Timer(secs, {
      onTick: (left) => ring.update(left, secs),
      onEnd: () => end(),
    }).start();

    // ---------- background simulation ----------
    const opennerTimes = shuffle([10, 28, 46, 64, 82, 96]).slice(0, randInt(2, 3)).map((x) => x * (secs / 105));
    let elapsed = 0, nextConvo = rand(3, 6);
    const sim = setInterval(() => {
      if (finished) return;
      elapsed += 1;
      nextConvo -= 1;
      if (nextConvo <= 0) {
        nextConvo = rand(4, 8);
        const msgs = botConvo(spyState?.phase === 'live' && chance(0.6) ? spyState.target : undefined);
        if (msgs.length) {
          const a = msgs[0].from, b = msgs[0].to;
          for (const m of msgs) S.convos.push({ ...m, t: performance.now() });
          if (spyState?.phase === 'live') capture(msgs);
          if (chance(0.55)) pushFeed(pick([`${nm(a)} and ${nm(b)} went for a walk.`, `${nm(a)} pulled ${nm(b)} aside by the well.`, `${nm(a)} and ${nm(b)} are whispering by the fire.`, `${nm(a)} and ${nm(b)} went to get water. Together. Again.`]), '👥');
        }
      }
      if (chance(0.05)) {
        const b = pick(aliveBots());
        if (b && S.hiddenIdol) { S.idolSusp[b.id] = Math.min(1, S.idolSusp[b.id] + 0.04); pushFeed(`${b.name} is poking around the ${pick(ZONES).name.toLowerCase()}...`, '🔍'); }
      }
      const finder = botIdolSearchTick(1);
      if (finder) pushFeed(`${finder.name} came back from the jungle looking very pleased.`, '😏');
      if (opennerTimes.length && elapsed >= opennerTimes[0]) {
        opennerTimes.shift();
        const pool = aliveBots().filter((b) => S.patience[b.id] > 1);
        if (pool.length) {
          const b = weightedPick(pool, (x) => x.t.social + Math.max(0, S.trust[x.id][0]) + 0.2);
          const op = botOpener(b.id);
          S.chats[b.id].push({ from: b.id, text: op.text, options: op.options, round: S.round });
          unread.add(b.id);
          sfx('ping');
          toast(`💬 <b>${b.name}</b>: ${op.text}`, 'msg');
          render();
        }
      }
    }, 1000);

    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

    function end() {
      if (finished) return;
      finished = true;
      clearInterval(sim);
      timer.stop();
      huntState?.stop?.();
      spyState?.stop?.();
      sfx('conch');
      banner({ title: 'The conch sounds!', sub: "It's time for Tribal Council.", icon: '🐚', tone: 'sunset', hold: 2200 }).then(resolve);
    }

    // ---------- views ----------
    function go(v, arg) {
      if (huntState && v !== 'hunt') { huntState.stop(); huntState = null; }
      if (spyState && v !== 'spy') { spyState.stop(); spyState = null; }
      view = v;
      viewArg = arg;
      sfx('click');
      render();
    }

    function render() {
      if (finished) return;
      nav.replaceChildren(
        navBtn('hub', '🏝️', 'Camp'),
        navBtn('talk', '💬', 'Strategy', unread.size),
        navBtn('spy', '👀', 'Spy'),
        navBtn('hunt', '🗿', 'Idol Hunt'),
      );
      if (view === 'hub') body.replaceChildren(hubView());
      if (view === 'talk') body.replaceChildren(talkList());
      if (view === 'chat') body.replaceChildren(chatView(viewArg));
      if (view === 'spy' && !spyState) body.replaceChildren(spyPick());
      if (view === 'hunt' && !huntState) body.replaceChildren(huntPick());
    }

    function navBtn(v, icon, label, badge) {
      const active = view === v || (v === 'talk' && view === 'chat');
      return h('button', { class: `nav-btn ${active ? 'on' : ''}`, onclick: () => go(v) },
        h('span', { class: 'nav-ic' }, icon), h('span', {}, label),
        badge ? h('span', { class: 'badge' }, badge) : null);
    }

    function hubView() {
      return h('div', { class: 'hub' },
        h('div', { class: 'action-grid' },
          actionCard('🗿', 'Idol Hunt', 'Find a hidden advantage', 'hunt', 'a-idol'),
          actionCard('💬', 'Strategy', 'Message another castaway', 'talk', 'a-talk'),
          actionCard('👀', 'Spy', 'Intercept a conversation', 'spy', 'a-spy'),
        ),
        h('div', { class: 'card feed' },
          h('div', { class: 'feed-title' }, 'Around camp'),
          feed.length ? feed.map((f) => h('div', { class: 'feed-row' }, h('span', {}, f.icon), h('span', {}, f.txt)))
            : h('div', { class: 'muted' }, 'The tribe is settling in after the challenge...'),
        ),
        h('button', { class: 'btn btn-ghost', onclick: () => { timer.end(); } }, 'Head to Tribal early →'),
      );
    }

    function actionCard(icon, title, sub, v, cls) {
      return h('button', { class: `action-card ${cls}`, onclick: () => go(v) },
        h('div', { class: 'ac-ic' }, icon), h('div', { class: 'ac-t' }, title), h('div', { class: 'ac-s' }, sub));
    }

    // ----- strategy -----
    function talkList() {
      return h('div', { class: 'talk-list' },
        h('div', { class: 'section-title' }, 'Who do you want to talk to?'),
        ...aliveBots().map((b) => {
          const v = vibe(b.id);
          const last = S.chats[b.id].at(-1);
          return h('button', { class: `talk-row ${unread.has(b.id) ? 'unread' : ''}`, onclick: () => { unread.delete(b.id); go('chat', b.id); } },
            h('div', { class: 'tr-face', html: avatarSVG(b.look, { size: 46 }) }),
            h('div', { class: 'tr-mid' },
              h('div', { class: 'tr-name' }, b.name, b.immune ? ' 📿' : '', S.allied[0][b.id] ? h('span', { class: 'ally-tag' }, 'ALLY') : null),
              h('div', { class: 'tr-last' }, last ? (last.from === 0 ? 'You: ' : '') + last.text : `${b.job}`)),
            h('div', { class: 'tr-vibe', title: v.t }, v.e),
            unread.has(b.id) ? h('span', { class: 'dot' }) : null);
        }));
    }

    function chatView(botId) {
      const b = P(botId);
      const log = h('div', { class: 'chat-log' });
      const paint = () => {
        log.replaceChildren(...S.chats[botId].filter((m) => m.round === S.round).map((m) => bubble(m, botId)));
        log.scrollTop = log.scrollHeight;
      };
      const typing = h('div', { class: 'typing hidden' }, h('span'), h('span'), h('span'));
      const input = h('input', { class: 'chat-input', placeholder: 'Type your own message...', maxlength: 120 });
      const send = (presetId, target, text) => {
        if (S.patience[botId] <= 0) return;
        const msg = text || PRESETS.find((p) => p.id === presetId).text.replace('{X}', target != null ? nm(target) : '');
        S.chats[botId].push({ from: 0, text: msg, round: S.round });
        S.patience[botId]--;
        sfx('send');
        paint();
        typing.classList.remove('hidden');
        setTimeout(() => {
          if (finished) return;
          typing.classList.add('hidden');
          let reply = replyTo(botId, presetId, target, text);
          if (S.patience[botId] <= 0) reply += ' ...Anyway, I should get back before people notice.';
          S.chats[botId].push({ from: botId, text: reply, round: S.round });
          sfx('ping');
          if (view === 'chat' && viewArg === botId) render();
        }, rand(900, 2000));
      };
      const tired = S.patience[botId] <= 0;
      const v = vibe(botId);
      const el = h('div', { class: 'chat' },
        h('div', { class: 'chat-head' },
          h('button', { class: 'back', onclick: () => go('talk') }, '←'),
          h('div', { html: avatarSVG(b.look, { size: 40 }) }),
          h('div', { class: 'ch-who' }, h('b', {}, b.name), h('small', {}, `${b.job} · ${v.e} ${v.t}`)),
          h('div', { class: 'patience', title: 'How much longer they will talk' }, '●'.repeat(Math.max(0, S.patience[botId])) + '○'.repeat(Math.max(0, 4 - S.patience[botId])))),
        log, typing,
        tired ? h('div', { class: 'muted center' }, `${b.name} has wandered off. Try someone else.`) :
          h('div', { class: 'chips' }, ...PRESETS.map((p) => h('button', {
            class: 'chip-btn', onclick: async () => {
              if (p.needs) {
                const t = await pickName(p.text, alive().filter((x) => !x.human).map((x) => x.id));
                if (t == null) return;
                send(p.id, t);
              } else send(p.id);
            },
          }, p.text.replace('{X}', '___')))),
        tired ? null : h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); const v2 = input.value.trim(); if (v2) { input.value = ''; send(null, null, v2); } } },
          input, h('button', { class: 'btn btn-teal sm', type: 'submit' }, 'Send')),
      );
      paint();
      return el;
    }

    function bubble(m, botId) {
      const mine = m.from === 0;
      const el = h('div', { class: `bubble ${mine ? 'mine' : 'theirs'}` }, m.text);
      if (m.options && !m.answered) {
        el.append(h('div', { class: 'bubble-opts' }, ...m.options.map((o) => h('button', {
          class: 'chip-btn sm', onclick: () => {
            m.answered = true;
            S.chats[botId].push({ from: 0, text: o.label, round: S.round });
            const r = o.fx();
            sfx('send');
            render();
            setTimeout(() => { if (finished) return; S.chats[botId].push({ from: botId, text: r, round: S.round }); sfx('ping'); if (view === 'chat' && viewArg === botId) render(); }, rand(700, 1400));
          },
        }, o.label))));
      }
      return el;
    }

    // ----- spy -----
    function spyPick() {
      return h('div', { class: 'spy' },
        h('div', { class: 'section-title' }, 'Who do you want to spy on?'),
        h('p', { class: 'muted' }, 'It takes a few seconds to sneak close. Then you can overhear what they say for 15 seconds. You might get caught!'),
        h('div', { class: 'spy-grid' }, ...aliveBots().map((b) => h('button', { class: 'spy-target', onclick: () => startSpy(b.id) }, avatarChip(b, { size: 54 })))));
    }

    function startSpy(target) {
      sfx('click');
      const connectSecs = 6, liveSecs = 15;
      const bar = h('div', { class: 'spy-bar-fill' });
      const status = h('div', { class: 'spy-status' }, `Sneaking toward ${nm(target)}...`);
      const logEl = h('div', { class: 'spy-log' });
      const panel = h('div', { class: 'spy live' },
        h('div', { class: 'spy-hero', html: `<div class="bush">🌿</div>${avatarSVG(P(target).look, { size: 70 })}<div class="bush r">🌿</div>` }),
        status, h('div', { class: 'spy-bar' }, bar), logEl,
        h('button', { class: 'btn btn-ghost', onclick: () => { spyState?.stop(); spyState = null; go('spy'); } }, 'Done spying'));
      body.replaceChildren(panel);
      let t = 0;
      const iv = setInterval(() => {
        t += 0.1;
        if (spyState.phase === 'connect') {
          bar.style.width = `${(t / connectSecs) * 100}%`;
          if (t >= connectSecs) {
            spyState.phase = 'live';
            t = 0;
            status.textContent = `👂 Listening in on ${nm(target)}...`;
            panel.classList.add('listening');
            sfx('pop');
            setTimeout(() => {
              if (spyState?.phase !== 'live') return;
              const msgs = botConvo(target);
              for (const m of msgs) S.convos.push({ ...m, t: performance.now() });
              capture(msgs);
            }, 1200);
          }
        } else {
          bar.style.width = `${100 - (t / liveSecs) * 100}%`;
          if (t >= liveSecs) {
            clearInterval(iv);
            spyState.phase = 'done';
            status.textContent = 'They wandered off.';
            const caught = chance(0.2);
            if (caught) {
              adjTrust(target, 0, -0.25);
              game.S.influence[target][0] += 0.2;
              computePlans();
              sfx('gasp');
              toast(`😳 <b>${nm(target)}</b> noticed you spying!`, 'bad');
              pushFeed(`${nm(target)} noticed ${me.name} lurking in the bushes.`, '😳');
            }
            if (!logEl.children.length) logEl.append(h('div', { class: 'muted' }, 'You only heard small talk about fishing.'));
          }
        }
      }, 100);
      spyState = { target, phase: 'connect', log: logEl, stop: () => clearInterval(iv) };
    }

    function capture(msgs) {
      if (!spyState || spyState.phase !== 'live') return;
      const tgt = spyState.target;
      msgs.filter((m) => m.from === tgt || m.to === tgt).forEach((m, i) => {
        setTimeout(() => {
          if (!spyState || spyState.phase !== 'live') return;
          let text = m.text;
          if (chance(0.25)) text = text.split(' ').map((w, k) => (k > 0 && chance(0.3) ? '▒'.repeat(Math.min(5, w.length)) : w)).join(' ');
          const hideTo = chance(0.35);
          spyState.log.append(h('div', { class: 'spy-msg' },
            h('b', {}, nm(m.from)), h('span', { class: 'arrow' }, ' → '), h('b', {}, hideTo ? '???' : nm(m.to)), h('div', {}, `“${text}”`)));
          sfx('tick');
        }, i * 1400);
      });
    }

    // ----- idol hunt -----
    function huntPick() {
      return h('div', { class: 'hunt' },
        h('div', { class: 'section-title' }, 'Where do you want to search?'),
        h('p', { class: 'muted' }, 'You get 20 seconds and 8 digs. Search too long and people will notice you’re gone...'),
        me.idols ? h('div', { class: 'pill idol' }, `You already hold ${me.idols} idol${me.idols > 1 ? 's' : ''}.`) : null,
        h('div', { class: 'zone-grid' }, ...ZONES.map((z) => h('button', { class: `zone-card z-${z.id}`, onclick: () => startHunt(z) },
          h('div', { class: 'zc-ic' }, z.icon), h('div', { class: 'zc-n' }, z.name)))));
    }

    function startHunt(zone) {
      sfx('click');
      S.idolSusp[0] = Math.min(1, S.idolSusp[0] + 0.07);
      const dug = (S.dug[zone.id] = S.dug[zone.id] || {});
      let digs = 8, left = 20, busy = false, found = false;
      const info = h('div', { class: 'hunt-info' });
      const grid = h('div', { class: `dig-grid z-${zone.id}` });
      const hint = h('div', { class: 'hunt-hint' }, 'Tap the ground to dig. Colors tell you how close you are.');
      const here = S.hiddenIdol && S.hiddenIdol.zone === zone.id ? S.hiddenIdol.idx : -1;
      const heat = (i) => {
        if (here < 0) return 'cold';
        const d = Math.abs((i % HUNT_COLS) - (here % HUNT_COLS)) + Math.abs(Math.floor(i / HUNT_COLS) - Math.floor(here / HUNT_COLS));
        return d === 0 ? 'found' : d === 1 ? 'hot' : d === 2 ? 'warm' : d === 3 ? 'cool' : 'cold';
      };
      const paintInfo = () => info.replaceChildren(h('span', {}, `${zone.icon} ${zone.name}`), h('span', {}, `⛏️ ${digs}`), h('span', {}, `⏱ ${Math.ceil(left)}s`));
      for (let i = 0; i < HUNT_COLS * HUNT_ROWS; i++) {
        const cell = h('button', { class: `dig ${dug[i] ? 'dug ' + dug[i] : ''}` });
        cell.addEventListener('click', async () => {
          if (busy || found || digs <= 0 || left <= 0 || dug[i]) return;
          busy = true;
          digs--;
          cell.classList.add('digging');
          sfx('dig');
          await sleep(450);
          const ht = heat(i);
          dug[i] = ht;
          cell.className = `dig dug ${ht}`;
          busy = false;
          paintInfo();
          if (ht === 'found') {
            found = true;
            S.hiddenIdol = null;
            me.idols++;
            me.stats.idolsFound++;
            stop();
            cell.textContent = '🗿';
            await sleep(400);
            sfx('idol');
            await banner({ title: 'YOU FOUND A HIDDEN IMMUNITY IDOL!', sub: 'Play it at Tribal Council after the votes are cast and before they are read. Any votes against the person you protect will not count. <br><b>Keep it secret...</b>', icon: '<div class="idol-big">🗿</div>', tone: 'gold', tap: true });
            if (!finished) go('hub');
            return;
          }
          hint.textContent = { hot: '🔥 Burning hot! It’s right next to here!', warm: '🌡️ Warm... getting closer.', cool: '🙂 Cool. You’re in the area-ish.', cold: '🧊 Cold. Nothing nearby.' }[ht];
          if (digs <= 0) { hint.textContent = 'Out of digs. Better get back before anyone notices.'; stop(); }
        });
        grid.append(cell);
      }
      const panel = h('div', { class: 'hunt live' }, info, grid, hint, h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Head back to camp'));
      body.replaceChildren(panel);
      paintInfo();
      const iv = setInterval(() => {
        left -= 0.25;
        paintInfo();
        if (left <= 0) { stop(); hint.textContent = '⏰ Time’s up! Someone might have seen you sneaking around.'; }
      }, 250);
      function stop() { clearInterval(iv); }
      huntState = { stop };
    }

    function pickName(prompt, ids) {
      const box = h('div', { class: 'picker' },
        h('div', { class: 'section-title' }, prompt.replace('{X}', '...')),
        h('div', { class: 'pick-grid' }, ...ids.map((id) => h('button', { class: 'pick', onclick: () => { sfx('click'); box.close(id); } }, avatarChip(P(id), { size: 50 })))));
      return modal(box);
    }

    render();
  });
}

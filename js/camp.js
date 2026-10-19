// Back at Camp: two actions per day (strategy talk, spy, idol search) plus free replies to incoming messages.
import { game, P, nm, alive, aliveBots, human, adjTrust } from './state.js';
import { replyTo, botOpener, botConvo, computePlans } from './ai.js';
import { PRESETS, ZONES, SEARCH_DUDS } from './data.js';
import { h, rand, pick, chance, sleep, weightedPick, shuffle, clock } from './util.js';
import { show, toast, banner, setScene, setMusic, Timer, timerRing, avatarChip, modal } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

const ACTIONS = 2;
const SEARCHES = 3;

export function hideIdolIfNeeded() {
  const S = game.S;
  if (!S.hiddenIdol && S.idolsLeft > 0 && alive().length > 4) {
    S.idolsLeft--;
    S.hiddenIdol = { zone: pick(ZONES).id, spot: Math.floor(Math.random() * 8) };
    S.searched = {};
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

const asReply = (r) => (typeof r === 'string' ? { text: r } : r || { text: '...' });

/** The jury watches camp from the lounge: everything is visible, nothing is interactive. */
export function simulateCamp() {
  const msgs = [];
  for (let i = 0; i < 5; i++) msgs.push(...botConvo());
  const finder = botIdolSearchTick(120);
  return { msgs, finder };
}

export function runCamp() {
  return new Promise((resolve) => {
    const S = game.S, me = human();
    const limit = S.settings.campTimer || 0;
    let actions = ACTIONS;
    S.vibeNoise = {};
    for (const b of aliveBots()) S.vibeNoise[b.id] = rand(-0.1, 0.1);
    S.searched = S.searched || {};
    S.inbox = [];
    setScene('camp');
    setMusic('camp', 'beach');

    let view = 'hub', finished = false, activity = null;
    const feed = [];
    const pushFeed = (txt, icon = '🌴') => {
      feed.unshift({ txt, icon });
      if (feed.length > 8) feed.pop();
      if (view === 'hub') render();
    };

    const ring = limit ? timerRing() : null;
    const body = h('div', { class: 'camp-body' });
    const scr = h('div', { class: 'screen camp' },
      h('div', { class: 'camp-head' },
        h('div', { class: 'camp-title' }, h('div', { class: 'eyebrow' }, `DAY ${S.day + 1}`), h('div', { class: 'display' }, 'Back at Camp')),
        ring),
      body);
    show(scr);

    const timer = limit ? new Timer(limit, { onTick: (left) => ring.update(left, limit), onEnd: () => end() }).start() : null;

    // ---------- background life at camp ----------
    const openerAt = [5, 26, 55];
    let elapsed = 0, nextConvo = rand(3, 6);
    const sim = setInterval(() => {
      if (finished || clock.paused) return;
      elapsed += 1;
      nextConvo -= 1;
      if (nextConvo <= 0) {
        nextConvo = rand(5, 9);
        const forced = activity?.kind === 'spy' && activity.phase === 'live' && chance(0.7) ? activity.target : undefined;
        const msgs = botConvo(forced);
        if (msgs.length) {
          const a = msgs[0].from, b = msgs[0].to;
          for (const m of msgs) S.convos.push({ ...m, t: performance.now() });
          activity?.capture?.(msgs);
          if (chance(0.5)) pushFeed(pick([`${nm(a)} and ${nm(b)} went for a walk.`, `${nm(a)} pulled ${nm(b)} aside by the well.`, `${nm(a)} and ${nm(b)} are whispering by the fire.`, `${nm(a)} and ${nm(b)} went to get water. Together. Again.`]), '👥');
        }
      }
      if (chance(0.04)) {
        const b = pick(aliveBots());
        if (b && S.hiddenIdol) { S.idolSusp[b.id] = Math.min(1, S.idolSusp[b.id] + 0.04); pushFeed(`${b.name} slipped off toward ${pick(ZONES).name.toLowerCase()}...`, '🔍'); }
      }
      const finder = botIdolSearchTick(1);
      if (finder) pushFeed(`${finder.name} came back from a walk looking very pleased.`, '😏');
      if (openerAt.length && elapsed >= openerAt[0]) {
        openerAt.shift();
        sendOpener();
      }
    }, 1000);

    function sendOpener() {
      const asked = new Set(S.inbox.map((m) => m.from));
      const pool = aliveBots().filter((b) => !asked.has(b.id));
      if (!pool.length || finished) return;
      const b = weightedPick(pool, (x) => x.t.social + Math.max(0, S.trust[x.id][0]) + 0.2);
      const op = botOpener(b.id);
      S.inbox.push({ from: b.id, text: op.text, options: op.options, thread: [] });
      sfx('ping');
      toast(`💬 <b>${b.name}</b>: ${op.text}`, 'msg');
      if (view === 'hub') render();
    }

    function end() {
      if (finished) return;
      finished = true;
      clearInterval(sim);
      timer?.stop();
      activity?.stop?.();
      sfx('conch');
      banner({ title: 'The conch sounds', sub: 'Grab your torches. It’s time for Tribal Council.', icon: '🐚', tone: 'sunset', hold: 2600 }).then(resolve);
    }

    function go(v) {
      activity?.stop?.();
      activity = null;
      view = v;
      sfx('click');
      render();
    }

    function spend() {
      actions = Math.max(0, actions - 1);
    }

    function render() {
      if (finished) return;
      if (view === 'hub') body.replaceChildren(hubView());
      if (view === 'talk') body.replaceChildren(pickView('Who do you want to talk to?', 'One private conversation. Use it wisely.', (id) => { spend(); openChat(id); }));
      if (view === 'spy') body.replaceChildren(pickView('Who do you want to spy on?', 'Sneak close, then overhear them for 15 seconds. You might get caught.', (id) => { spend(); startSpy(id); }));
      if (view === 'search') body.replaceChildren(zoneView());
    }

    function tokens() {
      return h('div', { class: 'actions-left' }, 'ACTIONS LEFT',
        ...Array.from({ length: ACTIONS }, (_, i) => h('span', { class: `token ${i < actions ? '' : 'used'}` })));
    }

    function immuneBanner() {
      const imm = alive().find((p) => p.immune);
      if (!imm) return null;
      return h('div', { class: 'immune-banner' },
        avatarChip(imm, { size: 48, label: false }),
        h('div', {}, h('b', {}, imm.human ? 'You have immunity' : `${imm.name} has immunity`),
          h('span', {}, imm.human ? 'You cannot be voted out tonight.' : `${imm.name} cannot be voted out tonight.`)));
    }

    function hubView() {
      const done = actions <= 0;
      return h('div', { class: 'hub stack' },
        immuneBanner(),
        tokens(),
        h('div', { class: 'action-grid' },
          actionCard('💬', 'Strategy', 'Private talk with one castaway', 'talk', 'a-talk'),
          actionCard('👀', 'Spy', 'Overhear one castaway', 'spy', 'a-spy'),
          actionCard('🗿', 'Idol Search', 'Search one area of the island', 'search', 'a-idol'),
        ),
        inboxView(),
        h('div', { class: 'panel feed' },
          h('div', { class: 'feed-title' }, 'AROUND CAMP'),
          feed.length ? feed.map((f) => h('div', { class: 'feed-row' }, h('span', {}, f.icon), h('span', {}, f.txt)))
            : h('div', { class: 'muted' }, 'The tribe drags itself back from the challenge...')),
        h('button', { class: `btn ${done ? 'btn-big' : 'btn-ghost'}`, onclick: () => end() }, done ? 'Go to Tribal Council' : 'Skip ahead to Tribal Council'),
      );
    }

    function actionCard(icon, title, sub, v, cls) {
      return h('button', { class: `action-card ${cls}`, disabled: actions <= 0, onclick: () => go(v) },
        h('div', { class: 'ac-ic' }, icon), h('div', { class: 'ac-t' }, title), h('div', { class: 'ac-s' }, sub));
    }

    function inboxView() {
      if (!S.inbox.length) return null;
      return h('div', { class: 'inbox' },
        h('div', { class: 'feed-title' }, 'MESSAGES · FREE TO ANSWER'),
        ...S.inbox.map((m) => {
          const b = P(m.from);
          const last = m.thread.at(-1);
          const pending = last ? (last.from !== 0 ? last.options : null) : m.options;
          return h('div', { class: 'inbox-card' },
            h('div', { class: 'chip-face', style: { width: '44px', height: '44px' }, html: avatarSVG(b.look, { size: 44, necklace: b.immune }) }),
            h('div', { class: 'ib-main' },
              h('div', { class: 'ib-who' }, b.name),
              h('div', { class: 'ib-txt' }, m.text),
              ...m.thread.map((t) => h('div', { class: `ib-txt ${t.from === 0 ? 'muted' : ''}` }, t.from === 0 ? `You: ${t.text}` : t.text)),
              pending && !m.closed ? h('div', { class: 'quick' }, ...pending.map((o) => h('button', {
                class: 'chip-btn', onclick: () => {
                  m.thread.push({ from: 0, text: o.label });
                  const r = asReply(o.fx());
                  sfx('send');
                  m.thread.push({ from: b.id, text: '…', typing: true });
                  render();
                  sleep(rand(700, 1300)).then(() => {
                    m.thread.pop();
                    m.thread.push({ from: b.id, text: r.text, options: r.options });
                    if (!r.options) m.closed = true;
                    sfx('ping');
                    if (view === 'hub') render();
                  });
                },
              }, o.label))) : null));
        }));
    }

    function pickView(title, sub, onPick) {
      return h('div', { class: 'stack' },
        h('div', { class: 'section-title' }, title),
        h('p', { class: 'muted center' }, sub),
        h('div', { class: 'talk-list' }, ...aliveBots().map((b) => {
          const v = vibe(b.id);
          return h('button', { class: 'talk-row', onclick: () => { sfx('click'); onPick(b.id); } },
            h('div', { class: 'chip-face', style: { width: '46px', height: '46px' }, html: avatarSVG(b.look, { size: 46, necklace: b.immune }) }),
            h('div', { class: 'tr-mid' },
              h('div', { class: 'tr-name' }, b.name, b.immune ? h('span', { class: 'chip-tag', style: { position: 'static', transform: 'none' } }, 'IMMUNE') : null, S.allied[0][b.id] ? h('span', { class: 'ally-tag' }, 'ALLY') : null),
              h('div', { class: 'tr-last' }, b.job)),
            h('div', { class: 'tr-vibe', title: v.t }, v.e));
        })),
        h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Back'));
    }

    // ---------- strategy talk ----------
    function openChat(botId) {
      const b = P(botId);
      let patience = 4;
      const msgs = [];
      const log = h('div', { class: 'chat-log' });
      const quick = h('div', { class: 'quick' });
      const presets = h('div', { class: 'chips' });
      const input = h('input', { class: 'chat-input', placeholder: 'Type your own message...', maxlength: 120 });
      const form = h('form', { class: 'chat-form' }, input, h('button', { class: 'btn sm', type: 'submit' }, 'Send'));
      const leave = h('button', { class: 'btn btn-ghost' }, 'End conversation');
      leave.addEventListener('click', () => go('hub'));
      let busy = false;

      const paint = () => {
        log.replaceChildren(...msgs.map((m) => h('div', { class: `bubble ${m.from === 0 ? 'mine' : 'theirs'}` }, m.text)));
        if (busy) log.append(h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
        log.scrollTop = log.scrollHeight;
        const last = msgs.at(-1);
        quick.replaceChildren(...(!busy && last && last.from !== 0 && last.options ? last.options.map((o) => h('button', { class: 'chip-btn', onclick: () => answer(o) }, o.label)) : []));
        const out = patience <= 0;
        presets.replaceChildren(...(out ? [] : PRESETS.map((p) => h('button', {
          class: 'chip-btn', disabled: busy, onclick: async () => {
            let target = null;
            if (p.needs) {
              target = await pickName(p.text, aliveBots().filter((x) => x.id !== botId).map((x) => x.id));
              if (target == null) return;
            }
            send(p.text.replace('{X}', target != null ? nm(target) : ''), () => replyTo(botId, p.id, target));
          },
        }, p.text.replace('{X}', '___')))));
        form.style.display = out ? 'none' : '';
        leave.className = `btn ${out ? '' : 'btn-ghost'}`;
        leave.textContent = out ? 'Back to camp' : 'End conversation';
      };

      const respond = (getReply) => {
        busy = true;
        paint();
        sleep(rand(800, 1600)).then(() => {
          if (finished) return;
          const r = asReply(getReply());
          busy = false;
          msgs.push({ from: botId, text: patience <= 0 && !r.options ? `${r.text} Anyway, I should get back before people notice.` : r.text, options: r.options });
          sfx('ping');
          paint();
        });
      };
      const send = (text, getReply) => {
        if (busy || patience <= 0) return;
        patience--;
        msgs.push({ from: 0, text });
        sfx('send');
        respond(getReply);
      };
      const answer = (o) => {
        if (busy) return;
        msgs.at(-1).options = null;
        msgs.push({ from: 0, text: o.label });
        sfx('send');
        respond(() => o.fx());
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ''; send(v, () => replyTo(botId, null, null, v)); } });

      const v = vibe(botId);
      body.replaceChildren(h('div', { class: 'chat' },
        h('div', { class: 'chat-head' },
          h('div', { class: 'chip-face', style: { width: '44px', height: '44px' }, html: avatarSVG(b.look, { size: 44, necklace: b.immune }) }),
          h('div', { class: 'ch-who' }, h('b', {}, b.name), h('small', {}, `${b.job} · ${v.e} ${v.t}`)),
          h('div', { class: 'patience' }, 'Private talk')),
        log, quick, presets, form, leave));
      view = 'chat';
      paint();
    }

    // ---------- spy ----------
    function startSpy(target) {
      const connectSecs = 5, liveSecs = 15;
      const bar = h('div', { class: 'spy-bar-fill' });
      const status = h('div', { class: 'spy-status' }, `Sneaking toward ${nm(target)}...`);
      const logEl = h('div', { class: 'spy-log' });
      const back = h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Sneak back to camp');
      const panel = h('div', { class: 'spy' },
        h('div', { class: 'spy-hero' }, h('span', { class: 'bush' }, '🌿'), h('div', { class: 'chip-face', style: { width: '72px', height: '72px' }, html: avatarSVG(P(target).look, { size: 72 }) }), h('span', { class: 'bush r' }, '🌿')),
        status, h('div', { class: 'spy-bar' }, bar), logEl, back);
      body.replaceChildren(panel);
      view = 'spy-live';
      let t = 0;
      const pending = [];
      const capture = (msgs) => {
        if (activity?.phase !== 'live') return;
        msgs.filter((m) => m.from === target || m.to === target).forEach((m, i) => {
          pending.push(setTimeout(() => {
            if (activity?.phase !== 'live') return;
            let text = m.text;
            if (chance(0.2)) text = text.split(' ').map((w, k) => (k > 0 && chance(0.3) ? '▒'.repeat(Math.min(5, w.length)) : w)).join(' ');
            const hideTo = chance(0.3);
            logEl.append(h('div', { class: 'spy-msg' },
              h('b', {}, nm(m.from)), h('span', { class: 'arrow' }, ' → '), h('b', {}, hideTo ? '???' : nm(m.to)), h('div', {}, `“${text}”`)));
            sfx('tick');
          }, i * 1500));
        });
      };
      const iv = setInterval(() => {
        if (clock.paused) return;
        t += 0.1;
        if (activity.phase === 'connect') {
          bar.style.width = `${(t / connectSecs) * 100}%`;
          if (t >= connectSecs) {
            activity.phase = 'live';
            t = 0;
            status.textContent = `Listening in on ${nm(target)}...`;
            panel.classList.add('listening');
            sfx('pop');
            for (const delay of [800, 7000]) {
              pending.push(setTimeout(() => {
                if (activity?.phase !== 'live') return;
                const msgs = botConvo(target);
                for (const m of msgs) S.convos.push({ ...m, t: performance.now() });
                capture(msgs);
              }, delay));
            }
          }
        } else if (activity.phase === 'live') {
          bar.style.width = `${100 - (t / liveSecs) * 100}%`;
          if (t >= liveSecs) {
            activity.phase = 'done';
            clearInterval(iv);
            status.textContent = `${nm(target)} wandered off.`;
            back.className = 'btn';
            back.textContent = 'Back to camp';
            if (chance(0.2)) {
              adjTrust(target, 0, -0.25);
              S.influence[target][0] += 0.2;
              computePlans();
              sfx('gasp');
              toast(`😳 <b>${nm(target)}</b> noticed you spying!`, 'bad');
              pushFeed(`${nm(target)} caught ${me.name} lurking in the bushes.`, '😳');
              logEl.append(h('div', { class: 'spy-msg', style: { borderColor: 'var(--blood)' } }, `😳 ${nm(target)} spotted you in the bushes.`));
            }
            if (!logEl.children.length) logEl.append(h('div', { class: 'muted' }, 'You only heard small talk about fishing.'));
          }
        }
      }, 100);
      activity = { kind: 'spy', target, phase: 'connect', capture, stop: () => { clearInterval(iv); pending.forEach(clearTimeout); if (activity) activity.phase = 'done'; } };
    }

    // ---------- idol search ----------
    function zoneView() {
      return h('div', { class: 'stack' },
        h('div', { class: 'section-title' }, 'Where will you search?'),
        h('p', { class: 'muted center' }, `You have time to check ${SEARCHES} spots. Look for clues. People will notice you’re gone.`),
        me.idols ? h('div', { class: 'pill gold', style: { alignSelf: 'center' } }, `You hold ${me.idols} idol${me.idols > 1 ? 's' : ''}`) : null,
        h('div', { class: 'zone-grid' }, ...ZONES.map((z) => h('button', { class: 'zone-card', onclick: () => { spend(); startSearch(z); } },
          h('div', { class: 'zc-ic' }, z.icon), h('div', { class: 'zc-n' }, z.name)))),
        h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Back'));
    }

    function startSearch(zone) {
      sfx('click');
      view = 'search-live';
      S.idolSusp[0] = Math.min(1, S.idolSusp[0] + 0.07);
      const searched = (S.searched[zone.id] = S.searched[zone.id] || []);
      const here = S.hiddenIdol && S.hiddenIdol.zone === zone.id ? S.hiddenIdol.spot : -1;
      let left = SEARCHES, busy = false, found = false;
      const info = h('div', { class: 'search-info' });
      const result = h('div', { class: 'search-result' }, 'Pick a spot to search.');
      const back = h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Head back to camp');
      const scene = h('div', { class: `search-scene z-${zone.id}` });
      const paintInfo = () => info.replaceChildren(h('span', {}, `${zone.icon} ${zone.name}`), h('span', {}, `Searches left: ${left}`));
      const neighbors = (i) => [i - 1, i + 1, i - 4, i + 4].filter((j) => j >= 0 && j < 8 && (Math.floor(j / 4) === Math.floor(i / 4) || Math.abs(j - i) === 4));
      zone.spots.forEach(([icon, name], i) => {
        const spot = h('button', { class: `spot ${searched.includes(i) ? 'searched' : ''}` }, icon, h('small', {}, name));
        spot.addEventListener('click', async () => {
          if (busy || found || left <= 0 || searched.includes(i)) return;
          busy = true;
          left--;
          searched.push(i);
          paintInfo();
          spot.classList.add('searching');
          result.className = 'search-result';
          result.textContent = `Searching the ${name.toLowerCase()}...`;
          sfx('dig');
          await sleep(500);
          sfx('dig');
          await sleep(600);
          spot.classList.remove('searching');
          spot.classList.add('searched');
          busy = false;
          if (i === here) {
            found = true;
            S.hiddenIdol = null;
            me.idols++;
            me.stats.idolsFound++;
            spot.classList.add('found');
            spot.firstChild.textContent = '🗿';
            sfx('idol');
            await banner({ title: 'Hidden Immunity Idol', sub: 'Play it at Tribal Council after the votes are cast and before they’re read. Votes against whoever you protect won’t count.<br><b>Keep it secret.</b>', icon: '<div class="idol-big">🗿</div>', tone: 'gold', tap: true });
            if (!finished) go('hub');
            return;
          }
          let msg = pick(SEARCH_DUDS), clue = false;
          if (chance(0.5)) {
            clue = true;
            if (!S.hiddenIdol) msg = '📜 Fresh holes everywhere. Somebody already dug up whatever was here.';
            else if (here < 0) msg = `📜 A carved marker in the dirt points toward ${ZONES.find((z) => z.id === S.hiddenIdol.zone).name.toLowerCase()}.`;
            else {
              const near = pick([here, ...neighbors(here)].filter((j) => j !== i));
              msg = `📜 Scratch marks lead toward the ${zone.spots[near][1].toLowerCase()}. It’s close.`;
            }
          }
          result.className = `search-result ${clue ? 'clue' : ''}`;
          result.textContent = msg;
          if (left <= 0) {
            result.textContent += ' Out of time. Better get back before anyone notices.';
            back.className = 'btn';
            back.textContent = 'Back to camp';
          }
        });
        scene.append(spot);
      });
      paintInfo();
      body.replaceChildren(h('div', { class: 'search' }, info, scene, result, back));
      activity = { kind: 'search', stop: () => {} };
    }

    function pickName(prompt, ids) {
      const box = h('div', { class: 'picker' },
        h('div', { class: 'section-title' }, prompt.replace('{X}', '...')),
        h('div', { class: 'pick-grid' }, ...ids.map((id) => h('button', { class: 'pick', onclick: () => { sfx('click'); box.close(id); } }, avatarChip(P(id), { size: 52 })))));
      return modal(box);
    }

    render();
  });
}

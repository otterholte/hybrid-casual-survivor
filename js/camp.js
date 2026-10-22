// Back at Camp: talk to anyone (or a group) as much as you like, plus ONE excursion per day (spy or idol search).
import { game, P, nm, alive, aliveBots, human, adjTrust } from './state.js';
import { replyTo, botOpener, botConvo, computePlans, spendAdv, runErrand } from './ai.js';
import { chatReply, understand, matchOption, isGameTalk, FLAVOR_INTENTS, GROUP_PRESETS, groupReply } from './chat.js';
import { llm, chatter } from './llm.js';
import { PRESETS, ZONES, ADVANTAGES } from './data.js';
import { h, rand, pick, chance, sleep, weightedPick, shuffle, clock } from './util.js';
import { show, toast, banner, setScene, setMusic, Timer, timerRing, avatarChip, modal } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

const PATIENCE = 6; // messages you can send each castaway (or group) per day

export function hideIdolIfNeeded() {
  const S = game.S;
  if (!S.hiddenIdol && S.idolsLeft > 0 && alive().length > 4) {
    S.idolsLeft--;
    S.hiddenIdol = { zone: pick(ZONES).id, spot: Math.floor(Math.random() * 8) };
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
const face = (p, size) => h('div', { class: 'chip-face', style: { width: `${size}px`, height: `${size}px` }, html: avatarSVG(p.look, { size, necklace: p.immune }) });

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
    const day = S.day + 1;
    let excursionsLeft = 1;
    if (me.advantages.includes('extraTrip')) { spendAdv(0, 'extraTrip'); excursionsLeft = 2; }
    S.vibeNoise = {};
    S.threads = S.threads || {};
    S.groups = (S.groups || []).filter((g) => g.members.filter((m) => P(m).alive).length >= 2);
    S.unread = new Set();
    S.patience = {};
    for (const b of aliveBots()) {
      S.vibeNoise[b.id] = rand(-0.1, 0.1);
      S.threads[b.id] = S.threads[b.id] || [];
      S.patience[b.id] = PATIENCE;
      for (const m of S.threads[b.id]) m.options = null; // yesterday's questions expire
    }
    for (const g of S.groups) S.patience[g.id] = PATIENCE;
    setScene('camp');
    setMusic('camp', 'beach');

    let view = 'hub', finished = false, activity = null, openChatId = null, repaintChat = null;
    const feed = [];
    const pushFeed = (txt, icon = '🌴') => {
      feed.unshift({ txt, icon });
      if (feed.length > 4) feed.pop();
      if (view === 'hub') render();
    };

    const ring = limit ? timerRing() : null;
    const body = h('div', { class: 'camp-body' });
    const scr = h('div', { class: 'screen camp' },
      h('div', { class: 'camp-head' },
        h('div', { class: 'camp-title' }, h('div', { class: 'eyebrow' }, `DAY ${day}`), h('div', { class: 'display' }, 'Back at Camp')),
        ring),
      body);
    show(scr);
    const timer = limit ? new Timer(limit, { onTick: (left) => ring.update(left, limit), onEnd: () => end() }).start() : null;

    // ---------- background life at camp ----------
    const openerAt = [6, 30, 70];
    let elapsed = 0, nextConvo = rand(3, 6);
    const sim = setInterval(() => {
      if (finished || clock.paused) return;
      elapsed += 1;
      S.campElapsed = elapsed;
      for (const e of (S.errands || []).filter((x) => !x.done && x.due <= elapsed)) finishErrand(e);
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

    // A castaway comes back from an errand you sent it on.
    function finishErrand(e) {
      const out = runErrand(e);
      if (!out || finished) return;
      for (const m of out.msgs) S.convos.push({ ...m, t: performance.now() });
      activity?.capture?.(out.msgs);
      pushFeed(`${nm(e.bot)} pulled ${nm(e.target)} aside.`, '👥');
      const options = out.report.options?.map((o) => ({ label: o.label, fx: () => chatReply(e.bot, o.label, S.threads[e.bot]) }))
        ?? chatReply(e.bot, 'what have you heard?', S.threads[e.bot]).options;
      S.threads[e.bot].push({ from: e.bot, text: out.report.text, options, day });
      if (openChatId === e.bot) repaintChat?.();
      else {
        S.unread.add(e.bot);
        sfx('ping');
        toast(`💬 <b>${nm(e.bot)}</b> is back from talking to ${nm(e.target)}`, 'msg');
        if (view === 'hub' || view === 'inbox') render();
      }
    }

    function sendOpener() {
      const pool = aliveBots().filter((b) => !S.threads[b.id].some((m) => m.day === day && m.from === b.id));
      if (!pool.length || finished) return;
      const b = weightedPick(pool, (x) => x.t.social + Math.max(0, S.trust[x.id][0]) + 0.2);
      const op = botOpener(b.id);
      S.threads[b.id].push({ from: b.id, text: op.text, options: op.options, day });
      if (openChatId === b.id) repaintChat?.();
      else {
        S.unread.add(b.id);
        sfx('ping');
        toast(`💬 New message from <b>${b.name}</b>`, 'msg');
        if (view === 'hub' || view === 'inbox') render();
      }
    }

    function end() {
      if (finished) return;
      // Errands still in progress happen anyway; you hear about them tomorrow.
      for (const e of (S.errands || []).filter((x) => !x.done)) { const out = runErrand(e); if (out) { for (const m of out.msgs) S.convos.push({ ...m, t: performance.now() }); S.threads[e.bot]?.push({ from: e.bot, text: out.report.text, day }); } }
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
      openChatId = null;
      repaintChat = null;
      view = v;
      sfx('click');
      render();
    }

    function render() {
      if (finished) return;
      if (view === 'hub') body.replaceChildren(hubView());
      if (view === 'inbox') body.replaceChildren(inboxView());
      if (view === 'spy') body.replaceChildren(spyPick());
      if (view === 'search') startSearch();
      if (view === 'clue') startSearch({ fromClue: true });
    }

    const subHead = (title, back = 'hub', extra = null) => h('div', { class: 'sub-head' },
      h('button', { class: 'back-btn', onclick: () => go(back) }, '‹ Back'), h('div', { class: 'section-title' }, title), extra || h('span'));

    // ---------- hub ----------
    function immuneBanner() {
      const imm = alive().find((p) => p.immune);
      if (!imm) return null;
      return h('div', { class: 'immune-banner' },
        avatarChip(imm, { size: 48, label: false }),
        h('div', {}, h('b', {}, imm.human ? 'You have immunity' : `${imm.name} has immunity`),
          h('span', {}, imm.human ? 'You cannot be voted out tonight.' : `${imm.name} cannot be voted out tonight.`)));
    }

    function hubView() {
      const n = S.unread.size;
      return h('div', { class: 'hub stack' },
        immuneBanner(),
        h('button', { class: `strategy-card ${n ? 'has-new' : ''}`, onclick: () => go('inbox') },
          h('div', { class: 'sc-ic' }, '💬'),
          h('div', { class: 'sc-mid' }, h('div', { class: 'ac-t' }, 'Strategy'), h('div', { class: 'ac-s' }, 'Talk privately or in groups, as much as you want.')),
          n ? h('span', { class: 'badge' }, `${n} new`) : h('span', { class: 'sc-arrow' }, '›')),
        advantagePanel(),
        h('div', { class: 'feed-title center' }, excursionsLeft <= 0 ? 'EXCURSIONS USED FOR TODAY' : excursionsLeft === 1 ? 'ONE EXCURSION · PICK ONE' : `${excursionsLeft} EXCURSIONS TODAY`),
        h('div', { class: 'action-grid two' },
          excursionCard('🗿', 'Idol Search', 'Find the clue, then race to the idol', 'search', 'a-idol'),
          excursionCard('👀', 'Spy', 'Overhear one castaway', 'spy', 'a-spy')),
        feed.length ? h('div', { class: 'panel feed' }, h('div', { class: 'feed-title' }, 'AROUND CAMP'), ...feed.map((f) => h('div', { class: 'feed-row' }, h('span', {}, f.icon), h('span', {}, f.txt)))) : null,
        h('button', { class: 'btn btn-big', onclick: () => end() }, 'Go to Tribal Council'),
      );
    }

    function advantagePanel() {
      if (!me.advantages.length) return null;
      return h('div', { class: 'panel adv-panel' },
        h('div', { class: 'feed-title' }, 'YOUR ADVANTAGES'),
        ...me.advantages.map((type) => {
          const a = ADVANTAGES[type];
          const use = type === 'intel' ? useIntel : type === 'idolClue' ? useClue : null;
          return h('div', { class: 'adv-row' },
            h('span', { class: 'adv-ic' }, a.icon),
            h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc)),
            use ? h('button', { class: 'btn sm', onclick: use }, 'Use') : h('span', { class: 'pill' }, 'At Tribal'));
        }));
    }

    async function useIntel() {
      sfx('click');
      const id = await pickName('Whose vote do you want to know?', aliveBots().map((b) => b.id));
      if (id == null) return;
      spendAdv(0, 'intel');
      const t = S.plan[id];
      sfx('reveal');
      await banner({ title: 'Secret Intel', sub: t == null ? `${nm(id)} hasn\u2019t settled on a vote yet.` : t === 0 ? `${nm(id)} is planning to vote for <b>YOU</b>.` : `${nm(id)} is planning to vote for <b>${nm(t)}</b>.`, icon: avatarSVG(P(id).look, { size: 100 }), tone: 'night', tap: true });
      if (!finished) render();
    }

    async function useClue() {
      spendAdv(0, 'idolClue');
      if (!S.hiddenIdol) {
        sfx('fail');
        await banner({ title: 'Too late', sub: 'Your clue leads to an empty hole. Someone already found the idol.', icon: '📜', tone: 'night', tap: true });
        if (!finished) render();
        return;
      }
      go('clue');
    }

    function excursionCard(icon, title, sub, v, cls) {
      return h('button', { class: `action-card ${cls}`, disabled: excursionsLeft <= 0, onclick: () => go(v) },
        h('div', { class: 'ac-ic' }, icon), h('div', { class: 'ac-t' }, title), h('div', { class: 'ac-s' }, sub));
    }

    // ---------- shared reply helper (used from the list and inside a conversation) ----------
    function answerOption(botId, o, after) {
      const thread = S.threads[botId];
      const last = thread.at(-1);
      if (last) last.options = null;
      thread.push({ from: 0, text: o.label, day });
      sfx('send');
      after?.(true);
      sleep(rand(700, 1300)).then(() => {
        const r = asReply(o.fx());
        thread.push({ from: botId, text: r.text, options: r.options, day });
        sfx('ping');
        if (openChatId !== botId && view !== 'inbox') S.unread.add(botId);
        after?.(false);
      });
    }

    // ---------- strategy inbox ----------
    function inboxView() {
      const pendingFor = (id) => { const l = S.threads[id].at(-1); return l && l.from !== 0 && l.options ? l : null; };
      const rows = aliveBots().map((b) => ({ b, last: S.threads[b.id].at(-1) }))
        .sort((x, y) => (S.unread.has(y.b.id) - S.unread.has(x.b.id)) || (!!pendingFor(y.b.id) - !!pendingFor(x.b.id)) || ((y.last ? 1 : 0) - (x.last ? 1 : 0)));
      return h('div', { class: 'stack' },
        subHead('Messages', 'hub', h('button', { class: 'chip-btn', onclick: newGroup }, '＋ Group')),
        ...S.groups.map((g) => {
          const last = g.thread.at(-1);
          return h('div', { class: 'talk-row', onclick: () => openGroup(g) },
            h('div', { class: 'group-faces' }, ...g.members.slice(0, 3).map((m) => face(P(m), 30))),
            h('div', { class: 'tr-mid' },
              h('div', { class: 'tr-name' }, g.members.map(nm).join(', ')),
              h('div', { class: 'tr-last' }, last ? `${last.from === 0 ? 'You' : nm(last.from)}: ${last.text}` : 'Group chat')),
            h('div', { class: 'tr-right' }, h('span', { class: 'tr-vibe' }, '👥')));
        }),
        h('div', { class: 'talk-list' }, ...rows.map(({ b, last }) => {
          const unread = S.unread.has(b.id);
          const pending = pendingFor(b.id);
          const v = vibe(b.id);
          return h('div', { class: `talk-row ${unread ? 'unread' : ''} ${pending ? 'asking' : ''}`, onclick: () => openChat(b.id) },
            face(b, 48),
            h('div', { class: 'tr-mid' },
              h('div', { class: 'tr-name' }, b.name, b.immune ? h('span', { class: 'chip-tag inline' }, 'IMMUNE') : null, S.allied[0][b.id] ? h('span', { class: 'ally-tag' }, 'ALLY') : null),
              h('div', { class: 'tr-last' }, last ? `${last.from === 0 ? 'You: ' : ''}${last.text}` : `${b.job} · start a conversation`),
              pending ? h('div', { class: 'quick' }, ...pending.options.map((o) => h('button', {
                class: 'chip-btn', onclick: (e) => { e.stopPropagation(); S.unread.delete(b.id); answerOption(b.id, o, () => { if (view === 'inbox') render(); }); },
              }, o.label))) : null),
            h('div', { class: 'tr-right' }, unread ? h('span', { class: 'dot' }) : h('span', { class: 'tr-vibe', title: v.t }, v.e)));
        })));
    }

    function newGroup() {
      sfx('click');
      const chosen = new Set();
      const start = h('button', { class: 'btn', disabled: true }, 'Start group chat');
      const grid = h('div', { class: 'pick-grid' }, ...aliveBots().map((b) => {
        const btn = h('button', { class: 'pick' }, avatarChip(b, { size: 52 }));
        btn.addEventListener('click', () => {
          chosen.has(b.id) ? chosen.delete(b.id) : chosen.add(b.id);
          btn.classList.toggle('sel', chosen.has(b.id));
          start.disabled = chosen.size < 2;
          sfx('click');
        });
        return btn;
      }));
      const box = h('div', { class: 'picker' }, h('div', { class: 'section-title' }, 'Who’s in the group?'), h('p', { class: 'muted center' }, 'Pick two or more. Everyone in the group hears everything.'), grid, start);
      start.addEventListener('click', () => box.close([...chosen]));
      modal(box).then((ids) => {
        if (!ids || ids.length < 2) return;
        const key = [...ids].sort().join('-');
        let g = S.groups.find((x) => x.key === key);
        if (!g) { g = { id: `g${Date.now()}`, key, members: ids, thread: [] }; S.groups.push(g); S.patience[g.id] = PATIENCE; }
        openGroup(g);
      });
    }

    // ---------- conversation views ----------
    function castStrip(focus) {
      return h('div', { class: 'cast-strip' }, ...alive().map((p) => h('div', { class: `cs-item ${focus.includes(p.id) ? 'on' : ''}` },
        face(p, 30), h('span', {}, p.human ? 'You' : p.name))));
    }

    function threadEls(thread, group) {
      let lastDay = null;
      const els = [];
      for (const m of thread) {
        if (m.day !== lastDay) { els.push(h('div', { class: 'day-sep' }, `Day ${m.day}`)); lastDay = m.day; }
        els.push(h('div', { class: `bubble ${m.from === 0 ? 'mine' : 'theirs'}` },
          group && m.from !== 0 ? h('div', { class: 'b-name' }, nm(m.from)) : null, m.text));
      }
      return els;
    }

    function openChat(botId) {
      sfx('click');
      view = 'chat';
      openChatId = botId;
      S.unread.delete(botId);
      const b = P(botId);
      const thread = S.threads[botId];
      const log = h('div', { class: 'chat-log' });
      const quick = h('div', { class: 'quick' });
      const presets = h('div', { class: 'chips' });
      const input = h('input', { class: 'chat-input', placeholder: `Message ${b.name}...`, maxlength: 140 });
      const form = h('form', { class: 'chat-form' }, input, h('button', { class: 'btn sm', type: 'submit' }, 'Send'));
      const away = h('div', { class: 'muted center' });
      let busy = false;

      const paint = () => {
        log.replaceChildren(...threadEls(thread, false));
        if (busy) log.append(h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
        log.scrollTop = log.scrollHeight;
        const last = thread.at(-1);
        quick.replaceChildren(...(!busy && last && last.from !== 0 && last.options ? last.options.map((o) => h('button', { class: 'chip-btn', onclick: () => answerOption(botId, o, (b2) => { busy = b2; if (openChatId === botId) paint(); }) }, o.label)) : []));
        const out = S.patience[botId] <= 0;
        presets.replaceChildren(...(out ? [] : PRESETS.map((p) => h('button', {
          class: 'chip-btn', disabled: busy, onclick: async () => {
            let target = null;
            if (p.needs) {
              target = await pickName(p.text, aliveBots().filter((x) => x.id !== botId).map((x) => x.id));
              if (target == null) return;
            }
            {
              const msg = p.text.replace('{X}', target != null ? nm(target) : '');
              send(msg, () => chatReply(botId, msg, thread));
            }
          },
        }, p.text.replace('{X}', '___')))));
        form.style.display = out ? 'none' : '';
        away.textContent = out ? `${b.name} wandered off. Try again tomorrow.` : '';
      };
      repaintChat = paint;

      const send = (text, getReply) => {
        if (busy || S.patience[botId] <= 0) return;
        S.patience[botId]--;
        thread.push({ from: 0, text, day });
        sfx('send');
        busy = true;
        paint();
        Promise.all([Promise.resolve(getReply()), sleep(rand(700, 1300))]).then(([raw]) => {
          const r = asReply(raw);
          busy = false;
          if (S.patience[botId] <= 0 && !r.options) r.text += ' Anyway, I should get back before people notice.';
          thread.push({ from: botId, text: r.text, options: r.options, day });
          sfx('ping');
          if (openChatId === botId) paint();
          else S.unread.add(botId);
        });
      };
      const typed = (text) => {
        const last = thread.at(-1);
        const opt = last && last.from !== 0 && !busy ? matchOption(text, last.options) : null;
        if (opt) {
          last.options = null;
          thread.push({ from: 0, text, day });
          sfx('send');
          busy = true;
          paint();
          sleep(rand(700, 1200)).then(() => {
            const r = asReply(opt.fx());
            busy = false;
            thread.push({ from: botId, text: r.text, options: r.options, day });
            sfx('ping');
            if (openChatId === botId) paint();
          });
          return;
        }
        send(text, async () => {
          const { intent } = understand(text, botId, thread);
          const rule = chatReply(botId, text, thread);
          // The model only does small talk; anything about the vote stays with the rules engine.
          if (FLAVOR_INTENTS.has(intent) && !isGameTalk(text) && llm.status === 'ready') {
            const mood = S.plan[botId] === 0 ? 'Privately you are wary of them.' : S.trust[botId][0] > 0.3 ? 'You like them.' : '';
            const t = await chatter({ bot: b, playerName: me.name, message: text, fallback: rule.text, allNames: S.players.map((p) => p.name), mood });
            return { text: t, options: rule.options };
          }
          return rule;
        });
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ''; typed(v); } });

      const v = vibe(botId);
      body.replaceChildren(h('div', { class: 'stack' },
        subHead('', 'inbox'),
        castStrip([botId]),
        h('div', { class: 'chat' },
          h('div', { class: 'chat-head' }, face(b, 44),
            h('div', { class: 'ch-who' }, h('b', {}, b.name), h('small', {}, `${b.job} · ${v.e} ${v.t}`)),
            llm.status === 'ready' ? h('div', { class: 'ai-tag', title: 'Small talk uses the on-device AI' }, 'AI') : null),
          log, quick, presets, form, away)));
      paint();
    }

    function openGroup(g) {
      sfx('click');
      view = 'group';
      openChatId = g.id;
      const members = g.members.filter((m) => P(m).alive);
      const log = h('div', { class: 'chat-log' });
      const presets = h('div', { class: 'chips' });
      const input = h('input', { class: 'chat-input', placeholder: 'Message the group...', maxlength: 140 });
      const form = h('form', { class: 'chat-form' }, input, h('button', { class: 'btn sm', type: 'submit' }, 'Send'));
      const away = h('div', { class: 'muted center' });
      let busy = false;
      const paint = () => {
        log.replaceChildren(...threadEls(g.thread, true));
        if (busy) log.append(h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
        log.scrollTop = log.scrollHeight;
        const out = S.patience[g.id] <= 0;
        presets.replaceChildren(...(out ? [] : GROUP_PRESETS.map((p) => h('button', {
          class: 'chip-btn', disabled: busy, onclick: async () => {
            let target = null;
            if (p.needs) {
              target = await pickName(p.text, aliveBots().map((x) => x.id));
              if (target == null) return;
            }
            send(p.text.replace('{X}', target != null ? nm(target) : ''), p.id, target);
          },
        }, p.text.replace('{X}', '___')))));
        form.style.display = out ? 'none' : '';
        away.textContent = out ? 'The group broke up for now. Try again tomorrow.' : '';
      };
      const send = async (text, presetId, target) => {
        if (busy || S.patience[g.id] <= 0) return;
        S.patience[g.id]--;
        g.thread.push({ from: 0, text, day });
        sfx('send');
        busy = true;
        paint();
        const replies = groupReply(members, presetId, target, text, g.thread);
        for (const r of replies) {
          await sleep(rand(800, 1400));
          g.thread.push({ from: r.from, text: r.text, day });
          sfx('ping');
          if (openChatId === g.id) paint();
        }
        busy = false;
        if (openChatId === g.id) paint();
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ''; send(v, null, null); } });
      body.replaceChildren(h('div', { class: 'stack' },
        subHead('', 'inbox'),
        castStrip(members),
        h('div', { class: 'chat' },
          h('div', { class: 'chat-head' }, h('div', { class: 'group-faces' }, ...members.map((m) => face(P(m), 34))),
            h('div', { class: 'ch-who' }, h('b', {}, 'Group chat'), h('small', {}, members.map(nm).join(', ')))),
          log, presets, form, away)));
      paint();
    }

    // ---------- spy (excursion) ----------
    function spyPick() {
      return h('div', { class: 'stack' },
        subHead('Spy on who?'),
        h('p', { class: 'muted center' }, 'This uses your excursion for today. Sneak close, then overhear them for 15 seconds. You might get caught.'),
        h('div', { class: 'talk-list' }, ...aliveBots().map((b) => h('button', { class: 'talk-row', onclick: () => { excursionsLeft--; startSpy(b.id); } },
          face(b, 46), h('div', { class: 'tr-mid' }, h('div', { class: 'tr-name' }, b.name), h('div', { class: 'tr-last' }, b.job))))));
    }

    function startSpy(target) {
      sfx('click');
      view = 'spy-live';
      const connectSecs = 5, liveSecs = 15;
      const bar = h('div', { class: 'spy-bar-fill' });
      const status = h('div', { class: 'spy-status' }, `Sneaking toward ${nm(target)}...`);
      const logEl = h('div', { class: 'spy-log' });
      const back = h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Sneak back to camp');
      const panel = h('div', { class: 'spy' },
        h('div', { class: 'spy-hero' }, h('span', { class: 'bush' }, '🌿'), face(P(target), 72), h('span', { class: 'bush r' }, '🌿')),
        status, h('div', { class: 'spy-bar' }, bar), logEl, back);
      body.replaceChildren(panel);
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
            logEl.append(h('div', { class: 'spy-msg' }, h('b', {}, nm(m.from)), h('span', { class: 'arrow' }, ' → '), h('b', {}, hideTo ? '???' : nm(m.to)), h('div', {}, `“${text}”`)));
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

    // ---------- idol search (excursion): memory match, then a dash ----------
    function startSearch(opts = {}) {
      view = 'search-live';
      const diff = S.settings.difficulty;
      const memSecs = { easy: 50, normal: 40, hard: 32 }[diff];
      const dashSecs = { easy: 10, normal: 8, hard: 6.5 }[diff];
      body.replaceChildren(h('div', { class: 'search stack' },
        subHead('Idol Search'),
        h('p', { class: 'center' }, 'Flip cards to find matching pairs. Match the two ', h('b', {}, '📜 clue'), ' cards to learn where the idol is hidden, then race there before anyone notices you’re gone.'),
        h('p', { class: 'muted center' }, 'This uses your excursion for today.'),
        h('button', { class: 'btn btn-big', onclick: () => { excursionsLeft--; sfx('click'); memory(); } }, 'Start searching')));
      if (opts.fromClue) clue();

      function memory() {
        S.idolSusp[0] = Math.min(1, S.idolSusp[0] + 0.07);
        const icons = shuffle(['🐚', '🦀', '🥥', '🪨', '🌺']);
        const deck = shuffle([...icons, ...icons, '📜', '📜']);
        let first = null, lock = false, done = false;
        const ring2 = timerRing('sm');
        const status = h('div', { class: 'search-result' }, 'Find the 📜 pair.');
        const grid = h('div', { class: 'memory-grid' });
        const cards = deck.map((icon, i) => {
          const c = h('button', { class: 'mem-card' }, h('span', { class: 'mem-back' }, '🌴'), h('span', { class: 'mem-front' }, icon));
          c.addEventListener('click', async () => {
            if (lock || done || c.classList.contains('up')) return;
            c.classList.add('up');
            sfx('click');
            if (first == null) { first = i; return; }
            const a = cards[first], ai = first;
            first = null;
            if (deck[ai] === icon) {
              a.classList.add('matched'); c.classList.add('matched');
              sfx(icon === '📜' ? 'sparkle' : 'pop');
              if (icon === '📜') { done = true; t.stop(); await sleep(600); clue(); }
            } else {
              lock = true;
              await sleep(650);
              a.classList.remove('up'); c.classList.remove('up');
              lock = false;
            }
          });
          grid.append(c);
          return c;
        });
        const t = new Timer(memSecs, {
          onTick: (l) => ring2.update(l, memSecs),
          onEnd: () => {
            if (done) return;
            done = true;
            S.idolSusp[0] = Math.min(1, S.idolSusp[0] + 0.1);
            status.textContent = 'You’ve been gone too long. Head back before anyone gets suspicious.';
            sfx('fail');
          },
        }).start();
        body.replaceChildren(h('div', { class: 'search' },
          h('div', { class: 'search-info' }, h('span', {}, 'Find the clue'), ring2), grid, status,
          h('button', { class: 'btn btn-ghost', onclick: () => go('hub') }, 'Back to camp')));
        activity = { kind: 'search', stop: () => t.stop() };
      }

      function clue() {
        const idol = S.hiddenIdol;
        if (!idol) {
          body.replaceChildren(h('div', { class: 'search stack' },
            h('div', { class: 'clue-scroll' }, '📜', h('p', {}, 'The map leads to a freshly dug hole. Someone already found this idol.')),
            h('button', { class: 'btn', onclick: () => go('hub') }, 'Back to camp')));
          return;
        }
        const zone = ZONES.find((z) => z.id === idol.zone);
        const spotName = zone.spots[idol.spot][1];
        body.replaceChildren(h('div', { class: 'search stack' },
          h('div', { class: 'clue-scroll' }, '📜', h('p', {}, 'The idol is hidden at the ', h('b', {}, spotName.toLowerCase()), ' at ', h('b', {}, zone.name.toLowerCase()), '.')),
          h('button', { class: 'btn btn-big', onclick: () => dash(idol) }, 'Go get it!')));
      }

      function dash(idol) {
        sfx('go');
        let over = false;
        const ring3 = timerRing('sm');
        const stage = h('div', { class: 'stack' });
        const status = h('div', { class: 'search-result' }, 'Run! Pick the right area.');
        const finish = (msg, ok) => {
          if (over) return;
          over = true;
          t.stop();
          if (ok) return;
          status.textContent = msg;
          sfx('fail');
          stage.replaceChildren(h('button', { class: 'btn', onclick: () => go('hub') }, 'Back to camp'));
        };
        const t = new Timer(dashSecs, { tick: false, onTick: (l) => ring3.update(l, dashSecs), onEnd: () => finish('Too slow. You heard footsteps and had to bail.') }).start();
        const penalty = (el) => { t.left = Math.max(0.1, t.left - 1.5); el.classList.add('wrong'); sfx('fail'); setTimeout(() => el.classList.remove('wrong'), 400); };
        const spots = (z) => {
          status.textContent = 'Now find the spot!';
          stage.replaceChildren(h('div', { class: `search-scene z-${z.id}` }, ...shuffle(z.spots.map((s, i) => [s, i])).map(([[icon, name], i]) => {
            const btn = h('button', { class: 'spot' }, icon, h('small', {}, name));
            btn.addEventListener('click', async () => {
              if (over) return;
              if (i !== idol.spot) { penalty(btn); return; }
              if (!S.hiddenIdol) { finish('Empty! Someone got here first.'); return; }
              finish('', true);
              S.hiddenIdol = null;
              me.idols++;
              me.stats.idolsFound++;
              btn.classList.add('found');
              sfx('idol');
              await banner({ title: 'Hidden Immunity Idol', sub: 'Play it at Tribal Council after the votes are cast and before they’re read. Votes against whoever you protect won’t count.<br><b>Keep it secret.</b>', icon: '<div class="idol-big">🗿</div>', tone: 'gold', tap: true });
              if (!finished) go('hub');
            });
            return btn;
          })));
        };
        stage.replaceChildren(h('div', { class: 'zone-grid' }, ...shuffle(ZONES).map((z) => {
          const btn = h('button', { class: 'zone-card' }, h('div', { class: 'zc-ic' }, z.icon), h('div', { class: 'zc-n' }, z.name));
          btn.addEventListener('click', () => { if (over) return; if (z.id === idol.zone) { sfx('dig'); spots(z); } else penalty(btn); });
          return btn;
        })));
        body.replaceChildren(h('div', { class: 'search' }, h('div', { class: 'search-info' }, h('span', {}, 'Get to the idol!'), ring3), status, stage));
        activity = { kind: 'search', stop: () => t.stop() };
      }
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

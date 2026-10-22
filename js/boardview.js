// The Strategy screen: the Vote Board. One screen, no scrolling, no typing needed.
// Tap faces to select, then Ask or Tell. Tap a castaway's chip to judge what they told you.
import { game, P, nm, alive, aliveBots } from './state.js';
import { board, ask, tellVote, passOn, spyStory, tally, cycleChip, setRead, noteToldFromLabel } from './board.js';
import { chatReply } from './chat.js';
import { spendAdv } from './ai.js';
import { h, sleep } from './util.js';
import { modal, toast } from './ui.js';
import { avatarSVG } from './avatar.js';
import { sfx } from './audio.js';

const H = 0;
const face = (p, size, extra = {}) => h('span', { class: 'vb-av', html: avatarSVG(p.look, { size, necklace: p.immune, ...extra }) });

/**
 * Mounts the board into `el`. api: { onLock(), openMessages(), readyCount(), isOver() }.
 * Returns { paint } so camp can repaint when a castaway sends something.
 */
export function mountBoard(el, api) {
  const S = game.S;
  const selected = new Set();
  const bubbles = {}; // id -> text
  let spyMode = false;
  let replyPrompt = null; // { id, text }

  const say = (id, text, ms = 4200) => {
    bubbles[id] = text;
    paint();
    setTimeout(() => { if (bubbles[id] === text) { delete bubbles[id]; if (el.isConnected) paint(); } }, ms);
  };
  const sayAll = async (list) => {
    for (const r of list) { say(r.id, r.text); sfx('ping'); await sleep(550); }
  };

  // ---------------------------------------------------------------- a castaway on the board
  function card(b) {
    const p = board().ppl[b.id];
    const sel = selected.has(b.id);
    const kind = p.state === 'read' ? (p.read === '?' ? 'unknown' : 'read') : p.claim === undefined ? 'none' : p.state === 'believe' && p.claim != null ? 'believe' : 'word';
    const target = kind === 'read' ? p.read : p.claim;
    const label = kind === 'none' ? 'ASK' : kind === 'unknown' ? '?' : target == null ? 'NOT SURE' : target === H ? 'YOU' : nm(target).toUpperCase();
    const icon = kind === 'believe' ? '✓ ' : kind === 'read' || kind === 'unknown' ? (p.spied ? '👁 ' : '✎ ') : '';
    const showSaid = (kind === 'read' || kind === 'unknown') && p.claim != null && p.claim !== p.read;
    return h('div', { class: `vb-p ${sel ? 'sel' : ''}`, 'data-id': b.id },
      bubbles[b.id] ? h('div', { class: 'vb-bubble' }, bubbles[b.id]) : null,
      h('button', { class: 'vb-face', onclick: () => tapFace(b.id), 'aria-label': `Select ${b.name}` },
        face(b, 54), b.immune ? h('span', { class: 'vb-imm' }, '📿') : null, sel ? h('span', { class: 'vb-check' }, '✓') : null),
      h('div', { class: 'vb-name' }, b.name),
      h('div', { class: `vb-said ${showSaid ? '' : 'hide'}` }, 'said ', h('s', {}, showSaid ? (p.claim === H ? 'you' : nm(p.claim)) : '-')),
      h('button', { class: `vb-chip k-${kind}`, onclick: () => tapChip(b.id) }, `${icon}${label}${p.spied && kind === 'read' ? ` ×${p.spied.n}` : ''}`),
      h('div', { class: 'vb-told' }, p.told != null ? `you said ${p.told === H ? 'you' : nm(p.told)} ${p.meant ? '✓' : '🤥'}` : ' '));
  }

  function tapFace(id) {
    if (spyMode) { spyMode = false; return useSpy(id); }
    selected.has(id) ? selected.delete(id) : selected.add(id);
    sfx('click');
    paint();
  }
  function tapChip(id) {
    const p = board().ppl[id];
    if (p.claim === undefined && p.state !== 'read') { selected.clear(); selected.add(id); return doAsk([id], false); }
    const next = cycleChip(id);
    sfx('click');
    if (next === 'pick') return readPicker(id);
    paint();
  }

  // ---------------------------------------------------------------- the incoming card (pitch / reply prompt)
  function incoming() {
    if (replyPrompt) {
      const b = P(replyPrompt.id);
      return h('div', { class: 'vb-in reply' },
        h('div', { class: 'vb-in-top' }, face(b, 34), h('div', {}, h('b', {}, `${b.name}: `), `“${replyPrompt.text}”`)),
        h('div', { class: 'vb-in-btns' },
          h('button', { class: 'vb-mini blue', onclick: () => { const id = replyPrompt.id; replyPrompt = null; openTell([id], 'mine'); } }, '🗳️ Tell my vote'),
          h('button', { class: 'vb-mini', onclick: () => { const id = replyPrompt.id; replyPrompt = null; say(id, chatReply(id, 'not sure yet', S.threads?.[id] || []).text); } }, '🤷 Not sure yet'),
          h('button', { class: 'vb-mini orange', onclick: () => { const id = replyPrompt.id; replyPrompt = null; openTell([id], 'pass'); } }, '👂 Pass it on')));
    }
    const bd = board();
    const c = bd.cards.find((x) => !x.done && P(x.botId).alive);
    if (!c) return null;
    const b = P(c.botId);
    const opts = c.options.slice(0, 3).map((o) => h('button', { class: 'vb-mini', onclick: () => {
      c.done = true;
      noteToldFromLabel(c.botId, o.label, true);
      const r = o.fx?.();
      const text = typeof r === 'string' ? r : r?.text;
      if (text) say(c.botId, text); else paint();
    } }, o.label));
    if (c.claim != null && c.claim !== H) opts.push(h('button', { class: 'vb-mini gold', title: 'Say yes, but you don’t mean it (only you know)', onclick: () => {
      c.done = true;
      const r = chatReply(c.botId, `I'm in on ${nm(c.claim)}`, S.threads?.[c.botId] || []);
      noteToldFromLabel(c.botId, `I'm in on ${nm(c.claim)}`, false);
      say(c.botId, r.text);
    } }, '🤥 Yes (bluff)'));
    return h('div', { class: 'vb-in' },
      h('div', { class: 'vb-in-top' }, face(b, 34), h('div', {}, h('b', {}, `${b.name}: `), `“${c.text}”`), h('button', { class: 'vb-x', title: 'Ignore', onclick: () => { c.done = true; paint(); } }, '×')),
      h('div', { class: 'vb-in-btns' }, ...opts));
  }

  // ---------------------------------------------------------------- tally
  function tallyEl() {
    const t = tally().slice(0, 4);
    const need = Math.floor(alive().length / 2) + 1;
    if (!t.length) return h('div', { class: 'vb-tally empty' }, 'Ask people who they’re voting for to fill this in.');
    return h('div', { class: 'vb-tally' }, h('span', { class: 'vb-tl' }, 'VOTES'),
      ...t.map((e) => h('span', { class: `vb-t ${e.id === H ? 'me' : ''}` },
        h('b', {}, e.id === H ? 'You' : nm(e.id)),
        h('span', { class: 'vb-boxes' }, ...Array.from({ length: e.sure }, () => h('i', { class: 'sure' })), ...Array.from({ length: e.maybe }, () => h('i', { class: 'maybe' }))),
        e.id === H && e.total >= need - 1 ? ' ⚠️' : '')));
  }

  // ---------------------------------------------------------------- actions
  async function doAsk(ids, together) {
    const { answers, askBack } = ask(ids, together);
    paint();
    await sayAll(answers);
    if (askBack && !api.isOver()) { replyPrompt = askBack; paint(); }
  }
  async function askSelected() {
    const ids = [...selected];
    if (!ids.length) { toast('Tap faces to pick who to ask.'); return; }
    sfx('click');
    if (ids.length === 1) return doAsk(ids, false);
    const box = h('div', { class: 'vb-sheet' },
      h('div', { class: 'vb-sh-title' }, `Ask ${ids.map(nm).join(' & ')}`),
      h('div', { class: 'vb-sh-q' }, '❓ Who are you voting for?'),
      h('div', { class: 'vb-row2' },
        h('button', { class: 'vb-big', onclick: () => box.close('together') }, '👥 Together', h('small', {}, 'they hear each other')),
        h('button', { class: 'vb-big', onclick: () => box.close('apart') }, '👤 Separately', h('small', {}, 'private, one by one'))));
    const how = await modal(box);
    if (how) doAsk(ids, how === 'together');
  }

  // A row of faces to pick one person from.
  function facePicker(ids, current, onPick, { you = false } = {}) {
    const list = [...(you ? [H] : []), ...ids.filter((x) => x !== H)];
    return h('div', { class: 'vb-pick' }, ...list.map((id) => {
      const p = P(id);
      return h('button', { class: `vb-pk ${current === id ? 'on' : ''} ${p.immune ? 'imm' : ''}`, onclick: () => onPick(id) }, face(p, 40), h('span', {}, id === H ? 'YOU' : p.name));
    }));
  }

  function openTell(ids, mode = 'mine') {
    ids = ids?.length ? ids : [...selected];
    if (!ids.length) { toast('Tap faces to pick who to tell.'); return; }
    sfx('click');
    const st = { mode, vote: null, meant: true, src: H, toldWho: null, toldVote: null, but: false, real: null, active: null };
    const box = h('div', { class: 'vb-sheet' });
    const voteable = (exclude) => alive().filter((p) => !exclude.includes(p.id) && !p.immune).map((p) => p.id);
    const blank = (key, label) => h('button', { class: `vb-blank ${st.active === key ? 'on' : ''}`, onclick: () => { st.active = st.active === key ? null : key; draw(); } },
      st[key] != null ? face(P(st[key]), 22) : null, h('b', {}, st[key] == null ? label : st[key] === H ? 'ME' : nm(st[key])), ' ▾');
    const draw = () => {
      const blue = st.mode === 'mine';
      box.className = `vb-sheet ${blue ? 'blue' : 'orange'}`;
      const switcher = h('div', { class: 'vb-mode' },
        h('button', { class: blue ? 'on' : '', onclick: () => { st.mode = 'mine'; draw(); } }, 'MY VOTE'),
        h('button', { class: !blue ? 'on' : '', onclick: () => { st.mode = 'pass'; draw(); } }, 'PASS IT ON'));
      const priv = h('div', { class: 'vb-priv' }, h('small', {}, '🔒 Only you see this'),
        h('div', { class: 'vb-row2' },
          h('button', { class: `vb-tog ${st.meant ? 'on good' : ''}`, onclick: () => { st.meant = true; draw(); } }, '✓ I mean it'),
          h('button', { class: `vb-tog ${!st.meant ? 'on bluff' : ''}`, onclick: () => { st.meant = false; draw(); } }, blue ? '🤥 Bluff' : '🤥 Made up')));
      let bodyEls, ready = false, sendText = 'Send';
      if (blue) {
        bodyEls = [h('div', { class: 'vb-lab' }, 'I’m voting for'), facePicker(voteable([H]), st.vote, (id) => { st.vote = id; draw(); })];
        ready = st.vote != null;
        if (ready) sendText = `“My vote is ${nm(st.vote)}”`;
      } else {
        const meSrc = st.src === H;
        const lines = meSrc
          ? [h('div', { class: 'vb-sent' }, 'I told ', blank('toldWho', 'who'), ' I’m voting for ', blank('toldVote', 'who')),
            h('label', { class: 'vb-but' }, h('input', { type: 'checkbox', checked: st.but, onchange: (e) => { st.but = e.target.checked; st.active = st.but ? 'real' : null; draw(); } }), ' but I’m really on ', st.but ? blank('real', 'who') : null)]
          : [h('div', { class: 'vb-sent' }, blank('src', 'who'), ' told me they’re voting for ', blank('toldVote', 'who'))];
        const pickerFor = {
          toldWho: () => facePicker(aliveBots().map((b) => b.id).filter((x) => !ids.includes(x)), st.toldWho, (id) => { st.toldWho = id; st.active = 'toldVote'; draw(); }),
          src: () => facePicker(aliveBots().map((b) => b.id).filter((x) => !ids.includes(x)), st.src === H ? null : st.src, (id) => { st.src = id; st.active = 'toldVote'; draw(); }),
          toldVote: () => facePicker(voteable(meSrc ? [H] : [st.src]), st.toldVote, (id) => { st.toldVote = id; st.active = meSrc && st.but && st.real == null ? 'real' : null; draw(); }, { you: !meSrc }),
          real: () => facePicker(voteable([H]), st.real, (id) => { st.real = id; st.active = null; draw(); }),
        };
        bodyEls = [
          h('div', { class: 'vb-who' }, h('span', { class: 'vb-lab' }, 'Who said it'),
            h('button', { class: `vb-chipbtn me ${meSrc ? 'on' : ''}`, onclick: () => { st.src = H; st.active = 'toldWho'; draw(); } }, 'ME'),
            h('button', { class: `vb-chipbtn ${!meSrc ? 'on' : ''}`, onclick: () => { st.src = null; st.active = 'src'; draw(); } }, 'SOMEONE ELSE')),
          ...lines,
          st.active && pickerFor[st.active] ? h('div', { class: 'vb-pickwrap' }, pickerFor[st.active]()) : null,
        ];
        ready = meSrc ? st.toldWho != null && st.toldVote != null && (!st.but || st.real != null) : st.src != null && st.toldVote != null;
        if (ready) sendText = meSrc
          ? `“I told ${nm(st.toldWho)} ${nm(st.toldVote)}${st.but ? `, but I’m really on ${nm(st.real)}` : ''}”`
          : `“${nm(st.src)}’s on ${st.toldVote === H ? 'me' : nm(st.toldVote)}”`;
      }
      box.replaceChildren(
        h('div', { class: 'vb-sh-title' }, `Tell ${ids.map(nm).join(' & ')}`),
        switcher, ...bodyEls, priv,
        h('button', { class: 'vb-send', disabled: !ready, onclick: () => box.close(true) }, sendText));
    };
    if (mode === 'pass') st.active = 'toldWho';
    draw();
    modal(box).then(async (ok) => {
      if (!ok) return;
      const replies = st.mode === 'mine'
        ? tellVote(ids, st.vote, st.meant)
        : passOn(ids, { src: st.src, toldWho: st.toldWho, toldVote: st.toldVote, real: st.but ? st.real : null, meant: st.meant });
      paint();
      await sayAll(replies);
    });
  }

  function readPicker(id) {
    const p = board().ppl[id], b = P(id);
    const box = h('div', { class: 'vb-sheet purple' },
      h('div', { class: 'vb-sh-sub' }, p.claim == null ? `${b.name} says they’re not sure.` : `${b.name} said ${p.claim === H ? 'you' : nm(p.claim)}.`),
      h('div', { class: 'vb-sh-title' }, `Who is ${b.name} really voting for?`),
      facePicker(alive().filter((x) => x.id !== id && !x.immune).map((x) => x.id), p.read, (t) => box.close(t), { you: true }),
      h('div', { class: 'vb-row2' },
        h('button', { class: 'vb-tog', onclick: () => box.close('?') }, '? No idea'),
        h('button', { class: 'vb-tog', onclick: () => box.close('word') }, '↺ Use their word')));
    modal(box).then((t) => { setRead(id, t ?? 'word'); paint(); });
  }

  function useSpy(id) {
    spendAdv(H, 'spy');
    const story = spyStory(id);
    const b = P(id);
    sfx('reveal');
    const total = story.reduce((a, g) => a + g.who.length, 0);
    const box = h('div', { class: 'vb-sheet gold' },
      h('div', { class: 'vb-sh-sub' }, '👁️ SPY'),
      h('div', { class: 'vb-sh-title' }, `${b.name}’s story`),
      h('div', { class: 'vb-sh-q small' }, `Who ${b.name} has told people they’re voting for:`),
      ...(story.length ? story.map((g) => h('div', { class: 'vb-story' },
        face(P(g.target), 40), h('div', {}, h('b', {}, `${g.target === H ? 'YOU' : nm(g.target)}`), h('span', {}, g.who.length ? ` · told ${g.who.length} ${g.who.length === 1 ? 'person' : 'people'}` : ' · hasn’t said it out loud, but it’s the vibe')),
        h('div', { class: 'vb-story-who' }, ...g.who.map((w) => face(P(w), 24)))))
        : [h('div', { class: 'muted' }, `${b.name} hasn’t told anyone anything yet.`)]),
      story.length > 1 ? h('div', { class: 'vb-mixed' }, 'Mixed story: they’re telling people different things.') : null,
      total ? null : null,
      h('button', { class: 'vb-send', onclick: () => box.close() }, 'Back to the board'));
    modal(box).then(() => paint());
  }

  async function lockIn() {
    sfx('click');
    const real = board().me.real;
    const box = h('div', { class: 'vb-sheet' },
      h('div', { class: 'vb-sh-title' }, 'Lock in and go to Tribal?'),
      h('div', { class: 'vb-sh-q small' }, real != null ? `Your plan: vote ${nm(real)}. You can still change your vote at Tribal.` : 'You can still decide your vote at Tribal.'),
      h('div', { class: 'vb-row2' },
        h('button', { class: 'vb-tog', onclick: () => box.close(false) }, 'Not yet'),
        h('button', { class: 'vb-send green', onclick: () => box.close(true) }, '🔒 Lock in')));
    if (await modal(box)) api.onLock();
  }

  // ---------------------------------------------------------------- paint
  function paint() {
    if (api.isOver()) return;
    const bots = aliveBots();
    for (const id of [...selected]) if (!P(id).alive) selected.delete(id);
    const me = P(H), bd = board();
    const spies = me.advantages.filter((a) => a === 'spy').length;
    const sel = [...selected];
    el.replaceChildren(h('div', { class: `vb ${spyMode ? 'spying' : ''}` },
      h('div', { class: 'vb-head' },
        h('span', { class: 'vb-pill' }, `🔒 ${api.readyCount()} / ${alive().length}`),
        h('div', { class: 'vb-title' }, 'STRATEGY'),
        h('button', { class: 'vb-pill btn-pill', onclick: () => api.openMessages(), title: 'Messages' }, '💬')),
      incoming(),
      spyMode ? h('div', { class: 'vb-hint gold' }, '👁️ Tap a face to spy on them') : null,
      h('div', { class: 'vb-grid' }, ...bots.map(card)),
      tallyEl(),
      h('div', { class: 'vb-bar' },
        h('div', { class: 'vb-selrow' }, sel.length ? `${sel.length} selected · ${sel.map(nm).join(', ')}` : 'Tap faces to select · tap a chip to judge it',
          sel.length ? h('button', { class: 'vb-clear', onclick: () => { selected.clear(); paint(); } }, 'clear') : null),
        h('div', { class: 'vb-row2' },
          h('button', { class: 'vb-act', onclick: askSelected }, '❓ ASK'),
          h('button', { class: 'vb-act', onclick: () => openTell() }, '🗣️ TELL')),
        h('div', { class: 'vb-row2 last' },
          spies ? h('button', { class: `vb-spy ${spyMode ? 'on' : ''}`, onclick: () => { spyMode = !spyMode; sfx('click'); paint(); } }, `👁️ SPY ×${spies}`) : null,
          h('button', { class: 'vb-lock', onclick: lockIn }, bd.me.real != null ? `🔒 LOCK IN · ${nm(bd.me.real).toUpperCase()}` : '🔒 LOCK IN · VOTE')))));
  }

  paint();
  return { paint };
}

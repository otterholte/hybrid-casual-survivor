// Everything you hear is synthesized live with the Web Audio API: no audio files.
import { store, rand, pick } from './util.js';

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic, the "island" sound
const noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const scale = (root, degree) => {
  const oct = Math.floor(degree / 5);
  const d = ((degree % 5) + 5) % 5;
  return root + oct * 12 + PENTA[d];
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = store.get('ic_muted', false);
    this.musicName = null;
    this.ambientName = null;
    this._musicTimer = null;
    this._ambNodes = [];
    this._ambTimers = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.8;
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.32;
    this.ambBus = c.createGain();
    this.ambBus.gain.value = 0.35;
    [this.sfxBus, this.musicBus, this.ambBus].forEach((b) => b.connect(this.master));
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Resume whichever loops were requested before the first gesture.
    const m = this.musicName, a = this.ambientName;
    this.musicName = this.ambientName = null;
    if (m) this.music(m);
    if (a) this.ambient(a);
  }

  setMuted(m) {
    this.muted = m;
    store.set('ic_muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---------- primitive voices ----------
  tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slideTo, delay = 0, bus, filter, q = 1 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      node = g.connect(f);
      f.connect(bus || this.sfxBus);
    } else g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, type = 'lowpass', freq = 1000, slideTo, q = 1, attack = 0.005, delay = 0, bus }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus || this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  marimba(midi, delay = 0, vol = 0.25, bus) {
    const f = noteHz(midi);
    this.tone({ freq: f, type: 'sine', dur: 0.45, vol, delay, bus });
    this.tone({ freq: f * 4, type: 'sine', dur: 0.08, vol: vol * 0.25, delay, bus });
  }

  drum(delay = 0, vol = 0.8, bus, pitch = 95) {
    this.tone({ freq: pitch, slideTo: pitch * 0.45, type: 'sine', dur: 0.42, vol, delay, bus });
    this.noise({ dur: 0.05, vol: vol * 0.3, freq: 700, delay, bus });
  }

  // ---------- named sound effects ----------
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.tone({ freq: 520, slideTo: 700, type: 'triangle', dur: 0.07, vol: 0.18 }); break;
      case 'pop': this.tone({ freq: 380, slideTo: 950, dur: 0.11, vol: 0.28 }); break;
      case 'whoosh': this.noise({ dur: 0.32, vol: 0.22, type: 'bandpass', freq: 500, slideTo: 2400, q: 1.5, attack: 0.06 }); break;
      case 'thud': this.tone({ freq: 130, slideTo: 45, dur: 0.3, vol: 0.7 }); this.noise({ dur: 0.18, vol: 0.35, freq: 350 }); break;
      case 'plop': this.tone({ freq: 240, slideTo: 110, dur: 0.16, vol: 0.5 }); this.noise({ dur: 0.12, vol: 0.25, freq: 600 }); break;
      case 'snap': this.noise({ dur: 0.09, vol: 0.7, type: 'highpass', freq: 1800 }); this.tone({ freq: 200, type: 'square', dur: 0.05, vol: 0.15 }); break;
      case 'tick': this.tone({ freq: 1250, type: 'triangle', dur: 0.035, vol: 0.12 }); break;
      case 'beep': this.tone({ freq: 660, type: 'square', dur: 0.12, vol: 0.12, filter: 2500 }); break;
      case 'go': this.tone({ freq: 990, type: 'square', dur: 0.35, vol: 0.14, filter: 3000 }); this.drum(0, 0.7); break;
      case 'drum': this.drum(); break;
      case 'drumroll': for (let i = 0; i < 14; i++) this.drum(i * 0.07, 0.15 + i * 0.03, undefined, 150); this.drum(1.05, 1); break;
      case 'boom': this.drum(0, 1, undefined, 70); this.noise({ dur: 0.8, vol: 0.25, freq: 200 }); break;
      case 'conch': {
        const c = this.ctx, t = c.currentTime;
        [0, 7].forEach((det, i) => {
          const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(196 * (i ? 1.5 : 1), t);
          o.frequency.linearRampToValueAtTime(207 * (i ? 1.5 : 1), t + 0.4);
          o.detune.value = det;
          f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1300, t + 0.5);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(i ? 0.06 : 0.16, t + 0.25);
          g.gain.setValueAtTime(i ? 0.06 : 0.16, t + 1.1);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
          o.connect(f).connect(g).connect(this.sfxBus);
          o.start(t); o.stop(t + 1.7);
        });
        break;
      }
      case 'sparkle': [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ freq: noteHz(84 + n), dur: 0.35, vol: 0.14, delay: i * 0.06 })); break;
      case 'idol': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.marimba(72 + n, i * 0.08, 0.22)); this.noise({ dur: 1.2, vol: 0.08, type: 'highpass', freq: 6000, attack: 0.3 }); break;
      case 'fanfare': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.42], [79, 0.6], [84, 0.72]].forEach(([n, d]) => this.marimba(n, d, 0.3)); this.drum(0, 0.6); this.drum(0.42, 0.8); break;
      case 'fail': this.tone({ freq: 420, slideTo: 210, type: 'triangle', dur: 0.35, vol: 0.25 }); this.tone({ freq: 300, slideTo: 140, type: 'triangle', dur: 0.5, vol: 0.25, delay: 0.3 }); break;
      case 'snuff': this.noise({ dur: 0.7, vol: 0.5, freq: 1800, slideTo: 150, attack: 0.02 }); this.tone({ freq: 90, slideTo: 40, dur: 0.6, vol: 0.3, delay: 0.1 }); break;
      case 'gasp': this.noise({ dur: 0.45, vol: 0.18, type: 'bandpass', freq: 1300, slideTo: 900, q: 2, attack: 0.06 }); break;
      case 'ping': this.tone({ freq: 1320, dur: 0.12, vol: 0.14 }); this.tone({ freq: 1760, dur: 0.18, vol: 0.12, delay: 0.07 }); break;
      case 'send': this.tone({ freq: 700, slideTo: 1100, dur: 0.09, vol: 0.12 }); break;
      case 'dig': this.noise({ dur: 0.14, vol: 0.35, freq: 900, slideTo: 300 }); break;
      case 'clack': this.tone({ freq: 280, type: 'triangle', dur: 0.08, vol: 0.4 }); this.noise({ dur: 0.04, vol: 0.3, type: 'bandpass', freq: 1600, q: 3 }); break;
      case 'clang': this.tone({ freq: 1480, dur: 0.6, vol: 0.18 }); this.tone({ freq: 2220, dur: 0.4, vol: 0.1 }); this.tone({ freq: 740, dur: 0.3, vol: 0.12 }); break;
      case 'paper': this.noise({ dur: 0.25, vol: 0.2, type: 'highpass', freq: 3000, attack: 0.03 }); this.noise({ dur: 0.18, vol: 0.15, type: 'highpass', freq: 4000, delay: 0.2 }); break;
      case 'stamp': this.tone({ freq: 160, slideTo: 60, dur: 0.18, vol: 0.6 }); this.noise({ dur: 0.08, vol: 0.4, freq: 1200 }); break;
      case 'perfect': [0, 7, 12].forEach((n, i) => this.marimba(79 + n, i * 0.05, 0.22)); break;
      case 'splash': this.noise({ dur: 0.5, vol: 0.4, type: 'bandpass', freq: 1500, slideTo: 400, q: 0.8 }); break;
      case 'cheer':
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.9, vol: 0.07, type: 'bandpass', freq: rand(900, 2200), q: 4, attack: 0.1, delay: i * 0.05 });
        break;
      case 'win': this.play('fanfare'); this.play('cheer'); break;
      // Cinematic Tribal sounds.
      case 'heartbeat':
        this.tone({ freq: 62, slideTo: 40, dur: 0.18, vol: 0.55, attack: 0.008 });
        this.tone({ freq: 58, slideTo: 38, dur: 0.2, vol: 0.4, attack: 0.008, delay: 0.24 });
        break;
      case 'swell': this.noise({ dur: 0.9, vol: 0.16, type: 'bandpass', freq: 300, slideTo: 2600, q: 0.8, attack: 0.8 }); this.tone({ freq: 110, slideTo: 220, type: 'sawtooth', dur: 0.85, vol: 0.05, attack: 0.8, filter: 700 }); break;
      case 'reveal':
        this.tone({ freq: 58, slideTo: 32, dur: 1.8, vol: 0.9, attack: 0.005 });
        this.noise({ dur: 1.4, vol: 0.3, freq: 420, slideTo: 90, attack: 0.005 });
        this.tone({ freq: 1661, dur: 1.6, vol: 0.035, attack: 0.01 });
        this.tone({ freq: 2489, dur: 1.2, vol: 0.02, attack: 0.01 });
        this.tone({ freq: 110, type: 'triangle', dur: 2.2, vol: 0.12, attack: 0.02, filter: 500 });
        break;
      case 'scribble':
        // Pencil on paper: a run of short, scratchy strokes.
        for (let i = 0, t = 0; i < 11; i++) {
          const d = rand(0.05, 0.13);
          this.noise({ dur: d, vol: rand(0.05, 0.11), type: 'bandpass', freq: rand(2600, 4800), slideTo: rand(1800, 5200), q: 3, attack: 0.01, delay: t });
          t += d + rand(0.01, 0.05);
        }
        break;
      case 'cast': this.tone({ freq: 90, slideTo: 45, dur: 1.1, vol: 0.55 }); this.noise({ dur: 0.9, vol: 0.12, freq: 600, slideTo: 120, attack: 0.15 }); break;
      case 'void': this.tone({ freq: 140, slideTo: 70, type: 'sawtooth', dur: 0.5, vol: 0.12, filter: 600 }); this.tone({ freq: 70, slideTo: 40, dur: 0.6, vol: 0.5 }); break;
      case 'question': this.tone({ freq: 74, slideTo: 60, dur: 0.9, vol: 0.35 }); this.tone({ freq: 880, dur: 0.8, vol: 0.025, attack: 0.05 }); break;
    }
  }

  // ---------- music (16-step sequencer) ----------
  music(name) {
    if (this.musicName === name) return;
    this.musicName = name;
    clearInterval(this._musicTimer);
    this._musicTimer = null;
    if (!this.ctx || !name) return;
    const songs = {
      challenge: { bpm: 124, fn: (s, d, bar) => {
        if ([0, 6, 8, 11].includes(s)) this.drum(d, 0.6, this.musicBus, 80);
        if ([2, 3, 10, 14].includes(s)) this.drum(d, 0.35, this.musicBus, 210);
        if (s % 2 === 0) this.noise({ dur: 0.05, vol: 0.12, type: 'highpass', freq: 7000, delay: d, bus: this.musicBus });
        const bass = [0, 0, 2, 0, 3, 3, 1, 4][(bar % 2) * 4 + Math.floor(s / 4)];
        if (s % 4 === 0) this.marimba(scale(45, bass), d, 0.35, this.musicBus);
        if ([1, 5, 9, 13, 15].includes(s) && Math.random() < 0.6) this.marimba(scale(69, Math.floor(rand(0, 7))), d, 0.12, this.musicBus);
      } },
      camp: { bpm: 96, fn: (s, d, bar) => {
        const mel = [[0, 2, 4, 2], [3, 4, 5, 4], [0, 4, 2, 1], [2, 1, 0, -1]][bar % 4];
        if (s % 4 === 0) this.marimba(scale(60, mel[s / 4]), d, 0.18, this.musicBus);
        if (s % 4 === 2 && Math.random() < 0.5) this.marimba(scale(72, mel[(s - 2) / 4] + 2), d, 0.08, this.musicBus);
        if (s === 0 || s === 8) this.marimba(scale(36, mel[0]), d, 0.3, this.musicBus);
        if (s === 4 || s === 12) this.drum(d, 0.18, this.musicBus, 200);
      } },
      title: { bpm: 108, fn: (s, d, bar) => {
        if ([0, 3, 6, 8, 10].includes(s)) this.drum(d, 0.5, this.musicBus, s === 0 ? 70 : 150);
        const mel = [[0, 2, 4, 5], [4, 2, 3, 1], [0, 2, 4, 7], [5, 4, 2, 0]][bar % 4];
        if (s % 4 === 0) this.marimba(scale(60, mel[s / 4]), d, 0.2, this.musicBus);
        if (s === 0) this.marimba(scale(36, mel[0]), d, 0.35, this.musicBus);
      } },
      tribal: { bpm: 60, fn: (s, d, bar) => {
        if (s === 0) this.drum(d, 0.8, this.musicBus, 55);
        if (s === 6 && bar % 2) this.drum(d, 0.35, this.musicBus, 62);
        if (s === 0 && bar % 2 === 0) {
          this.tone({ freq: noteHz(33), type: 'sawtooth', dur: 4.2, vol: 0.05, attack: 1.2, delay: d, bus: this.musicBus, filter: 220 });
          this.tone({ freq: noteHz(45), type: 'triangle', dur: 4.2, vol: 0.06, attack: 1.2, delay: d, bus: this.musicBus, filter: 400 });
        }
        if (s === 10 && Math.random() < 0.3) this.tone({ freq: noteHz(pick([69, 72, 76])), dur: 1.4, vol: 0.02, attack: 0.3, delay: d, bus: this.musicBus });
      } },
      tension: { bpm: 70, fn: (s, d, bar) => {
        if (s === 0) { this.tone({ freq: 62, slideTo: 40, dur: 0.18, vol: 0.45, attack: 0.008, delay: d, bus: this.musicBus }); this.tone({ freq: 58, slideTo: 38, dur: 0.2, vol: 0.32, attack: 0.008, delay: d + 0.24, bus: this.musicBus }); }
        if (s === 0 && bar % 2 === 0) this.tone({ freq: noteHz(31), type: 'sawtooth', dur: 4, vol: 0.05, attack: 1.5, delay: d, bus: this.musicBus, filter: 260 });
      } },
    };
    const song = songs[name];
    if (!song) return;
    const stepDur = 60 / song.bpm / 4;
    let next = this.ctx.currentTime + 0.1, step = 0, bar = 0;
    this._musicTimer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.15) {
        song.fn(step, next - this.ctx.currentTime, bar);
        next += stepDur;
        step = (step + 1) % 16;
        if (step === 0) bar++;
      }
    }, 30);
  }

  // ---------- ambience ----------
  ambient(name) {
    if (this.ambientName === name) return;
    this.ambientName = name;
    this._ambNodes.forEach((n) => { try { n.stop(); } catch {} });
    this._ambTimers.forEach(clearInterval);
    this._ambNodes = [];
    this._ambTimers = [];
    if (!this.ctx || !name) return;
    const c = this.ctx;
    if (name === 'beach' || name === 'jungle') {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = name === 'beach' ? 520 : 300;
      const g = c.createGain();
      g.gain.value = 0.25;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.11;
      lg.gain.value = 0.22;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.ambBus);
      src.start(); lfo.start();
      this._ambNodes.push(src, lfo);
      this._ambTimers.push(setInterval(() => {
        if (Math.random() < 0.45) {
          const base = rand(2200, 3600);
          for (let i = 0; i < (Math.random() < 0.5 ? 2 : 3); i++)
            this.tone({ freq: base, slideTo: base * rand(1.1, 1.4), dur: 0.09, vol: 0.05, delay: i * 0.13, bus: this.ambBus });
        }
      }, 2600));
    }
    if (name === 'night') {
      this._ambTimers.push(setInterval(() => {
        if (Math.random() < 0.7) for (let i = 0; i < 3; i++)
          this.tone({ freq: 4300, type: 'sine', dur: 0.04, vol: 0.025, delay: i * 0.06, bus: this.ambBus });
      }, 700));
      this._ambTimers.push(setInterval(() => {
        for (let i = 0; i < 3; i++) if (Math.random() < 0.5)
          this.noise({ dur: 0.03, vol: rand(0.05, 0.18), type: 'highpass', freq: 2500, delay: Math.random() * 0.3, bus: this.ambBus });
      }, 300));
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      const g = c.createGain(); g.gain.value = 0.3;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      this._ambNodes.push(src);
    }
  }
}

export const audio = new AudioEngine();
export const sfx = (name) => audio.play(name);

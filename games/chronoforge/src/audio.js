// Chronoforge — Procedural Web Audio SFX.
// Exposes initAudio(), playSfx(id, {pitch, gain}), setBusGain(bus, value).
// All SFX are oscillator+filter+envelope recipes, no sample loading.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;

export function initAudio() {
  if (ctx) return;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  ctx = new C();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.6; musicBus.connect(master);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setBusGain(bus, value) {
  const n = bus === 'master' ? master : bus === 'music' ? musicBus : sfxBus;
  if (n) n.gain.value = value;
}

function env(node, { attack = 0.005, decay = 0.05, peak = 1, sustain = 0, release = 0.02, dur = 0.1 }) {
  const g = node.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(0.0001, now);
  g.exponentialRampToValueAtTime(peak, now + attack);
  g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);
  g.setValueAtTime(Math.max(0.0001, sustain), now + attack + decay + dur);
  g.exponentialRampToValueAtTime(0.0001, now + attack + decay + dur + release);
}

function osc(type, freq) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  return o;
}

function noise(durMs) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * durMs / 1000, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  return src;
}

function filter(type, freq) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  return f;
}

const RECIPES = {
  ui_click: ({ pitch, gain }) => {
    const o = osc('triangle', 220 * pitch);
    const g = ctx.createGain();
    o.connect(g); g.connect(sfxBus);
    o.frequency.exponentialRampToValueAtTime(140 * pitch, ctx.currentTime + 0.05);
    env(g, { attack: 0.002, decay: 0.02, peak: 0.35 * gain, sustain: 0, release: 0.04, dur: 0.02 });
    o.start(); o.stop(ctx.currentTime + 0.08);
  },
  ui_tab: ({ pitch, gain }) => {
    const o = osc('square', 440 * pitch);
    const f = filter('lowpass', 2000);
    const g = ctx.createGain();
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.frequency.exponentialRampToValueAtTime(660 * pitch, ctx.currentTime + 0.06);
    env(g, { attack: 0.002, decay: 0.02, peak: 0.3 * gain, sustain: 0, release: 0.04, dur: 0.02 });
    o.start(); o.stop(ctx.currentTime + 0.1);
  },
  ui_menu_open: ({ pitch, gain }) => {
    const o = osc('sine', 200 * pitch);
    const g = ctx.createGain();
    o.connect(g); g.connect(sfxBus);
    o.frequency.exponentialRampToValueAtTime(800 * pitch, ctx.currentTime + 0.18);
    env(g, { attack: 0.01, decay: 0.08, peak: 0.28 * gain, sustain: 0.08 * gain, release: 0.08, dur: 0.08 });
    o.start(); o.stop(ctx.currentTime + 0.24);
  },
  ui_menu_close: ({ pitch, gain }) => {
    const o = osc('sine', 800 * pitch);
    const g = ctx.createGain();
    o.connect(g); g.connect(sfxBus);
    o.frequency.exponentialRampToValueAtTime(200 * pitch, ctx.currentTime + 0.14);
    env(g, { attack: 0.005, decay: 0.06, peak: 0.25 * gain, sustain: 0.05 * gain, release: 0.06, dur: 0.06 });
    o.start(); o.stop(ctx.currentTime + 0.2);
  },
  ow_encounter: ({ pitch, gain }) => {
    const o = osc('square', 520 * pitch);
    const f = filter('lowpass', 1200);
    const g = ctx.createGain();
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.frequency.exponentialRampToValueAtTime(260 * pitch, ctx.currentTime + 0.28);
    env(g, { attack: 0.01, decay: 0.1, peak: 0.4 * gain, sustain: 0.1 * gain, release: 0.1, dur: 0.1 });
    o.start(); o.stop(ctx.currentTime + 0.35);
  },
  bt_atb_fill: ({ pitch, gain }) => {
    const o = osc('sine', 1200 * pitch);
    const g = ctx.createGain();
    o.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.015, peak: 0.3 * gain, sustain: 0, release: 0.02, dur: 0.005 });
    o.start(); o.stop(ctx.currentTime + 0.05);
  },
  bt_action_select: ({ pitch, gain }) => {
    const o = osc('square', 660 * pitch);
    const g = ctx.createGain();
    o.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.02, peak: 0.3 * gain, sustain: 0, release: 0.03, dur: 0.02 });
    o.start(); o.stop(ctx.currentTime + 0.08);
  },
  bt_basic_attack: ({ pitch, gain }) => {
    const n = noise(120);
    const f = filter('bandpass', 1800 * pitch); f.Q.value = 1.5;
    const saw = osc('sawtooth', 220 * pitch);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    n.connect(f); f.connect(g); saw.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.04, peak: 0.55 * gain, sustain: 0.1 * gain, release: 0.05, dur: 0.04 });
    saw.frequency.exponentialRampToValueAtTime(120 * pitch, ctx.currentTime + 0.12);
    n.start(); saw.start();
    n.stop(ctx.currentTime + 0.14); saw.stop(ctx.currentTime + 0.14);
  },
  bt_tech_cast: ({ pitch, gain }) => {
    const s1 = osc('sawtooth', 300 * pitch);
    const s2 = osc('square', 600 * pitch);
    const f = filter('lowpass', 600);
    const g = ctx.createGain();
    s1.connect(f); s2.connect(f); f.connect(g); g.connect(sfxBus);
    f.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 0.25);
    s1.frequency.exponentialRampToValueAtTime(900 * pitch, ctx.currentTime + 0.25);
    env(g, { attack: 0.005, decay: 0.15, peak: 0.4 * gain, sustain: 0.1 * gain, release: 0.08, dur: 0.1 });
    s1.start(); s2.start();
    s1.stop(ctx.currentTime + 0.35); s2.stop(ctx.currentTime + 0.35);
  },
  bt_crit_hit: ({ pitch, gain }) => {
    const n = noise(220);
    const sh = osc('sine', 2200 * pitch);
    const saw = osc('sawtooth', 90 * pitch);
    const g = ctx.createGain();
    n.connect(g); sh.connect(g); saw.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.06, peak: 0.7 * gain, sustain: 0.12 * gain, release: 0.08, dur: 0.08 });
    n.start(); sh.start(); saw.start();
    n.stop(ctx.currentTime + 0.22); sh.stop(ctx.currentTime + 0.22); saw.stop(ctx.currentTime + 0.22);
  },
  bt_combo_intro: ({ pitch, gain }) => {
    [0, 0.12, 0.24].forEach((t, i) => {
      const o = osc('square', (440 + i * 220) * pitch);
      const f = filter('lowpass', 1400);
      const g = ctx.createGain();
      o.connect(f); f.connect(g); g.connect(sfxBus);
      const start = ctx.currentTime + t;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.35 * gain, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      o.start(start); o.stop(start + 0.18);
    });
  },
  bt_combo_hit: ({ pitch, gain }) => {
    const n = noise(180);
    const low = osc('sawtooth', 70 * pitch);
    const g = ctx.createGain();
    n.connect(g); low.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.05, peak: 0.85 * gain, sustain: 0.15 * gain, release: 0.1, dur: 0.06 });
    n.start(); low.start();
    n.stop(ctx.currentTime + 0.2); low.stop(ctx.currentTime + 0.2);
  },
  bt_hurt: ({ pitch, gain }) => {
    const saw = osc('sawtooth', 180 * pitch);
    const g = ctx.createGain();
    saw.connect(g); g.connect(sfxBus);
    saw.frequency.exponentialRampToValueAtTime(90 * pitch, ctx.currentTime + 0.12);
    env(g, { attack: 0.002, decay: 0.04, peak: 0.45 * gain, sustain: 0.08 * gain, release: 0.04, dur: 0.04 });
    saw.start(); saw.stop(ctx.currentTime + 0.14);
  },
  bt_heal: ({ pitch, gain }) => {
    [0, 0.1].forEach((t, i) => {
      const o = osc('triangle', (660 + i * 220) * pitch);
      const g = ctx.createGain();
      o.connect(g); g.connect(sfxBus);
      const start = ctx.currentTime + t;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.32 * gain, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      o.start(start); o.stop(start + 0.2);
    });
  },
  bt_miss: ({ pitch, gain }) => {
    const n = noise(80);
    const f = filter('lowpass', 400);
    const g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(sfxBus);
    env(g, { attack: 0.002, decay: 0.03, peak: 0.25 * gain, sustain: 0.05 * gain, release: 0.03, dur: 0.02 });
    n.start(); n.stop(ctx.currentTime + 0.1);
  },
  bt_victory: ({ pitch, gain }) => {
    // 4-note fanfare I-iii-V-I in D major: D A F# D (MIDI 62,64,66,62 actually I–iii–V–I is D F# A D)
    const notes = [293.66, 369.99, 440, 587.33];
    notes.forEach((f, i) => {
      const o1 = osc('sawtooth', f * pitch);
      const o2 = osc('square', f * 2 * pitch);
      const g = ctx.createGain();
      o1.connect(g); o2.connect(g); g.connect(sfxBus);
      const start = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.35 * gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      o1.start(start); o2.start(start);
      o1.stop(start + 0.26); o2.stop(start + 0.26);
    });
  },
  bt_defeat: ({ pitch, gain }) => {
    const notes = [293.66, 277.18, 246.94, 220];
    notes.forEach((f, i) => {
      const o = osc('sawtooth', f * pitch);
      const flt = filter('lowpass', 800);
      const g = ctx.createGain();
      o.connect(flt); flt.connect(g); g.connect(sfxBus);
      const start = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3 * gain, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      o.start(start); o.stop(start + 0.45);
    });
  },
};

export function playSfx(id, { pitch = 1, gain = 0.6 } = {}) {
  if (!ctx) return;
  resumeAudio();
  const recipe = RECIPES[id];
  if (!recipe) return;
  try { recipe({ pitch, gain }); } catch {}
}

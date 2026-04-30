// audio.js — Void Sentinel: Breach
// All SFX synthesized via Web Audio API. No audio files.

let ctx = null;

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
}

export function playSound(event, opts = {}) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  switch (event) {
    case 'shoot_t1': _shootT1(); break;
    case 'shoot_t2': _shootT2(); break;
    case 'shoot_t3': _shootT3(); break;
    case 'shoot_t4': _shootT4(); break;
    case 'shoot_t5': _shootT5(); break;
    case 'shoot_t6': _shootT6(); break;
    case 'shoot_t7': _shootT7(); break;
    case 'enemy_hit': _enemyHit(); break;
    case 'enemy_death_small': _enemyDeathSmall(); break;
    case 'enemy_death_large': _enemyDeathLarge(); break;
    case 'weapon_tier_up': _weaponTierUp(); break;
    case 'bomb_blast': _bombBlast(); break;
    case 'boss_phase_transition': _bossPhaseTransition(); break;
    case 'boss_death': _bossDeath(); break;
    case 'player_hit': _playerHit(); break;
    case 'pickup_weapon': _pickupWeapon(); break;
    case 'pickup_bomb': _pickupBomb(); break;
    default: break;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _osc(type, freq, gain, dur, freqEnd = null) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function _oscAt(type, freq, gain, dur, freqEnd, startOffset) {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function _noise(gain, dur, startOffset = 0) {
  const t = ctx.currentTime + startOffset;
  const bufLen = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(ctx.destination);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.start(t);
}

function _filteredNoise(gain, dur, filterFreq, filterType = 'bandpass', startOffset = 0) {
  const t = ctx.currentTime + startOffset;
  const bufLen = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = filterFreq;
  const g = ctx.createGain();
  src.connect(filt);
  filt.connect(g);
  g.connect(ctx.destination);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.start(t);
}

// ─── Weapon Shoot ────────────────────────────────────────────────────────────

// T1 Pulse: short high blip, sine 880→440, 80ms
function _shootT1() {
  _osc('sine', 880, 0.25, 0.08, 440);
}

// T2 Twin: two blips 30ms apart
function _shootT2() {
  _oscAt('sine', 880, 0.25, 0.08, 440, 0);
  _oscAt('sine', 880, 0.22, 0.08, 440, 0.03);
}

// T3 Spread: three-note chord, slight detune, sawtooth 660Hz
function _shootT3() {
  _oscAt('sawtooth', 660, 0.2, 0.09, 330, 0);
  _oscAt('sawtooth', 680, 0.18, 0.09, 340, 0.01);
  _oscAt('sawtooth', 640, 0.18, 0.09, 320, 0.02);
}

// T4 Lance: sharp crack + high whine, square 1200→200, 120ms
function _shootT4() {
  _osc('square', 1200, 0.3, 0.12, 200);
  _osc('sine', 1800, 0.12, 0.12, 900);
}

// T5 Barrage: four rapid pops, sawtooth 500Hz, 40ms apart, distorted via high gain
function _shootT5() {
  for (let i = 0; i < 4; i++) {
    _oscAt('sawtooth', 500 + i * 30, 0.28, 0.07, 100, i * 0.04);
  }
}

// T6 Seeker: lance crack + rising seeker tone (sine 200→800) + delayed echo
function _shootT6() {
  _osc('square', 1200, 0.28, 0.10, 300);
  _osc('sine', 200, 0.22, 0.22, 800);
  // echo layer
  _oscAt('sine', 200, 0.10, 0.18, 750, 0.06);
}

// T7 God Mode: spread chaos + deep bass thud 60Hz + high freq storm
function _shootT7() {
  // Bass thud
  _osc('sine', 60, 0.7, 0.15, 30);
  // Sub layer
  _osc('sine', 40, 0.5, 0.20, 20);
  // Mid sawtooth punch
  _osc('sawtooth', 440, 0.3, 0.12, 80);
  // High chaos — three detuned highs
  for (let i = 0; i < 3; i++) {
    _oscAt('square', 900 + i * 120, 0.2, 0.10, 200, i * 0.015);
  }
  // White noise crack on attack
  _noise(0.35, 0.06);
}

// ─── Enemies ─────────────────────────────────────────────────────────────────

// enemy_hit: low thud, sine 200→80, 60ms
function _enemyHit() {
  _osc('sine', 200, 0.45, 0.06, 80);
}

// enemy_death_small: descending filtered noise burst, 100ms
function _enemyDeathSmall() {
  _filteredNoise(0.45, 0.10, 800, 'bandpass');
  _osc('sine', 300, 0.25, 0.08, 80);
}

// enemy_death_large: boom — sine 80Hz + sawtooth 120Hz, 300ms
function _enemyDeathLarge() {
  _osc('sine', 80, 0.55, 0.30, 20);
  _osc('sawtooth', 120, 0.4, 0.20, 40);
  _noise(0.3, 0.12);
}

// ─── Pickups / Power-ups ─────────────────────────────────────────────────────

// weapon_tier_up: C4→E4→G4 fanfare, sine, 80ms each
function _weaponTierUp() {
  const notes = [262, 330, 392];
  notes.forEach((freq, i) => {
    _oscAt('sine', freq, 0.5, 0.10, freq * 0.95, i * 0.09);
  });
  // Slight shimmer echo on last note
  _oscAt('sine', 392, 0.2, 0.12, 380, 0.18 + 0.04);
}

// pickup_weapon: rising chime, sine 440→880, 150ms
function _pickupWeapon() {
  _osc('sine', 440, 0.5, 0.15, 880);
}

// pickup_bomb: lower rising tone, sine 220→440, 200ms
function _pickupBomb() {
  _osc('sine', 220, 0.5, 0.20, 440);
}

// ─── Bomb ────────────────────────────────────────────────────────────────────

// bomb_blast: sine 40→20Hz over 500ms + white noise burst
function _bombBlast() {
  _osc('sine', 40, 0.75, 0.50, 20);
  _osc('sine', 80, 0.5, 0.30, 30);
  _noise(0.6, 0.15);
  _filteredNoise(0.45, 0.40, 200, 'lowpass');
}

// ─── Boss Events ──────────────────────────────────────────────────────────────

// boss_phase_transition: sawtooth 400→100Hz over 600ms + distorted edge
function _bossPhaseTransition() {
  _osc('sawtooth', 400, 0.65, 0.60, 100);
  _osc('square', 600, 0.3, 0.25, 150);
  _noise(0.35, 0.10);
}

// boss_death: bass sine 40Hz (1s) + mid sawtooth 200Hz (600ms) + high noise (300ms)
function _bossDeath() {
  _osc('sine', 40, 0.75, 1.00, 15);
  _osc('sine', 80, 0.5, 0.70, 20);
  _oscAt('sawtooth', 200, 0.55, 0.60, 50, 0.05);
  _filteredNoise(0.6, 0.30, 1200, 'highpass');
  _noise(0.4, 0.50, 0.10);
  // Triumphant high shimmer at peak
  _oscAt('sine', 880, 0.35, 0.40, 440, 0.20);
}

// ─── Player ───────────────────────────────────────────────────────────────────

// player_hit: impact thud + brief descend, sine 150→50, 200ms
function _playerHit() {
  _osc('sine', 150, 0.55, 0.20, 50);
  _osc('square', 300, 0.2, 0.08, 80);
}

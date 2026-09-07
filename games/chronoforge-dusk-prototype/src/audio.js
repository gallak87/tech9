/** Original score and sound design for Chronoforge Dusk. No audio assets or network requests. */
export function createAudio() {
  let ctx, musicBus, soundBus, master, delaySend, reverbSend, noise;
  let timer = null, mode = 'title', activeMode = '', beat = 0, nextBeat = 0;
  let musicVolume = .4, soundVolume = .65, disposed = false;
  const voices = new Set(), recent = new Map();
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const arrangements = {
    title: { bpm: 58, root: 0, pluck: .052, pad: .027, pulse: false },
    explore: { bpm: 64, root: 0, pluck: .045, pad: .023, pulse: false },
    battle: { bpm: 96, root: 0, pluck: .065, pad: .019, pulse: true },
    boss: { bpm: 108, root: -12, pluck: .066, pad: .023, pulse: true },
    ending: { bpm: 65, root: 0, pluck: .049, pad: .030, pulse: false },
    defeat: { bpm: 48, root: -12, pluck: .023, pad: .020, pulse: false },
  };
  // D minor / B-flat major / F major / C suspended: the settlement's four-bar theme.
  const chords = [[50, 57, 60, 64], [46, 53, 57, 62], [48, 53, 57, 64], [48, 55, 62, 65]];
  const melody = [74, 76, 77, 81, 77, 76, 72, 69, 70, 74, 77, 76, 74, 72, 69, 67];

  function gainTo(node, value, time = .16) {
    if (!ctx || !node) return;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setTargetAtTime(Math.max(0, value), ctx.currentTime, time);
  }

  function synth(n, t, duration, volume, options = {}) {
    if (!ctx || disposed) return;
    const { shape = 'triangle', bus = musicBus, pan = 0, cutoff = 2600, attack = .015, pad = false, frequency = false, slide = 0 } = options;
    const amp = ctx.createGain(), filter = ctx.createBiquadFilter(), stereo = ctx.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, t); filter.Q.value = .5;
    stereo.pan.value = pan;
    const tail = pad ? 1.6 : Math.min(.75, duration * .7);
    const end = t + duration + tail;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(volume, t + Math.min(attack, duration * .35));
    if (pad) {
      amp.gain.setValueAtTime(volume, t + Math.max(attack, duration - .8));
      amp.gain.linearRampToValueAtTime(0, end);
    } else {
      amp.gain.exponentialRampToValueAtTime(Math.max(.00001, volume * .18), t + duration);
      amp.gain.exponentialRampToValueAtTime(.00001, end);
    }
    filter.connect(amp); amp.connect(stereo); stereo.connect(bus);
    if (bus === musicBus) { stereo.connect(reverbSend); if (!pad) stereo.connect(delaySend); }
    const oscillators = [];
    for (let i = 0; i < (pad ? 2 : 1); i++) {
      const osc = ctx.createOscillator(); osc.type = shape;
      osc.frequency.setValueAtTime(frequency ? n : midi(n), t);
      osc.detune.value = pad ? (i === 0 ? -5 : 5) : 0;
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, (frequency ? n : midi(n)) * slide), t + duration);
      osc.connect(filter); osc.start(t); osc.stop(end + .02); oscillators.push(osc);
    }
    const voice = { amp, oscillators, bus }; voices.add(voice);
    oscillators[0].onended = () => {
      voices.delete(voice); amp.disconnect(); filter.disconnect(); stereo.disconnect();
      oscillators.forEach(osc => osc.disconnect());
    };
  }

  function rustle(t, duration, volume, { cutoff = 1600, highpass = 250, bus = soundBus } = {}) {
    if (!ctx) return;
    const source = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), amp = ctx.createGain();
    source.buffer = noise; lp.type = 'lowpass'; lp.frequency.value = cutoff;
    hp.type = 'highpass'; hp.frequency.value = highpass;
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(volume, t + .008);
    amp.gain.exponentialRampToValueAtTime(.00001, t + duration);
    source.connect(lp); lp.connect(hp); hp.connect(amp); amp.connect(bus);
    source.start(t); source.stop(t + duration + .02);
    source.onended = () => { source.disconnect(); lp.disconnect(); hp.disconnect(); amp.disconnect(); };
  }

  function kick(t, amount = .12) {
    synth(110, t, .15, amount, { frequency: true, slide: .34, shape: 'sine', bus: musicBus, cutoff: 400 });
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running' || disposed) return;
    const a = arrangements[activeMode] || arrangements.explore;
    const eighth = 30 / a.bpm;
    if (nextBeat < ctx.currentTime - .4) nextBeat = ctx.currentTime + .05;
    while (nextBeat < ctx.currentTime + .35) {
      const b = beat % 16, bar = Math.floor(beat / 16), harmony = chords[bar % 4];
      if (b === 0) {
        harmony.forEach((n, i) => synth(n + (activeMode === 'ending' && i === 2 ? 1 : 0), nextBeat, eighth * 15.2, a.pad, {
          shape: 'sine', attack: 1.2, pad: true, cutoff: 1200, pan: (i - 1.5) * .33,
        }));
        synth(harmony[0] - 12, nextBeat, eighth * 10, a.pad * 1.2, { shape: 'sine', attack: .3, cutoff: 600 });
      }
      if (b % 4 === 0 || (a.pulse && b % 2 === 0)) {
        const note = harmony[(b / 2 + bar) % harmony.length] + 12;
        synth(note, nextBeat, .65, a.pluck, { cutoff: 1850, pan: Math.sin(beat * .8) * .5 });
      }
      if ((b === 3 || b === 9 || b === 13) && activeMode !== 'defeat') {
        const note = melody[(bar * 3 + Math.floor(b / 4)) % melody.length];
        synth(note, nextBeat + .025, 1.5, a.pluck * .55, { shape: 'sine', cutoff: 3300, pan: .25 });
        synth(note + 12, nextBeat + .027, .3, a.pluck * .13, { shape: 'sine', cutoff: 4500, pan: -.25 });
      }
      if (a.pulse) {
        if (b === 0 || b === 6 || b === 8 || (activeMode === 'boss' && b === 14)) kick(nextBeat, activeMode === 'boss' ? .13 : .095);
        if (b === 4 || b === 12) rustle(nextBeat, .15, .025, { bus: musicBus, cutoff: 3100, highpass: 900 });
        if (b % 2 === 1) rustle(nextBeat, .055, .012, { bus: musicBus, cutoff: 5100, highpass: 3400 });
        if (activeMode === 'boss' && b % 2 === 0) synth(harmony[0] + a.root, nextBeat, .17, .045, { shape: 'triangle', cutoff: 700 });
      }
      nextBeat += eighth; beat++;
    }
  }

  function normalizeMode(value) {
    if (value === 'victory') return 'explore';
    if (value === 'menu' || value === 'dialogue' || value === 'pause') return activeMode || 'explore';
    return arrangements[value] ? value : 'explore';
  }

  function changeArrangement() {
    const next = normalizeMode(mode);
    if (activeMode === next || !ctx) return;
    activeMode = next; beat = 0; nextBeat = ctx.currentTime + .06;
    for (const voice of voices) {
      if (voice.bus !== musicBus) continue;
      voice.amp.gain.cancelScheduledValues(ctx.currentTime);
      voice.amp.gain.setTargetAtTime(.00001, ctx.currentTime, .3);
      for (const osc of voice.oscillators) { try { osc.stop(ctx.currentTime + 1.5); } catch {} }
    }
    schedule();
  }

  async function start() {
    if (disposed) return false;
    try {
      if (!ctx) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return false;
        ctx = new Audio();
        master = ctx.createGain(); master.gain.value = .7;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 15; limiter.ratio.value = 5;
        limiter.attack.value = .006; limiter.release.value = .22;
        master.connect(limiter); limiter.connect(ctx.destination);
        musicBus = ctx.createGain(); soundBus = ctx.createGain();
        musicBus.gain.value = musicVolume; soundBus.gain.value = soundVolume;
        musicBus.connect(master); soundBus.connect(master);
        const delay = ctx.createDelay(1), feedback = ctx.createGain(), delayFilter = ctx.createBiquadFilter();
        delaySend = ctx.createGain(); delaySend.gain.value = .16;
        delay.delayTime.value = .375; feedback.gain.value = .23;
        delayFilter.frequency.value = 1800;
        delaySend.connect(delay); delay.connect(delayFilter); delayFilter.connect(feedback); feedback.connect(delay);
        delayFilter.connect(musicBus);
        const reverb = ctx.createConvolver(); reverbSend = ctx.createGain(); reverbSend.gain.value = .22;
        const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.8), ctx.sampleRate);
        let seed = 173;
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
        for (let c = 0; c < 2; c++) {
          const samples = impulse.getChannelData(c);
          for (let i = 0; i < samples.length; i++) samples[i] = random() * Math.pow(1 - i / samples.length, 3) * .5;
        }
        reverb.buffer = impulse; reverbSend.connect(reverb); reverb.connect(musicBus);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = random();
        timer = setInterval(schedule, 120);
        document.addEventListener('visibilitychange', visibility);
      }
      await ctx.resume(); changeArrangement(); schedule(); return true;
    } catch { return false; }
  }

  function visibility() {
    if (!ctx || disposed) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else { nextBeat = ctx.currentTime + .06; ctx.resume().then(schedule).catch(() => {}); }
  }

  function play(name) {
    if (!ctx || ctx.state !== 'running' || disposed || soundVolume <= 0) return;
    const t = ctx.currentTime + .008;
    const cooldown = name === 'step' ? .19 : name === 'click' ? .035 : .025;
    if (t - (recent.get(name) || -10) < cooldown) return;
    recent.set(name, t);
    const tone = (n, offset, d, v, options = {}) => synth(n, t + offset, d, v, { bus: soundBus, ...options });
    const hiss = (offset, d, v, options) => rustle(t + offset, d, v, options);
    switch (name) {
      case 'step': hiss(0, .07, .034, { cutoff: 700, highpass: 130 }); break;
      case 'click': tone(84, 0, .045, .055, { shape: 'sine' }); tone(91, .025, .04, .025); break;
      case 'interact': case 'save': case 'unlock':
        [69, 76, 81].forEach((n, i) => tone(n, i * .075, .25, .085, { shape: 'sine', pan: i * .3 - .3 })); break;
      case 'attack':
        hiss(0, .13, .19, { cutoff: 5000, highpass: 900 });
        tone(190, .055, .12, .23, { frequency: true, slide: .35, shape: 'triangle', cutoff: 1700 });
        hiss(.08, .16, .12, { cutoff: 2100, highpass: 140 }); break;
      case 'hit':
        tone(130, 0, .13, .22, { frequency: true, slide: .3, shape: 'sine' });
        hiss(0, .13, .11, { cutoff: 1400, highpass: 100 }); break;
      case 'tech':
        [62, 69, 74, 81].forEach((n, i) => tone(n, i * .055, .35, .085, { shape: 'sine', pan: i % 2 ? .5 : -.5 }));
        hiss(.09, .33, .1, { cutoff: 4500, highpass: 1800 });
        tone(74, .22, .48, .08, { shape: 'triangle', slide: 2 }); break;
      case 'combo':
        [50, 57, 62, 65, 69, 74].forEach((n, i) => tone(n, i * .058, .32, .12, { pan: (i % 2 ? 1 : -1) * .6, cutoff: 3400 }));
        tone(72, .37, .5, .27, { frequency: true, slide: .45, shape: 'sine' });
        hiss(.36, .44, .2, { cutoff: 3300, highpass: 200 });
        [74, 77, 81].forEach(n => tone(n, .39, .8, .08, { shape: 'sine' })); break;
      case 'triple':
        [50, 57, 62, 65, 69, 74, 77, 81].forEach((n, i) => tone(n, i * .07, .55, .11, { pan: Math.sin(i * 2) * .7, cutoff: 4000 }));
        tone(110, .04, .52, .12, { frequency: true, slide: 7, shape: 'sine', attack: .25 });
        hiss(.62, 1.05, .28, { cutoff: 5000, highpass: 100 });
        tone(85, .62, .75, .36, { frequency: true, slide: .28, shape: 'sine' });
        [62, 69, 74, 77, 81, 86].forEach((n, i) => tone(n, .65 + i * .008, 1.25, .082, { shape: 'sine', pan: i * .25 - .6 })); break;
      case 'heal':
        [74, 77, 81, 86].forEach((n, i) => tone(n, i * .095, .6, .085, { shape: 'sine', pan: i * .25 - .4 })); break;
      case 'victory':
        [62, 65, 69, 74, 72, 77].forEach((n, i) => tone(n, i * .14, .65, .13, { shape: 'triangle', cutoff: 1900 }));
        [53, 57, 60, 65].forEach(n => tone(n, .8, 1.25, .07, { shape: 'sine' })); break;
      case 'defeat':
        [62, 60, 57, 50].forEach((n, i) => tone(n, i * .23, 1.25, .085, { shape: 'sine' })); break;
      case 'build':
        [45, 52, 57].forEach((n, i) => { tone(n, i * .22, .2, .17, { cutoff: 900 }); hiss(i * .22, .13, .08, { cutoff: 1500 }); });
        [69, 74, 76, 81].forEach((n, i) => tone(n, .65 + i * .12, .85, .12, { shape: 'sine' })); break;
      default: tone(76, 0, .12, .06, { shape: 'sine' });
    }
  }

  return {
    start,
    setMode(value) { mode = value; changeArrangement(); },
    setVolumes(music, sfx) {
      musicVolume = Math.max(0, Math.min(1, Number(music) || 0));
      soundVolume = Math.max(0, Math.min(1, Number(sfx) || 0));
      gainTo(musicBus, musicVolume); gainTo(soundBus, soundVolume);
    },
    play,
    dispose() {
      disposed = true; if (timer) clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
      if (ctx) ctx.close().catch(() => {}); voices.clear(); recent.clear();
    },
  };
}

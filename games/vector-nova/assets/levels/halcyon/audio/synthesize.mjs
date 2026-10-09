// Original, deterministic PCM synthesis. Events wrap into a circular 30-second buffer.
export function synthesize(score) {
  const rate = score.sampleRate;
  const beat = 60 / score.bpm;
  const seconds = score.bars * score.beatsPerBar * beat;
  const frames = Math.round(seconds * rate);
  const tau = Math.PI * 2;
  const stereo = () => [new Float32Array(frames), new Float32Array(frames)];
  const drums = stereo(),
    bass = stereo(),
    chords = stereo(),
    lead = stereo();
  let seed = score.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const midi = (note) => {
    const [, letter, sharp, octave] = /^([A-G])(#?)(-?\d)$/.exec(note);
    return (
      (Number(octave) + 1) * 12 +
      { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] +
      (sharp ? 1 : 0)
    );
  };
  const hz = (note) =>
    440 * 2 ** (((typeof note === 'number' ? note : midi(note)) - 69) / 12);
  function voice(bus, start, length, position, sample) {
    const offset = Math.round(start * rate);
    const count = Math.round(length * rate);
    const left = Math.cos(((position + 1) * Math.PI) / 4);
    const right = Math.sin(((position + 1) * Math.PI) / 4);
    for (let i = 0; i < count; i++) {
      // Every voice has a short terminal ramp; its tail wraps into the next pass.
      const value = sample(i / rate) * Math.min(1, (count - 1 - i) / 180);
      const index = (offset + i) % frames;
      bus[0][index] += value * left;
      bus[1][index] += value * right;
    }
  }
  function kick(time, velocity) {
    voice(drums, time, 0.42, 0, (t) => {
      const phase = tau * (45 * t + 90 * 0.019 * (1 - Math.exp(-t / 0.019)));
      const body =
        Math.sin(phase) * Math.exp(-t / 0.087) * Math.min(1, t / 0.0025);
      const click =
        (random() * 2 - 1) *
        Math.exp(-t / 0.003) *
        0.05 *
        Math.min(1, t / 0.0004);
      return velocity * (0.81 * body + click);
    });
  }
  function clap(time, velocity) {
    let low = 0,
      lower = 0;
    voice(drums, time, 0.23, 0.06, (t) => {
      const n = random() * 2 - 1;
      low += 0.4 * (n - low);
      lower += 0.12 * (n - lower);
      let envelope = 0;
      for (let hit = 0; hit < 3; hit++) {
        const age = t - hit * 0.011;
        if (age >= 0)
          envelope +=
            Math.min(1, age / 0.001) *
            Math.exp(-age / (hit === 2 ? 0.031 : 0.005));
      }
      return (
        velocity *
        ((low - lower) * envelope * 0.48 +
          Math.sin(tau * 178 * t) * Math.exp(-t / 0.022) * 0.055)
      );
    });
  }
  function hat(time, open, velocity, index) {
    let low = 0;
    voice(drums, time, open ? 0.23 : 0.07, index % 2 ? 0.27 : -0.23, (t) => {
      const n = random() * 2 - 1;
      low += 0.7 * (n - low);
      return (
        (n - low) *
        Math.min(1, t / 0.001) *
        Math.exp(-t / (open ? 0.047 : 0.012)) *
        0.3 *
        velocity
      );
    });
  }
  function bassNote(note, time, duration, velocity) {
    const frequency = hz(note);
    voice(bass, time, duration + 0.12, 0, (t) => {
      const phase = tau * frequency * t;
      const body =
        Math.sin(phase) +
        0.28 * Math.sin(phase * 2) +
        0.09 * Math.sin(phase * 3);
      const envelope =
        Math.min(1, t / 0.006) * Math.exp(-t / (duration * 0.75 + 0.025));
      return body * envelope * 0.27 * velocity;
    });
  }
  function chord(notes, time, duration) {
    notes.forEach((note, index) => {
      const frequency = hz(note);
      voice(chords, time, duration + 2.2, (index - 1.5) * 0.4, (t) => {
        const a = tau * frequency * 0.998 * t;
        const b = tau * frequency * 1.002 * t;
        const motion =
          0.5 + 0.5 * Math.sin((tau * (time + t)) / (beat * 16) + index);
        const body =
          0.5 * (Math.sin(a) + Math.sin(b)) +
          (0.09 + motion * 0.08) * Math.sin(a * 2) +
          0.035 * Math.sin(b * 3);
        const envelope =
          (1 - Math.exp(-t / 0.38)) *
          Math.exp(-Math.max(0, t - duration + 0.25) / 0.48);
        return body * envelope * 0.045;
      });
    });
  }
  let previousFrequency = hz(score.melody.at(-1).at(-1)[1]);
  function leadNote(note, time, duration, velocity) {
    const frequency = hz(note);
    const from = previousFrequency;
    previousFrequency = frequency;
    let low = 0,
      lower = 0;
    // Detuned, band-limited saw harmonics with a rounded onset and slow filter motion.
    // A small glide joins phrases without the struck/FM transient of pitched keys.
    voice(
      lead,
      time,
      duration + 1.25,
      Math.sin((time * tau) / seconds) * 0.12,
      (t) => {
        const phase =
          tau *
          (frequency * t +
            (from - frequency) * 0.055 * (1 - Math.exp(-t / 0.055)));
        const a = phase * 0.9975,
          b = phase * 1.0025;
        const body =
          0.45 * (Math.sin(a) + Math.sin(b)) +
          0.21 * (Math.sin(a * 2) + Math.sin(b * 2)) +
          0.11 * Math.sin(phase * 3) +
          0.07 * Math.sin(a * 4) +
          0.045 * Math.sin(b * 5) +
          0.025 * Math.sin(phase * 6);
        const motion =
          0.5 + 0.5 * Math.sin((tau * (time + t)) / (beat * 16) - 0.8);
        const cutoff = 620 + motion * 700;
        const alpha = 1 - Math.exp((-tau * cutoff) / rate);
        low += alpha * (body - low);
        lower += alpha * (low - lower);
        const envelope =
          (1 - Math.exp(-t / 0.045)) *
          Math.exp(-Math.max(0, t - duration) / 0.23);
        return lower * envelope * 0.16 * velocity;
      },
    );
  }
  for (let bar = 0; bar < score.bars; bar++) {
    const start = bar * 4 * beat;
    const [root, voicing] = score.harmony[bar];
    for (let step = 0; step < 4; step++) {
      const t = start + step * beat;
      kick(t, step === 0 ? 1 : 0.93);
      if (step % 2) clap(t + 0.004, 0.68);
      hat(t + beat * 0.51, step === 3 && bar % 4 !== 3, 0.65, bar * 4 + step);
      if (bar % 2 && step === 2) hat(t + beat * 0.77, false, 0.22, step + 1);
    }
    for (const [offset, semitones, duration, velocity] of [
      [0.5, 0, 0.6, 1],
      [1.25, 0, 0.2, 0.3],
      [1.5, 0, 0.55, 0.9],
      [2.5, 0, 0.6, 1],
      [3.25, 7, 0.2, 0.35],
      [3.5, 0, 0.5, 0.9],
    ]) {
      bassNote(
        midi(root) + semitones,
        start + offset * beat,
        duration * beat,
        velocity,
      );
    }
    if (bar % 4 === 0) chord(voicing, start, beat * 16);
    for (const [offset, note, duration] of score.melody[bar]) {
      leadNote(note, start + offset * beat, duration * beat, 0.85);
    }
  }
  const mix = stereo();
  const roomInput = stereo();
  for (let i = 0; i < frames; i++) {
    const phase = (i / rate) % beat;
    const recovery =
      phase < 0.006
        ? 1 - phase / 0.006
        : Math.min(1, (phase - 0.006) / (beat * 0.7));
    for (let channel = 0; channel < 2; channel++) {
      const harmony = chords[channel][i] * (0.64 + recovery * 0.36) * 0.9;
      const low = bass[channel][i] * (0.3 + recovery * 0.7) * 0.9;
      const phrase = lead[channel][i] * (0.76 + recovery * 0.24);
      mix[channel][i] = drums[channel][i] * 0.8 + low + harmony + phrase * 0.75;
      roomInput[channel][i] = harmony * 0.7 + phrase * 0.45;
    }
  }
  // Circular delay and finite room reflections retain the exact repeat boundaries.
  for (const [beats, level, swap] of [
    [0.75, 0.14, true],
    [1.5, 0.09, false],
    [2.25, 0.045, true],
  ]) {
    const offset = Math.round(beats * beat * rate);
    for (let i = 0; i < frames; i++)
      for (let channel = 0; channel < 2; channel++) {
        mix[channel][(i + offset) % frames] +=
          lead[swap ? 1 - channel : channel][i] * level;
      }
  }
  // Colored sparse diffusion: reproducible room taps, no external impulse sample.
  for (let tap = 0; tap < 36; tap++) {
    const delay = 0.025 + tap * 0.034 + random() * 0.016;
    const offset = Math.round(delay * rate);
    const level = Math.exp(-delay / 0.31) * 0.045 * (tap % 3 === 0 ? -1 : 1);
    for (let channel = 0; channel < 2; channel++) {
      let smoothed = roomInput[channel][frames - 1];
      for (let i = 0; i < frames; i++) {
        smoothed += 0.22 * (roomInput[channel][i] - smoothed);
        mix[tap % 2 ? 1 - channel : channel][(i + offset) % frames] +=
          smoothed * level;
      }
    }
  }
  // Remove DC/subsonics with a periodic-state one-pole high-pass.
  const pole = Math.exp((-tau * 25) / rate);
  for (const samples of mix) {
    let previous = samples[frames - rate - 1],
      state = 0;
    for (let i = frames - rate; i < frames; i++) {
      state = pole * (state + samples[i] - previous);
      previous = samples[i];
    }
    for (let i = 0; i < frames; i++) {
      const input = samples[i];
      state = pole * (state + input - previous);
      previous = input;
      samples[i] = Math.tanh(state * 1.12) / 1.12;
    }
  }
  let peak = 0,
    energy = 0,
    maxAdjacent = 0;
  for (const samples of mix)
    for (const value of samples) {
      if (!Number.isFinite(value))
        throw new Error('Nonfinite rendered sample.');
      peak = Math.max(peak, Math.abs(value));
    }
  if (peak < 1e-6) throw new Error('Render is silent.');
  const scale = 10 ** (-1.5 / 20) / peak;
  const pcm = new Uint8Array(frames * 4);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < frames; i++)
    for (let channel = 0; channel < 2; channel++) {
      const value = mix[channel][i] * scale;
      energy += value * value;
      if (i)
        maxAdjacent = Math.max(
          maxAdjacent,
          Math.abs(value - mix[channel][i - 1] * scale),
        );
      view.setInt16((i * 2 + channel) * 2, Math.round(value * 32767), true);
    }
  const seamStep = mix.map(
    (samples) => Math.abs(samples[0] - samples[frames - 1]) * scale,
  );
  return {
    pcm,
    stats: {
      seconds,
      frames,
      sampleRate: rate,
      channels: 2,
      peakDbfs: -1.5,
      rmsDbfs: 20 * Math.log10(Math.sqrt(energy / (frames * 2))),
      seamStep,
      maxAdjacent,
      normalizationGain: scale,
    },
  };
}

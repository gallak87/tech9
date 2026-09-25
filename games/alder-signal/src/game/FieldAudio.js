/** Original synthesized field ambience and radio cues. No remote audio assets. */
export class FieldAudio {
  constructor() {
    this.started = false;
    try {
      this.muted = localStorage.getItem('alder-signal.muted') === 'true';
    } catch {
      this.muted = false;
    }
    this.nextStep = 0;
    this.active = false;
  }
  start() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.ambience = this.context.createGain();
      this.ambience.gain.value = 0;
      this.ambience.connect(this.master);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 4,
        this.context.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.035) / 1.035;
        data[i] = last;
      }
      this.wind = this.context.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      this.wind.connect(this.ambience);
      this.wind.start();
    }
    this.started = true;
    this.context.resume().catch(() => {});
    this.applyMute();
    this.setActive(true);
  }
  setActive(active) {
    this.active = active;
    if (this.context)
      this.ambience.gain.setTargetAtTime(
        active ? 0.23 : 0,
        this.context.currentTime,
        0.3,
      );
  }
  applyMute() {
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.45,
        this.context.currentTime,
        0.03,
      );
  }
  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('alder-signal.muted', String(this.muted));
    } catch {
      /* Local preferences are optional. */
    }
    this.applyMute();
  }
  tone(frequency, duration = 0.14, delay = 0, shape = 'sine', gain = 0.15) {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = shape;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  cue(kind) {
    if (kind === 'restored') {
      this.tone(660);
      this.tone(990, 0.24, 0.15);
    } else if (kind === 'won')
      [523, 659, 784, 1046].forEach((note, i) =>
        this.tone(note, 0.4, i * 0.15),
      );
    else if (kind === 'lost') {
      this.tone(220, 0.45);
      this.tone(165, 0.6, 0.3);
    } else {
      this.tone(440, 0.08);
      this.tone(660, 0.12, 0.1);
    }
  }
  update(now, speed, repairing) {
    if (!this.active) return;
    if (speed > 0.2 && now >= this.nextStep) {
      this.tone(72 + Math.random() * 20, 0.09, 0, 'triangle', 0.07);
      this.nextStep = now + (speed > 4 ? 0.27 : 0.41);
    }
    if (repairing && now >= (this.nextRepair || 0)) {
      this.tone(520, 0.045, 0, 'sine', 0.065);
      this.nextRepair = now + 0.3;
    }
  }
  snapshot() {
    return {
      started: this.started,
      muted: this.muted,
      active: this.active,
      contextState: this.context?.state ?? 'uninitialized',
    };
  }
  dispose() {
    this.wind?.stop();
    this.context?.close().catch(() => {});
  }
}

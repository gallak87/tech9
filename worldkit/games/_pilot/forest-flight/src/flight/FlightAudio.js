export class FlightAudio {
  constructor() {
    this.muted = false;
    this.disposed = false;
  }
  async start() {
    if (this.disposed) return;
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context = new Audio();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 500;
      this.filter.connect(this.gain);
      this.osc = this.context.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 35;
      this.osc.connect(this.filter);
      this.osc.start();
      this.harmonic = this.context.createOscillator();
      this.harmonic.type = 'sine';
      this.harmonic.frequency.value = 70;
      this.harmonic.connect(this.gain);
      this.harmonic.start();
    }
    try {
      await this.context.resume();
    } catch {
      /* Audio remains optional when unavailable. */
    }
  }
  update(state, paused) {
    if (!this.context || this.disposed) return;
    const t = this.context.currentTime;
    const live =
      !paused &&
      !['ready', 'landed', 'crashed'].includes(state.phase) &&
      !this.muted;
    this.gain.gain.setTargetAtTime(
      live ? 0.025 + state.throttle * 0.025 : 0,
      t,
      0.15,
    );
    this.osc.frequency.setTargetAtTime(
      32 + state.throttle * 55 + state.speed * 0.15,
      t,
      0.1,
    );
    this.harmonic.frequency.setTargetAtTime(64 + state.throttle * 110, t, 0.1);
    this.filter.frequency.setTargetAtTime(230 + state.throttle * 480, t, 0.1);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.osc?.stop();
    this.harmonic?.stop();
    this.gain?.disconnect();
    this.context?.close().catch(() => {});
  }
}

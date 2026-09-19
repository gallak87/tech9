// Original D-dorian field music. Synthesis, score and effects authored for Echo.
export class EchoAudio {
  constructor() {
    this.ctx = null;
    this.settings = { music: 0.4, sfx: 0.6 };
    this.step = 0;
    this.next = 0;
    this.region = 'haventide';
    this.battle = false;
  }
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.music = this.ctx.createGain();
        this.fx = this.ctx.createGain();
        this.music.connect(this.ctx.destination);
        this.fx.connect(this.ctx.destination);
        this.set(this.settings);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.disabled = true;
    }
  }
  set(s) {
    this.settings = s;
    if (this.ctx) {
      this.music.gain.setTargetAtTime(
        (s.music ?? 0.4) * 0.22,
        this.ctx.currentTime,
        0.08,
      );
      this.fx.gain.setTargetAtTime(
        (s.sfx ?? 0.6) * 0.24,
        this.ctx.currentTime,
        0.04,
      );
    }
  }
  note(
    freq,
    dur = 0.4,
    vol = 0.4,
    type = 'triangle',
    bus = this.music,
    at = 0,
  ) {
    if (!this.ctx || this.disabled) return;
    const t = at || this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.016);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  sound(id) {
    if (!this.ctx) return;
    const freq =
      {
        step: 90,
        select: 440,
        confirm: 660,
        back: 294,
        pickup: 880,
        level: 523,
        timing: 1046,
        hit: 120,
        crit: 180,
        heal: 698,
        victory: 784,
        door: 220,
        build: 330,
        error: 110,
      }[id] || 440;
    this.note(
      freq,
      id === 'hit' ? 0.18 : 0.27,
      0.35,
      id === 'hit' ? 'sawtooth' : 'triangle',
      this.fx,
    );
    if (['pickup', 'level', 'victory', 'heal'].includes(id))
      this.note(
        freq * 1.5,
        0.5,
        0.2,
        'sine',
        this.fx,
        this.ctx.currentTime + 0.11,
      );
  }
  update(region, battle = false, paused = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.region = region;
    this.battle = battle;
    const now = this.ctx.currentTime;
    if (this.next < now - 0.5) this.next = now + 0.1;
    while (this.next < now + 0.15) {
      const seq = battle
        ? [0, 7, 3, 10, 5, 7, 2, 3, 0, 12, 10, 7, 5, 3, 2, 7]
        : [0, 7, 10, 14, 12, 7, 5, 3, 0, 5, 7, 10, 9, 5, 3, 2];
      const cold = /frost|orbital/.test(region),
        fire = /crater|ember/.test(region),
        n = seq[(this.step + (cold ? 5 : fire ? 3 : 0)) % seq.length];
      const base = cold ? 146.832 : fire ? 164.814 : 146.832;
      const t = this.next;
      this.note(
        base * Math.pow(2, n / 12),
        battle ? 0.31 : 1.15,
        paused ? 0.1 : 0.28,
        'sine',
        this.music,
        t,
      );
      if (this.step % 4 === 0) {
        this.note(
          base / 2,
          battle ? 0.6 : 1.8,
          0.32,
          'triangle',
          this.music,
          t,
        );
        this.note(
          base * Math.pow(2, 7 / 12),
          1.6,
          0.1,
          'triangle',
          this.music,
          t,
        );
      }
      if (battle && this.step % 2 === 0)
        this.note(base / 4, 0.12, 0.35, 'triangle', this.music, t);
      this.step++;
      this.next += battle ? 0.24 : 0.46;
    }
  }
}

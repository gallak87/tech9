export function createRace(track, { rulesId = 'magnetic-v3-assist-0.3' } = {}) {
  const count = track.checkpoints?.length || 12;
  const spacing = track.length / count;
  return {
    rulesId,
    lap: 1,
    checkpoint: 0,
    elapsed: 0,
    lastLap: null,
    best: null,
    valid: true,
    complete: false,
    startDistance: 0,
    history: [],
    step(previous, current, dt) {
      this.elapsed += dt;
      let events = [];
      const a = Math.floor(previous / spacing),
        b = Math.floor(current / spacing);
      for (let k = a + 1; k <= b; k++) {
        const index = k % count;
        if (index === (this.checkpoint + 1) % count) {
          this.checkpoint = index;
          this.startDistance = k * spacing;
          events.push({
            type: 'checkpoint',
            payload: { index, lapTime: this.elapsed },
          });
          if (index === 0) {
            this.lastLap = this.elapsed;
            this.history.push({
              duration: this.elapsed,
              valid: this.valid,
              rulesId,
            });
            if (this.valid && (!this.best || this.elapsed < this.best))
              this.best = this.elapsed;
            events.push({
              type: 'lap',
              payload: { duration: this.elapsed, valid: this.valid },
            });
            this.lap++;
            this.elapsed = 0;
            this.valid = true;
          }
        } else this.valid = false;
      }
      return events;
    },
    recover() {
      this.valid = false;
      return Math.floor(this.startDistance / spacing) * spacing;
    },
  };
}

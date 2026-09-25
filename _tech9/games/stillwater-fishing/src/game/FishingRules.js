const CAST_SECONDS = 1;
const HOOK_SECONDS = 2.2;
const PULL_CYCLE_SECONDS = 7.6;
const PULL_SECONDS = 3.2;
const SLACK_ESCAPE_SECONDS = 25;

/** Deterministic fishing rules. The owning layer supplies time and input. */
export class FishingRules {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.paused = false;
    this.catches = 0;
    this.lastCatch = null;
    this.message = '';
    this.reason = '';
    this.timer = 0;
    this.power = 0;
    this.distance = 0;
    this.fightTime = 0;
    this.tension = 0;
    this.progress = 0;
    this.pulling = false;
    this.slackTime = 0;
    this.biteDelay = 5.4;
    this.castNumber = 0;
  }

  startCharge() {
    if (this.paused || this.phase !== 'ready') return false;
    this.phase = 'charging';
    this.timer = 0;
    this.power = 0;
    this.reason = '';
    this.message = 'Release to cast.';
    return true;
  }

  cast(valid, distance = 20) {
    if (this.paused || this.phase !== 'charging') return false;
    this.distance = Number.isFinite(distance)
      ? Math.max(0, Math.min(60, distance))
      : 20;
    if (!valid) {
      this.fail('That cast found the bank. Aim farther into the pond.');
      return false;
    }
    this.castNumber += 1;
    this.biteDelay = 4.5 + ((this.castNumber * 13) % 29) / 10;
    this.phase = 'casting';
    this.timer = 0;
    this.message = 'A quiet cast.';
    return true;
  }

  action() {
    if (this.paused) return false;
    if (this.phase === 'bite') {
      this.phase = 'fight';
      this.timer = 0;
      this.fightTime = 0;
      this.tension = 0.24;
      this.progress = 0;
      this.slackTime = 0;
      this.pulling = true;
      this.message = 'Fish on. Let go when the line strains.';
      return true;
    }
    if (this.phase === 'failed' || this.phase === 'landed') {
      this.phase = 'ready';
      this.timer = 0;
      this.power = 0;
      this.fightTime = 0;
      this.tension = 0;
      this.progress = 0;
      this.slackTime = 0;
      this.pulling = false;
      this.reason = '';
      this.message = '';
      return true;
    }
    return false;
  }

  tick(dt, { reeling = false } = {}) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (remaining > 0) {
      if (this.phase === 'charging') {
        this.timer += remaining;
        const cycle = (this.timer * 0.68) % 2;
        this.power = cycle <= 1 ? cycle : 2 - cycle;
        return;
      }
      if (this.phase === 'fight') {
        // Small simulation steps keep tension and pulling consistent at low FPS.
        const step = Math.min(remaining, 1 / 30);
        this.tickFight(step, reeling);
        remaining -= step;
        continue;
      }
      const duration = {
        casting: CAST_SECONDS,
        waiting: this.biteDelay,
        bite: HOOK_SECONDS,
      }[this.phase];
      if (duration === undefined) return;
      const step = Math.min(remaining, Math.max(0, duration - this.timer));
      this.timer += step;
      remaining -= step;
      if (this.timer < duration) return;
      this.timer = 0;
      if (this.phase === 'casting') {
        this.phase = 'waiting';
        this.message = 'Watch the float. Wait for a bite.';
      } else if (this.phase === 'waiting') {
        this.phase = 'bite';
        this.message = 'Bite! Set the hook.';
      } else {
        this.fail('The trout slipped away. Set the hook when the float dives.');
      }
    }
  }

  tickFight(dt, reeling) {
    this.fightTime += dt;
    this.timer = this.fightTime;
    this.pulling = this.fightTime % PULL_CYCLE_SECONDS < PULL_SECONDS;
    const tensionRate = reeling
      ? this.pulling
        ? 0.24
        : 0.055
      : this.pulling
        ? -0.17
        : -0.22;
    this.tension = Math.max(0, Math.min(1, this.tension + tensionRate * dt));
    this.slackTime = reeling ? 0 : this.slackTime + dt;
    if (this.tension >= 1) {
      this.fail(
        'The line snapped. Ease off the reel before the tension peaks.',
      );
      return;
    }
    if (this.slackTime >= SLACK_ESCAPE_SECONDS || this.fightTime >= 120) {
      this.fail(
        'The trout shook the hook. Reel steadily whenever the line eases.',
      );
      return;
    }
    const progressRate = reeling ? (this.pulling ? 0.009 : 0.041) : -0.0015;
    this.progress = Math.max(0, Math.min(1, this.progress + progressRate * dt));
    this.message = this.pulling
      ? 'The trout is running. Ease off if the line strains.'
      : 'The trout is tiring. Reel it closer.';
    if (this.progress >= 1) {
      this.phase = 'landed';
      this.timer = 0;
      this.catches += 1;
      const lengthCm =
        34 + ((Math.round(this.distance) + this.catches * 7) % 11);
      this.lastCatch = {
        species: 'Brook trout',
        lengthCm,
        weightKg: Math.round((lengthCm / 40) ** 3 * 85) / 100,
      };
      this.pulling = false;
      this.message = 'A beautiful brook trout. Release it when you are ready.';
    }
  }

  fail(reason) {
    this.phase = 'failed';
    this.timer = 0;
    this.pulling = false;
    this.reason = reason;
    this.message = reason;
  }

  snapshot() {
    return {
      phase: this.phase,
      paused: this.paused,
      catches: this.catches,
      lastCatch: this.lastCatch ? { ...this.lastCatch } : null,
      message: this.message,
      reason: this.reason,
      timer: this.timer,
      power: this.power,
      distance: this.distance,
      fightTime: this.fightTime,
      tension: this.tension,
      progress: this.progress,
      pulling: this.pulling,
      slackTime: this.slackTime,
      biteDelay: this.biteDelay,
      castNumber: this.castNumber,
    };
  }
}

const MOTION = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
export class BoatInput {
  constructor(rules, onChange, onReset) {
    this.keys = new Set();
    this.abort = new AbortController();
    this.rules = rules;
    const options = { signal: this.abort.signal };
    const pause = () => {
      this.clear();
      if (rules.state === 'running') {
        rules.pause();
        onChange();
      }
    };
    window.addEventListener(
      'keydown',
      (e) => {
        if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (MOTION.has(e.code)) {
          e.preventDefault();
          if (rules.state === 'running' && !e.repeat) this.keys.add(e.code);
        }
        if (!e.repeat && ['KeyP', 'Escape', 'Tab'].includes(e.code)) {
          e.preventDefault();
          if (rules.state === 'running') pause();
          else if (rules.state === 'paused') {
            this.clear();
            rules.resume();
            onChange();
          }
        }
        if (!e.repeat && e.code === 'KeyR') {
          this.clear();
          onReset();
        }
      },
      options,
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), options);
    window.addEventListener('blur', pause, options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) pause();
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (!document.pointerLockElement) pause();
      },
      options,
    );
  }
  sample() {
    return {
      throttle:
        Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')),
      steer:
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')),
    };
  }
  clear() {
    this.keys.clear();
  }
  dispose() {
    this.clear();
    this.abort.abort();
  }
}

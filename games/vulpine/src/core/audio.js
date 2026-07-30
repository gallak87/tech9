// ─────────────────────────────────────────────────────────────────────────────
// Audio seam.  OWNER: audio agent.  Yours: src/core/audio.js, src/audio/*
//
// Everything is synthesised through WebAudio — no binary assets. Autoplay
// policy means the context stays suspended until the first real input, so all
// entry points must be safe to call before that happens.
// ─────────────────────────────────────────────────────────────────────────────

export function installAudio(ctx) {
  let actx = null;
  let enabled = false;

  function ensure() {
    if (actx || typeof AudioContext === 'undefined') return actx;
    actx = new AudioContext();
    return actx;
  }

  const api = {
    get context() { return actx; },
    get enabled() { return enabled; },
    /** Called on first user gesture. */
    unlock() {
      ensure();
      if (actx && actx.state === 'suspended') actx.resume();
      enabled = !!actx;
    },
    play(name, opts = {}) { void name; void opts; },
    setEngine(throttle, boost) { void throttle; void boost; },
    music(track) { void track; },
    update(dt) { void dt; },
    dispose() { if (actx) actx.close(); },
  };
  void ctx;
  return api;
}

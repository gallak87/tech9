// ─────────────────────────────────────────────────────────────────────────────
// Module isolation.
//
// HARD REQUIREMENT: one broken module must never blank the screen. Eleven lanes
// work this repo in parallel; on any given afternoon one of them is mid-edit and
// throwing. If a throw in `settlement` takes down the render loop, every other
// lane is blocked and nobody can screenshot anything.
//
// So: every module is installed through `installModule()` and ticked through
// `mod.tick()`. A throw at install time yields a live stub. A throw at tick time
// is logged once, counted, and after `MAX_FAULTS` the module is quarantined —
// its update stops being called, the rest of the frame goes on, and `stats()`
// and the dev overlay both report it.
//
// The failure is loud (console.error, `module:failed` on the bus, a red row in
// stats) and never silent. A quarantined module is a defect to be fixed, not a
// state to ship in.
// ─────────────────────────────────────────────────────────────────────────────
import { bus } from './events.js';

const MAX_FAULTS = 3;

export class Module {
  constructor(name) {
    this.name = name;
    this.api = null;
    this.ok = false;
    this.faults = 0;
    this.quarantined = false;
    this.error = null;
    this.ms = 0;            // last update cost, for the frame breakdown
  }

  tick(dt, ctx) {
    if (!this.ok || this.quarantined || !this.api?.update) return;
    const t0 = performance.now();
    try {
      this.api.update(dt, ctx);
    } catch (e) {
      this.fault(e);
    }
    this.ms = performance.now() - t0;
  }

  /** Same guard for any non-update entry point a lane exposes. */
  call(fnName, ...args) {
    if (!this.ok || this.quarantined) return undefined;
    const fn = this.api?.[fnName];
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(this.api, args); }
    catch (e) { this.fault(e); return undefined; }
  }

  fault(e) {
    this.error = e;
    if (++this.faults >= MAX_FAULTS) {
      this.quarantined = true;
      console.error(`[module:${this.name}] quarantined after ${this.faults} faults —`, e);
      bus.emit('module:failed', { module: this.name, error: String(e?.message || e) });
    } else {
      console.error(`[module:${this.name}] fault ${this.faults}/${MAX_FAULTS} —`, e);
    }
  }
}

/**
 * Install a lane. `factory(ctx)` returns the lane's API object; anything it
 * throws is contained here and the game keeps running without that lane.
 *
 * @param {string} name   lane name, matching the CONTRACT.md ownership table
 * @param {Function} factory  (ctx) => api
 * @param {object} ctx
 * @returns {Module}
 */
export function installModule(name, factory, ctx) {
  const m = new Module(name);
  try {
    m.api = factory(ctx) || {};
    m.ok = true;
  } catch (e) {
    m.error = e;
    m.quarantined = true;
    m.api = {};
    console.error(`[module:${name}] install failed — running without it:`, e);
    bus.emit('module:failed', { module: name, error: String(e?.message || e), phase: 'install' });
  }
  return m;
}

/** Health of every installed lane. `__DAWN__.stats().modules` returns this. */
export function moduleReport(modules) {
  const out = {};
  for (const [k, m] of Object.entries(modules)) {
    if (!(m instanceof Module)) continue;
    out[k] = { ok: m.ok && !m.quarantined, faults: m.faults, ms: +m.ms.toFixed(2) };
    if (m.error) out[k].error = String(m.error?.message || m.error);
  }
  return out;
}

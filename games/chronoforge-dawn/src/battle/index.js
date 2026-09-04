// ─────────────────────────────────────────────────────────────────────────────
// battle — LANE STUB.
//
// ATB combat, fought IN PLACE on the terrain the encounter fired on: no scene
// swap, no load. Camera may swing and push in; pitch stays locked.
//
// Phase 0 ships the seam, not the feature. `main.js` already installs this and
// hands it the shared `ctx`; the battle lane fills it in without touching a
// single shared-core file. Do not widen this signature — add fields to the
// returned API instead.
//
// Owned by the `battle` lane. See CONTRACT.md §1.
// ─────────────────────────────────────────────────────────────────────────────

export function installBattle(ctx) {
  return {
    /** Ticked once per fixed sim step, inside the module-isolation guard. A
     *  throw here is caught, counted and quarantined — it can never blank the
     *  screen. See core/modules.js. */
    update(_dt, _ctx) {},

    /** Stage a representative scene of just this module. Every lane owes one:
     *  `?showcase=battle` boots straight into it and the critic reviews the
     *  module in isolation rather than hunting for it in the whole game. */
    showcase() { return false; },

    /** Report for `__DAWN__.stats()` and the census. Keep it cheap. */
    report() { return { phase0: 'stub' }; },
  };
}

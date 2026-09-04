// ─────────────────────────────────────────────────────────────────────────────
// ui — LANE STUB.
//
// HUD, menu chrome, the dev overlay. Draws to the #ui canvas layer and NEVER
// touches the Three scene or the post chain.
//
// Phase 0 ships the seam, not the feature. `main.js` already installs this and
// hands it the shared `ctx`; the ui lane fills it in without touching a
// single shared-core file. Do not widen this signature — add fields to the
// returned API instead.
//
// Owned by the `ui` lane. See CONTRACT.md §1.
// ─────────────────────────────────────────────────────────────────────────────

export function installUI(ctx) {
  return {
    /** Ticked once per fixed sim step, inside the module-isolation guard. A
     *  throw here is caught, counted and quarantined — it can never blank the
     *  screen. See core/modules.js. */
    update(_dt, _ctx) {},

    /** Stage a representative scene of just this module. Every lane owes one:
     *  `?showcase=ui` boots straight into it and the critic reviews the
     *  module in isolation rather than hunting for it in the whole game. */
    showcase() { return false; },

    /** Report for `__DAWN__.stats()` and the census. Keep it cheap. */
    report() { return { phase0: 'stub' }; },
  };
}

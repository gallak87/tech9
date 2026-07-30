import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// FX subsystem seam.  OWNER: fx agent.  Everything under src/fx/ is yours.
//
// main.js calls installFx(ctx) once and then fx.update(dt) every frame. Combat
// and the ship call into the returned API — keep these method names stable, add
// freely.
// ─────────────────────────────────────────────────────────────────────────────

export function installFx(ctx) {
  const group = new THREE.Group();
  group.name = 'fx';
  ctx.scene.add(group);

  const api = {
    group,
    /** @param {THREE.Vector3} pos @param {object} opts {scale, color, kind} */
    explosion(pos, opts = {}) { void pos; void opts; },
    /** Muzzle flash + travelling bolt. */
    laser(origin, dir, opts = {}) { void origin; void dir; void opts; },
    /** Sparks + scorch when a bolt connects. */
    impact(pos, normal, opts = {}) { void pos; void normal; void opts; },
    /** Water/ground spray under the ship. */
    spray(pos, opts = {}) { void pos; void opts; },
    /** Speed lines / vapour cone intensity, 0..1. */
    setBoost(v) { void v; },
    update(dt) { void dt; },
    dispose() { ctx.scene.remove(group); },
  };
  return api;
}

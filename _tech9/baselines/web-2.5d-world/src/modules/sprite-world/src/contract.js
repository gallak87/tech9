import { actorFrames, validateFrames } from './frames.js';
export function validateScene(scene, frames) {
  if (
    !scene?.id ||
    !Number.isFinite(scene.width) ||
    scene.width <= 0 ||
    !Number.isFinite(scene.height) ||
    scene.height <= 0
  )
    throw new Error('Scene needs an id and positive dimensions');
  for (const p of scene.props || []) {
    if (
      !frames[p.frame] ||
      ![p.x, p.y, p.height].every(Number.isFinite) ||
      p.height <= 0
    )
      throw new Error(`Invalid prop: ${p.id || p.frame}`);
    for (const f of p.footprints || [])
      if (![f.x, f.y, f.w, f.h].every(Number.isFinite) || f.w <= 0 || f.h <= 0)
        throw new Error(`Invalid footprint: ${p.id || p.frame}`);
  }
}
/** Validate authored inputs before allocating browser or image resources. */
export function validateWorldOptions({
  mount,
  scene,
  assets,
  frames,
  actor,
  drawGround,
  createPatterns,
} = {}) {
  if (typeof mount?.append !== 'function')
    throw new Error('A mount element is required');
  if (!Array.isArray(assets) || !assets.length)
    throw new Error('Explicit nonempty assets are required');
  if (!frames || typeof frames !== 'object' || Array.isArray(frames))
    throw new Error('Explicit frame metadata is required');
  if (!actor?.animations?.idle)
    throw new Error('An explicit actor with idle animation groups is required');
  if (typeof drawGround !== 'function')
    throw new Error('An explicit drawGround callback is required');
  if (createPatterns !== undefined && typeof createPatterns !== 'function')
    throw new Error('createPatterns must be a factory function');
  validateScene(scene, frames);
  const entries = new Map();
  for (const entry of assets) {
    if (!entry.id || !entry.url || entries.has(entry.id))
      throw new Error('Assets require unique ids and explicit URLs');
    entries.set(entry.id, entry);
  }
  for (const groups of Object.values(actor.animations)) {
    if (!groups || typeof groups !== 'object' || !Object.keys(groups).length)
      throw new Error('Actor animation groups must not be empty');
    for (const list of Object.values(groups))
      if (!Array.isArray(list) || !list.length)
        throw new Error(
          'Each directional animation must be a nonempty frame array',
        );
  }
  for (const frame of [...Object.values(frames), ...actorFrames(actor)]) {
    const entry = entries.get(frame?.asset);
    if (!entry) throw new Error(`Unregistered frame asset: ${frame?.asset}`);
    validateFrames(
      { id: entry.id, frames: [frame] },
      { width: entry.width ?? Infinity, height: entry.height ?? Infinity },
    );
    if (
      frame.scale !== undefined &&
      (!Number.isFinite(frame.scale) || frame.scale <= 0)
    )
      throw new Error('Frame scale must be positive');
  }
  if (
    actor.scale !== undefined &&
    (!Number.isFinite(actor.scale) || actor.scale <= 0)
  )
    throw new Error('Actor scale must be positive');
}
export function copyActor(actor) {
  return {
    ...actor,
    animations: Object.fromEntries(
      Object.entries(actor.animations).map(([name, groups]) => [
        name,
        Object.fromEntries(
          Object.entries(groups).map(([direction, list]) => [
            direction,
            list.map((frame) => ({ ...frame })),
          ]),
        ),
      ]),
    ),
    animationRates: actor.animationRates
      ? { ...actor.animationRates }
      : undefined,
  };
}

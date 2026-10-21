export function frameBounds(frame, x, y, height) {
  const scale = height / frame.h;
  return {
    left: x - frame.anchorX * scale,
    top: y - frame.anchorY * scale,
    width: frame.w * scale,
    height,
  };
}
export function validateFrames(entry, image) {
  if (
    (entry.width && entry.width !== image.width) ||
    (entry.height && entry.height !== image.height)
  )
    throw new Error(`Source dimensions changed: ${entry.id}`);
  for (const f of entry.frames || []) {
    if (
      ![f.x, f.y, f.w, f.h, f.anchorX, f.anchorY].every(Number.isFinite) ||
      f.x < 0 ||
      f.y < 0 ||
      f.w <= 0 ||
      f.h <= 0 ||
      f.x + f.w > image.width ||
      f.y + f.h > image.height
    )
      throw new Error(`Invalid frame crop: ${entry.id}`);
  }
}
export function actorFrames(actor) {
  return Object.values(actor.animations).flatMap((groups) =>
    Object.values(groups).flat(),
  );
}
export function actorFrame(actor, time) {
  const action = actor.moving && actor.animations.walk ? 'walk' : 'idle';
  const groups = actor.animations[action];
  const facing = actor.facing || 'right';
  const mirrored = facing === 'left' && !groups.left && Boolean(groups.right);
  const frames =
    groups[facing] ||
    (mirrored ? groups.right : groups.default || Object.values(groups)[0]);
  const fps = actor.animationRates?.[action] ?? actor.fps ?? 9;
  const phase =
    Math.floor(Math.max(0, time) * Math.max(0, fps)) % frames.length;
  const frame = frames[phase];
  return {
    ...frame,
    flip: Boolean(frame.flip) !== mirrored,
    height: frame.h * (frame.scale ?? actor.scale ?? 1),
  };
}
export function isOccluding(prop, bounds, actor) {
  return (
    prop.occludes !== false &&
    actor.y < prop.y &&
    actor.y > bounds.top &&
    actor.x > bounds.left &&
    actor.x < bounds.left + bounds.width
  );
}
export function drawFrame(
  ctx,
  image,
  frame,
  x,
  y,
  height,
  { flip = false, alpha = 1 } = {},
) {
  const bounds = frameBounds(frame, x, y, height);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (flip) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(
      image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      (-frame.anchorX * height) / frame.h,
      (-frame.anchorY * height) / frame.h,
      bounds.width,
      height,
    );
  } else
    ctx.drawImage(
      image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      bounds.left,
      bounds.top,
      bounds.width,
      height,
    );
  ctx.restore();
  return bounds;
}

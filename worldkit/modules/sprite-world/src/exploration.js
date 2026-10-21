export function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function pointSegmentDistance(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}
export function roadDistance(scene, x, y) {
  let distance = Infinity;
  for (const road of scene.roads || []) {
    const points = road.points || road;
    for (let i = 1; i < points.length; i++)
      distance = Math.min(
        distance,
        pointSegmentDistance(x, y, points[i - 1], points[i]) -
          (road.width || 64) / 2,
      );
  }
  return distance;
}
export function isWalkable(scene, x, y, radius = 8) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < radius ||
    y < radius ||
    x > scene.width - radius ||
    y > scene.height - radius
  )
    return false;
  if (scene.isWalkable && !scene.isWalkable(x, y, radius)) return false;
  for (const water of scene.water || [])
    for (const [dx, dy] of [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ])
      if (
        insidePolygon(x + dx, y + dy, water) &&
        roadDistance(scene, x + dx, y + dy) > 0
      )
        return false;
  for (const prop of scene.props || [])
    for (const f of prop.footprints || []) {
      const nearX = Math.max(prop.x + f.x, Math.min(x, prop.x + f.x + f.w)),
        nearY = Math.max(prop.y + f.y, Math.min(y, prop.y + f.y + f.h));
      if (
        Math.hypot(x - nearX, y - nearY) < radius ||
        (x > prop.x + f.x &&
          x < prop.x + f.x + f.w &&
          y > prop.y + f.y &&
          y < prop.y + f.y + f.h)
      )
        return false;
    }
  return true;
}
export function clearSegment(scene, from, to, radius = 8) {
  const samples = Math.max(
    1,
    Math.ceil(
      Math.hypot(to.x - from.x, to.y - from.y) /
        Math.max(1, Math.min(3, radius / 2)),
    ),
  );
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (
      !isWalkable(
        scene,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        radius,
      )
    )
      return false;
  }
  return true;
}
/** Swept per-axis movement slides along solids and cannot tunnel through thin walls. */
export function moveActor(actor, input, dt, scene) {
  const length = Math.hypot(input.x || 0, input.y || 0);
  actor.moving = false;
  if (!length || !Number.isFinite(dt) || dt <= 0) return actor;
  const amount = Math.min(1, length),
    dx = input.x / length,
    dy = input.y / length,
    step =
      Math.min(dt, 0.1) *
      (input.run ? actor.runSpeed || 360 : actor.speed || 230) *
      amount;
  const oldX = actor.x,
    oldY = actor.y,
    radius = actor.radius ?? 8;
  const pieces = Math.max(1, Math.ceil(step / 3));
  for (let i = 0; i < pieces; i++) {
    const d = step / pieces;
    if (isWalkable(scene, actor.x + dx * d, actor.y, radius)) actor.x += dx * d;
    if (isWalkable(scene, actor.x, actor.y + dy * d, radius)) actor.y += dy * d;
  }
  actor.moving = Math.hypot(actor.x - oldX, actor.y - oldY) > 0.001;
  if (actor.moving)
    actor.facing =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
          ? 'down'
          : 'up';
  return actor;
}
export function nearestInteraction(scene, actor) {
  let result = null,
    distance = Infinity;
  for (const prop of scene.props || []) {
    if (!prop.interact) continue;
    const d = Math.hypot(actor.x - prop.x, actor.y - prop.y);
    if (d <= (prop.interact.radius || 100) && d < distance) {
      result = prop;
      distance = d;
    }
  }
  return result;
}

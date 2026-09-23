import { npcPresent } from './npc-identities.js';
import { footprintBlocks } from './world-scenery.js';

export function distanceToRoad(scene, x, y) {
  let min = Infinity;
  for (const line of scene.roads || [])
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        vx = b.x - a.x,
        vy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1),
          ),
        );
      min = Math.min(min, Math.hypot(x - a.x - vx * t, y - a.y - vy * t));
    }
  return min;
}
export function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function terrainAt(scene, x, y) {
  if (scene.interior) return 'ground';
  const d = distanceToRoad(scene, x, y);
  if (d < 35) return 'path';
  if (
    scene.islands?.some(
      ([cx, cy, rx, ry]) =>
        (x - cx) ** 2 / (rx * rx) + (y - cy) ** 2 / (ry * ry) < 1,
    )
  )
    return 'ground';
  if (scene.water?.some((poly) => insidePolygon(x, y, poly))) return 'water';
  return 'ground';
}
export function isWalkable(scene, x, y) {
  // Navigation nodes and interpolated motion share the same microunit boundary.
  x = Math.round(x * 1e6) / 1e6;
  y = Math.round(y * 1e6) / 1e6;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 18 ||
    y < 35 ||
    x > scene.width - 18 ||
    y > scene.height - 18
  )
    return false;
  if (
    scene.interior &&
    !scene.walkAreas.some(
      (a) =>
        x >= a.x + 7 &&
        x <= a.x + a.w - 7 &&
        y >= a.y + 7 &&
        y <= a.y + a.h - 7,
    )
  )
    return false;
  if (terrainAt(scene, x, y) === 'water') return false;
  for (const o of scene.objects) {
    if (!o.solid) continue;
    if (o.footprints) {
      if (footprintBlocks(o, x, y)) return false;
      continue;
    }
    const w = o.w || 24,
      h = o.h || 18;
    const bottom =
      o.type === 'town' || o.type === 'house' || o.type === 'cave'
        ? o.y - 12
        : o.y + 3;
    if (
      x > o.x - w / 2 - 6 &&
      x < o.x + w / 2 + 6 &&
      y > bottom - h - 5 &&
      y < bottom + 6
    )
      return false;
  }
  return true;
}
export function safeArrival(scene, x, y) {
  if (isWalkable(scene, x, y)) return { x, y };
  // Renovations can replace a former corner with a wall or furnishing. Search
  // all eight directions so saved positions can move back onto nearby floor.
  for (let d = 8; d < 180; d += 8)
    for (const [dx, dy] of [
      [0, d],
      [d, 0],
      [-d, 0],
      [0, -d],
      [d, d],
      [-d, d],
      [d, -d],
      [-d, -d],
    ])
      if (isWalkable(scene, x + dx, y + dy)) return { x: x + dx, y: y + dy };
  throw Error(`No safe arrival near ${scene.id} ${x},${y}`);
}
function interactionDistance(o, x, y) {
  const a = o.interactionArea;
  if (!a) return Math.hypot(o.x - x, o.y - y);
  return Math.hypot(
    Math.max(0, Math.abs(x - o.x - a.x) - a.w / 2),
    Math.max(0, Math.abs(y - o.y - a.y) - a.h / 2),
  );
}
export function meetsWorldRequirement(state, req) {
  if (!req) return true;
  if (typeof req === 'string') return !!state.flags?.[req];
  return (
    (!req.tier || state.tier >= req.tier) &&
    (!req.flag || !!state.flags?.[req.flag])
  );
}
// Keyboard and touch share this list. Arrival protection prevents automatic
// contact, but must still let the player explicitly choose to start the fight.
export function nearby(scene, x, y, state) {
  return [...scene.objects, ...scene.portals]
    .filter(
      (o) =>
        !['tree', 'rock', 'ruin', 'landmark'].includes(o.type) &&
        npcPresent(o, state) &&
        !(o.hero && state?.heroes?.some((h) => h.id === o.hero)) &&
        (!o.unlockTier || (state?.tier || 1) >= o.unlockTier) &&
        !state?.pickups?.[o.id] &&
        (o.type !== 'encounter' ||
          (state?.cleared?.[o.id]
            ? !o.boss && !o.guard && !o.flag
            : o.patrolMotion?.arrivalProtected &&
              meetsWorldRequirement(state, o.requires))) &&
        interactionDistance(o, x, y) <
          (o.type === 'encounter'
            ? 52
            : o.type === 'portal'
              ? 62
              : ['town', 'house', 'cave'].includes(o.type)
                ? 96
                : 72),
    )
    .sort(
      (a, b) =>
        interactionDistance(a, x, y) - interactionDistance(b, x, y) ||
        Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
    );
}
// Buildings are wider than an NPC: reveal their name near the footprint, not only the anchor.
// This is informational and deliberately separate from the interactable-object list.
export function nearbyBuildings(scene, x, y, state) {
  const distance = (o) =>
    Math.hypot(
      Math.max(0, Math.abs(x - o.x) - (o.w || 0) / 2),
      Math.max(0, y - o.y, o.y - (o.h || 0) - y),
    );
  return scene.objects
    .filter(
      (o) =>
        o.building && state?.buildings?.[o.building] > 0 && distance(o) < 60,
    )
    .sort((a, b) => distance(a) - distance(b));
}

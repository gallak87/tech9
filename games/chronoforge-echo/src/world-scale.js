// Convert native authored geometry before applying layouts already in world units.
const WORLD_SCALE = 1.25;

export function scaleScenes(scenes) {
  const scale = WORLD_SCALE;
  for (const scene of Object.values(scenes)) {
    scene.width *= scale;
    scene.height *= scale;
    for (const p of [
      scene.spawn,
      scene.town,
      ...scene.objects,
      ...scene.portals,
      ...(scene.roads || []).flat(),
    ])
      if (p) {
        p.x *= scale;
        p.y *= scale;
        if (p.w) p.w *= scale;
        if (p.h) p.h *= scale;
        if (p.spawn) {
          p.spawn.x *= scale;
          p.spawn.y *= scale;
        }
      }
    if (scene.floorZones)
      for (const zone of scene.floorZones)
        zone.points = zone.points.map((p) => p.map((v) => v * scale));
    if (scene.quietAreas)
      for (const area of scene.quietAreas)
        for (const k of ['x', 'y', 'rx', 'ry']) area[k] *= scale;
    if (scene.walkAreas)
      for (const a of scene.walkAreas) {
        a.x *= scale;
        a.y *= scale;
        a.w *= scale;
        a.h *= scale;
      }
    if (scene.water)
      scene.water = scene.water.map((poly) =>
        poly.map((p) => p.map((v) => v * scale)),
      );
    if (scene.islands)
      scene.islands = scene.islands.map((a) => a.map((v) => v * scale));
    if (scene.groves)
      scene.groves = scene.groves.map((a) =>
        a.map((v, i) => (i < 4 ? v * scale : v)),
      );
  }
}

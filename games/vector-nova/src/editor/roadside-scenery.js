import * as T from 'three';

/** Scenery clusters get more opportunities beside the road as Fullness rises.
 * Every caller reserves its real mesh bounds after choosing an assembly. */
export function roadsideScenerySites(track, density, limit = 24) {
  if (!track || density <= 0) return [];
  const length = track.finishDistance ?? track.length;
  const count = Math.min(limit, Math.ceil((length * density) / 265));
  const sites = [];
  for (let i = 0; i < count; i++) {
    const station = (length * (i + 0.62)) / count;
    if (track.isJumpProtected?.(station)) continue;
    const frame = track.sample(station);
    const forward = frame.tangent.clone().setY(0).normalize();
    if (forward.lengthSq() < 0.5) continue;
    const right = new T.Vector3(forward.z, 0, -forward.x);
    const side = i % 2 ? -1 : 1;
    sites.push({
      id: i,
      station,
      position: frame.position,
      forward,
      right,
      yaw: Math.atan2(forward.x, forward.z),
      offsets: [80 * side, -80 * side, 145 * side, -145 * side, 245 * side],
    });
  }
  return sites;
}

/** Extend a procedural kit without changing its structural contact plan. */
export function fillRoadsideKit(
  { doc, track, plan, placement },
  kit,
  { families, limit = 15, size = 1, floating = false, dry = false },
) {
  for (const site of roadsideScenerySites(track, doc.settings.density, limit)) {
    const id = families[site.id % families.length];
    const bounds = kit.localBounds[id].getSize(new T.Vector3());
    const scale = size * (0.94 + placement.random() * 0.24);
    const margin =
      track.width / 2 + (Math.hypot(bounds.x, bounds.z) * scale) / 2;
    for (const offset of site.offsets) {
      const { x, z } = site.position
        .clone()
        .addScaledVector(site.right, offset + Math.sign(offset) * margin);
      const ground = plan.surfaceHeight(x, z);
      if (dry && ground < plan.waterHeight(x, z) + 6) continue;
      if (!floating && site.position.y - ground > bounds.y * scale + 135)
        continue;
      if (
        kit.emit(id, {
          id: 'roadside-' + site.id,
          x,
          z,
          y: floating ? site.position.y - bounds.y * scale * 0.55 : null,
          yaw: site.yaw,
          scale,
          decorative: true,
          embed: floating ? 0 : 0.07,
        })
      )
        break;
    }
  }
}

import { groundFrame } from '../environment/placement.js';
import { editorRandom } from './document.js';

// Founded wards bridge the scale between the racing viaduct and regional towns.
// Their placement is scenery-only and still obeys the full flight reservation.
export function enrichNightweirPlan(doc, track, plan) {
  if (!track) return plan;
  const random = editorRandom(plan.seed ^ 0x71756179);
  const quarters = [],
    parcels = [];
  const spacing = Math.max(150, track.length / 26);
  for (let s = 70; s < track.length && quarters.length < 28; s += spacing) {
    if (track.isJumpProtected?.(s)) continue;
    const frame = groundFrame(track, s);
    for (const side of [-1, 1]) {
      const lateral = side * (140 + random() * 75);
      const x = frame.position.x + frame.right.x * lateral;
      const z = frame.position.z + frame.right.z * lateral;
      const y = plan.surfaceHeight(x, z);
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      if (
        y < plan.waterHeight(x, z) + 4 ||
        !plan.clears(x, z, 125, 150, y + 75, yaw, y - 16)
      )
        continue;
      if (quarters.some((q) => Math.hypot(q.x - x, q.z - z) < 190)) continue;
      const id = 'quay-ward-' + quarters.length;
      const garden =
        doc.settings.sceneryPreset === 'reclaimed' && random() < 0.7;
      quarters.push({
        id,
        x,
        y,
        z,
        yaw,
        radius: 110,
        kind: garden
          ? 'garden'
          : doc.settings.sceneryPreset === 'industrial'
            ? 'works'
            : 'civic',
      });
      const cos = Math.cos(yaw),
        sin = Math.sin(yaw);
      for (const [dx, dz] of [
        [-48, -40],
        [0, -40],
        [48, -40],
        [-48, 40],
        [0, 40],
        [48, 40],
      ]) {
        if (parcels.length >= 96) break;
        const px = x + dx * cos + dz * sin,
          pz = z - dx * sin + dz * cos;
        const py = plan.surfaceHeight(px, pz);
        const type = garden
          ? 'trees'
          : doc.settings.sceneryPreset === 'industrial'
            ? Math.abs(dx) < 1
              ? 'warehouse'
              : 'pump'
            : 'building';
        const scale = garden ? 1.15 : 0.72 + random() * 0.2;
        if (
          py < plan.waterHeight(px, pz) + 3 ||
          !plan.clears(px, pz, 48, 48, py + 78, yaw, py - 16)
        )
          continue;
        parcels.push({
          id: id + '-' + parcels.length,
          districtId: id,
          x: px,
          y: py,
          z: pz,
          yaw,
          type,
          scale,
          lod: 'near',
          seed: Math.floor(random() * 4294967296),
        });
      }
    }
  }
  const lods = { near: 0, mid: 0, far: 0 };
  const combined = [...parcels, ...plan.parcels].slice(0, 640).map((parcel) => {
    let lod = parcel.lod;
    if (lod === 'near' && lods.near >= 72) lod = 'mid';
    if (lod === 'mid' && lods.mid >= 160) lod = 'far';
    lods[lod]++;
    return { ...parcel, lod };
  });
  return {
    ...plan,
    districts: [...plan.districts, ...quarters],
    parcels: combined,
    stats: {
      ...plan.stats,
      parcels: combined.length,
      quayWards: quarters.length,
      ...lods,
    },
  };
}

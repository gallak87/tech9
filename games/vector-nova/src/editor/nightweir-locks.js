import * as T from 'three';

// A connected sluice belongs across a water channel. The foundations follow
// its actual bed; the moving/flight volume is reserved as one whole assembly.
export function buildNightweirLocks({
  doc,
  plan,
  placement,
  owner,
  materials,
  roof,
  glow,
}) {
  const steel = owner.material('Nightweir / oxide floodgate steel', {
    color: '#a4553e',
    roughness: 0.76,
    metalness: 0.34,
  });
  const enamel = owner.material('Nightweir / petrol pump housings', {
    color: '#37605d',
    roughness: 0.44,
    metalness: 0.25,
  });
  const skin = owner.material('Nightweir / salt-streaked gate piers', {
    color: '#b1aba0',
    roughness: 0.85,
  });
  const up = new T.Vector3(0, 1, 0),
    pos = new T.Vector3(),
    size = new T.Vector3(),
    q = new T.Quaternion();
  let count = 0;
  for (const [i, canal] of plan.canals.entries()) {
    if (doc.settings.sceneryPreset === 'reclaimed' && i % 2) continue;
    const yaw = Math.atan2(canal.b.x - canal.a.x, canal.b.z - canal.a.z);
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const span = canal.width * 2 + 37,
      height = 72 + (i % 3) * 14;
    for (const t of [0.46, 0.3, 0.63, 0.17, 0.79]) {
      const x = T.MathUtils.lerp(canal.a.x, canal.b.x, t),
        z = T.MathUtils.lerp(canal.a.z, canal.b.z, t);
      const water = plan.waterHeight(x, z);
      if (water - plan.surfaceHeight(x, z) < 3) continue;
      const toPoint = (u, y, v) =>
        new T.Vector3(x + u * c + v * s, y, z - u * s + v * c);
      const pierGround = [-1, 1].map((side) => {
        const p = toPoint((side * span) / 2, 0, 0);
        return Math.min(water - 4, plan.surfaceHeight(p.x, p.z) - 3);
      });
      const bottom = Math.min(...pierGround, plan.surfaceHeight(x, z) - 2);
      const bounds = new T.Box3(
        new T.Vector3(-span / 2 - 13, bottom, -18),
        new T.Vector3(span / 2 + 13, water + height + 15, 18),
      ).applyMatrix4(new T.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
      if (
        !placement.acceptBounds(bounds, {
          id: 'sluice-' + canal.id,
          type: 'sluice',
          solid: false,
          contactRole: 'decorative',
        })
      )
        continue;
      q.setFromAxisAngle(up, yaw);
      const block = (material, u, y, v, w, h, d) => {
        pos.copy(toPoint(u, y, v));
        owner.block(material.name, material, pos, size.set(w, h, d), q);
      };
      for (const [n, side] of [-1, 1].entries()) {
        const u = (side * span) / 2,
          foot = pierGround[n];
        block(
          skin,
          u,
          (foot + water + height) / 2,
          0,
          17,
          water + height - foot,
          27,
        );
        block(
          materials.concrete,
          u,
          (foot + water + 21) / 2,
          0,
          24,
          water + 21 - foot,
          34,
        );
        block(enamel, u, water + height + 4, 0, 23, 8, 31);
        block(roof, u, water + height + 9, 0, 25, 2, 33);
        block(glow, u, water + height + 4, -15.6, 15, 1.5, 0.5);
        block(glow, u, water + height + 4, 15.6, 15, 1.5, 0.5);
      }
      block(steel, 0, water + 4, 0, span - 14, 17, 7);
      for (const side of [-1, 1]) {
        for (let j = 0; j < 5; j++) {
          const u = (j - 2) * span * 0.17;
          block(steel, u, water + 6, side * 4.2, 2, 16, 2);
        }
        block(steel, 0, water + height - 6, side * 5, span, 3, 2);
        block(roof, 0, water + height, side * 6, span, 2, 2);
      }
      block(roof, 0, water + height - 1, 0, span, 2, 14);
      block(enamel, 0, water + height + 4, 0, span * 0.27, 9, 13);
      block(glow, 0, water + height + 5, -6.6, span * 0.19, 2, 0.5);
      for (const side of [-1, 1]) {
        const u = side * span * 0.31;
        block(roof, u, water + height * 0.52, 0, 1.2, height - 12, 1.2);
      }
      count++;
      break;
    }
  }
  return count;
}

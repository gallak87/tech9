import * as T from 'three';

// Merged machine loads share surveyed rock seats. Short drops use battered
// abutments; taller loads use a tapered primary pier with paired haunches.
export function createColossusFoundationBuilder({
  quarry,
  kit,
  concrete,
  putBox,
  staticPart,
  routeSurvey,
  groundY = -70,
}) {
  const identity = new T.Matrix4();
  const box = (material, size, position, name) =>
    putBox(material, size, position, identity, name);
  const loft = (a, b, w0, d0, w1, d1, material, name) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start),
      h = delta.length();
    if (h < 0.1) return;
    const corners = [
        [-w0 / 2, -h / 2, -d0 / 2],
        [w0 / 2, -h / 2, -d0 / 2],
        [w0 / 2, -h / 2, d0 / 2],
        [-w0 / 2, -h / 2, d0 / 2],
        [-w1 / 2, h / 2, -d1 / 2],
        [w1 / 2, h / 2, -d1 / 2],
        [w1 / 2, h / 2, d1 / 2],
        [-w1 / 2, h / 2, d1 / 2],
      ],
      indices = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ],
      g = new T.BufferGeometry();
    // These indices face inward in Y-up; reverse each triangle so lighting and
    // CPU flight rays agree with the closed support's exterior surface.
    const positions = [];
    for (let i = 0; i < indices.length; i += 3)
      for (const index of [indices[i], indices[i + 2], indices[i + 1]])
        positions.push(...corners[index]);
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    g.applyMatrix4(
      new T.Matrix4().compose(
        start.add(end).multiplyScalar(0.5),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.normalize(),
        ),
        new T.Vector3(1, 1, 1),
      ),
    );
    staticPart(g, material, name);
  };
  const build = (top, width, depth) => {
    if (
      top.y < groundY + 40 ||
      routeSurvey.some(
        (p) =>
          Math.abs(p.x - top.x) < width / 2 + 48 &&
          Math.abs(p.z - top.z) < depth / 2 + 48 &&
          p.y > groundY - 20 &&
          p.y < top.y + 20,
      )
    ) {
      return;
    }
    const nominalWidth = Math.max(24, Math.min(96, width * 0.78)),
      nominalDepth = Math.max(28, Math.min(96, depth * 0.78)),
      sites = [];
    // Try progressively narrower seats before accepting a cliff-straddling
    // footprint. Their centres can move only within the existing load envelope.
    for (const scale of [1, 0.68, 0.44]) {
      const footWidth = Math.max(18, nominalWidth * scale),
        footDepth = Math.max(22, nominalDepth * scale),
        moveX = Math.max(
          0,
          Math.min(width * 0.28, (width - footWidth) / 2 - 2),
        ),
        moveZ = Math.max(
          0,
          Math.min(depth * 0.28, (depth - footDepth) / 2 - 2),
        );
      for (const dx of [-moveX, 0, moveX])
        for (const dz of [-moveZ, 0, moveZ]) {
          const levels = [];
          for (const x of [-footWidth / 2, 0, footWidth / 2])
            for (const z of [-footDepth / 2, 0, footDepth / 2])
              levels.push(quarry.heightAt(top.x + dx + x, top.z + dz + z));
          const high = Math.max(...levels),
            low = Math.min(...levels);
          if (high > top.y - 14) continue;
          sites.push({
            x: top.x + dx,
            z: top.z + dz,
            high,
            low,
            footWidth,
            footDepth,
            score:
              (high - low) * 2.4 +
              (top.y - high) * 0.12 +
              Math.hypot(dx, dz) * 0.18 +
              (nominalWidth - footWidth + nominalDepth - footDepth) * 0.12,
          });
        }
    }
    sites.sort((a, b) => a.score - b.score);
    if (!sites.length) {
      return;
    }
    const seat = sites[0],
      { footWidth, footDepth } = seat,
      base = Math.min(top.y - 18, seat.high + 12),
      low = Math.max(seat.low - 14, base - 42),
      gap = top.y - base,
      majorX = width >= depth,
      trunkW = Math.max(14, Math.min(46, width * 0.42, footWidth * 0.78)),
      trunkD = Math.max(16, Math.min(48, depth * 0.42, footDepth * 0.78));
    // The broad low plinth is cut into a surveyed bench; it never grows down
    // hundreds of metres to a remote low corner of a cliff-straddling footprint.
    loft(
      [seat.x, low, seat.z],
      [seat.x, base, seat.z],
      footWidth,
      footDepth,
      footWidth * 0.84,
      footDepth * 0.84,
      concrete,
      'Foundation / primary bench seat',
    );
    if (gap <= 88) {
      loft(
        [seat.x, base - 3, seat.z],
        [top.x, top.y - 18, top.z],
        footWidth * 0.78,
        footDepth * 0.78,
        Math.max(trunkW, width * 0.48),
        Math.max(trunkD, depth * 0.48),
        concrete,
        'Foundation / battered bench abutment',
      );
    } else {
      const pedestalTop = base + Math.min(46, gap * 0.2),
        jointY = pedestalTop + (top.y - 25 - pedestalTop) * 0.6,
        joint = new T.Vector3(
          T.MathUtils.lerp(seat.x, top.x, 0.65),
          jointY,
          T.MathUtils.lerp(seat.z, top.z, 0.65),
        );
      loft(
        [seat.x, base - 2, seat.z],
        [seat.x, pedestalTop, seat.z],
        footWidth * 0.78,
        footDepth * 0.78,
        trunkW * 1.18,
        trunkD * 1.18,
        concrete,
        'Foundation / primary pier plinth',
      );
      loft(
        [seat.x, pedestalTop - 2, seat.z],
        joint.toArray(),
        trunkW,
        trunkD,
        trunkW * 0.78,
        trunkD * 0.78,
        kit.materials.cast,
        'Foundation / tapered primary box pier',
      );
      const armW = Math.max(16, trunkW * 0.65),
        armD = Math.max(18, trunkD * 0.65);
      for (const side of [-1, 1]) {
        const end = [
          top.x + (majorX ? side * width * 0.29 : 0),
          top.y - 18,
          top.z + (majorX ? 0 : side * depth * 0.29),
        ];
        loft(
          joint.toArray(),
          end,
          armW,
          armD,
          armW * 1.12,
          armD * 1.12,
          kit.materials.dark,
          'Foundation / primary transfer haunch',
        );
        box(
          kit.materials.steel,
          [armW + 10, 7, armD + 10],
          [end[0], top.y - 18, end[2]],
          'Foundation / primary haunch bearing',
        );
      }
    }
    // A single deep transfer cap makes the shared load path legible. Its top
    // surface is exactly the original foundation datum for every machine bed.
    box(
      kit.materials.dark,
      [width + 8, 22, depth + 8],
      [top.x, top.y - 11, top.z],
      'Foundation / shared transfer cap',
    );
    box(
      kit.materials.steel,
      [width + 12, 3, depth + 12],
      [top.x, top.y + 1.5, top.z],
      'Foundation / shared bearing floor',
    );
  };
  return build;
}

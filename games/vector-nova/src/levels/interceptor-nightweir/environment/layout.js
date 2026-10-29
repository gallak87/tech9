import * as T from 'three';

export const WORLD_UP = new T.Vector3(0, 1, 0);
export function createLockdownLayout(track) {
  const samples = Array.from(
    { length: Math.ceil(track.length / 14) },
    (_, index) => ({
      ...track.sample((index * track.length) / Math.ceil(track.length / 14)),
      distance: (index * track.length) / Math.ceil(track.length / 14),
    }),
  );
  const bounds = new T.Box3().setFromPoints(
    samples.map((frame) => frame.position),
  );
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const range = bounds.max.z - bounds.min.z;
  const splits = [bounds.min.z + range * 0.35, bounds.min.z + range * 0.69];
  const riverX = (z) => midX + 72 * Math.sin((z - bounds.min.z) * 0.0038);
  const riverLevel = (z) => (z < splits[0] ? 19 : z < splits[1] ? 46 : 77);
  const hydro = {
    start: track.length * 0.19,
    dam: track.length * 0.34,
    end: track.length * 0.405,
    upperY: 121,
    lowerY: 54,
    near: 54,
    far: 286,
  };
  const hydroSamples = samples.filter(
    (f) => f.distance >= hydro.start - 12 && f.distance <= hydro.end + 12,
  );
  function hydroAt(x, z) {
    let best = null,
      d = Infinity;
    for (const frame of hydroSamples) {
      const q = (x - frame.position.x) ** 2 + (z - frame.position.z) ** 2;
      if (q < d) {
        d = q;
        best = frame;
      }
    }
    if (!best) return null;
    const right = new T.Vector3(best.right.x, 0, best.right.z).normalize();
    const lateral =
      (x - best.position.x) * right.x + (z - best.position.z) * right.z;
    if (lateral < 44 || lateral > 305 || Math.sqrt(d) > 345) return null;
    return {
      frame: best,
      lateral,
      waterY: best.distance < hydro.dam ? hydro.upperY : hydro.lowerY,
    };
  }
  const quays = [
    {
      id: 'lower-tailrace',
      start: track.length * 0.615,
      end: track.length * 0.685,
      waterY: 49,
    },
    {
      id: 'sluice-quay',
      start: track.length * 0.74,
      end: track.length * 0.845,
      waterY: 87,
    },
    {
      id: 'return-quay',
      start: track.length * 0.855,
      end: track.length * 0.95,
      waterY: 100,
    },
  ];
  const discharge = {
    start: quays[1].end,
    end: quays[2].start,
    station: track.length * 0.85,
    near: 38,
    far: 148,
    upperY: 100,
    sourceY: 126,
    lowerY: 87,
  };
  // Inside-radius water cells stay within the bend's offset envelope. The
  // remaining bank is excavated too, so terrain cannot conceal them at speed.
  const quayFar = (distance) =>
    Math.min(
      148,
      0.82 / Math.max(0.0005, Math.max(0, track.sample(distance).curvature)),
    );
  const quaySamples = quays.map((quay) => ({
    ...quay,
    frames: samples.filter(
      (f) => f.distance >= quay.start - 8 && f.distance <= quay.end + 8,
    ),
  }));
  function reservoirBankAt(x, z) {
    let best = null,
      d = Infinity;
    for (const f of hydroSamples) {
      if (f.distance > hydro.dam) continue;
      const q = (x - f.position.x) ** 2 + (z - f.position.z) ** 2;
      if (q < d) {
        d = q;
        best = f;
      }
    }
    if (!best) return null;
    const right = new T.Vector3(best.right.x, 0, best.right.z).normalize(),
      lateral =
        (x - best.position.x) * right.x + (z - best.position.z) * right.z;
    return lateral > 302 && lateral < 500 && Math.sqrt(d) < 520
      ? { frame: best, lateral }
      : null;
  }
  function quayAt(x, z) {
    for (const quay of quaySamples) {
      let best = null,
        d = Infinity;
      for (const f of quay.frames) {
        const q = (x - f.position.x) ** 2 + (z - f.position.z) ** 2;
        if (q < d) {
          d = q;
          best = f;
        }
      }
      if (!best) continue;
      const right = new T.Vector3(best.right.x, 0, best.right.z).normalize(),
        lateral =
          (x - best.position.x) * right.x + (z - best.position.z) * right.z;
      if (
        lateral > 26 &&
        lateral < quayFar(best.distance) + 70 &&
        Math.sqrt(d) < 245
      )
        return { ...quay, lateral, frame: best };
    }
    return null;
  }
  function nearest(x, z) {
    let best = samples[0],
      distanceSq = Infinity;
    for (const sample of samples) {
      const d = (x - sample.position.x) ** 2 + (z - sample.position.z) ** 2;
      if (d < distanceSq) {
        best = sample;
        distanceSq = d;
      }
    }
    return { frame: best, distance: Math.sqrt(distanceSq) };
  }
  function terrainHeight(x, z) {
    const road = nearest(x, z),
      channel = Math.abs(x - riverX(z));
    const grain =
      Math.sin(x * 0.009 + Math.sin(z * 0.006)) * 15 +
      Math.sin(z * 0.011 - x * 0.003) * 9;
    const rim =
      T.MathUtils.smoothstep(road.distance, 230, 700) *
      (95 + 55 * Math.sin(z * 0.003) ** 2);
    let land = road.frame.position.y - 20 + grain + rim;
    const right = new T.Vector3(
        road.frame.right.x,
        0,
        road.frame.right.z,
      ).normalize(),
      lateral =
        (x - road.frame.position.x) * right.x +
        (z - road.frame.position.z) * right.z,
      fraction = road.frame.distance / track.length;
    // The return quarter is excavated into three broad rock benches. These
    // carry occupied works streets instead of an unbuilt spherical mound.
    if (fraction > 0.7 && fraction < 0.98 && lateral < -55 && lateral > -415) {
      const out = -lateral,
        step = Math.max(0, Math.floor((out - 70) / 80)),
        phase = T.MathUtils.euclideanModulo(out - 70, 80);
      land =
        road.frame.position.y -
        11 +
        step * 22 +
        T.MathUtils.smoothstep(phase, 66, 80) * 22 +
        grain * 0.12;
    }
    const bank = T.MathUtils.smoothstep(channel, 100, 235);
    land = T.MathUtils.lerp(riverLevel(z) - 14, land, bank);
    const bankCut = reservoirBankAt(x, z);
    if (bankCut) {
      const out = bankCut.lateral - 302,
        step = Math.floor(out / 65),
        phase = T.MathUtils.euclideanModulo(out, 65);
      land = Math.min(
        land,
        hydro.upperY +
          8 +
          step * 18 +
          T.MathUtils.smoothstep(phase, 57, 65) * 18 +
          grain * 0.12,
      );
    }
    const basin = hydroAt(x, z);
    if (basin) land = Math.min(land, basin.waterY - 18);
    const bridgeFrame = road.frame,
      bridgeRight = new T.Vector3(
        bridgeFrame.right.x,
        0,
        bridgeFrame.right.z,
      ).normalize(),
      bridgeLateral =
        (x - bridgeFrame.position.x) * bridgeRight.x +
        (z - bridgeFrame.position.z) * bridgeRight.z;
    if (
      bridgeFrame.distance > discharge.start - 16 &&
      bridgeFrame.distance < discharge.end + 16 &&
      bridgeLateral > 26 &&
      bridgeLateral < 175
    )
      land = Math.min(land, discharge.lowerY - 12);
    const quay = quayAt(x, z);
    if (quay) land = Math.min(land, quay.waterY - 12);
    if (road.distance < 70) land = Math.min(land, road.frame.position.y - 14);
    return land;
  }
  const inRiver = (x, z, margin = 0) =>
    Math.abs(x - riverX(z)) < 110 + margin ||
    hydroAt(x, z) !== null ||
    quayAt(x, z) !== null;
  const clear = (point, radius = 0) =>
    nearest(point.x, point.z).distance >= 36 + radius;
  function streetFrame(distance, side) {
    const frame = track.sample(distance),
      out = new T.Vector3(frame.right.x, 0, frame.right.z)
        .normalize()
        .multiplyScalar(side);
    const along = WORLD_UP.clone().cross(out).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(along, WORLD_UP, out),
    );
    return { ...frame, out, along, quaternion };
  }
  const buildings = [];
  let index = 0;
  for (let distance = 40; distance < track.length; distance += 76) {
    const fraction = distance / track.length;
    if (fraction > 0.6 && fraction < 0.98) continue;
    for (const side of [-1, 1]) {
      if (
        side === 1 &&
        !(
          fraction < 0.17 ||
          (fraction > 0.38 && fraction < 0.55) ||
          (fraction > 0.68 && fraction < 0.79) ||
          fraction > 0.9
        )
      )
        continue;
      if (fraction > 0.2 && fraction < 0.39 && side === -1) continue;
      const frame = streetFrame(distance, side);
      for (let row = 0; row < 2; row++) {
        const width = 38 + ((index * 13) % 24),
          depth = 36 + ((index * 7) % 20),
          height = 38 + ((index * 11) % 48) + row * 15;
        const position = frame.position
          .clone()
          .addScaledVector(frame.out, row ? 208 : 102);
        if (
          !clear(position, Math.hypot(width, depth) / 2) ||
          inRiver(position.x, position.z, 22)
        )
          continue;
        const ground = terrainHeight(position.x, position.z),
          urban =
            row === 0 &&
            (fraction < 0.18 || (fraction > 0.4 && fraction < 0.6)),
          base = Math.max(
            frame.position.y - 12 + row * 12 + (urban ? 18 : 0),
            ground - 2,
          );
        buildings.push({
          id: `ward-${index++}`,
          position: position.setY(base),
          quaternion: frame.quaternion,
          width,
          depth,
          height,
          ground,
          distance,
          row,
          side,
          urban,
          style: index % 3,
        });
      }
    }
  }
  const halls = [];
  for (const [fraction, side] of [
    [0.43, -1],
    [0.58, -1],
    [0.84, 1],
  ]) {
    const frame = streetFrame(track.length * fraction, side),
      width = 110,
      depth = 74;
    for (const offset of [175, 220, 270, 320]) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.out, offset);
      if (
        !clear(position, Math.hypot(width, depth) / 2 + 8) ||
        inRiver(position.x, position.z, 20)
      )
        continue;
      const ground = terrainHeight(position.x, position.z),
        base = Math.max(frame.position.y - 26, ground - 4);
      halls.push({
        id: `powerhouse-${halls.length}`,
        position: position.setY(base),
        quaternion: frame.quaternion,
        width,
        depth,
        height: 74,
        ground,
        distance: track.length * fraction,
      });
      break;
    }
  }
  const heroFrame = streetFrame(track.length * 0.375, 1),
    heroPosition = heroFrame.position
      .clone()
      .addScaledVector(heroFrame.out, 215)
      .setY(55);
  if (clear(heroPosition, Math.hypot(160, 110) / 2))
    halls.push({
      id: 'reservoir-generating-hall',
      position: heroPosition,
      quaternion: heroFrame.quaternion,
      width: 160,
      depth: 110,
      height: 110,
      ground: 36,
      distance: track.length * 0.375,
      hero: true,
    });
  return {
    track,
    discharge,
    quays,
    quayFar,
    quayAt,
    samples,
    bounds,
    riverX,
    riverLevel,
    splits,
    hydro,
    hydroAt,
    terrainHeight,
    nearest,
    clear,
    inRiver,
    streetFrame,
    buildings,
    halls,
  };
}

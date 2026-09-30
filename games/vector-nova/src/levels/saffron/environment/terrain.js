import * as T from 'three';
import {
  horizontalFrame,
  instanced,
  matrixAt,
  randomSequence,
} from './geometry.js';

/** A CPU-only survey shared by terrain and authored-asset placement. */
export function createLandformSurvey(track) {
  const samples = [];
  const bounds = new T.Box3();
  for (let s = 0; s < track.length; s += 13) {
    const position = track.sample(s).position.clone();
    bounds.expandByPoint(position);
    samples.push({ s, position });
  }
  const center = bounds.getCenter(new T.Vector3());
  const meanY =
    samples.reduce((sum, sample) => sum + sample.position.y, 0) /
    samples.length;
  function nearest(x, z) {
    let minimum = Infinity;
    let result = samples[0];
    let clearanceY = Infinity;
    for (const sample of samples) {
      const d = (sample.position.x - x) ** 2 + (sample.position.z - z) ** 2;
      if (d < minimum) {
        minimum = d;
        result = sample;
      }
      if (d < 52 ** 2)
        clearanceY = Math.min(clearanceY, sample.position.y - 11);
    }
    return { ...result, distance: Math.sqrt(minimum), clearanceY };
  }
  function heightAt(x, z) {
    const local = nearest(x, z);
    const broad =
      Math.sin(x * 0.0027 + z * 0.0016) * 39 +
      Math.sin(z * 0.0063 - x * 0.0011) * 23;
    const crescent =
      Math.pow(
        0.5 +
          0.5 * Math.sin(x * 0.0067 + z * 0.0041 + Math.sin(z * 0.002) * 1.7),
        2.2,
      ) * 68;
    const ripple = Math.sin(x * 0.029 + z * 0.013) * 1.9;
    const base = T.MathUtils.lerp(
      local.position.y - 43,
      meanY - 58,
      T.MathUtils.smoothstep(local.distance, 240, 950),
    );
    const natural = base + broad + crescent + ripple;
    const bank =
      local.position.y - 13 + Math.max(0, local.distance - 30) * 0.61;
    const carved = T.MathUtils.lerp(
      Math.min(natural, bank),
      natural,
      T.MathUtils.smoothstep(local.distance, 110, 250),
    );
    return Math.min(carved, local.clearanceY);
  }
  function clears(
    position,
    horizontalRadius,
    bottom = -Infinity,
    top = Infinity,
  ) {
    for (const sample of samples) {
      if (sample.position.y + 36 < bottom || sample.position.y - 9 > top)
        continue;
      const dx = position.x - sample.position.x;
      const dz = position.z - sample.position.z;
      if (dx * dx + dz * dz < (track.width / 2 + 22 + horizontalRadius) ** 2)
        return false;
    }
    return true;
  }
  return { samples, bounds, center, meanY, nearest, heightAt, clears };
}

export function createTerrain(track, survey, materials, resources, shape) {
  const group = new T.Group();
  group.name =
    'Saffron / stratified desert basin, close scree, and distant dune seas';
  const size = survey.bounds.getSize(new T.Vector3());
  const width = Math.max(size.x + 4600, 6200);
  const depth = Math.max(size.z + 4600, 6200);
  const geometry = resources.geometry(
    new T.PlaneGeometry(width, depth, 176, 176).rotateX(-Math.PI / 2),
  );
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const ochre = new T.Color(shape ? '#a6a19a' : '#c99a59');
  const highSand = new T.Color(shape ? '#c0bbb3' : '#e0bb78');
  const lowSilt = new T.Color(shape ? '#807e79' : '#9c7664');
  const shade = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + survey.center.x;
    const z = positions.getZ(i) + survey.center.z;
    const y = survey.heightAt(x, z);
    positions.setXYZ(i, x, y, z);
    const wave =
      0.5 + 0.5 * Math.sin(x * 0.009 + z * 0.005 + Math.sin(z * 0.003));
    shade
      .copy(ochre)
      .lerp(highSand, wave * 0.7)
      .lerp(lowSilt, Math.max(0, 0.5 - wave) * 0.7);
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const land = new T.Mesh(geometry, materials.terrain);
  land.name = 'Saffron / continuous wind-carved terrain with route clearance';
  land.receiveShadow = true;
  group.add(land);

  const random = randomSequence();
  const stoneTransforms = [];
  const crustTransforms = [];
  const fanTransforms = [];
  const boneTransforms = [];
  for (let s = 25; s < track.length; s += 51) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      const distance = side * (38 + random() * 28);
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, distance);
      const radius = 3 + random() * 6;
      if (!survey.clears(position, radius, -Infinity, frame.position.y + 9))
        continue;
      position.y = survey.heightAt(position.x, position.z) + 0.6;
      const yaw = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            random() * 3,
          ),
        );
      stoneTransforms.push(
        matrixAt(
          position,
          new T.Vector3(radius, 1.2 + random() * 3, radius * (0.5 + random())),
          yaw,
        ),
      );
      const crust = position.clone().addScaledVector(frame.right, side * 12);
      crust.y = survey.heightAt(crust.x, crust.z) + 0.4;
      crustTransforms.push(
        matrixAt(
          crust,
          new T.Vector3(8 + random() * 9, 0.4, 4 + random() * 7),
          yaw,
        ),
      );
      if (s < track.length * 0.14 || s > track.length * 0.81) {
        const fan = position.clone().addScaledVector(frame.forward, 12);
        fan.y = survey.heightAt(fan.x, fan.z) + 1.3;
        fanTransforms.push(
          matrixAt(
            fan,
            new T.Vector3(2 + random() * 2, 3 + random() * 3, 0.7),
            yaw,
          ),
        );
      }
      if (Math.floor(s / 51) % 3 === 0) {
        const bone = position.clone().addScaledVector(frame.right, side * 16);
        bone.y = survey.heightAt(bone.x, bone.z) + 1.2;
        boneTransforms.push(
          matrixAt(
            bone,
            new T.Vector3(2 + random() * 2, 1.7, 7 + random() * 9),
            yaw,
          ),
        );
      }
    }
  }
  instanced(
    group,
    'Saffron / broken mineral faces',
    resources.geometry(new T.IcosahedronGeometry(1, 0)),
    materials.mineral,
    stoneTransforms,
  );
  instanced(
    group,
    'Saffron / exposed sediment crust',
    resources.geometry(new T.IcosahedronGeometry(1, 1)),
    materials.sand,
    crustTransforms,
  );
  instanced(
    group,
    'Saffron / fan-shaped mineral growth',
    resources.geometry(new T.ConeGeometry(1, 1, 4, 1).rotateZ(0.33)),
    materials.boneDark,
    fanTransforms,
  );
  instanced(
    group,
    'Saffron / bone splinters embedded in dune skirts',
    resources.geometry(new T.CapsuleGeometry(1, 1, 3, 6).rotateX(Math.PI / 2)),
    materials.bone,
    boneTransforms,
  );
  return {
    group,
    terrain: land,
    nearPropCount:
      stoneTransforms.length +
      crustTransforms.length +
      fanTransforms.length +
      boneTransforms.length,
  };
}

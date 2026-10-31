import * as T from 'three';
import {
  horizontalFrame,
  instanced,
  matrixAt,
  randomSequence,
} from './geometry.js';

// Closed, unequal erosional benches: broad bedding, broken scarps and buried feet.
// One shared mesh per family keeps the middle-distance landscape inexpensive.
function scarpGeometry(family) {
  const sides = 54;
  const levels = [
    [0, 1.25],
    [0.08, 1.2],
    [0.14, 1.04],
    [0.29, 1.02],
    [0.34, 0.95],
    [0.49, 0.94],
    [0.54, 0.85],
    [0.72, 0.83],
    [0.77, 0.75],
    [0.94, 0.74],
    [1, 0.64],
  ];
  const positions = [],
    colors = [],
    indices = [];
  const dark = new T.Color('#796351'),
    light = new T.Color('#b39a78');
  for (let row = 0; row < levels.length; row++) {
    const [y, radius] = levels[row];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const facet =
        1 +
        0.22 * Math.sin(a * 3 + family) +
        0.14 * Math.cos(a * 5 - family * 2) +
        0.05 * Math.sin(a * 11 + y * 4);
      const fissure =
        1 - 0.2 * Math.exp(-((Math.sin(a - 0.4 - family) / 0.17) ** 2));
      const bend = Math.sin(y * 2 + family) * 0.12;
      positions.push(
        Math.cos(a) * radius * facet * fissure + bend,
        y + y * Math.sin(a * 3 + family) * 0.045,
        Math.sin(a) * radius * facet * (family === 1 ? 0.54 : 0.8),
      );
      const color = dark
        .clone()
        .lerp(light, 0.48 + y * 0.28 + Math.sin(row * 2.9 + family) * 0.045);
      color.toArray(colors, colors.length);
    }
  }
  for (let row = 0; row < levels.length - 1; row++)
    for (let i = 0; i < sides; i++) {
      const a = row * sides + i,
        b = row * sides + ((i + 1) % sides);
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i, i + 1);
    const top = (levels.length - 1) * sides;
    indices.push(top, top + i + 1, top + i);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createDesertScarps(track, survey, materials, resources) {
  const group = new T.Group();
  group.name =
    'Saffron / buried bedrock escarpments and fractured shelf districts';
  const random = randomSequence(0x5affa31);
  const families = [[], [], []];
  for (let s = 80; s < track.length; s += 275 + random() * 145) {
    const frame = horizontalFrame(track, s);
    const vista =
      s > track.landmarks.vistaStart - 140 &&
      s < track.landmarks.vistaEnd + 150;
    for (const side of [-1, 1]) {
      if (vista && side < 0) continue;
      const district = Math.floor(s / 540) % 3;
      const radius = 62 + random() * 48;
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (radius + 130 + random() * 55));
      if (!survey.clears(position, radius * 1.35)) continue;
      position.y = survey.heightAt(position.x, position.z) - 27;
      const rotation = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            (random() - 0.5) * 1.1,
          ),
        );
      families[district].push(
        matrixAt(
          position,
          new T.Vector3(
            radius,
            42 + random() * 46,
            radius * (1.35 + random() * 0.8),
          ),
          rotation,
        ),
      );
      // Lower companion follows the same bedding orientation, joining the mass
      // to a broad buried shelf instead of placing a solitary prop on the sand.
      const foot = position
        .clone()
        .addScaledVector(frame.forward, radius * 0.66)
        .addScaledVector(frame.right, side * radius * 0.22);
      foot.y = survey.heightAt(foot.x, foot.z) - 18;
      if (survey.clears(foot, radius * 1.55))
        families[1].push(
          matrixAt(
            foot,
            new T.Vector3(radius * 1.4, 27 + random() * 22, radius * 1.9),
            rotation,
          ),
        );
    }
  }
  for (const [family, transforms] of families.entries()) {
    const mesh = instanced(
      group,
      `Saffron / erosional bedrock family ${family}`,
      resources.geometry(scarpGeometry(family)),
      materials.bedrock,
      transforms,
    );
    if (mesh) mesh.castShadow = true;
  }
  return group;
}

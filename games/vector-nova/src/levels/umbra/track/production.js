import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';

function panelGeometry(track) {
  const positions = [];
  const normals = [];
  const colors = [];
  const triangle = (vertices, color) => {
    const normal = new THREE.Vector3()
      .crossVectors(
        vertices[1].clone().sub(vertices[0]),
        vertices[2].clone().sub(vertices[0]),
      )
      .normalize();
    for (const vertex of vertices) {
      positions.push(...vertex.toArray());
      normals.push(...normal.toArray());
      colors.push(color.r, color.g, color.b);
    }
  };
  for (const [start, end] of track.solidRuns) {
    for (let from = start; from < end; from += 18) {
      const to = Math.min(end, from + 18);
      const section = track.sections.find(
        (entry) => from >= entry.start && from < entry.end,
      );
      const landing = track.jumps.some(
        (jump) => from >= jump.landingStart && from < jump.landingStart + 110,
      );
      const launch = track.jumps.some(
        (jump) => from > jump.takeoff - 85 && from < jump.takeoff,
      );
      const bounds =
        section.id === 'event-fold' ? [-14, -8, 8, 14] : [-14, -5.7, 5.7, 14];
      for (let column = 0; column < bounds.length - 1; column += 1) {
        const x0 = bounds[column] + 0.085;
        const x1 = bounds[column + 1] - 0.085;
        const shade =
          landing || launch
            ? column === 1
              ? 0x819395
              : 0xb4b9ab
            : section.id === 'broken-meridian' &&
                (Math.floor(from / 18) + column) % 7 === 0
              ? 0x9ea799
              : section.id === 'event-fold' && column !== 1
                ? 0x64757d
                : [0x46525a, 0x37424b, 0x505b61][column];
        const color = new THREE.Color(shade).multiplyScalar(
          0.91 + ((Math.floor(from / 18) + column * 3) % 5) * 0.035,
        );
        const along = Math.max(1, Math.ceil((to - from) / 2.4));
        for (let row = 0; row < along; row += 1) {
          const a = THREE.MathUtils.lerp(from + 0.08, to - 0.08, row / along);
          const b = THREE.MathUtils.lerp(
            from + 0.08,
            to - 0.08,
            (row + 1) / along,
          );
          const fa = track.sample(a);
          const fb = track.sample(b);
          const mid = (x0 + x1) / 2;
          for (const [left, right, leftY, rightY] of [
            [x0, mid, 0.025, 0.065],
            [mid, x1, 0.065, 0.025],
          ]) {
            const p = [
              framePoint(fa, left, leftY),
              framePoint(fb, left, leftY),
              framePoint(fa, right, rightY),
              framePoint(fb, right, rightY),
            ];
            triangle([p[0], p[1], p[2]], color);
            triangle([p[2], p[1], p[3]], color);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// The deck is an engineered graphite ribbon: continuous curb, broad faceted
// panels, unequal suspended boundary leaves and two exposed tension spines.
export function buildUmbraRoad(track, { shape = false } = {}) {
  const group = new THREE.Group();
  group.name = shape
    ? 'Umbra Fold / neutral shape'
    : 'Umbra Fold / graphite observatory raceway';
  const geometries = new Set();
  const materials = new Set();
  const makeMaterial = (parameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    materials.add(material);
    return material;
  };
  const graphite = makeMaterial({
    color: shape ? 0x626f77 : 0x273139,
    roughness: 0.87,
    metalness: 0.24,
  });
  const panel = makeMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.73,
    metalness: 0.24,
  });
  const metal = makeMaterial({
    color: shape ? 0x91a0a7 : 0x7c929e,
    roughness: 0.43,
    metalness: 0.7,
  });
  const pale = makeMaterial({
    color: 0xc5c9b8,
    roughness: 0.8,
    metalness: 0.12,
  });
  const underside = makeMaterial({
    color: 0x3d4c5b,
    roughness: 0.59,
    metalness: 0.54,
  });
  const guide = makeMaterial({
    color: 0xc9eaf0,
    emissive: 0x729cac,
    emissiveIntensity: shape ? 0 : 0.95,
    roughness: 0.45,
    metalness: 0.25,
  });
  const amber = makeMaterial({
    color: 0xedbd70,
    emissive: 0xd78a38,
    emissiveIntensity: shape ? 0 : 0.9,
    roughness: 0.59,
  });
  const repair = makeMaterial({
    color: 0x746256,
    roughness: 0.72,
    metalness: 0.35,
  });
  const mesh = (name, geometry, material) => {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    result.receiveShadow = true;
    group.add(result);
    return result;
  };
  const sweep = (name, profile, material, step = 3) => {
    const parts = track.solidRuns.map(([start, end]) =>
      sweepGeometry(track, profile, { start, end, step }),
    );
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    return mesh(name, geometry, material);
  };
  const half = track.width / 2;
  const road = sweep(
    'Graphite deck backing / real open jump intervals',
    [
      [-half, shape ? 0 : -0.12],
      [half, shape ? 0 : -0.12],
    ],
    graphite,
    2,
  );
  road.userData.drivingSurface = true;
  road.userData.solidRuns = track.solidRuns.map((range) => [...range]);
  sweep(
    'Deep faceted deck sides and bottom',
    [
      [half, -0.13],
      [half + 0.45, -1.6],
      [11, -3.2],
      [-11, -3.2],
      [-half - 0.45, -1.6],
      [-half, -0.13],
    ],
    underside,
  );
  if (!shape)
    mesh(
      'Broad segmented graphite facets and pale landing patches',
      panelGeometry(track),
      panel,
    ).userData.drivingSurface = true;
  for (const side of [-1, 1]) {
    sweep(
      'Cold metal edge band',
      [
        [side * (half - 0.85) - 0.27, 0.08],
        [side * (half - 0.85) + 0.27, 0.08],
      ],
      metal,
      2,
    );
    sweep(
      'Recessed continuous luminous guide',
      boxProfile(side * (half - 0.18), 0.12, 0.21, 0.08),
      guide,
      2,
    );
    sweep(
      'Low continuous impact curb',
      boxProfile(side * (half + 0.42), 0.61, 0.7, 1.22),
      metal,
      2,
    );
    if (!shape) {
      const spineProfile = [
        [side * 7.7, -2.9],
        [side * 9.7, -5.8],
        [side * 8.7, -7.1],
        [side * 7.5, -5.8],
        [side * 7.7, -2.9],
      ];
      if (side < 0) spineProfile.reverse();
      sweep('Paired graphite tension spine', spineProfile, underside, 4);
      sweep(
        'Lit tension line on exposed deck bottom',
        boxProfile(side * 8.6, -7.15, 0.2, 0.13),
        guide,
        4,
      );
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(box);
  const instances = new Map();
  const instance = (material, position, quaternion, scale) => {
    if (!instances.has(material)) instances.set(material, []);
    instances
      .get(material)
      .push(new THREE.Matrix4().compose(position, quaternion, scale));
  };
  const localBox = (
    material,
    frame,
    x,
    y,
    z,
    width,
    height,
    length,
    tilt = 0,
  ) => {
    const q = frame.quaternion
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          tilt,
        ),
      );
    instance(
      material,
      framePoint(frame, x, y, z),
      q,
      new THREE.Vector3(width, height, length),
    );
  };
  const beam = (material, a, b, width, depth = width) => {
    const transform = beamTransform(a, b, width, depth);
    instance(
      material,
      transform.position,
      transform.quaternion,
      transform.scale,
    );
  };
  for (const [start, end] of track.solidRuns) {
    for (
      let distance = start + 12;
      distance < end - 8;
      distance += shape ? 100 : 34
    ) {
      const frame = track.sample(distance);
      const nearLanding = track.jumps.some(
        (jump) =>
          distance > jump.landingStart && distance < jump.landingStart + 160,
      );
      const nearLaunch = track.jumps.some(
        (jump) => distance > jump.takeoff - 180 && distance < jump.takeoff,
      );
      const inTide = track.tidalZones.some(
        (zone) => distance > zone.start && distance < zone.end,
      );
      const sideMaterial = nearLanding ? pale : metal;
      const outside = frame.curvature > 0 ? -1 : 1;
      for (const side of [-1, 1]) {
        const tall = side === outside;
        const height = shape ? 0.9 : tall ? 3.9 : 2.1;
        const x = side * (half + (tall ? 2.2 : 1.5));
        const y = shape ? 1.55 : tall ? 3.65 : 2.65;
        const length = Math.min(tall ? 20 : 12, (end - distance) * 1.2);
        const plateMaterial = nearLaunch || inTide ? amber : sideMaterial;
        localBox(
          plateMaterial,
          frame,
          x,
          y,
          0,
          shape ? 0.5 : 0.65,
          height,
          length,
          side * -0.14,
        );
        if (!shape) {
          for (const z of [-length * 0.32, length * 0.32]) {
            beam(
              underside,
              framePoint(frame, side * (half + 0.3), 0.45, z),
              framePoint(frame, x + side * 1.1, y - height * 0.15, z),
              0.36,
              0.55,
            );
            beam(
              metal,
              framePoint(frame, x + side * 1.1, y - height * 0.15, z),
              framePoint(frame, x, y + height * 0.28, z),
              0.25,
              0.35,
            );
          }
          localBox(
            guide,
            frame,
            x - side * 0.38,
            y + height * 0.32,
            0,
            0.1,
            0.12,
            length * 0.88,
          );
          // One inset cold brace and one warm repair insert break the outer leaf
          // into a recognizable instrument housing, with an open gap next to it.
          localBox(
            underside,
            frame,
            x - side * 0.4,
            y - height * 0.22,
            -length * 0.12,
            0.14,
            height * 0.23,
            length * 0.63,
          );
        }
      }
      if (!shape) {
        beam(
          metal,
          framePoint(frame, -9, -6.2),
          framePoint(frame, 9, -6.2),
          0.8,
          1.3,
        );
        for (const side of [-1, 1]) {
          localBox(
            repair,
            frame,
            side * 8.6,
            -4.75,
            0,
            3.4,
            3.6,
            2.8,
            side * 0.21,
          );
          beam(
            metal,
            framePoint(frame, side * 7.8, -6),
            framePoint(frame, side * 13.8, -0.9, 5.5),
            0.52,
            0.75,
          );
        }
      }
    }
  }
  // Amber landing ribs and stacked runway arrows remain visible on both presets.
  for (const jump of track.jumps) {
    for (const distance of [
      jump.takeoff - 90,
      jump.takeoff - 60,
      jump.takeoff - 30,
      jump.takeoff - 8,
      jump.landingStart + 2,
      jump.landingStart + 24,
      jump.landingStart + 48,
    ]) {
      const frame = track.sample(distance);
      const incoming = distance < jump.takeoff;
      for (const side of [-1, 1]) {
        localBox(
          incoming ? amber : guide,
          frame,
          side * 11.6,
          0.14,
          0,
          1.1,
          0.09,
          incoming ? 3.5 : 8,
        );
        if (!shape) {
          localBox(pale, frame, side * 16.3, 3.7, 0, 1, 7.4, 1);
          localBox(
            incoming ? amber : guide,
            frame,
            side * 16.3,
            7.4,
            0,
            1.45,
            0.35,
            1.45,
          );
        }
      }
    }
  }
  // Sparse side-mounted survey beacons describe the measured ballistic bend;
  // their open centre preserves the complete airborne corridor.
  if (!shape)
    for (const jump of track.jumps) {
      const launch = track.sample(jump.takeoff);
      const velocity = launch.tangent.clone().multiplyScalar(jump.targetSpeed);
      const acceleration = new THREE.Vector3(...jump.airAcceleration);
      acceleration.y = -26;
      for (const time of [0.42, 0.84, 1.26, 1.65]) {
        const centre = launch.position
          .clone()
          .addScaledVector(velocity, time)
          .addScaledVector(acceleration, 0.5 * time ** 2);
        const tangent = velocity
          .clone()
          .addScaledVector(acceleration, time)
          .normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const up = tangent.clone().cross(right).normalize();
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(right, up, tangent),
        );
        for (const side of [-1, 1]) {
          const position = centre
            .clone()
            .addScaledVector(right, side * 19.5)
            .addScaledVector(up, -2.5);
          instance(
            metal,
            position,
            quaternion,
            new THREE.Vector3(0.5, 3.5, 1.1),
          );
          instance(
            amber,
            position.clone().addScaledVector(up, 1.95),
            quaternion,
            new THREE.Vector3(1.05, 0.32, 1.35),
          );
        }
      }
    }
  for (let distance = 20; distance < track.length; distance += 82) {
    if (track.isGap(distance)) continue;
    const frame = track.sample(distance);
    for (const side of [-1, 1]) {
      const a = framePoint(frame, side * 0.8, 0.18, -0.8);
      const b = framePoint(frame, 0, 0.18, 1.5);
      beam(shape ? pale : metal, a, b, 0.1, 0.07);
    }
  }
  for (const [material, transforms] of instances) {
    const result = new THREE.InstancedMesh(box, material, transforms.length);
    result.name =
      'Umbra structural modules / suspended leaves, offset struts and repair nodes';
    transforms.forEach((transform, index) =>
      result.setMatrixAt(index, transform),
    );
    result.computeBoundingSphere();
    result.receiveShadow = true;
    group.add(result);
  }
  group.userData.reviewKind = shape ? 'bare-track' : 'production';
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.clear();
    materials.clear();
  };
  group.userData.dispose = dispose;
  return {
    group,
    dispose,
    setReflection(texture) {
      for (const material of materials) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
  };
}

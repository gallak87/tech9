import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
const white = new T.Color(0xffffff);

// Low uses ordinary unlit materials: no textures, custom shader patches, bloom,
// layered transparency, lights or shadows. Geometry supplies the silhouettes.
export function lowMaterial(color, opacity = 1) {
  return new T.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
    toneMapped: false,
    side: T.DoubleSide,
    forceSinglePass: true,
  });
}

export function lowMesh(geometry, color, name, opacity = 1) {
  const mesh = new T.Mesh(geometry, lowMaterial(color, opacity));
  mesh.name = name;
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  return mesh;
}

export function lowRing(color, name) {
  const geometry = new T.RingGeometry(0.91, 1, 24);
  geometry.rotateX(-Math.PI / 2);
  return lowMesh(geometry, color, name, 0.8);
}

const rect = (x0, x1, y0, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function stroke(a, b, width) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const x = ((-dy / length) * width) / 2,
    y = ((dx / length) * width) / 2;
  return [
    [a[0] + x, a[1] + y],
    [b[0] + x, b[1] + y],
    [b[0] - x, b[1] - y],
    [a[0] - x, a[1] - y],
  ];
}

export function createLowDeviceGeometry(
  _track,
  device,
  projector,
  { mountHeight = 0 } = {},
) {
  const group = new T.Group();
  group.name = `Low pickup / ${device.id}`;
  group.userData.deviceId = device.id;
  const x = device.lateral,
    s = device.distance;
  const w = device.width / 2,
    h = device.length / 2;
  const shapes = [
    rect(x - w, x - w + 0.22, s - h, s + h),
    rect(x + w - 0.22, x + w, s - h, s + h),
    rect(x - w, x + w, s - h, s - h + 0.22),
    rect(x - w, x + w, s + h - 0.22, s + h),
  ];
  const path = (points, width = 0.28) => {
    for (let i = 1; i < points.length; i++)
      shapes.push(
        stroke(
          [x + points[i - 1][0], s + points[i - 1][1]],
          [x + points[i][0], s + points[i][1]],
          width,
        ),
      );
  };
  if (device.type === 'vector') {
    const reach = Math.min(w * 0.65, 2);
    for (const offset of [-h * 0.55, 0, h * 0.55])
      path([
        [-reach, offset - 0.6],
        [0, offset + 0.6],
        [reach, offset - 0.6],
      ]);
  } else if (device.type === 'arc') {
    path(
      [
        [-1.2, -2.5],
        [0.8, -0.3],
        [-0.8, 0.3],
        [1.2, 2.5],
      ],
      0.45,
    );
  } else if (device.type === 'aegis') {
    path([
      [-1.3, 1.5],
      [1.3, 1.5],
      [1.3, -0.6],
      [0, -1.8],
      [-1.3, -0.6],
      [-1.3, 1.5],
    ]);
  } else if (device.type === 'repulsor') {
    for (const radius of [0.8, 1.7])
      path(
        Array.from({ length: 17 }, (_, i) => [
          Math.cos((i / 16) * Math.PI * 2) * radius,
          Math.sin((i / 16) * Math.PI * 2) * radius,
        ]),
      );
  } else {
    for (const offset of [-1.1, 0, 1.1])
      path([
        [offset, -2.5],
        [offset + 0.35, -1],
        [offset - 0.35, 1],
        [offset, 2.5],
      ]);
  }
  const base = lowMesh(
    projector.geometry([rect(x - w, x + w, s - h, s + h)], mountHeight + 0.07),
    0x182128,
    'Low pickup / deck',
  );
  const markings = lowMesh(
    projector.geometry(shapes, mountHeight + 0.095),
    DEVICE_COLORS[device.type],
    'Low pickup / symbol',
  );
  group.add(base, markings);
  let available = true;
  let collectedAt = -Infinity;
  return {
    group,
    updateCamera() {},
    setAvailable(value) {
      available = value;
    },
    activate(time) {
      collectedAt = time;
    },
    reset() {
      collectedAt = -Infinity;
    },
    update({ time = 0, reducedMotion = false } = {}) {
      markings.material.color.setHex(
        available ? DEVICE_COLORS[device.type] : 0x49515b,
      );
      if (!reducedMotion && time - collectedAt < 0.18)
        markings.material.color.lerp(white, 0.5);
    },
  };
}

import * as T from 'three';

import { DEVICE_COLORS } from './theme.js';
import { createDeviceSignal } from './signal.js';

export const COMBAT_NAMES = Object.freeze({
  repulsor: 'REPULSOR',
  arc: 'ARC BURST',
  ion: 'ION WAKE',
});
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
export function createCombatDeviceGeometry(
  track,
  device,
  projector,
  { mountHeight = 0 } = {},
) {
  const group = new T.Group();
  group.name = COMBAT_NAMES[device.type] + ' / ' + device.id;
  group.userData.deviceId = device.id;
  const color = DEVICE_COLORS[device.type];
  const dark = new T.MeshStandardMaterial({
    color: 0x182128,
    metalness: 0.7,
    roughness: 0.4,
  });
  const white = new T.MeshStandardMaterial({
    color: 0xdfe6e9,
    metalness: 0.3,
    roughness: 0.4,
  });
  const signal = new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.4,
    roughness: 0.35,
  });
  const cx = device.lateral,
    cy = device.distance;
  const x0 = cx - device.width / 2,
    x1 = cx + device.width / 2;
  const from = cy - device.length / 2,
    to = cy + device.length / 2;
  function road(shapes, height, material, skirt = null) {
    const mesh = new T.Mesh(
      projector.geometry(shapes, mountHeight + height, skirt),
      material,
    );
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  road([rect(x0 - 0.2, x1 + 0.2, from, to)], 0.07, dark, 0.003);
  road(
    [
      rect(x0, x0 + 0.22, from, to),
      rect(x1 - 0.22, x1, from, to),
      rect(x0, x1, from, from + 0.28),
      rect(x0, x1, to - 0.28, to),
    ],
    0.085,
    white,
  );
  const markings = [];
  if (device.type === 'repulsor') {
    for (const radius of [0.8, 1.7])
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2,
          b = ((i + 1) / 32) * Math.PI * 2;
        markings.push(
          stroke(
            [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius],
            [cx + Math.cos(b) * radius, cy + Math.sin(b) * radius],
            0.23,
          ),
        );
      }
    for (const side of [-1, 1])
      markings.push(
        stroke([cx, cy + side * 2.3], [cx, cy + side * 3.7], 0.32),
        stroke([cx, cy + side * 3.7], [cx - 0.65, cy + side * 3], 0.25),
        stroke([cx, cy + side * 3.7], [cx + 0.65, cy + side * 3], 0.25),
      );
  } else if (device.type === 'arc') {
    for (const offset of [-2.5, 0, 2.5])
      markings.push(
        stroke([cx - 1.5, cy + offset - 0.8], [cx, cy + offset + 0.8], 0.36),
        stroke([cx, cy + offset + 0.8], [cx + 1.5, cy + offset - 0.8], 0.36),
      );
  } else {
    for (const x of [-1.35, 0, 1.35]) {
      for (let i = 0; i < 8; i++) {
        const y = -3.4 + i * 0.85;
        markings.push(
          stroke(
            [cx + x + Math.sin(i * 0.9) * 0.25, cy + y],
            [cx + x + Math.sin((i + 1) * 0.9) * 0.25, cy + y + 0.85],
            0.3,
          ),
        );
      }
    }
  }
  road(markings, 0.095, signal);
  road(
    [
      rect(x0 + 0.5, x1 - 0.5, from - 9, from - 8.6),
      rect(x0 + 0.9, x1 - 0.9, from - 18, from - 17.6),
    ],
    0.025,
    signal,
  );
  const frame = track.sample(cy);
  for (const side of [-1, 1]) {
    const pedestal = new T.Mesh(new T.BoxGeometry(0.32, 1.45, 1.1), dark);
    pedestal.position
      .copy(projector.sample(cy, cx + side * (device.width / 2 + 0.28)))
      .addScaledVector(frame.up, mountHeight + 0.75);
    pedestal.quaternion.copy(frame.quaternion);
    group.add(pedestal);
    const lamp = new T.Mesh(new T.BoxGeometry(0.35, 0.65, 0.08), signal);
    lamp.position
      .copy(pedestal.position)
      .addScaledVector(frame.up, 0.25)
      .addScaledVector(frame.tangent, -0.57);
    lamp.quaternion.copy(frame.quaternion);
    group.add(lamp);
  }
  const edgeLight = createDeviceSignal(device, projector, mountHeight);
  group.add(edgeLight.mesh);
  let available = true;
  return {
    group,
    updateCamera() {},
    activate: edgeLight.activate,
    reset: edgeLight.reset,
    setAvailable(value) {
      available = value;
    },
    update({ reducedMotion = false, time = 0 } = {}) {
      edgeLight.update({ time, reducedMotion, available });
      signal.emissiveIntensity = available
        ? 2.2 + (reducedMotion ? 0.2 : 0.5 * Math.sin(time * 3))
        : 0.03;
      signal.color.setHex(available ? color : 0x49515b);
    },
  };
}

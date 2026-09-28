import * as THREE from 'three';
import {
  shell,
  skin,
  shellPoint,
  transformed,
  reflect,
  combine,
  pipe,
  axialTube,
  plate,
} from './geometry.js';
import { createMaterials } from './materials.js';

const PI = Math.PI;
const prowStations = [
  [-2.15, 1.31, 0.34, 0.48, 0.24, 0.18],
  [-1.68, 1.42, 0.6, 0.53, 0.31, 0.22],
  [-0.6, 1.49, 0.74, 0.53, 0.38, 0.21],
  [0.58, 1.42, 0.7, 0.48, 0.34, 0.2],
  [1.76, 1.21, 0.57, 0.37, 0.28, 0.17],
  [2.8, 0.98, 0.37, 0.26, 0.17, 0.11],
  [3.4, 0.83, 0.14, 0.2, 0.06, 0.045],
  [3.49, 0.82, 0.04, 0.195, 0.025, 0.022],
];

const chassisStations = [
  [-2.5, 0, 0.65, 0.43, 0.19, 0.22],
  [-2.08, 0, 1.53, 0.39, 0.24, 0.21],
  [-0.85, 0, 1.95, 0.4, 0.28, 0.24],
  [0.55, 0, 1.77, 0.34, 0.24, 0.2],
  [1.72, 0, 1.19, 0.28, 0.16, 0.15],
  [2.4, 0, 0.28, 0.23, 0.07, 0.07],
  [2.5, 0, 0.09, 0.23, 0.025, 0.03],
];

const canopyStations = [
  [-1.44, 0, 0.16, 0.69, 0.09, 0.07],
  [-1.12, 0, 0.45, 0.7, 0.4, 0.06],
  [-0.52, 0, 0.59, 0.68, 0.77, 0.05],
  [0.12, 0, 0.53, 0.65, 0.72, 0.05],
  [0.86, 0, 0.35, 0.56, 0.43, 0.04],
  [1.66, 0, 0.065, 0.45, 0.09, 0.03],
  [1.75, 0, 0.008, 0.43, 0.018, 0.015],
];

const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
  transformed(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const ring = (r, t, x, y, z) =>
  transformed(new THREE.TorusGeometry(r, t, 8, 48), x, y, z);
const disk = (r, x, y, z) =>
  transformed(new THREE.CircleGeometry(r, 40), x, y, z, 0, PI, 0);

/** Original Kestrel prototype. Local +Z nose, +Y roof; root y=0 is the hover
 * shoe datum. Core owns world movement. All animation stays below this root.
 * Reproducible showcase: update({speed:70,boost:false,steer:0,time:0,energy:1}). */
export function createShip() {
  const group = new THREE.Group();
  group.name = 'Kestrel / chassis 07';
  const materials = createMaterials(),
    bins = new Map();
  const rotors = [],
    shoes = [],
    plumes = [];
  const add = (key, geometry) => {
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(geometry);
  };
  const pair = (key, geometry) => {
    add(key, geometry);
    add(key, reflect(geometry));
  };
  const mesh = (geometry, material, parent = group, name = '') => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  add('graphite', shell(chassisStations, { sides: 40 }));
  // Exposed dark composite lower edge is a single continuous load-bearing tub.
  pair('lowerCeramic', shell(prowStations, { offset: -0.055, sides: 36 }));
  for (const [from, to] of [
    [-2.12, -0.56],
    [-0.515, 1.27],
    [1.315, 3.49],
  ]) {
    pair('ceramic', shell(prowStations, { from, to, sides: 40, steps: 35 }));
  }
  // Recessed elastomer expansion joints remain legible in the low chase view.
  // They seat below the ceramic edges rather than floating above the paint.
  for (const z of [-0.5375, 1.2925]) {
    pair(
      'recess',
      shell(prowStations, {
        from: z - 0.027,
        to: z + 0.027,
        offset: -0.014,
        sides: 40,
        steps: 2,
      }),
    );
  }
  pair('enamel', skin(prowStations, 1.4, 3.2, 0.38 * PI, 0.46 * PI, 0.013));
  pair('enamel', skin(prowStations, -1.88, -1.6, 0.16 * PI, 0.79 * PI, 0.014));
  pair('titanium', skin(prowStations, 2.62, 3.37, 1.02 * PI, 1.14 * PI, 0.014));
  // Thin flush black protection tape is interrupted with the real panel seams.
  for (const [from, to] of [
    [-1.45, -0.56],
    [-0.5, 1.26],
    [1.33, 2.58],
  ]) {
    pair(
      'graphite',
      skin(prowStations, from, to, 0.08 * PI, 0.095 * PI, 0.014),
    );
  }

  // Canopy gasket and metal frame have their own volume, so inspection reveals
  // where the smoked pressure shell seats inside the chassis.
  const gasket = canopyStations.map((s) => [
    s[0] - 0.012,
    s[1],
    s[2] + 0.05,
    s[3] - 0.025,
    Math.min(0.075, s[4]),
    s[5] + 0.045,
  ]);
  add('graphite', shell(gasket, { sides: 48, exponent: 1 }));
  add('glass', shell(canopyStations, { sides: 56, steps: 72, exponent: 1 }));
  for (const side of [-1, 1]) {
    const lowerRail = canopyStations
      .slice(0, -1)
      .map((s) => [side * (s[2] + 0.026), s[3] + 0.016, s[0]]);
    add('titanium', pipe(lowerRail, 0.018));
  }
  const rearArch = [];
  for (let i = 0; i <= 18; i++)
    rearArch.push(
      shellPoint(canopyStations, -1.02, (i / 18) * PI, 0.02, 1).toArray(),
    );
  add('graphite', pipe(rearArch, 0.031));
  // Narrow raised dorsal intake; low enough to preserve the canopy profile.
  const spine = [
    [-2.19, 0, 0.36, 0.6, 0.15, 0.06],
    [-1.7, 0, 0.4, 0.67, 0.18, 0.06],
    [-1.42, 0, 0.26, 0.69, 0.13, 0.05],
  ];
  add('ceramic', shell(spine, { sides: 24, steps: 22 }));
  add('recess', box(0.64, 0.045, 0.46, 0, 0.843, -1.76));
  for (let i = 0; i < 7; i++)
    add('titanium', box(0.56, 0.025, 0.026, 0, 0.872, -1.97 + i * 0.066, 0.18));

  // A recessed rear heat exchanger connects the two drive saddles. Its cast
  // surround, shadowed opening and projecting fins give the aft deck real depth.
  add('graphite', box(1.0, 0.34, 0.12, 0, 0.4, -2.5));
  add('recess', box(0.79, 0.23, 0.035, 0, 0.4, -2.574));
  for (let row = 0; row < 5; row++) {
    add('titanium', box(0.75, 0.018, 0.043, 0, 0.306 + row * 0.047, -2.596));
  }
  for (const x of [-0.46, 0.46]) {
    add('titanium', box(0.035, 0.24, 0.035, x, 0.4, -2.576));
    add('enamel', box(0.052, 0.07, 0.014, x, 0.445, -2.602));
  }

  for (const side of [-1, 1]) {
    const x = side * 1.1;
    // Structural saddles, two hose runs and a fixed hot core sit between the
    // cowl and replaceable exhaust ring. Open bores retain actual depth.
    add('graphite', axialTube(x, 0.5, -2.62, 0.52, 0.12, 1.07));
    add('heat', axialTube(x, 0.5, -3.14, 0.435, 0.042, 0.91));
    add('titanium', axialTube(x, 0.5, -3.42, 0.5, 0.056, 0.31));
    add('graphite', ring(0.514, 0.026, x, 0.5, -3.11));
    // Replaceable dark throat liner sits behind the machined nozzle lip; a
    // secondary retaining ring separates hot metal from the structural saddle.
    add('recess', axialTube(x, 0.5, -3.4, 0.437, 0.018, 0.2, 12));
    add(
      'heat',
      transformed(new THREE.TorusGeometry(0.494, 0.018, 4, 32), x, 0.5, -3.28),
    );
    add('recess', disk(0.39, x, 0.5, -2.94));
    add('power', ring(0.285, 0.031, x, 0.5, -3.01));
    add(
      'heat',
      transformed(
        new THREE.ConeGeometry(0.14, 0.18, 24),
        x,
        0.5,
        -3.08,
        -PI / 2,
      ),
    );
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * PI * 2;
      const gx = x + Math.cos(a) * 0.48,
        gy = 0.5 + Math.sin(a) * 0.48;
      add('heat', box(0.025, 0.035, 0.4, gx, gy, -2.9, 0, 0, a));
      add(
        'titanium',
        transformed(
          new THREE.CylinderGeometry(0.019, 0.021, 0.024, 6),
          x + Math.cos(a) * 0.472,
          0.5 + Math.sin(a) * 0.472,
          -3.446,
          PI / 2,
        ),
      );
    }
    const rotor = new THREE.Group();
    rotor.position.set(x, 0.5, -2.995);
    group.add(rotor);
    rotors.push(rotor);
    const blades = [];
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * PI * 2;
      blades.push(
        box(
          0.19,
          0.043,
          0.026,
          Math.cos(a) * 0.215,
          Math.sin(a) * 0.215,
          0,
          0,
          0.42,
          a + 0.42,
        ),
      );
    }
    mesh(
      combine(blades),
      materials.titanium,
      rotor,
      'Impeller / balanced titanium',
    );
    // Two nested open ion volumes share one draw: a narrow moving core and a
    // transparent compression envelope. Both start inside the real nozzle;
    // neither uses an opaque camera-facing disc.
    // Compression lives in the light field. A smoothly narrowing boundary
    // avoids turning the transparent volume into a stack of pointed shards.
    const jetProfile = Array.from({ length: 13 }, (_, step) => {
      const aft = step / 12;
      const radius = 0.235 * (1 - aft) * (1 - 0.16 * Math.sin(PI * aft));
      return new THREE.Vector2(Math.max(0.001, radius), aft);
    });
    const envelope = new THREE.LatheGeometry(jetProfile, 24);
    envelope.rotateX(-PI / 2);
    const core = envelope.clone();
    core.scale(0.38, 0.38, 0.92);
    // UV.y>=2 marks the inner layer without another material or draw call.
    for (let vertex = 0; vertex < core.attributes.uv.count; vertex++) {
      core.attributes.uv.setY(vertex, core.attributes.uv.getY(vertex) + 2);
    }
    const plumeGeo = combine([envelope, core]);
    const plume = mesh(plumeGeo, materials.plume, group, 'Ion exhaust');
    plume.position.set(x, 0.5, -3.2);
    plume.castShadow = false;
    plume.receiveShadow = false;
    plumes.push(plume);

    add(
      'titanium',
      pipe(
        [
          [side * 0.65, 0.46, -1.51],
          [side * 0.73, 0.68, -1.91],
          [side * 0.79, 0.67, -2.61],
        ],
        0.048,
      ),
    );
    add(
      'enamel',
      pipe(
        [
          [side * 0.76, 0.45, -1.59],
          [side * 0.85, 0.61, -1.94],
          [side * 0.88, 0.6, -2.46],
        ],
        0.023,
      ),
    );

    // Upper service grille inset between ceramic coaming strips. Individual
    // slats cast shadows and expose the dark throat at low inspection angles.
    const ventX = side * 1.69;
    add(
      'recess',
      transformed(
        plate(
          [
            [-0.18, -0.48],
            [0.18, -0.39],
            [0.18, 0.37],
            [-0.18, 0.49],
          ],
          0.023,
          0.025,
        ),
        ventX,
        0.899,
        -0.53,
      ),
    );
    for (let j = 0; j < 9; j++)
      add(
        'titanium',
        box(0.29, 0.026, 0.032, ventX, 0.946, -0.9 + j * 0.094, -0.22),
      );
    for (const z of [-0.9, -0.2])
      for (const dx of [-0.19, 0.19]) {
        add(
          'graphite',
          transformed(
            new THREE.CylinderGeometry(0.022, 0.022, 0.014, 6),
            ventX + dx,
            0.935,
            z,
          ),
        );
      }

    // Four independent suspension pivots. The magnetic shoes are flattened
    // fairings with machined undersides, not landing wheels or aircraft fins.
    for (const z of [-1.72, 1.52]) {
      const sx = side * (z > 0 ? 1.32 : 1.71);
      add(
        'titanium',
        pipe(
          [
            [sx - side * 0.19, 0.38, z - 0.13],
            [sx, 0.16, z],
            [sx, 0.07, z + 0.12],
          ],
          0.075,
        ),
      );
      add(
        'graphite',
        transformed(
          new THREE.CylinderGeometry(0.12, 0.12, 0.22, 16),
          sx,
          0.12,
          z,
          0,
          0,
          PI / 2,
        ),
      );
      const shoe = new THREE.Group();
      shoe.position.set(sx, 0, z);
      group.add(shoe);
      shoes.push({ group: shoe, side, z });
      const shoeProfile = [
        [-0.66, 0, 0.14, 0.03, 0.06, 0.035],
        [-0.46, 0, 0.29, 0.02, 0.12, 0.08],
        [0.35, 0, 0.27, 0.01, 0.1, 0.065],
        [0.65, 0, 0.1, 0.01, 0.035, 0.025],
      ];
      mesh(
        shell(shoeProfile, { sides: 24, steps: 28 }),
        materials.graphite,
        shoe,
        'Magnetic shoe fairing',
      );
      const underside = shell(
        shoeProfile.map((s) => [
          s[0] * 0.89,
          0,
          s[2] * 0.83,
          s[3] - 0.077,
          s[4] * 0.13,
          s[5] * 0.2,
        ]),
        { sides: 20, steps: 24 },
      );
      mesh(underside, materials.titanium, shoe, 'Laminated field plate');
      const powerRail = pipe(
        [
          [-0.18, -0.07, -0.43],
          [-0.22, -0.086, 0],
          [-0.17, -0.06, 0.39],
        ],
        0.017,
      );
      const oppositeRail = reflect(powerRail);
      mesh(
        combine([powerRail, oppositeRail]),
        materials.power,
        shoe,
        'Field coils',
      );
    }
  }

  // Restrained flush captive fasteners along the shaped upper panels.
  for (const z of [-1.45, -0.78, -0.34, 0.6, 1.04, 1.65, 2.28]) {
    for (const a of [0.2 * PI, 0.79 * PI]) {
      const p = shellPoint(prowStations, z, a, 0.015);
      pair(
        'titanium',
        transformed(
          new THREE.CylinderGeometry(0.021, 0.019, 0.012, 6),
          p.x,
          p.y,
          p.z,
          0,
          0,
          a - PI / 2,
        ),
      );
    }
  }
  // Chassis ID is cut from geometry, making it legible without a downloaded
  // typeface or a texture dependency. Two compact stencil numerals on the nose.
  const numeral0 = [
    [
      [0, 0],
      [0.06, 0],
      [0.06, 0.36],
      [0, 0.36],
    ],
    [
      [0.19, 0],
      [0.25, 0],
      [0.25, 0.36],
      [0.19, 0.36],
    ],
    [
      [0.04, 0],
      [0.21, 0],
      [0.21, 0.055],
      [0.04, 0.055],
    ],
    [
      [0.04, 0.305],
      [0.21, 0.305],
      [0.21, 0.36],
      [0.04, 0.36],
    ],
  ];
  for (const outline of numeral0)
    add(
      'graphite',
      transformed(plate(outline, 0.002, 0.001), 0.96, 0.659, 1.91, 0.105, 0, 0),
    );
  add(
    'graphite',
    transformed(
      plate(
        [
          [0, 0.305],
          [0.26, 0.305],
          [0.26, 0.36],
          [0, 0.36],
        ],
        0.002,
        0.001,
      ),
      1.29,
      0.645,
      1.91,
      0.105,
      0,
      0,
    ),
  );
  add(
    'graphite',
    transformed(
      plate(
        [
          [0.055, 0],
          [0.12, 0],
          [0.26, 0.33],
          [0.2, 0.33],
        ],
        0.002,
        0.001,
      ),
      1.29,
      0.645,
      1.91,
      0.105,
      0,
      0,
    ),
  );

  for (const [key, parts] of bins)
    mesh(
      combine(parts),
      materials[key],
      group,
      `${key} / consolidated surfaces`,
    );
  group.userData = {
    asset: 'Kestrel',
    provenance: 'Original procedural geometry; no external assets',
    dimensionsMetres: { width: 4.47, length: 6.94, height: 1.58 },
    forward: '+Z',
    hoverDatum: 0,
    showcase: { speed: 70, boost: false, steer: 0, time: 0, energy: 1 },
  };

  let disposed = false;
  function update({
    speed = 0,
    boost = false,
    steer = 0,
    time = 0,
    energy = 1,
  } = {}) {
    if (disposed) return;
    const velocity = Math.min(
      1,
      Math.max(0, Number.isFinite(speed) ? speed / 150 : 0),
    );
    const turning = THREE.MathUtils.clamp(
      Number.isFinite(steer) ? steer : 0,
      -1,
      1,
    );
    const t = Number.isFinite(time) ? time : 0;
    const reserve = THREE.MathUtils.clamp(
      Number.isFinite(energy) ? energy : 1,
      0,
      1,
    );
    const activeBoost = boost && reserve > 0;
    for (let i = 0; i < rotors.length; i++)
      rotors[i].rotation.z = t * (8 + velocity * 35) * (i ? -1 : 1);
    for (const shoe of shoes) {
      shoe.group.rotation.z = turning * 0.055;
      shoe.group.rotation.y = turning * (shoe.z > 0 ? 0.09 : -0.025);
      shoe.group.position.y =
        Math.sin(t * 7 + shoe.z + shoe.side) * 0.008 * velocity;
    }
    materials.power.emissiveIntensity =
      1.1 + velocity * 1.1 + (activeBoost ? 1.2 : 0);
    materials.plume.uniforms.strength.value =
      0.035 + velocity * 0.13 + (activeBoost ? 0.28 : 0);
    materials.plume.uniforms.flowTime.value = t;
    materials.plume.uniforms.boostMix.value = activeBoost ? 1 : 0;
    materials.plume.uniforms.glowColor.value.setHex(
      activeBoost ? 0x59d6ef : 0x339fcb,
    );
    for (let i = 0; i < plumes.length; i++) {
      const pulse = 1 + Math.sin(t * 17 + i * 2) * 0.008;
      const width = (activeBoost ? 1.02 : 0.73 + velocity * 0.19) * pulse;
      plumes[i].scale.set(
        width,
        width,
        (0.12 + velocity * 0.68 + (activeBoost ? 1.48 : 0)) * pulse,
      );
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    group.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
    });
    geometries.forEach((g) => g.dispose());
    Object.values(materials).forEach((m) => m.dispose());
    group.removeFromParent();
    group.clear();
  }
  update();
  return { group, update, dispose };
}

import * as THREE from 'three';
import { POND } from '../world/pondDefinition.js';

function fin(points, color) {
  const shape = new THREE.Shape(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.65,
    }),
  );
}
export function createTrout() {
  const group = new THREE.Group();
  const profile = [
    [-0.36, 0.005],
    [-0.28, 0.035],
    [-0.21, 0.073],
    [-0.1, 0.103],
    [0.04, 0.105],
    [0.16, 0.08],
    [0.25, 0.065],
    [0.32, 0.032],
    [0.345, 0.006],
  ];
  const points = [],
    colors = [],
    indices = [];
  for (let i = 0; i < profile.length; i++)
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * Math.PI * 2,
        [x, r] = profile[i];
      points.push(x, Math.cos(a) * r, Math.sin(a) * r * 0.64);
      const c = new THREE.Color()
        .setRGB(0.3, 0.36, 0.22)
        .lerp(new THREE.Color('#c6ad72'), Math.max(0, 0.4 - Math.cos(a) * 0.7));
      if (Math.cos(a) < -0.35) c.lerp(new THREE.Color('#ce8152'), 0.65);
      colors.push(c.r, c.g, c.b);
      if (i < profile.length - 1 && j < 24) {
        const n = i * 25 + j;
        indices.push(n, n + 1, n + 25, n + 1, n + 26, n + 25);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.12,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 fishPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfishPosition = position;',
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 fishPosition;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 cell = fishPosition.xy * vec2(85.,100.);
      vec2 id = floor(cell); float h = fract(sin(dot(id,vec2(31.71,74.17)))*4134.7);
      float spot = 1.-smoothstep(.14,.25,length(fract(cell)-.5));
      float marks = spot * step(.6,h) * step(-.045,fishPosition.y);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.88,.77,.46),marks*.85);
      float red = spot * step(.86,h) * step(abs(fishPosition.y),.055);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.72,.17,.09),red);
    `,
    );
  };
  const body = new THREE.Mesh(geometry, material);
  group.add(body);
  const tail = fin(
    [
      [-0.28, 0],
      [-0.48, 0.112],
      [-0.445, 0],
      [-0.48, -0.1],
    ],
    '#94763e',
  );
  group.add(tail);
  group.userData.tail = tail;
  const dorsal = fin(
    [
      [-0.16, 0.078],
      [-0.11, 0.184],
      [0.035, 0.15],
      [0.09, 0.092],
    ],
    '#827844',
  );
  group.add(dorsal);
  const bottom = fin(
    [
      [0.09, -0.068],
      [0.01, -0.164],
      [-0.045, -0.147],
      [-0.035, -0.092],
    ],
    '#c58a4e',
  );
  group.add(bottom);
  for (const side of [-1, 1]) {
    const pectoral = fin(
      [
        [0.15, -0.015],
        [0.045, -0.108],
        [0.005, -0.07],
      ],
      '#b78d5a',
    );
    pectoral.position.z = side * 0.047;
    pectoral.rotation.x = side * 0.45;
    group.add(pectoral);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#c2b46d', roughness: 0.3 }),
    );
    eye.position.set(0.255, 0.025, side * 0.043);
    group.add(eye);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#101b17', roughness: 0.15 }),
    );
    pupil.position.set(0.26, 0.027, side * 0.057);
    group.add(pupil);
    const gill = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.205, 0.052, side * 0.05),
        new THREE.Vector3(0.174, 0.016, side * 0.053),
        new THREE.Vector3(0.2, -0.045, side * 0.05),
      ]),
      new THREE.LineBasicMaterial({ color: '#514c35' }),
    );
    group.add(gill);
  }
  return group;
}

export class Tackle {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rig = new THREE.Group();
    camera.add(this.rig);
    scene.add(camera);
    const rodMat = new THREE.MeshStandardMaterial({
      color: '#382b1d',
      roughness: 0.4,
    });
    this.rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.014, 1.95, 9),
      rodMat,
    );
    this.rod.geometry.translate(0, 0.975, 0);
    this.rod.rotation.x = -1.12;
    this.rod.position.set(0.34, -0.46, -0.48);
    this.rig.add(this.rod);
    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.023, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: '#b59a69', roughness: 0.95 }),
    );
    cork.position.y = 0.13;
    this.rod.add(cork);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.012 + i * 0.001, 0.002, 5, 10),
        new THREE.MeshStandardMaterial({
          color: '#b6b9a3',
          metalness: 0.85,
          roughness: 0.25,
        }),
      );
      ring.position.set(0, 0.39 + i * 0.29, -0.02);
      this.rod.add(ring);
    }
    this.reel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.048, 24),
      new THREE.MeshStandardMaterial({
        color: '#374640',
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    this.reel.rotation.x = Math.PI / 2;
    this.reel.position.set(0, 0.08, 0.06);
    this.rod.add(this.reel);
    const spool = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.007, 6, 24),
      new THREE.MeshStandardMaterial({
        color: '#c8ba84',
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    spool.position.z = 0.026;
    spool.rotation.x = Math.PI / 2;
    this.reel.add(spool);
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 25 }, () => new THREE.Vector3()),
      ),
      new THREE.LineBasicMaterial({
        color: '#e2dec1',
        transparent: true,
        opacity: 0.67,
      }),
    );
    this.line.frustumCulled = false;
    this.group.add(this.line);
    this.float = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({
      color: '#e36a42',
      roughness: 0.5,
    });
    const white = new THREE.MeshStandardMaterial({
      color: '#efe9cf',
      roughness: 0.4,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 10), red);
    bulb.scale.set(1, 1.65, 1);
    this.float.add(bulb);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.036, 0.19, 9),
      white,
    );
    top.position.y = 0.1;
    this.float.add(top);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.29, 6),
      red,
    );
    stem.position.y = 0.19;
    this.float.add(stem);
    this.group.add(this.float);
    this.ripples = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 64),
        new THREE.MeshBasicMaterial({
          color: '#c6d6bb',
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.group.add(ring);
      this.ripples.push(ring);
    }
    this.fish = createTrout();
    this.group.add(this.fish);
    this.target = new THREE.Vector3(0, POND.level, 0);
    this.tip = new THREE.Vector3();
    this.clock = 0;
  }
  update(dt, rules, active, reeling) {
    this.clock += dt;
    const t = this.clock,
      phase = rules.phase;
    this.rig.visible = active;
    this.rod.rotation.x =
      -1.12 +
      (phase === 'charging' ? rules.power * 0.45 : 0) +
      (phase === 'fight'
        ? Math.sin(t * 3) * 0.025 + rules.tension * 0.19
        : Math.sin(t * 0.8) * 0.008);
    if (reeling) this.reel.rotation.y += dt * 7;
    this.rod.updateWorldMatrix(true, false);
    this.tip.set(0, 1.95, 0).applyMatrix4(this.rod.matrixWorld);
    const inWater =
      ['casting', 'waiting', 'bite', 'fight'].includes(phase) && active;
    this.float.visible = this.line.visible = inWater;
    this.float.position.copy(this.target);
    if (phase === 'casting') {
      const a = Math.min(1, rules.timer);
      this.float.position.lerpVectors(this.tip, this.target, a);
      this.float.position.y += Math.sin(a * Math.PI) * 2.4;
    } else {
      this.float.position.y = POND.level + 0.07 + Math.sin(t * 3) * 0.025;
      if (phase === 'bite')
        this.float.position.y += Math.sin(t * 18) * 0.16 - 0.1;
    }
    if (phase === 'fight') {
      this.float.position.lerp(this.camera.position, rules.progress * 0.7);
      this.float.position.y = POND.level + 0.06;
      this.float.position.x += Math.sin(t * 2) * 0.5 * (1 - rules.progress);
    }
    const positions = this.line.geometry.attributes.position;
    for (let i = 0; i < 25; i++) {
      const a = i / 24;
      const point = new THREE.Vector3().lerpVectors(
        this.tip,
        this.float.position,
        a,
      );
      point.y -= Math.sin(a * Math.PI) * (phase === 'fight' ? 0.08 : 0.32);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    this.ripples.forEach((ring, i) => {
      const pulse = (t * (phase === 'bite' ? 1.2 : 0.4) + i / 3) % 1;
      ring.visible = inWater && phase !== 'casting';
      ring.position.set(
        this.float.position.x,
        POND.level + 0.03,
        this.float.position.z,
      );
      ring.scale.setScalar(0.1 + pulse * (phase === 'fight' ? 1.6 : 0.85));
      ring.material.opacity = (1 - pulse) * 0.28;
    });
    this.fish.visible =
      active &&
      (phase === 'landed' || (phase === 'fight' && rules.progress > 0.6));
    if (phase === 'landed') {
      this.fish.position
        .set(-0.26, -0.04, -1.1)
        .applyMatrix4(this.camera.matrixWorld);
      this.fish.quaternion.copy(this.camera.quaternion);
      this.fish.rotateY(-0.12);
      this.fish.rotateZ(Math.sin(t * 1.8) * 0.015);
    } else {
      this.fish.position.copy(this.float.position);
      this.fish.position.y = POND.level - 0.035 + Math.sin(t * 5) * 0.07;
      this.fish.rotation.set(0.15, Math.sin(t * 2) * 0.5, 0);
    }
    this.fish.userData.tail.rotation.y =
      Math.sin(t * (phase === 'landed' ? 3 : 10)) * 0.16;
  }
  dispose() {
    this.scene.remove(this.group);
    this.camera.remove(this.rig);
    const resources = new Set();
    for (const root of [this.group, this.rig])
      root.traverse((o) => {
        if (o.geometry) resources.add(o.geometry);
        if (o.material) resources.add(o.material);
      });
    resources.forEach((r) => r.dispose());
  }
}

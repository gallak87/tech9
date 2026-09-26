import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Authored mesh aircraft. Nose is -Z; the controller owns the root transform. */
export class AircraftVisual {
  constructor(type = 'trainer') {
    this.type = type;
    this.group = new THREE.Group();
    this.group.name =
      type === 'trainer' ? 'High-wing trainer' : 'Low-wing sport';
    this.exterior = new THREE.Group();
    this.cockpit = new THREE.Group();
    this.group.add(this.exterior, this.cockpit);
    this.cockpit.visible = false;
    this.resources = new Set();
    this.ailerons = [];
    this.elevators = [];
    this.propAngle = 0;
    const sport = type !== 'trainer';
    const keep = (resource) => {
      this.resources.add(resource);
      return resource;
    };
    const surface = (color, options = {}) =>
      keep(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.4,
          metalness: 0.15,
          ...options,
        }),
      );
    const paint = surface(sport ? '#17656b' : '#eee7ce');
    const accent = surface(sport ? '#eab85b' : '#a94335');
    const dark = surface('#283634', { roughness: 0.8, metalness: 0.05 });
    const chrome = surface('#a7b8b3', { roughness: 0.27, metalness: 0.75 });
    const rubber = surface('#242727', { roughness: 0.95, metalness: 0 });
    const glass = surface('#5e949a', {
      transparent: true,
      opacity: 0.72,
      metalness: 0.3,
      roughness: 0.16,
      side: THREE.DoubleSide,
    });
    const mesh = (geometry, material, parent = this.exterior) => {
      keep(geometry);
      const object = new THREE.Mesh(geometry, material);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const sphere = (
      radius,
      scale,
      position,
      material,
      parent = this.exterior,
    ) => {
      const object = mesh(
        new THREE.SphereGeometry(radius, 20, 12),
        material,
        parent,
      );
      object.scale.set(...scale);
      object.position.set(...position);
      return object;
    };
    const box = (size, position, material, parent = this.exterior) => {
      const object = mesh(new THREE.BoxGeometry(...size), material, parent);
      object.position.set(...position);
      return object;
    };
    const rod = (from, to, radius, material, parent = this.exterior) => {
      const a = new THREE.Vector3(...from),
        b = new THREE.Vector3(...to),
        delta = b.clone().sub(a);
      const object = mesh(
        new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
        material,
        parent,
      );
      object.position.copy(a.add(b).multiplyScalar(0.5));
      object.quaternion.setFromUnitVectors(UP, delta.normalize());
      return object;
    };
    const sections = sport
      ? [
          [-3.3, 0.23, 0.27, -0.06],
          [-2.9, 0.4, 0.42, 0],
          [-1.3, 0.48, 0.47, 0],
          [0.3, 0.44, 0.4, 0],
          [1.6, 0.3, 0.27, 0.07],
          [3.5, 0.085, 0.11, 0.25],
        ]
      : [
          [-3.4, 0.27, 0.29, -0.08],
          [-3.05, 0.5, 0.45, -0.04],
          [-1.4, 0.6, 0.58, 0.02],
          [0.4, 0.59, 0.52, 0.02],
          [1.4, 0.39, 0.37, 0.03],
          [3.6, 0.12, 0.16, 0.3],
          [4.0, 0.04, 0.08, 0.32],
        ];
    const fuselage = new THREE.BufferGeometry(),
      vertices = [],
      indices = [];
    const radial = 20;
    for (const [z, width, height, lift] of sections)
      for (let j = 0; j <= radial; j++) {
        const angle = (j / radial) * TAU;
        vertices.push(
          Math.cos(angle) * width,
          Math.sin(angle) * height + lift,
          z,
        );
      }
    for (let ring = 0; ring < sections.length - 1; ring++)
      for (let j = 0; j < radial; j++) {
        const a = ring * (radial + 1) + j,
          b = a + radial + 1;
        const start = indices.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
        const angle = ((j + 0.5) / radial) * TAU;
        fuselage.addGroup(start, 6, Math.abs(Math.sin(angle)) < 0.33 ? 1 : 0);
      }
    fuselage.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    fuselage.setIndex(indices);
    fuselage.computeVertexNormals();
    mesh(fuselage, [paint, accent]);
    // Short cowling seams and dark side cooling vents give the nose mechanical scale.
    for (const side of [-1, 1]) {
      for (let vent = 0; vent < 4; vent++)
        box(
          [0.022, 0.17, 0.08],
          [side * (sport ? 0.405 : 0.51), 0.02, -2.75 + vent * 0.16],
          dark,
        );
      rod([side * 0.18, -0.3, -2.8], [side * 0.2, -0.5, -2.95], 0.055, dark);
    }
    // Cabin glazing: the trainer has a framed cabin, the sport a flowing bubble canopy.
    if (sport) {
      sphere(1, [0.46, 0.57, 1.05], [0, 0.45, -0.15], glass);
      const frame = mesh(
        new THREE.TorusGeometry(0.49, 0.025, 6, 28, Math.PI),
        chrome,
      );
      frame.position.set(0, 0.43, 0.63);
      frame.scale.y = 1.08;
      rod([-0.43, 0.45, -0.9], [-0.43, 0.45, 0.65], 0.025, chrome);
      rod([0.43, 0.45, -0.9], [0.43, 0.45, 0.65], 0.025, chrome);
    } else {
      const cabinVertices = [
        -0.52, 0.39, -1.3, 0.52, 0.39, -1.3, -0.44, 1.13, -0.79, 0.44, 1.13,
        -0.79, -0.53, 0.43, 0.71, 0.53, 0.43, 0.71, -0.44, 1.13, 0.51, 0.44,
        1.13, 0.51,
      ];
      const cabin = new THREE.BufferGeometry();
      cabin.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(cabinVertices, 3),
      );
      cabin.setIndex([
        0, 1, 2, 1, 3, 2, 0, 2, 4, 2, 6, 4, 1, 5, 3, 3, 5, 7, 4, 6, 5, 6, 7, 5,
      ]);
      cabin.computeVertexNormals();
      mesh(cabin, glass);
      for (const side of [-1, 1]) {
        rod(
          [side * 0.52, 0.39, -1.3],
          [side * 0.44, 1.13, -0.79],
          0.035,
          paint,
        );
        rod([side * 0.53, 0.43, 0.71], [side * 0.44, 1.13, 0.51], 0.038, paint);
        rod([side * 0.55, 0.44, -0.1], [side * 0.44, 1.13, -0.1], 0.03, paint);
        rod([side * 0.54, 0.39, -1.3], [side * 0.55, 0.43, 0.71], 0.024, paint);
        box([0.024, 0.035, 0.17], [side * 0.6, 0.22, 0.22], chrome);
      }
      rod([0, 0.39, -1.3], [0, 1.13, -0.79], 0.027, paint);
    }
    // A rounded airfoil section closes at the trailing edge; span stations taper the wing.
    const airfoil = (
      from,
      to,
      chordA,
      chordB,
      y,
      sweep,
      surface,
      parent = this.exterior,
      dihedral = 0,
    ) => {
      const profile = [
        [0, 0],
        [0.045, 0.038],
        [0.16, 0.065],
        [0.4, 0.057],
        [0.7, 0.03],
        [1, 0.002],
        [0.7, -0.014],
        [0.4, -0.022],
        [0.16, -0.022],
        [0.045, -0.014],
      ];
      const v = [],
        ix = [],
        count = profile.length;
      for (const [x, chord] of [
        [from, chordA],
        [to, chordB],
      ])
        for (const [p, thickness] of profile)
          v.push(
            x,
            y + thickness * chord + Math.abs(x) * dihedral,
            (p - 0.5) * chord + Math.abs(x) * sweep,
          );
      for (let j = 0; j < count; j++) {
        const next = (j + 1) % count;
        ix.push(j, next, j + count, next, next + count, j + count);
      }
      for (let j = 1; j < count - 1; j++) {
        ix.push(0, j + 1, j, count, count + j, count + j + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geometry.setIndex(ix);
      geometry.computeVertexNormals();
      const result = mesh(geometry, surface, parent);
      result.material.side = THREE.DoubleSide;
      return result;
    };
    const halfSpan = sport ? 4.65 : 5.9,
      wingY = sport ? -0.12 : 1.22,
      wingZ = sport ? -0.32 : -0.55;
    for (const side of [-1, 1]) {
      const wing = airfoil(
        0,
        side * halfSpan * 0.85,
        sport ? 1.85 : 1.8,
        sport ? 1.25 : 1.48,
        wingY,
        sport ? 0.12 : 0.025,
        paint,
        this.exterior,
        sport ? 0.038 : 0.018,
      );
      wing.position.z = wingZ;
      const tip = airfoil(
        side * halfSpan * 0.85,
        side * halfSpan,
        sport ? 1.25 : 1.48,
        sport ? 0.94 : 1.33,
        wingY,
        sport ? 0.12 : 0.025,
        accent,
        this.exterior,
        sport ? 0.038 : 0.018,
      );
      tip.position.z = wingZ;
      const aileron = new THREE.Group();
      aileron.position.set(
        side * halfSpan * 0.69,
        wingY + halfSpan * (sport ? 0.028 : 0.012),
        wingZ + (sport ? 0.96 : 0.78),
      );
      this.exterior.add(aileron);
      airfoil(-0.84, 0.84, 0.29, 0.28, 0, 0, accent, aileron);
      this.ailerons.push(aileron);
      if (!sport)
        rod(
          [side * 0.45, -0.32, -0.14],
          [side * 3.7, 1.23, -0.54],
          0.043,
          chrome,
        );
      const tail = airfoil(
        0,
        side * (sport ? 1.68 : 1.92),
        1.18,
        0.64,
        0.39,
        0.12,
        paint,
      );
      tail.position.z = sport ? 2.96 : 3.2;
      const elevator = new THREE.Group();
      elevator.position.set(side * 1.0, 0.42, sport ? 3.5 : 3.75);
      this.exterior.add(elevator);
      airfoil(-0.82, 0.82, 0.28, 0.22, 0, 0, accent, elevator);
      this.elevators.push(elevator);
      const navigation = surface(side < 0 ? '#c9362f' : '#43a286', {
        emissive: side < 0 ? '#a3150c' : '#087a4b',
        emissiveIntensity: 0.75,
      });
      sphere(
        0.062,
        [1, 0.6, 1.8],
        [side * halfSpan, wingY + 0.12, wingZ + 0.18],
        navigation,
      );
    }
    const tailShape = new THREE.Shape();
    tailShape.moveTo(-0.58, 0);
    tailShape.lineTo(0.4, 1.78);
    tailShape.quadraticCurveTo(0.64, 1.92, 0.87, 1.78);
    tailShape.lineTo(1.08, 0);
    tailShape.closePath();
    const fin = mesh(
      new THREE.ExtrudeGeometry(tailShape, {
        depth: 0.075,
        bevelEnabled: true,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        bevelSegments: 1,
        steps: 1,
      }),
      paint,
    );
    fin.rotation.y = -Math.PI / 2;
    fin.position.set(0.038, 0.3, sport ? 2.58 : 2.95);
    this.rudder = new THREE.Group();
    this.rudder.position.set(0, 0.33, sport ? 3.45 : 3.82);
    this.exterior.add(this.rudder);
    const rudderShape = new THREE.Shape();
    rudderShape.moveTo(0, 0);
    rudderShape.lineTo(-0.08, 1.64);
    rudderShape.lineTo(0.25, 1.4);
    rudderShape.lineTo(0.32, 0);
    rudderShape.closePath();
    const rudderMesh = mesh(
      new THREE.ExtrudeGeometry(rudderShape, {
        depth: 0.065,
        bevelEnabled: false,
      }),
      accent,
      this.rudder,
    );
    rudderMesh.rotation.y = -Math.PI / 2;
    rudderMesh.position.x = 0.032;
    // Fixed tricycle gear. Lowest tire point is the simulation's declared rest offset.
    const rest = sport ? 1.15 : 1.35,
      wheelRadius = sport ? 0.28 : 0.34;
    const wheel = (x, z, front = false) => {
      const y = -rest + wheelRadius;
      rod(
        [x * 0.3, -0.3, front ? z + 0.18 : z - 0.3],
        [x, y, z],
        front ? 0.055 : 0.065,
        chrome,
      );
      const tire = mesh(
        new THREE.TorusGeometry(wheelRadius * 0.72, wheelRadius * 0.28, 8, 20),
        rubber,
      );
      tire.rotation.y = Math.PI / 2;
      tire.position.set(x, y, z);
      const hub = mesh(
        new THREE.CylinderGeometry(
          wheelRadius * 0.45,
          wheelRadius * 0.45,
          wheelRadius * 0.42,
          16,
        ),
        chrome,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, y, z);
      if (sport && !front)
        sphere(1, [0.18, 0.28, 0.46], [x, y + 0.15, z], paint);
    };
    wheel(sport ? -1.2 : -1.35, 0.43);
    wheel(sport ? 1.2 : 1.35, 0.43);
    wheel(0, -2.15, true);
    this.propeller = new THREE.Group();
    this.propeller.position.set(0, -0.04, sport ? -3.43 : -3.55);
    this.exterior.add(this.propeller);
    const spinner = mesh(
      new THREE.ConeGeometry(sport ? 0.24 : 0.27, 0.53, 20),
      accent,
      this.propeller,
    );
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = -0.16;
    for (let blade = 0; blade < (sport ? 3 : 2); blade++) {
      const bladeRoot = new THREE.Group();
      bladeRoot.rotation.z = (blade / (sport ? 3 : 2)) * TAU;
      this.propeller.add(bladeRoot);
      sphere(
        1,
        [0.105, sport ? 0.54 : 0.6, 0.026],
        [0, sport ? 0.56 : 0.63, 0.03],
        dark,
        bladeRoot,
      );
      box(
        [0.17, 0.16, 0.045],
        [0, sport ? 1.02 : 1.14, 0.035],
        accent,
        bladeRoot,
      );
    }
    this.propDisc = mesh(
      new THREE.CircleGeometry(sport ? 1.1 : 1.24, 48),
      keep(
        new THREE.MeshBasicMaterial({
          color: '#b4b1a1',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
      this.exterior,
    );
    this.propDisc.position.copy(this.propeller.position);
    this.propDisc.position.z += 0.02;
    // Registration and fin graphics are rasterized locally, without external art dependencies.
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = sport ? '#efc475' : '#762f29';
      ctx.font = 'bold 83px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sport ? 'FF–02' : 'FF–01', 256, 94);
      const texture = keep(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      const decal = keep(
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      for (const side of [-1, 1]) {
        const label = mesh(new THREE.PlaneGeometry(1.36, 0.34), decal);
        label.position.set(side * (sport ? 0.31 : 0.39), 0.16, 1.4);
        label.rotation.y = (side * Math.PI) / 2;
      }
      const instruments = document.createElement('canvas');
      instruments.width = 1024;
      instruments.height = 512;
      const panel = instruments.getContext('2d');
      panel.fillStyle = '#252e2c';
      panel.fillRect(0, 0, 1024, 512);
      for (const [i, title] of ['AIRSPEED', 'ATTITUDE', 'ALTITUDE'].entries()) {
        const cx = 196 + i * 312,
          cy = 248;
        panel.fillStyle = '#64716c';
        panel.beginPath();
        panel.arc(cx, cy, 130, 0, TAU);
        panel.fill();
        panel.fillStyle = '#131d1c';
        panel.beginPath();
        panel.arc(cx, cy, 121, 0, TAU);
        panel.fill();
        if (i === 1) {
          panel.save();
          panel.beginPath();
          panel.arc(cx, cy, 108, 0, TAU);
          panel.clip();
          panel.fillStyle = '#609098';
          panel.fillRect(cx - 110, cy - 110, 220, 110);
          panel.fillStyle = '#a1865a';
          panel.fillRect(cx - 110, cy, 220, 110);
          panel.restore();
        }
        panel.strokeStyle = '#d7d9c5';
        panel.lineWidth = 3;
        for (let n = 0; n < 24; n++) {
          const a = (n / 24) * TAU;
          panel.beginPath();
          panel.moveTo(cx + Math.sin(a) * 106, cy - Math.cos(a) * 106);
          panel.lineTo(
            cx + Math.sin(a) * (n % 3 ? 97 : 89),
            cy - Math.cos(a) * (n % 3 ? 97 : 89),
          );
          panel.stroke();
        }
        panel.strokeStyle = '#e3b664';
        panel.lineWidth = 5;
        panel.beginPath();
        panel.moveTo(cx - 45, cy + 12);
        panel.lineTo(cx, cy);
        panel.lineTo(cx + 45, cy + 12);
        panel.stroke();
        panel.fillStyle = '#c5cdbd';
        panel.font = '20px sans-serif';
        panel.textAlign = 'center';
        panel.fillText(title, cx, 424);
      }
      const panelTexture = keep(new THREE.CanvasTexture(instruments));
      panelTexture.colorSpace = THREE.SRGBColorSpace;
      const panelFace = mesh(
        new THREE.PlaneGeometry(1.5, 0.38),
        surface('#ffffff', { map: panelTexture, roughness: 0.9, metalness: 0 }),
        this.cockpit,
      );
      panelFace.position.set(0, 0.03, -1.7);
      box([1.56, 0.028, 0.16], [0, 0.232, -1.74], dark, this.cockpit);
      rod(
        [-0.75, 0.23, -1.76],
        [-0.63, 1.22, -1.4],
        0.018,
        paint,
        this.cockpit,
      );
      rod([0.75, 0.23, -1.76], [0.63, 1.22, -1.4], 0.018, paint, this.cockpit);
      this.yoke = new THREE.Group();
      this.yoke.position.set(0, -0.015, -1.45);
      this.cockpit.add(this.yoke);
      rod([-0.18, 0, 0], [0.18, 0, 0], 0.022, dark, this.yoke);
      rod([-0.18, 0, 0], [-0.18, 0.11, 0], 0.025, dark, this.yoke);
      rod([0.18, 0, 0], [0.18, 0.11, 0], 0.025, dark, this.yoke);
      // Needles move over the painted dial faces; HUD carries the exact telemetry.
      this.needleSpeed = box(
        [0.012, 0.086, 0.004],
        [-0.4629, 0.0359, -1.695],
        accent,
        this.cockpit,
      );
      this.needleAltitude = box(
        [0.012, 0.086, 0.004],
        [0.4512, 0.0359, -1.695],
        accent,
        this.cockpit,
      );
    }
    this.group.userData.cockpitPosition = [0, 0.62, -0.55];
  }

  setCockpitMode(enabled) {
    this.exterior.visible = !enabled;
    this.cockpit.visible = enabled;
  }

  update(state, dt) {
    const throttle = Math.max(0, Math.min(1, state.throttle ?? 0));
    this.propAngle = (this.propAngle + dt * (15 + throttle * 105)) % TAU;
    this.propeller.rotation.z = this.propAngle;
    this.propDisc.material.opacity =
      throttle > 0.1 ? 0.08 + throttle * 0.06 : 0;
    const roll = state.rollInput ?? 0,
      pitch = state.pitchInput ?? 0,
      yaw = state.yawInput ?? 0;
    this.ailerons.forEach((part, i) => {
      part.rotation.x = roll * (i ? -0.3 : 0.3);
    });
    this.elevators.forEach((part) => {
      part.rotation.x = pitch * 0.32;
    });
    this.rudder.rotation.y = yaw * 0.34;
    if (this.yoke) {
      this.yoke.rotation.z = -roll * 0.4;
      this.yoke.position.z = -1.45 + pitch * 0.04;
    }
    if (this.needleSpeed)
      this.needleSpeed.rotation.z = (-(state.speed ?? 0) / 80) * Math.PI * 1.8;
    if (this.needleAltitude)
      this.needleAltitude.rotation.z = (-(state.y ?? 0) / 300) * TAU;
  }

  dispose() {
    this.group.removeFromParent();
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}

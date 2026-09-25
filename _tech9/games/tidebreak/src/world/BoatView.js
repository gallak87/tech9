import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Local authored launch. Simulation is planar; visual heave, trim, and foam live here.
export function createBoatView(boat, rules) {
  const root = new THREE.Group();
  root.name = 'Tidebreak launch';
  const owned = new Set();
  const samples = [];
  const drops = [];
  const stats = { wakeSamples: 0, sprayParticles: 0, length: 5.6, beam: 2.1 };
  let context;
  let wake;
  let spray;
  let disposed = false;
  let lastX = boat.x;
  let lastZ = boat.z;
  let emitTime = 0;
  let sprayTime = 0;
  let visualTime = 0;
  let previousState = rules.state;
  let previousElapsed = rules.elapsed ?? 0;
  let roll = 0;
  let pitch = 0;
  const MAX_SAMPLES = 90;
  const MAX_DROPS = 128;
  const UP = new THREE.Vector3(0, 1, 0);
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  const material = (color, roughness = 0.5, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const mesh = (geometry, mat, x = 0, y = 0, z = 0, parent = root) => {
    const item = new THREE.Mesh(own(geometry), mat);
    item.position.set(x, y, z);
    // The island shadow map is static. Moving launch geometry only receives it.
    item.castShadow = false;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const box = (w, h, d, mat, x, y, z) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const ellipsoid = (sx, sy, sz, mat, x, y, z) => {
    const item = mesh(new THREE.SphereGeometry(1, 14, 10), mat, x, y, z);
    item.scale.set(sx, sy, sz);
    return item;
  };
  const rod = (a, b, radius, mat) => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const item = mesh(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
      mat,
    );
    item.position.copy(start.add(end).multiplyScalar(0.5));
    item.quaternion.setFromUnitVectors(UP, delta.normalize());
    return item;
  };
  const outline = [
    [0, -2.78],
    [0.37, -2.48],
    [0.72, -1.98],
    [0.96, -1.15],
    [1.035, -0.2],
    [1.025, 1.25],
    [0.96, 2.34],
    [0.81, 2.48],
    [-0.81, 2.48],
    [-0.96, 2.34],
    [-1.025, 1.25],
    [-1.035, -0.2],
    [-0.96, -1.15],
    [-0.72, -1.98],
    [-0.37, -2.48],
  ];
  function hullStrip(lowY, highY, lowScale, highScale, mat) {
    const positions = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const point = (p, scale, y) => [
        p[0] * scale,
        y + (p[1] < -1.4 ? (-p[1] - 1.4) * 0.065 : 0),
        p[1] * (0.85 + scale * 0.15),
      ];
      const a0 = point(a, lowScale, lowY);
      const b0 = point(b, lowScale, lowY);
      const a1 = point(a, highScale, highY);
      const b1 = point(b, highScale, highY);
      positions.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    mesh(geometry, mat);
  }
  function deck(points, y, mat, holes = []) {
    const shape = new THREE.Shape(
      points.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    for (const hole of holes)
      shape.holes.push(
        new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
      );
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    mesh(geometry, mat, 0, y, 0);
  }
  function buildBoat() {
    const ivory = material('#eee7ce', 0.36);
    const teal = material('#214b4b', 0.3);
    const rubber = material('#252e2e', 0.74);
    const wood = material('#9b6b3b', 0.79);
    const paleWood = material('#b18551', 0.68);
    const orange = material('#b76235', 0.88);
    const piping = material('#e6c296', 0.85);
    const chrome = material('#b4bebb', 0.26, 0.75);
    const navy = material('#243c46', 0.85);
    const skin = material('#b78258', 0.8);
    const shirt = material('#ddd6bc', 0.94);
    const glass = own(
      new THREE.MeshPhysicalMaterial({
        color: '#95b9b2',
        roughness: 0.16,
        metalness: 0.06,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    hullStrip(-0.29, 0.14, 0.57, 0.88, ivory);
    hullStrip(0.14, 0.55, 0.88, 0.992, teal);
    hullStrip(0.55, 0.72, 0.992, 1, ivory);
    hullStrip(0.61, 0.655, 1.007, 1.008, rubber);
    const cockpit = [
      [-0.79, -1.12],
      [0.79, -1.12],
      [0.84, 1.89],
      [0.73, 2.12],
      [-0.73, 2.12],
      [-0.84, 1.89],
    ];
    deck(outline, 0.73, ivory, [cockpit]);
    deck(cockpit, 0.435, wood);
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.142;
      box(0.132, 0.019, 3.08, i % 3 === 0 ? paleWood : wood, x, 0.452, 0.45);
    }
    const bowWood = [
      [0, -2.5],
      [0.33, -2.24],
      [0.56, -1.79],
      [0.66, -1.3],
      [-0.66, -1.3],
      [-0.56, -1.79],
      [-0.33, -2.24],
    ];
    deck(bowWood, 0.752, paleWood);
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.17;
      const length = 1.12 - Math.abs(i) * 0.2;
      box(0.012, 0.006, length, wood, x, 0.759, -1.33 - length / 2);
    }
    box(0.09, 0.25, 3.0, ivory, -0.865, 0.59, 0.38);
    box(0.09, 0.25, 3.0, ivory, 0.865, 0.59, 0.38);
    box(1.7, 0.24, 0.12, ivory, 0, 0.61, 2.13);
    box(1.57, 0.25, 0.57, ivory, 0, 0.58, 1.67);
    box(1.55, 0.16, 0.6, orange, 0, 0.78, 1.65);
    box(1.55, 0.39, 0.12, orange, 0, 0.95, 1.93);
    for (const x of [-0.43, 0.43]) {
      mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.27, 10),
        chrome,
        x,
        0.57,
        0.34,
      );
      box(0.61, 0.15, 0.61, orange, x, 0.765, 0.34);
      const back = box(0.62, 0.53, 0.15, orange, x, 1.005, 0.6);
      back.rotation.x = -0.11;
      rod([x - 0.28, 0.85, 0.64], [x - 0.28, 1.23, 0.61], 0.017, piping);
      rod([x + 0.28, 0.85, 0.64], [x + 0.28, 1.23, 0.61], 0.017, piping);
    }
    for (const x of [-0.56, 0, 0.56])
      rod([x, 0.865, 1.36], [x, 0.865, 1.9], 0.009, piping);
    box(1.64, 0.4, 0.42, ivory, 0, 0.75, -0.81);
    const dash = box(1.51, 0.045, 0.34, teal, 0, 0.98, -0.66);
    dash.rotation.x = 0.13;
    const screenGeometry = new THREE.BufferGeometry();
    screenGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.78, 0.95, -0.95, 0.78, 0.95, -0.95, -0.68, 1.47, -0.71, 0.78, 0.95,
          -0.95, 0.68, 1.47, -0.71, -0.68, 1.47, -0.71, -0.78, 0.95, -0.95,
          -0.68, 1.47, -0.71, -0.88, 0.94, -0.17, -0.68, 1.47, -0.71, -0.8,
          1.21, -0.18, -0.88, 0.94, -0.17, 0.78, 0.95, -0.95, 0.88, 0.94, -0.17,
          0.68, 1.47, -0.71, 0.68, 1.47, -0.71, 0.88, 0.94, -0.17, 0.8, 1.21,
          -0.18,
        ],
        3,
      ),
    );
    screenGeometry.computeVertexNormals();
    const screen = mesh(screenGeometry, glass);
    screen.castShadow = false;
    rod([-0.68, 1.47, -0.71], [0.68, 1.47, -0.71], 0.023, chrome);
    rod([0, 0.96, -0.95], [0, 1.47, -0.71], 0.017, chrome);
    for (const s of [-1, 1]) {
      rod([s * 0.78, 0.95, -0.95], [s * 0.68, 1.47, -0.71], 0.022, chrome);
      rod([s * 0.68, 1.47, -0.71], [s * 0.8, 1.21, -0.18], 0.02, chrome);
      const railPoints = [
        [s * 0.92, 0.87, -0.89],
        [s * 0.84, 1.04, -1.49],
        [s * 0.47, 1.08, -2.22],
        [0, 1.075, -2.6],
      ];
      for (let i = 0; i < railPoints.length - 1; i++)
        rod(railPoints[i], railPoints[i + 1], 0.022, chrome);
      rod([s * 0.84, 0.76, -1.49], railPoints[1], 0.022, chrome);
      rod([s * 0.47, 0.8, -2.22], railPoints[2], 0.022, chrome);
      rod([s * 0.93, 0.765, 1.25], [s * 0.93, 0.765, 1.66], 0.025, chrome);
      rod([s * 0.93, 0.74, 1.46], [s * 0.93, 0.81, 1.46], 0.028, chrome);
    }
    const steering = mesh(
      new THREE.TorusGeometry(0.155, 0.016, 6, 22),
      rubber,
      0.43,
      1.04,
      -0.33,
    );
    steering.rotation.x = 0.48;
    rod([0.43, 1.04, -0.31], [0.43, 0.91, -0.69], 0.03, chrome);
    rod([0.3, 1.04, -0.32], [0.56, 1.04, -0.32], 0.012, chrome);
    for (const x of [0.23, 0.45, 0.63]) {
      const gauge = mesh(
        new THREE.CircleGeometry(x === 0.45 ? 0.065 : 0.045, 16),
        rubber,
        x,
        1.015,
        -0.7,
      );
      gauge.rotation.x = -Math.PI / 2 + 0.13;
    }
    ellipsoid(0.23, 0.31, 0.17, shirt, 0.43, 1.18, 0.31);
    ellipsoid(0.19, 0.12, 0.22, navy, 0.43, 0.86, 0.25);
    ellipsoid(0.13, 0.165, 0.145, skin, 0.43, 1.61, 0.24);
    ellipsoid(0.145, 0.07, 0.155, navy, 0.43, 1.74, 0.26);
    box(0.22, 0.028, 0.13, navy, 0.43, 1.717, 0.105);
    for (const s of [-1, 1]) {
      rod(
        [0.43 + s * 0.18, 1.37, 0.28],
        [0.43 + s * 0.24, 1.13, 0.02],
        0.074,
        shirt,
      );
      rod(
        [0.43 + s * 0.24, 1.13, 0.02],
        [0.43 + s * 0.12, 1.035, -0.32],
        0.048,
        skin,
      );
      rod(
        [0.43 + s * 0.115, 0.84, 0.2],
        [0.43 + s * 0.14, 0.72, -0.17],
        0.083,
        navy,
      );
      rod(
        [0.43 + s * 0.14, 0.72, -0.17],
        [0.43 + s * 0.14, 0.5, -0.16],
        0.073,
        navy,
      );
    }
    box(0.42, 0.23, 0.18, chrome, 0, 0.55, 2.51);
    const engine = box(0.63, 0.69, 0.58, rubber, 0, 0.76, 2.74);
    engine.rotation.x = -0.08;
    ellipsoid(0.316, 0.14, 0.29, teal, 0, 1.065, 2.715);
    box(0.636, 0.048, 0.57, piping, 0, 0.97, 2.73);
    box(0.2, 0.65, 0.27, rubber, 0, 0.13, 2.78);
    box(0.58, 0.055, 0.36, rubber, 0, -0.13, 2.79);
    box(0.48, 0.024, 0.39, ivory, 0, 0.779, -1.62);
    rod([-0.13, 0.84, -2.27], [0.13, 0.84, -2.27], 0.033, chrome);
    rod([0, 0.77, -2.27], [0, 0.84, -2.27], 0.025, chrome);
    batchBoat();
  }
  function batchBoat() {
    const batches = new Map();
    for (const item of [...root.children]) {
      if (item.material.transparent) continue;
      item.updateMatrix();
      const source = item.geometry.index
        ? own(item.geometry.toNonIndexed())
        : item.geometry;
      const geometry = own(source.clone().applyMatrix4(item.matrix));
      for (const name of Object.keys(geometry.attributes))
        if (!['position', 'normal'].includes(name))
          geometry.deleteAttribute(name);
      if (!batches.has(item.material)) batches.set(item.material, []);
      batches.get(item.material).push(geometry);
      root.remove(item);
    }
    for (const [mat, geometries] of batches) {
      const merged = own(mergeGeometries(geometries));
      const item = new THREE.Mesh(merged, mat);
      // The island shadow map is static. Moving launch geometry only receives it.
      item.castShadow = false;
      item.receiveShadow = true;
      root.add(item);
    }
  }
  function buildWake() {
    // One footprint includes the diffuse centre wash and both spreading edges.
    // Three vertices across each row keep curved wakes continuous without rails.
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 2),
        2,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'aAge',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const indices = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++)
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const foam = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: {
          ...THREE.UniformsLib.fog,
          tint: { value: new THREE.Color('#c3d8cf') },
        },
        vertexShader: `attribute float aFade; attribute float aAge;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_vertex>
        void main() { vUv=uv; vFade=aFade; vAge=aAge; vWorld=position.xz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
        fragmentShader: `uniform vec3 tint;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_fragment>
        float hash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
            mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        void main() {
          vec2 p=vWorld*2.6+vec2(vAge*0.13,-vAge*0.09);
          float broad=noise(p*0.31);
          float n=noise(p)*0.57+noise(p*2.07+17.8)*0.29+noise(p*4.13-9.2)*0.14;
          float crossWake=vUv.x*2.-1.;
          float edgeCentre=0.70+(broad-0.5)*0.22;
          float edgeDistance=abs(abs(crossWake)-edgeCentre);
          float edgeWidth=0.14+vAge*0.009;
          float edge=exp(-pow(edgeDistance/edgeWidth,2.)*1.6);
          // Broken soft foam patches, not a periodic weave along each strip.
          float breakup=smoothstep(0.37,0.72,n);
          float edgeFoam=edge*breakup*0.27;
          float metres=crossWake*(0.90+vAge*0.88);
          float centre=exp(-pow(metres/(0.40+vAge*0.24),2.)*1.6)*exp(-vAge*1.02);
          float wash=centre*(0.12+smoothstep(0.40,0.68,n)*0.62);
          float mist=(1.-smoothstep(0.2,1.,abs(crossWake)))*0.027*exp(-vAge*0.55);
          float outer=1.-smoothstep(0.86,1.,abs(crossWake));
          float sternFade=smoothstep(0.,0.12,vAge);
          gl_FragColor=vec4(tint,(edgeFoam+wash+mist)*vFade*outer*sternFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    wake = new THREE.Mesh(geometry, foam);
    wake.name = 'World space propeller wake';
    wake.frustumCulled = false;
    wake.renderOrder = 2;
    context.scene.add(wake);
    const sprayGeometry = own(new THREE.BufferGeometry());
    sprayGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setDrawRange(0, 0);
    const sprayMaterial = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: { ...THREE.UniformsLib.fog },
        vertexShader: `attribute float aFade; attribute float aSize; varying float vFade;
        #include <fog_pars_vertex>
        void main(){vFade=aFade;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(aSize*650./-mvPosition.z,1.,16.);
          #include <fog_vertex>
        }`,
        fragmentShader: `varying float vFade;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=(gl_PointCoord-0.5)*2.;float r=length(p);
          if(r>1.)discard;
          float soft=pow(1.-r,2.1);
          gl_FragColor=vec4(0.76,0.89,0.83,soft*vFade*0.36);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    spray = new THREE.Points(sprayGeometry, sprayMaterial);
    spray.name = 'Fine bow spray';
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    context.scene.add(spray);
  }
  // Seeded stochastic emission gives reproducible checks without periodic strings.
  let effectSeed = 14371;
  function random() {
    effectSeed = (Math.imul(effectSeed, 1664525) + 1013904223) >>> 0;
    return effectSeed / 4294967296;
  }
  function clearWake() {
    samples.length = 0;
    drops.length = 0;
    emitTime = 0;
    sprayTime = 0;
  }
  function updateWake(dt, speed) {
    const h = boat.heading;
    const forwardX = Math.sin(h);
    const forwardZ = -Math.cos(h);
    const rightX = Math.cos(h);
    const rightZ = Math.sin(h);
    for (const sample of samples) sample.age += dt;
    while (samples.length && samples[0].age > 5.2) samples.shift();
    emitTime += dt;
    if (dt > 0 && speed > 1.1 && emitTime > 0.065) {
      const direction = boat.speed < 0 ? -1 : 1;
      if (samples.length && samples.at(-1).direction !== direction)
        samples.length = 0;
      samples.push({
        x: boat.x - forwardX * 2.72,
        z: boat.z - forwardZ * 2.72,
        h,
        direction,
        age: 0,
        strength: Math.min(speed / 6, 1),
      });
      if (samples.length > MAX_SAMPLES) samples.shift();
      emitTime = 0;
    }
    const pos = wake.geometry.attributes.position;
    const uv = wake.geometry.attributes.uv;
    const fade = wake.geometry.attributes.aFade;
    const age = wake.geometry.attributes.aAge;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const width = 0.9 + sample.age * (0.55 + sample.strength * 0.33);
      const rx = Math.cos(sample.h);
      const rz = Math.sin(sample.h);
      for (let column = 0; column < 3; column++) {
        const j = i * 3 + column;
        const cross = (column - 1) * width;
        pos.setXYZ(j, sample.x + rx * cross, 0.072, sample.z + rz * cross);
        uv.setXY(j, column / 2, 0);
        age.setX(j, sample.age);
        fade.setX(
          j,
          Math.pow(Math.max(0, 1 - sample.age / 5.2), 1.55) * sample.strength,
        );
      }
    }
    pos.needsUpdate =
      uv.needsUpdate =
      fade.needsUpdate =
      age.needsUpdate =
        true;
    wake.geometry.setDrawRange(0, Math.max(0, samples.length - 1) * 12);
    sprayTime += dt;
    if (dt > 0 && speed > 2.6 && sprayTime > 0.028) {
      const count = 4 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const sign = random() < 0.5 ? -1 : 1;
        const fore = -0.65 + random() * 1.2;
        const cross = sign * (0.91 + random() * 0.15);
        const outward = sign * (0.25 + random() * 1.05);
        const carry = speed * (0.05 + random() * 0.18);
        drops.push({
          x: boat.x + forwardX * fore + rightX * cross,
          y: 0.1 + random() * 0.075,
          z: boat.z + forwardZ * fore + rightZ * cross,
          vx: rightX * outward + forwardX * carry,
          vz: rightZ * outward + forwardZ * carry,
          vy: 0.25 + random() * 0.55,
          age: 0,
          life: 0.24 + random() * 0.32,
          size: 0.025 + random() * 0.085,
          strength: (0.35 + random() * 0.5) * Math.min(1, speed / 6),
        });
      }
      sprayTime = random() * 0.012;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      drop.age += dt;
      drop.x += drop.vx * dt;
      drop.z += drop.vz * dt;
      drop.vy -= dt * 3;
      drop.y = Math.max(0.082, drop.y + drop.vy * dt);
      if (drop.age > drop.life || drops.length > MAX_DROPS) drops.splice(i, 1);
    }
    const sp = spray.geometry.attributes.position;
    const sf = spray.geometry.attributes.aFade;
    const ss = spray.geometry.attributes.aSize;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const life = drop.age / drop.life;
      sp.setXYZ(i, drop.x, drop.y, drop.z);
      sf.setX(i, Math.pow(1 - life, 1.6) * drop.strength);
      ss.setX(i, drop.size * (1 + life * 1.8));
    }
    sp.needsUpdate = sf.needsUpdate = ss.needsUpdate = true;
    spray.geometry.setDrawRange(0, drops.length);
    stats.wakeSamples = samples.length;
    stats.sprayParticles = drops.length;
  }
  return {
    id: 'boat-view',
    stats,
    init(ctx) {
      context = ctx;
      buildBoat();
      buildWake();
      context.scene.add(root);
      root.position.set(boat.x, 0, boat.z);
      root.rotation.y = -boat.heading;
    },
    update(dt) {
      if (disposed) return;
      const state = rules.state;
      const running = state === 'running';
      const speed = Math.abs(boat.speed);
      const distance = Math.hypot(boat.x - lastX, boat.z - lastZ);
      const elapsed = rules.elapsed ?? 0;
      const restarted =
        elapsed < previousElapsed ||
        (state === 'running' && ['finished', 'ready'].includes(previousState));
      if (
        distance > 12 ||
        restarted ||
        (state === 'ready' && previousState !== 'ready')
      )
        clearWake();
      const activeDt = running || state === 'ready' ? dt : 0;
      visualTime += activeDt;
      const smoothing = 1 - Math.exp(-activeDt * 4);
      roll +=
        (-(boat.steer || 0) * Math.min(speed / 10, 1) * 0.085 - roll) *
        smoothing;
      pitch += (Math.min(speed / 11, 1) * 0.055 - pitch) * smoothing;
      root.position.set(
        boat.x,
        Math.sin(visualTime * 1.9) * 0.025 +
          Math.sin(visualTime * 3.3 + 1.5) * 0.009,
        boat.z,
      );
      root.rotation.set(
        pitch + Math.sin(visualTime * 1.7) * 0.008,
        -boat.heading,
        roll + Math.sin(visualTime * 1.3) * 0.012,
        'YXZ',
      );
      updateWake(running ? dt : 0, speed);
      lastX = boat.x;
      lastZ = boat.z;
      previousState = state;
      previousElapsed = elapsed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context?.scene.remove(root);
      if (wake) context?.scene.remove(wake);
      if (spray) context?.scene.remove(spray);
      for (const resource of owned) resource.dispose();
      owned.clear();
      root.clear();
      samples.length = drops.length = 0;
    },
  };
}

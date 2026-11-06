import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from '../ships/index.js';
import { createRivalPreview } from '../ships/rivals.js';
import { configureShipTextures } from '../ships/texture-loader.js';
import { createStudioEnvironment } from '../ships/studio-environment.js';
import { createAsphalt } from '../levels/halcyon/track/asphalt.js';
import { assetURL } from '../assets/url.js';
import {
  COMPLETION_FIRES,
  COMPLETION_FINISH,
  sampleCompletionTimeline,
} from './completion-timeline.js';

// A small, self-contained set, rather than another running circuit. Every craft
// is the same authored asset used in the race; only the blocking is directed.
export function createCompletionStage({
  mount,
  shipId,
  settings,
  signal,
  onProgress,
  onError,
}) {
  const readSettings = () =>
    typeof settings === 'function' ? settings() : (settings ?? {});
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  configureShipTextures(renderer);
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, readSettings().quality === 'low' ? 1 : 1.25),
  );
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = readSettings().quality !== 'low';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'completion-cinematic-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mount.append(canvas);
  const scene = new T.Scene();
  scene.background = new T.Color('#819ca9');
  scene.fog = new T.FogExp2('#9baab0', 0.00053);
  const camera = new T.PerspectiveCamera(52, 1, 0.1, 3600);
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.75;
  scene.add(new T.HemisphereLight('#d7e9f5', '#565047', 1.05));
  const key = new T.DirectionalLight('#ffe0b1', 3.2);
  key.castShadow = renderer.shadowMap.enabled;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -65,
    right: 65,
    top: 65,
    bottom: -65,
    near: 1,
    far: 380,
  });
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.04;
  const rim = new T.DirectionalLight('#b0dcff', 0.7);
  rim.position.set(40, 30, -50);
  scene.add(key, key.target, rim);
  const resources = new Set();
  const own = (value) => {
    resources.add(value);
    return value;
  };
  const standard = (color, roughness = 0.65, metalness = 0.1) =>
    own(new T.MeshStandardMaterial({ color, roughness, metalness }));
  const basic = (color, options = {}) =>
    own(new T.MeshBasicMaterial({ color, ...options }));
  const cube = own(new T.BoxGeometry(1, 1, 1));
  const object = new T.Object3D();
  const ivory = standard('#c9c6b8', 0.52, 0.3);
  const road = standard('#303d46', 0.82, 0.24);
  const bronze = standard('#806d51', 0.35, 0.75);
  const graphite = standard('#1c2e3b', 0.56, 0.45);
  const cyan = basic('#70def0', { toneMapped: false });
  const warm = basic('#ffe4b2', { toneMapped: false });
  const checkerBlack = standard('#18222b', 0.7, 0.12);
  const checkerWhite = standard('#d8d6c8', 0.6, 0.12);
  const asphalt = createAsphalt(renderer, 32, {
    uvLength: 16,
    label: 'Victory causeway',
    moisture: 0.16,
  });
  asphalt.material.color.set('#667782');

  function boxes(material, items, { shadows = false } = {}) {
    if (!items.length) return;
    const mesh = new T.InstancedMesh(cube, material, items.length);
    items.forEach(([x, y, z, sx, sy, sz, rotation = 0], index) => {
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.rotation.set(0, 0, rotation);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }
  const slabs = [],
    edges = [],
    lines = [],
    lamps = [],
    supports = [],
    sidePanels = [];
  const spans = [
    [-180, 635],
    [800, 1730],
  ];
  for (const [start, end] of spans) {
    slabs.push([0, -1.1, (start + end) / 2, 32, 2.2, end - start]);
    const surface = own(new T.PlaneGeometry(32, end - start));
    const uv = surface.attributes.uv;
    for (let index = 0; index < uv.count; index++)
      uv.setY(index, (uv.getY(index) * (end - start)) / 16);
    surface.rotateX(-Math.PI / 2);
    const deck = new T.Mesh(surface, asphalt.material);
    deck.position.set(0, 0.005, (start + end) / 2);
    deck.receiveShadow = true;
    scene.add(deck);
    for (const side of [-1, 1]) {
      edges.push([
        side * 16.4,
        -0.12,
        (start + end) / 2,
        0.8,
        0.65,
        end - start,
      ]);
      lines.push([
        side * 15.65,
        0.017,
        (start + end) / 2,
        0.09,
        0.025,
        end - start,
      ]);
      for (let z = Math.ceil(start / 24) * 24; z < end; z += 24) {
        lamps.push([side * 16.5, 0.9, z, 0.2, 0.14, 0.75]);
        supports.push([side * 16.5, 0.35, z, 0.3, 1, 0.35]);
      }
      for (let z = start + 20; z < end; z += 64)
        sidePanels.push([side * 16.5, -2.2, z, 1.1, 3.4, 22]);
    }
    for (let z = start + 5; z < end - 4; z += 12)
      for (const x of [-8, 8]) lines.push([x, 0.015, z, 0.09, 0.025, 3]);
  }
  boxes(road, slabs);
  boxes(ivory, edges);
  boxes(cyan, lines);
  boxes(warm, lamps);
  boxes(graphite, supports);
  boxes(bronze, sidePanels);
  const joints = [],
    bolts = [],
    shoulders = [];
  for (const [start, end] of spans)
    for (let z = start + 10; z < end; z += 14) {
      joints.push([0, 0.018, z, 30.6, 0.012, 0.025]);
      for (const side of [-1, 1]) {
        shoulders.push([side * 14.9, 0.025, z, 0.55, 0.03, 8]);
        bolts.push([side * 16.4, 0.23, z, 0.15, 0.06, 0.15]);
      }
    }
  boxes(graphite, joints);
  boxes(ivory, shoulders);
  boxes(bronze, bolts);
  const launchLines = [];
  for (const start of [580, 805])
    for (let step = 0; step < 5; step++)
      launchLines.push([0, 0.03, start + step * 6, 28, 0.04, 0.3]);
  boxes(cyan, launchLines);
  const checker = [[], []];
  for (let x = 0; x < 20; x++)
    for (let z = 0; z < 5; z++)
      checker[(x + z) % 2].push([
        -15.2 + x * 1.6,
        0.035,
        COMPLETION_FINISH - 4 + z * 1.6,
        1.6,
        0.035,
        1.6,
      ]);
  boxes(checkerBlack, checker[0]);
  boxes(checkerWhite, checker[1]);
  boxes(
    ivory,
    [
      [-19, 7.5, COMPLETION_FINISH, 2, 15, 3],
      [19, 7.5, COMPLETION_FINISH, 2, 15, 3],
      [0, 14.4, COMPLETION_FINISH, 40, 1.2, 3],
    ],
    { shadows: true },
  );
  boxes(bronze, [
    [-21, 5, COMPLETION_FINISH, 0.7, 15, 1.8, -0.22],
    [21, 5, COMPLETION_FINISH, 0.7, 15, 1.8, 0.22],
  ]);
  boxes(cyan, [[0, 13.72, COMPLETION_FINISH - 1.55, 35, 0.08, 0.08]]);
  const gateChecks = [[], []];
  for (let index = 0; index < 24; index++)
    gateChecks[index % 2].push([
      -17.25 + index * 1.5,
      14.4,
      COMPLETION_FINISH - 1.52,
      1.48,
      0.9,
      0.04,
    ]);
  boxes(checkerBlack, gateChecks[0]);
  boxes(checkerWhite, gateChecks[1]);

  // The set has depth at three scales: a founded causeway, quiet civic towers,
  // and angular coastal hills. Instancing keeps the vista inexpensive.
  const seaTime = { value: 0 };
  const waterMaterial = standard('#315d6b', 0.23, 0.42);
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.seaTime = seaTime;
    shader.vertexShader =
      'varying vec3 seaPosition;\n' +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nseaPosition=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 seaPosition;\nuniform float seaTime;\n' +
      shader.fragmentShader
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      vec2 wave=seaPosition.xz;
      float a=dot(wave,vec2(.19,.11))+seaTime*.8;
      float b=dot(wave,vec2(-.36,.28))-seaTime*1.15;
      float c=dot(wave,vec2(.87,.61))+seaTime*1.4;
      vec2 slope=vec2(.19,.11)*cos(a)*.24+vec2(-.36,.28)*cos(b)*.11+vec2(.87,.61)*cos(c)*.035;
      normal=normalize(mat3(viewMatrix)*normalize(vec3(-slope.x,1.,-slope.y)));
    `,
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\ndiffuseColor.rgb *= .94+.06*sin(dot(seaPosition.xz,vec2(.037,.023))+seaTime*.14);',
        );
  };
  const sea = new T.Mesh(own(new T.PlaneGeometry(6500, 6500)), waterMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -58, 600);
  scene.add(sea);
  const quay = standard('#586c72', 0.86, 0.06);
  boxes(quay, [
    [-150, -59, 650, 180, 18, 1980],
    [150, -59, 650, 180, 18, 1980],
  ]);
  boxes(ivory, [
    [-59.5, -49.5, 650, 1.3, 1.2, 1980],
    [59.5, -49.5, 650, 1.3, 1.2, 1980],
  ]);
  const pylons = [],
    town = [],
    windows = [],
    terraces = [],
    fins = [],
    crowns = [];
  for (let index = 0; index < 27; index++) {
    const z = -150 + index * 72;
    if (z > 600 && z < 825) continue;
    pylons.push([-11, -27, z, 3, 52, 4], [11, -27, z, 3, 52, 4]);
    for (const side of [-1, 1]) {
      const x = side * (100 + ((index * 37) % 95));
      const height = 24 + ((index * 43) % 90);
      town.push([x, height / 2 - 53, z + 11, 18 + (index % 4) * 5, height, 27]);
      terraces.push([x, -53, z + 11, 47, 12, 56]);
      const tier = index % 3;
      crowns.push([x, height - 51, z + 11, 21 + (index % 4) * 5, 1.8, 31]);
      if (tier === 0)
        crowns.push(
          [x + side * 3, height - 45, z + 8, 12, 10, 20],
          [x + side * 3, height - 39, z + 8, 14, 1.2, 22],
        );
      else if (tier === 1)
        crowns.push([x - side * 4, height - 47, z + 11, 6, 7, 25]);
      else
        crowns.push(
          [x, height - 43, z + 16, 9, 14, 12],
          [x, height - 32, z + 16, 0.6, 8, 0.6],
        );
      for (const bay of [-1, 0, 1])
        fins.push([
          x - side * (9.6 + (index % 4) * 2.5),
          height / 2 - 53,
          z + 11 + bay * 8.6,
          1.1,
          height,
          0.55,
        ]);
      let floorIndex = 0;
      for (let floor = 6; floor < height - 3; floor += 6.5 + (index % 3)) {
        for (const bay of [-1, 0, 1])
          if ((floorIndex + index + bay) % 6 !== 0)
            windows.push([
              x - side * (9.65 + (index % 4) * 2.5),
              floor - 53,
              z + 11 + bay * 8.5,
              0.15,
              tier === 1 ? 3.1 : 1.9,
              6.2,
            ]);
        for (const face of [-1, 1])
          windows.push([
            x,
            floor - 53,
            z + 11 + face * 14.15,
            12 + (index % 4) * 5,
            1.8,
            0.15,
          ]);
        floorIndex++;
      }
    }
  }
  boxes(ivory, pylons);
  boxes(standard('#b2bab8', 0.76, 0.15), town);
  boxes(graphite, windows);
  boxes(ivory, fins);
  boxes(bronze, crowns);
  boxes(standard('#697879', 0.9, 0.05), terraces);
  const mountainMaterial = standard('#899a99', 1, 0);
  for (const side of [-1, 1]) {
    const terrain = own(new T.PlaneGeometry(1700, 5100, 42, 110));
    terrain.rotateX(-Math.PI / 2);
    const positions = terrain.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index),
        z = positions.getZ(index);
      const inward = (x + 850) / 1700;
      const ridge =
        Math.sin(z * 0.0021 + 0.7) * 0.5 + Math.sin(z * 0.0053) * 0.22 + 0.8;
      const fractured =
        Math.sin(x * 0.022 + z * 0.011) * Math.sin(z * 0.026 - x * 0.008) * 24 +
        Math.sin(x * 0.079 + z * 0.057) * 7;
      const edge = Math.sin((inward * Math.PI) / 2);
      positions.setY(index, -65 + edge * edge * (80 + ridge * 175 + fractured));
    }
    terrain.computeVertexNormals();
    const hill = new T.Mesh(terrain, mountainMaterial);
    hill.position.set(side * 1120, 0, 650);
    if (side < 0) hill.rotation.y = Math.PI;
    scene.add(hill);
  }
  const sky = new T.Mesh(
    own(new T.SphereGeometry(2800, 32, 16)),
    own(
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new T.Color('#678ba1') },
          horizon: { value: new T.Color('#e1c8a5') },
        },
        vertexShader:
          'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'uniform vec3 top;uniform vec3 horizon;varying vec3 vDirection;void main(){float h=normalize(vDirection).y;float mixValue=pow(clamp(h*.9+.08,0.,1.),.55);vec3 color=mix(horizon,top,mixValue);vec3 sunDirection=normalize(vec3(-.48,.35,.65));float sun=max(dot(normalize(vDirection),sunDirection),0.);color+=vec3(1.,.66,.28)*pow(sun,180.)*.9;gl_FragColor=vec4(color,1.);}',
      }),
    ),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  const sun = new T.Mesh(
    own(new T.SphereGeometry(45, 20, 12)),
    basic('#fff0cd', { fog: false, toneMapped: false }),
  );
  sun.position.set(-1300, 820, 1880);
  scene.add(sun);

  const beamGeometry = own(new T.CylinderGeometry(1, 1, 1, 8, 1, true));
  const beamMaterial = basic('#a981ff', {
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: false,
    blending: T.AdditiveBlending,
  });
  const beamCore = basic('#f3ecff', {
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
    blending: T.AdditiveBlending,
  });
  const beams = [-1, 1].map(() => {
    const outer = new T.Mesh(beamGeometry, beamMaterial);
    const inner = new T.Mesh(beamGeometry, beamCore);
    scene.add(outer, inner);
    return { outer, inner };
  });
  const ringGeometry = own(new T.TorusGeometry(1, 0.024, 6, 48));
  const hitMaterial = basic('#c6a4ff', {
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: T.AdditiveBlending,
  });
  const hitRings = [0, 1].map(() => {
    const mesh = new T.Mesh(ringGeometry, hitMaterial);
    scene.add(mesh);
    return mesh;
  });
  const jumpMaterial = basic('#83dbff', {
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: T.AdditiveBlending,
  });
  const jumpRing = new T.Mesh(ringGeometry, jumpMaterial);
  jumpRing.rotation.x = Math.PI / 2;
  scene.add(jumpRing);
  const trailGeometry = own(new T.PlaneGeometry(1, 1));
  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = dustCanvas.height = 64;
  const dustContext = dustCanvas.getContext('2d');
  const gradient = dustContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(225,228,220,.3)');
  gradient.addColorStop(0.35, 'rgba(225,228,220,.14)');
  gradient.addColorStop(1, 'rgba(225,228,220,0)');
  dustContext.fillStyle = gradient;
  dustContext.fillRect(0, 0, 64, 64);
  const dustTexture = own(new T.CanvasTexture(dustCanvas));
  const dustMaterial = basic('#c4c8c4', {
    map: dustTexture,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const dust = Array.from({ length: 16 }, () => {
    const mesh = new T.Mesh(trailGeometry, dustMaterial);
    scene.add(mesh);
    return mesh;
  });
  const sparkMaterial = basic('#ffdf9a', {
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  });
  const sparks = Array.from({ length: 18 }, () => {
    const mesh = new T.Mesh(cube, sparkMaterial);
    scene.add(mesh);
    return mesh;
  });
  const direction = new T.Vector3(),
    start = new T.Vector3(),
    end = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  const models = new Map();
  let disposed = false,
    lastSample = sampleCompletionTimeline(0);
  let width = 0,
    height = 0;
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      if (!disposed) onError?.(new Error('Finale graphics context was lost.'));
    },
    { signal },
  );
  onProgress?.(0.18);

  function resize() {
    if (disposed) return;
    const rect = mount.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(() => {
    try {
      resize();
      draw(lastSample.time, true);
    } catch (error) {
      onError?.(error);
    }
  });
  observer.observe(mount);
  resize();

  function draw(time, reducedMotion = false) {
    if (disposed) return;
    resize();
    const sample = sampleCompletionTimeline(time);
    seaTime.value = time;
    lastSample = sample;
    for (const [id, model] of models) {
      const pose = sample[id];
      model.group.position.set(pose.x, pose.y, pose.z);
      model.group.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      model.update({
        ...pose,
        time,
        energy: 1,
        quality: readSettings().quality,
        reducedMotion,
      });
    }
    const [cx, cy, cz] = sample.camera.position;
    const fit = Math.max(1, Math.min(2.4, 1.4 / camera.aspect));
    camera.position.set(
      sample.hero.x + (cx - sample.hero.x) * fit,
      sample.hero.y + (cy - sample.hero.y) * fit,
      sample.hero.z + (cz - sample.hero.z) * fit,
    );
    camera.fov = sample.camera.fov;
    camera.lookAt(...sample.camera.target);
    camera.updateProjectionMatrix();
    key.position.set(
      sample.hero.x - 80,
      sample.hero.y + 150,
      sample.hero.z + 100,
    );
    key.target.position.set(sample.hero.x, 0, sample.hero.z);
    sky.position.copy(camera.position);
    const fireIndex = COMPLETION_FIRES.findIndex(
      (fire) => time >= fire && time < fire + 0.23,
    );
    const attackTarget = fireIndex === 3 ? sample.rook : sample.manta;
    for (let index = 0; index < beams.length; index++) {
      const beam = beams[index];
      beam.outer.visible = beam.inner.visible =
        fireIndex >= 0 && !reducedMotion;
      if (!beam.outer.visible) continue;
      start.set(
        sample.hero.x + (index ? 0.7 : -0.7),
        sample.hero.y + 0.65,
        sample.hero.z + 3,
      );
      end.set(
        attackTarget.x + (index ? 0.4 : -0.4),
        attackTarget.y + 0.65,
        attackTarget.z - 2,
      );
      direction.subVectors(end, start);
      const length = direction.length();
      for (const [mesh, radius] of [
        [beam.outer, 0.085],
        [beam.inner, 0.024],
      ]) {
        mesh.position.copy(start).addScaledVector(direction, 0.5);
        mesh.quaternion.setFromUnitVectors(up, direction.normalize());
        mesh.scale.set(radius, length, radius);
        direction.subVectors(end, start);
      }
    }
    const hitIndex = COMPLETION_FIRES.findIndex(
      (fire) => time >= fire + 0.16 && time < fire + 0.7,
    );
    const age =
      hitIndex < 0 ? 0 : (time - COMPLETION_FIRES[hitIndex] - 0.16) / 0.54;
    const hitTarget = hitIndex === 3 ? sample.rook : sample.manta;
    hitMaterial.opacity = (1 - age) * 0.8;
    hitRings.forEach((ring, index) => {
      ring.visible = hitIndex >= 0 && !reducedMotion;
      ring.position.set(hitTarget.x, hitTarget.y + 0.7, hitTarget.z - 2.3);
      ring.rotation.set(age * 2 + index * 1.2, age + index * 0.8, age);
      ring.scale.setScalar(1.2 + age * 2 + index * 0.4);
    });
    sparks.forEach((spark, index) => {
      spark.visible = hitIndex >= 0 && !reducedMotion;
      const angle = index * 2.4;
      spark.position.set(
        hitTarget.x + Math.cos(angle) * age * 6,
        hitTarget.y + 0.8 + Math.sin(index * 4.1) * age * 3 - age * age * 2,
        hitTarget.z - 2.6 - age * (3 + (index % 5)),
      );
      spark.scale.set(0.04, 0.04, 0.2 + (1 - age) * 0.8);
      spark.rotation.set(angle, angle * 2, angle);
    });
    const ringAge =
      time >= 7.8 && time < 8.55
        ? (time - 7.8) / 0.75
        : time >= 12.8 && time < 13.6
          ? (time - 12.8) / 0.8
          : -1;
    jumpRing.visible = ringAge >= 0 && !reducedMotion;
    jumpRing.position.set(sample.hero.x, 0.12, time < 10 ? 585 : 960);
    jumpRing.scale.setScalar(2 + Math.max(0, ringAge) * 9);
    jumpMaterial.opacity = (1 - Math.max(0, ringAge)) * 0.65;
    const drifting = time >= 16.8 && time < 20.8 && !reducedMotion;
    dust.forEach((puff, index) => {
      puff.visible = drifting;
      const lag = (index / dust.length) * 0.7;
      const pose = sampleCompletionTimeline(Math.max(16.6, time - lag)).hero;
      puff.position.set(
        pose.x + Math.sin(index * 3.7) * 1.5,
        0.25 + lag,
        pose.z - 2.7 - lag * 4,
      );
      puff.quaternion.copy(camera.quaternion);
      puff.scale.set(2.5 + lag * 3, 1.1 + lag * 2, 1);
    });
    renderer.render(scene, camera);
    return sample;
  }

  async function load(id, create) {
    const model = await create();
    if (disposed || signal?.aborted) {
      model.dispose();
      return;
    }
    models.set(id, model);
    scene.add(model.group);
    onProgress?.(0.18 + models.size * 0.23);
  }
  const loader = new GLTFLoader();
  const loadAsset = async (url) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Completion craft could not load.');
    return loader.parseAsync(
      await response.arrayBuffer(),
      new URL('.', new URL(url, document.baseURI)).href,
    );
  };
  const ready = Promise.all([
    load('hero', () => createShip({ id: shipId })),
    load('rook', () =>
      createRivalPreview('rook', { loadAsset, settings: readSettings() }),
    ),
    load('manta', () =>
      createRivalPreview('manta', { loadAsset, settings: readSettings() }),
    ),
    asphalt.ready,
    new T.TextureLoader()
      .loadAsync(assetURL('assets/levels/nomad/nomad-sky-v1.png'))
      .then((texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        own(texture);
        texture.colorSpace = T.SRGBColorSpace;
        texture.mapping = T.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.backgroundIntensity = 1;
        scene.backgroundRotation.y = -0.5;
        sky.visible = sun.visible = false;
      }),
  ]).then(async () => {
    if (disposed || signal?.aborted) return;
    draw(0, true);
    onProgress?.(0.93);
    await renderer.compileAsync(scene, camera);
    if (!disposed) onProgress?.(1);
  });
  return {
    ready,
    draw,
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      for (const model of models.values()) model.dispose();
      models.clear();
      resources.forEach((resource) => resource.dispose());
      asphalt.dispose();
      environment.dispose();
      key.shadow.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

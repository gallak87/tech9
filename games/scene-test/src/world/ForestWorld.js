import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createRandom,
  pathCenter,
  pathDistance,
  pathWidth,
  terrainHeight,
  WORLD_HALF,
  WORLD_SIZE,
} from './terrain.js';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/`;
const UP = new THREE.Vector3(0, 1, 0);
const QUALITY_DENSITY = { balanced: 0.66, high: 1, ultra: 1.08 };

function terrainMaterial(textures) {
  const material = new THREE.MeshStandardMaterial({
    map: textures.floorColor,
    normalMap: textures.floorNormal,
    roughnessMap: textures.floorRoughness,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.97,
    color: '#f4efe3',
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      pathColor: { value: textures.pathColor },
      pathNormal: { value: textures.pathNormal },
      pathRoughness: { value: textures.pathRoughness },
    });
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float trail;\nvarying float vTrail;\nvarying vec3 vTerrainPosition;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTrail = trail;\nvTerrainPosition = position;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D pathColor;
      uniform sampler2D pathNormal;
      uniform sampler2D pathRoughness;
      varying float vTrail;
      varying vec3 vTerrainPosition;
      float terrainNoise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec4 floorSample = texture2D(map, vMapUv);
      vec4 dirtSample = texture2D(pathColor, vMapUv * 1.28 + vec2(0.213, 0.782));
      float edgeNoise = (floorSample.g - floorSample.r) * 2.0 + (floorSample.r - 0.3) * 0.36;
      float pathBlend = smoothstep(0.16, 0.88, vTrail + edgeNoise * (1.0 - abs(vTrail * 2.0 - 1.0)));
      diffuseColor *= mix(floorSample, dirtSample * vec4(1.46, 1.28, 1.07, 1.0), pathBlend);
      float soilMoisture = 0.9 + 0.1 * sin(vTerrainPosition.x * 0.39 + cos(vTerrainPosition.z * 0.17)) * sin(vTerrainPosition.z * 0.23);
      diffuseColor.rgb *= mix(1.0, soilMoisture, pathBlend);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      float roughnessFactor = roughness;
      roughnessFactor *= mix(texture2D(roughnessMap, vRoughnessMapUv).g, texture2D(pathRoughness, vRoughnessMapUv * 1.28 + vec2(0.213, 0.782)).g, pathBlend);
      roughnessFactor = max(0.71, roughnessFactor);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = mix(texture2D(normalMap, vNormalMapUv).xyz, texture2D(pathNormal, vNormalMapUv * 1.28 + vec2(0.213, 0.782)).xyz, pathBlend) * 2.0 - 1.0;`,
      ),
    );
  };
  material.customProgramCacheKey = () => 'alder-terrain-v1';
  return material;
}

async function loadTerrainTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['floorColor', 'forest-floor-color.jpg'],
    ['floorNormal', 'forest-floor-normal.jpg'],
    ['floorRoughness', 'forest-floor-roughness.jpg'],
    ['pathColor', 'path-color.jpg'],
    ['pathNormal', 'path-normal.jpg'],
    ['pathRoughness', 'path-roughness.jpg'],
  ];
  const textures = {};
  await Promise.all(
    entries.map(async ([key, file]) => {
      const texture = await loader.loadAsync(`${ASSET_ROOT}textures/${file}`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      if (key.endsWith('Color')) texture.colorSpace = THREE.SRGBColorSpace;
      textures[key] = texture;
    }),
  );
  return textures;
}

function buildTerrain(textures) {
  const resolution = 256;
  const geometry = new THREE.PlaneGeometry(
    WORLD_SIZE,
    WORLD_SIZE,
    resolution,
    resolution,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const trail = new Float32Array(position.count);
  const colors = new Float32Array(position.count * 3);
  const shade = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));
    uv.setXY(i, x / 3.2, z / 3.2);
    const distance = pathDistance(x, z);
    const width = pathWidth(z);
    const noise =
      Math.sin(x * 4.7 + Math.cos(z * 2.4)) * Math.cos(z * 6.1) * 0.2;
    trail[i] = THREE.MathUtils.clamp(
      (width + 0.8 - distance + noise) / 1.6,
      0,
      1,
    );
    const macro = Math.sin(x * 0.35 + z * 0.06) * Math.cos(z * 0.23) * 0.05;
    shade.setRGB(0.87 + macro, 0.89 + macro, 0.83 + macro);
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('trail', new THREE.BufferAttribute(trail, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, terrainMaterial(textures));
  mesh.name = 'Scanned forest floor and worn trail';
  mesh.receiveShadow = true;
  return mesh;
}

function matrixAt(x, z, scale, rotation, yOffset = 0) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(x, terrainHeight(x, z) + yOffset, z);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotation);
  matrix.compose(
    position,
    quaternion,
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
  );
  return matrix;
}

/** Bounded mesh batches keep culling useful without an entity system or per-object updates. */
function createBatches(
  group,
  geometry,
  material,
  entries,
  name,
  { chunkSize = 40, shadow = false, density = false, color = false } = {},
) {
  const chunks = new Map();
  for (const entry of entries) {
    const key = `${Math.floor((entry.x + WORLD_HALF) / chunkSize)}:${Math.floor((entry.z + WORLD_HALF) / chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(entry);
  }
  const batches = [];
  for (const [key, instances] of chunks) {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = `${name} ${key}`;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.userData.maxCount = instances.length;
    mesh.userData.baseCount = instances.filter(
      (instance) => !instance.reserve,
    ).length;
    mesh.userData.density = density;
    for (let i = 0; i < instances.length; i++) {
      const entry = instances[i];
      mesh.setMatrixAt(i, entry.matrix);
      if (color && entry.color) mesh.setColorAt(i, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.push(mesh);
  }
  return batches;
}

function instancePrototype(
  group,
  kit,
  prototypeName,
  entries,
  disposables,
  options = {},
) {
  const prototype = kit.getObjectByName(prototypeName);
  if (!prototype)
    throw new Error(
      `Forest kit is missing the Blender prototype: ${prototypeName}`,
    );
  prototype.updateWorldMatrix(true, true);
  const inverseRoot = new THREE.Matrix4().copy(prototype.matrixWorld).invert();
  const batches = [];
  prototype.traverse((part) => {
    if (!part.isMesh) return;
    const localMatrix = new THREE.Matrix4().multiplyMatrices(
      inverseRoot,
      part.matrixWorld,
    );
    const geometry = part.geometry.clone().applyMatrix4(localMatrix);
    const material = part.material.clone();
    if (prototypeName.startsWith('rock_')) {
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
      if (material.normalScale) material.normalScale.setScalar(0.55);
    }
    material.envMapIntensity = 0.3;
    if (
      prototypeName.startsWith('grass_') ||
      prototypeName.startsWith('fern_')
    ) {
      material.color.multiplyScalar(
        prototypeName.startsWith('grass_') ? 1.42 : 1.2,
      );
      material.normalScale?.setScalar(0.7);
      material.emissive.set('#617c36');
      material.emissiveIntensity = prototypeName.startsWith('grass_')
        ? 0.115
        : 0.07;
    }
    if (material.map) material.map.anisotropy = 8;
    if (
      material.alphaTest > 0 ||
      material.name.toLowerCase().includes('needle')
    ) {
      material.side = THREE.DoubleSide;
      material.alphaTest = material.name.toLowerCase().includes('needle')
        ? 0.37
        : 0.42;
      material.alphaToCoverage = true;
      material.transparent = false;
      material.roughness = 0.95;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.08;',
        );
      };
      material.customProgramCacheKey = () => 'pine-transmission-v1';
    }
    if (options.windUniform) {
      const configureMaterial = material.onBeforeCompile;
      material.onBeforeCompile = (shader) => {
        configureMaterial(shader);
        shader.uniforms.uPlantTime = options.windUniform;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nuniform float uPlantTime;',
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float phase = uPlantTime * 0.75 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
            transformed.x += sin(phase) * pow(max(position.y, 0.0), 1.4) * 0.095;
            transformed.z += cos(phase * 1.23) * pow(max(position.y, 0.0), 1.4) * 0.047;
          #endif`,
        );
      };
      material.customProgramCacheKey = () => `scanned-foliage-${prototypeName}`;
    }
    disposables.push(geometry, material);
    batches.push(
      ...createBatches(
        group,
        geometry,
        material,
        entries,
        `${prototypeName}/${part.name}`,
        { shadow: true, ...options },
      ),
    );
  });
  return batches;
}

function treePlacements() {
  const random = createRandom(190724);
  const points = [];
  const hero = [
    [-7.5, 15, 1.1],
    [15, 22, 0.96],
    [-10, 27, 1.14],
    [21, 7, 0.93],
    [-6.5, -4, 0.87],
    [21, -19, 1.02],
    [-8, -27, 1.1],
    [17, -37, 0.99],
  ];
  for (const [x, z, scale] of hero)
    points.push({ x, z, scale, angle: random() * 6.28 });
  for (let attempt = 0; attempt < 5000 && points.length < 278; attempt++) {
    const range = points.length < 145 ? 44 : 77;
    const x = (random() * 2 - 1) * range;
    const z = (random() * 2 - 1) * range;
    if (pathDistance(x, z) < 3.6) continue;
    // A deliberate canopy break admits the morning key into the foreground path.
    if (
      x > 3 &&
      x < 24 &&
      z > -14 &&
      z < 23 &&
      Math.abs(x - (23 - z) * 0.5) < 6.2
    )
      continue;
    if (Math.hypot(x - 14, z + 24) < 7.4) continue;
    if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 3.8))
      continue;
    points.push({
      x,
      z,
      scale: 0.61 + random() * 0.49,
      angle: random() * 6.28,
    });
  }
  for (const [centerX, centerZ] of [
    [-29, -51],
    [-16, -59],
    [-3, -57],
    [12, -60],
    [27, -54],
    [-42, -60],
    [39, -65],
  ]) {
    for (let i = 0; i < 4; i++) {
      const x = centerX + (random() - 0.5) * 10;
      const z = centerZ + (random() - 0.5) * 11;
      points.push({
        x,
        z,
        scale: 0.73 + random() * 0.4,
        angle: random() * 6.28,
      });
    }
  }
  const result = [[], [], []];
  for (const [index, point] of points.entries()) {
    const scale = new THREE.Vector3(
      point.scale * (0.83 + random() * 0.25),
      point.scale,
      point.scale * (0.83 + random() * 0.25),
    );
    result[[0, 1, 2, 0, 1][index % 5]].push({
      ...point,
      matrix: matrixAt(point.x, point.z, scale, point.angle, -0.06),
    });
  }
  return result;
}

function scatter(random, count, radius, filter, scaleRange, colorRange) {
  const entries = [];
  for (
    let attempt = 0;
    attempt < count * 12 && entries.length < count;
    attempt++
  ) {
    const x = (random() * 2 - 1) * radius;
    const z = (random() * 2 - 1) * radius;
    if (filter && !filter(x, z, random)) continue;
    const scale = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
    const entry = {
      x,
      z,
      matrix: matrixAt(x, z, scale, random() * Math.PI * 2),
    };
    if (colorRange)
      entry.color = colorRange[0].clone().lerp(colorRange[1], random());
    entries.push(entry);
  }
  return entries;
}

function buildGroundcover(group, kit, windUniform, disposables) {
  const random = createRandom(92151);
  const short = [],
    tall = [],
    tiny = [],
    ferns = [[], []],
    distant = [];
  const palette = [new THREE.Color('#f5f6ed'), new THREE.Color('#ffffff')];
  const colonies = [
    [-3.6, 23],
    [4, 22],
    [-3.9, 16],
    [5.3, 13],
    [-3.1, 7],
    [7.6, 3],
    [-2.8, -4],
    [9, -8],
    [-3.4, -15],
    [9.8, -23],
    [-5.2, -30],
    [10, -34],
    [-10.8, 27],
    [13.5, 23],
    [-13, 7],
    [17, -17],
    [-14, -28],
    [21, -39],
  ];
  function plantInColony(
    target,
    centerX,
    centerZ,
    radius,
    count,
    minScale,
    maxScale,
    allowEdge = false,
  ) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const spread = Math.sqrt(random()) * radius;
      const x = centerX + Math.cos(angle) * spread;
      const z = centerZ + Math.sin(angle) * spread * (0.7 + random() * 0.7);
      const threshold = pathWidth(z) - (allowEdge ? 0.45 : 0.1);
      if (pathDistance(x, z) < threshold) continue;
      const scale = minScale + random() * (maxScale - minScale);
      target.push({
        x,
        z,
        matrix: matrixAt(x, z, scale, random() * Math.PI * 2, -0.012),
        color: palette[0].clone().lerp(palette[1], random()),
      });
    }
  }
  for (const [index, [authoredX, z]] of colonies.entries()) {
    const side = index % 2 === 0 ? -1 : 1;
    const x =
      index < 12 ? pathCenter(z) + side * (3.15 + random() * 1.15) : authoredX;
    const radius = 1.75 + random() * 1.15;
    plantInColony(short, x, z, radius, 128, 2.15, 2.8, true);
    plantInColony(tall, x, z, radius + 0.3, 19, 1.05, 1.55);
    plantInColony(tiny, x, z, radius + 0.65, 72, 1.1, 2);
    plantInColony(
      ferns[index % 2],
      x + (x < pathCenter(z) ? -0.7 : 0.7),
      z + 0.7,
      radius * 0.7,
      11,
      1.35,
      1.9,
    );
  }
  for (let colony = 0; colony < 75; colony++) {
    const x = (random() * 2 - 1) * (colony < 45 ? 32 : 72);
    const z = colony < 45 ? random() * 88 - 50 : (random() * 2 - 1) * 72;
    if (pathDistance(x, z) < 4) continue;
    plantInColony(distant, x, z, 2.2 + random() * 2.3, 31, 2, 2.7);
    plantInColony(tiny, x, z, 3.3, 38, 1.0, 2.0);
  }
  // Ferns sit against boulder contacts and hummocks, not in parallel verge bands.
  for (const [index, [x, z]] of [
    [-5.8, 10],
    [6.7, 14.5],
    [-7, -3],
    [15, -12],
    [-4.5, -20],
    [-12, 25],
    [-11, -43],
    [11, -47],
  ].entries()) {
    plantInColony(ferns[index % 2], x, z, 1.45, 10, 1.1, 1.6);
  }
  function addReserve(entries) {
    const count = entries.length;
    for (let i = 0; i < count; i += 2) {
      const source = entries[i];
      const x = source.x + (random() - 0.5) * 0.7;
      const z = source.z + (random() - 0.5) * 0.7;
      const position = new THREE.Vector3(),
        quaternion = new THREE.Quaternion(),
        scale = new THREE.Vector3();
      source.matrix.decompose(position, quaternion, scale);
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, scale, random() * Math.PI * 2, -0.012),
        color: source.color,
        reserve: true,
      });
    }
  }
  [short, tall, tiny, distant, ...ferns].forEach(addReserve);
  const shortLod = kit.getObjectByName('grass_short_lod')
    ? 'grass_short_lod'
    : 'grass_tiny';
  if (shortLod === 'grass_tiny') tiny.push(...distant);
  const options = {
    density: true,
    shadow: true,
    chunkSize: 32,
    color: true,
    windUniform,
  };
  const batches = [
    ...instancePrototype(
      group,
      kit,
      'grass_short',
      short,
      disposables,
      options,
    ),
    ...instancePrototype(group, kit, 'grass_tall', tall, disposables, options),
    ...instancePrototype(group, kit, 'grass_tiny', tiny, disposables, {
      ...options,
      shadow: false,
    }),
    ...instancePrototype(group, kit, 'fern_a', ferns[0], disposables, options),
    ...instancePrototype(group, kit, 'fern_b', ferns[1], disposables, options),
  ];
  if (shortLod !== 'grass_tiny')
    batches.push(
      ...instancePrototype(group, kit, shortLod, distant, disposables, {
        ...options,
        shadow: false,
      }),
    );
  return batches;
}

function buildDebris(group, disposables) {
  const random = createRandom(31199);
  const pebbleGeometry = new THREE.DodecahedronGeometry(0.065, 1);
  pebbleGeometry.scale(1, 0.6, 0.8);
  const pebbleMaterial = new THREE.MeshStandardMaterial({
    color: '#a29b83',
    roughness: 0.99,
  });
  const stickGeometry = new THREE.CylinderGeometry(0.009, 0.016, 0.5, 5);
  stickGeometry.rotateZ(Math.PI / 2);
  stickGeometry.translate(0, 0.027, 0);
  const stickMaterial = new THREE.MeshStandardMaterial({
    color: '#3b3024',
    roughness: 0.98,
  });
  const pebbles = scatter(
    random,
    1500,
    48,
    (x, z, rng) => pathDistance(x, z) < 3.8 || rng() < 0.15,
    [0.28, 1.15],
    [new THREE.Color('#aaa797'), new THREE.Color('#6c6758')],
  );
  const sticks = scatter(random, 540, 54, () => true, [0.4, 1.5]);
  disposables.push(
    pebbleGeometry,
    pebbleMaterial,
    stickGeometry,
    stickMaterial,
  );
  return [
    ...createBatches(
      group,
      pebbleGeometry,
      pebbleMaterial,
      pebbles,
      'Trail gravel',
      { density: true, color: true },
    ),
    ...createBatches(
      group,
      stickGeometry,
      stickMaterial,
      sticks,
      'Fallen twigs',
      { density: true },
    ),
  ];
}

function buildSaplings(group, kit, disposables) {
  const random = createRandom(88291);
  const entries = [];
  for (let i = 0; i < 104; i++) {
    const edge = i % 4;
    const along = random() * 146 - 73;
    const distance = 61 + random() * 15;
    const x = edge < 2 ? along : distance * (edge === 2 ? 1 : -1);
    const z = edge < 2 ? distance * (edge === 0 ? 1 : -1) : along;
    entries.push({
      x,
      z,
      matrix: matrixAt(x, z, 0.8 + random() * 0.95, random() * 6.28),
    });
  }
  for (const [centerX, centerZ] of [
    [-19, -13],
    [20, -28],
    [-15, -39],
    [23, 9],
    [-28, 24],
  ]) {
    for (let i = 0; i < 5; i++) {
      const x = centerX + (random() - 0.5) * 7;
      const z = centerZ + (random() - 0.5) * 7;
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, 0.7 + random() * 0.55, random() * 6.28),
      });
    }
  }
  for (const [centerX, centerZ] of [
    [-25, -44],
    [-15, -48],
    [-3, -51],
    [11, -50],
    [24, -49],
    [-35, -56],
    [35, -56],
  ]) {
    for (let i = 0; i < 8; i++) {
      const x = centerX + (random() - 0.5) * 9;
      const z = centerZ + (random() - 0.5) * 10;
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, 0.9 + random() * 0.8, random() * 6.28),
      });
    }
  }
  // A kit may omit the optional younger age class without breaking world loading.
  if (kit.getObjectByName('pine_sapling')) {
    instancePrototype(group, kit, 'pine_sapling', entries, disposables);
    return entries.length;
  }
  return 0;
}

function rockPlacements() {
  const random = createRandom(91824);
  const points = scatter(
    random,
    135,
    73,
    (x, z) => pathDistance(x, z) > pathWidth(z) + 1.0,
    [0.32, 1.23],
  );
  const hero = [
    [-5.8, 10, 0.64],
    [6.7, 14.5, 0.82],
    [-7, -3, 1.35],
    [15, -12, 0.78],
    [-4.5, -20, 1.2],
    [-10, 28, 1.5],
  ];
  for (const [x, z, scale] of hero)
    points.push({
      x,
      z,
      matrix: matrixAt(
        x,
        z,
        new THREE.Vector3(scale * 1.1, scale * 0.86, scale),
        random() * 6.28,
        -0.15,
      ),
    });
  return [
    points.filter((_, index) => index % 2 === 0),
    points.filter((_, index) => index % 2 === 1),
  ];
}

export function createForestWorld() {
  const group = new THREE.Group();
  group.name = 'Alder Vale — fixed 160 metre forest';
  const disposables = [];
  const windUniform = { value: 0 };
  let settings = { quality: 'high', richness: 1 };
  let densityBatches = [];
  let context;
  const stats = {
    trees: 0,
    batches: 0,
    terrainArea: WORLD_SIZE * WORLD_SIZE,
    asset: 'Blender forest-kit.glb',
    vegetationInstances: 0,
  };
  return {
    id: 'forest-world',
    stats,
    async init(initialContext) {
      context = initialContext;
      const suppliedKit =
        context.assets instanceof Map
          ? context.assets.get('forestKit')
          : context.assets?.forestKit;
      const [textures, loadedKit] = await Promise.all([
        loadTerrainTextures(context.renderer),
        suppliedKit
          ? Promise.resolve(suppliedKit)
          : new GLTFLoader().loadAsync(`${ASSET_ROOT}forest-kit.glb`),
      ]);
      const kit = loadedKit.scene || loadedKit;
      disposables.push(...Object.values(textures));
      const terrain = buildTerrain(textures);
      disposables.push(terrain.geometry, terrain.material);
      group.add(terrain);
      const trees = treePlacements();
      stats.trees = trees.reduce((sum, family) => sum + family.length, 0);
      ['pine_a', 'pine_b', 'pine_c'].forEach((name, index) =>
        instancePrototype(group, kit, name, trees[index], disposables),
      );
      stats.saplings = buildSaplings(group, kit, disposables);
      const rocks = rockPlacements();
      instancePrototype(group, kit, 'rock_a', rocks[0], disposables);
      instancePrototype(group, kit, 'rock_b', rocks[1], disposables);
      const deadfall = [
        [-9.2, 5, 0.9, 0.38],
        [9.2, -24, 0.74, 2.1],
        [-16, -16, 1.03, 0.9],
        [16, 28, 0.85, 1.4],
        [23, -43, 0.8, 2.9],
      ];
      instancePrototype(
        group,
        kit,
        'fallen_log',
        deadfall.map(([x, z, scale, angle]) => ({
          x,
          z,
          matrix: matrixAt(x, z, scale, angle),
        })),
        disposables,
      );
      densityBatches = [
        ...buildGroundcover(group, kit, windUniform, disposables),
        ...buildDebris(group, disposables),
      ];
      group.traverse((object) => {
        if (object.isInstancedMesh) stats.batches++;
      });
      context.scene.add(group);
      context.renderer.shadowMap.needsUpdate = true;
      this.configure(settings);
      // Originals are never added to the scene; their buffers are now independently owned.
      const originalGeometries = new Set();
      const originalMaterials = new Set();
      const sharedTextures = new Set();
      kit.traverse((object) => {
        if (object.isMesh) {
          originalGeometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            originalMaterials.add(material);
            for (const value of Object.values(material)) {
              if (value?.isTexture) sharedTextures.add(value);
            }
          }
        }
      });
      if (!suppliedKit) {
        originalGeometries.forEach((geometry) => geometry.dispose());
        originalMaterials.forEach((material) => material.dispose());
        disposables.push(...sharedTextures);
      }
    },
    configure(nextSettings) {
      const geometryChanged =
        (nextSettings.quality !== undefined &&
          nextSettings.quality !== settings.quality) ||
        (nextSettings.richness !== undefined &&
          nextSettings.richness !== settings.richness);
      settings = { ...settings, ...nextSettings };
      const ratio =
        (QUALITY_DENSITY[settings.quality] || 1) * settings.richness;
      stats.vegetationInstances = 0;
      for (const mesh of densityBatches) {
        mesh.count = Math.max(
          1,
          Math.min(
            mesh.userData.maxCount,
            Math.round(mesh.userData.baseCount * ratio),
          ),
        );
        stats.vegetationInstances += mesh.count;
      }
      if (context && geometryChanged)
        context.renderer.shadowMap.needsUpdate = true;
    },
    update(_dt, elapsed) {
      windUniform.value = elapsed;
    },
    dispose() {
      group.removeFromParent();
      for (const item of new Set(disposables)) item.dispose();
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      group.clear();
      densityBatches = [];
    },
  };
}

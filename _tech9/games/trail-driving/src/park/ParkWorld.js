import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { softenShadowSampling } from '../core/softShadows.js';
import {
  height,
  trailSample,
  surface,
  ROUTES,
  placements,
  colliders,
  GARAGE_POSTS,
  createRandom,
  TERRAIN_SIZE,
  TERRAIN_RESOLUTION,
} from './parkData.js';

const ASSET_ROOT = `${import.meta.env?.BASE_URL ?? './'}assets/`;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

function groundMaterial(textures) {
  const material = new THREE.MeshStandardMaterial({
    map: textures.floorColor,
    normalMap: textures.floorNormal,
    roughnessMap: textures.floorRoughness,
    roughness: 1,
    normalScale: new THREE.Vector2(0.65, 0.65),
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      pathColor: { value: textures.pathColor },
      pathNormal: { value: textures.pathNormal },
      pathRoughness: { value: textures.pathRoughness },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float trail;\nvarying float vTrail;\nvarying vec3 vGround;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTrail=trail;\nvGround=position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform sampler2D pathColor;
      uniform sampler2D pathNormal;
      uniform sampler2D pathRoughness;
      varying float vTrail;
      varying vec3 vGround;
    `,
      )
      .replace(
        '#include <map_fragment>',
        `
      vec4 floorSample=texture2D(map,vMapUv);
      vec4 roadSample=texture2D(pathColor,vMapUv*0.88+vec2(.217,.531));
      float noise=(floorSample.g-floorSample.r)*1.4+(floorSample.r-.3)*.45;
      float road=smoothstep(.12,.9,vTrail+noise*(1.-abs(vTrail*2.-1.)));
      vec4 soil=roadSample*vec4(1.5,1.29,1.02,1.);
      diffuseColor*=mix(floorSample*vec4(.82,.99,.65,1.),soil,road);
      float macro=.94+.06*sin(vGround.x*.043+cos(vGround.z*.037))*sin(vGround.z*.051);
      diffuseColor.rgb*=macro;
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
      float roughnessFactor=max(.78,roughness*mix(texture2D(roughnessMap,vRoughnessMapUv).g,texture2D(pathRoughness,vRoughnessMapUv*.88+vec2(.217,.531)).g,road));
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec3 mapN=mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(pathNormal,vNormalMapUv*.88+vec2(.217,.531)).xyz,road)*2.-1.;',
        ),
      );
  };
  material.customProgramCacheKey = () => 'alder-terrain-v1';
  return material;
}

async function loadTextures(renderer, owned) {
  const loader = new THREE.TextureLoader();
  const textures = {};
  await Promise.all(
    [
      ['floorColor', 'forest-floor-color.jpg'],
      ['floorNormal', 'forest-floor-normal.jpg'],
      ['floorRoughness', 'forest-floor-roughness.jpg'],
      ['pathColor', 'path-color.jpg'],
      ['pathNormal', 'path-normal.jpg'],
      ['pathRoughness', 'path-roughness.jpg'],
    ].map(async ([key, file]) => {
      const t = await loader.loadAsync(`${ASSET_ROOT}textures/${file}`);
      owned.add(t);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (key.endsWith('Color')) t.colorSpace = THREE.SRGBColorSpace;
      textures[key] = t;
    }),
  );
  return textures;
}

function terrain(textures, owned) {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_RESOLUTION,
    TERRAIN_RESOLUTION,
  );
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  const trail = new Float32Array(p.count),
    colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      y = height(x, z);
    p.setY(i, y);
    uv.setXY(i, x / 4.2, z / 4.2);
    const d = trailSample(x, z).distance;
    const apron = clamp((34 - Math.hypot(x, z - 250)) / 8, 0, 1);
    trail[i] = Math.max(apron, clamp((7.6 - d) / 2.1, 0, 1));
    const ridge = clamp((x - 70) / 140, 0, 1) * clamp((-z + 100) / 200, 0, 1);
    const variation =
      Math.sin(x * 0.037 + z * 0.013) * Math.cos(z * 0.041) * 0.04;
    colors[i * 3] = 0.88 + ridge * 0.17 + variation;
    colors[i * 3 + 1] = 0.94 + ridge * 0.06 + variation;
    colors[i * 3 + 2] = 0.8 - ridge * 0.03 + variation;
  }
  geometry.setAttribute('trail', new THREE.BufferAttribute(trail, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = groundMaterial(textures);
  owned.add(geometry);
  owned.add(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Continuous contact terrain · worn dirt / forest / granite';
  mesh.receiveShadow = true;
  return mesh;
}

function placementMatrix(item) {
  const scale = item.scale ?? 1;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      item.x,
      height(item.x, item.z) + (item.offset ?? 0),
      item.z,
    ),
    new THREE.Quaternion().setFromAxisAngle(UP, item.rotation ?? 0),
    new THREE.Vector3(scale, scale, scale),
  );
}

function instanceKit(
  group,
  kit,
  name,
  entries,
  owned,
  { chunkSize = 85, shadow = true, density = false } = {},
) {
  if (!entries.length) return [];
  const prototype = kit.getObjectByName(name);
  if (!prototype) throw new Error(`Forest asset is missing ${name}`);
  prototype.updateWorldMatrix(true, true);
  const inverseRoot = prototype.matrixWorld.clone().invert();
  const chunks = new Map();
  for (const entry of entries) {
    const key = `${Math.floor(entry.x / chunkSize)}:${Math.floor(entry.z / chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(entry);
  }
  const batches = [];
  prototype.traverse((part) => {
    if (!part.isMesh) return;
    const geometry = part.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverseRoot, part.matrixWorld),
      );
    const material = part.material.clone();
    owned.add(geometry);
    owned.add(material);
    material.envMapIntensity = 0.3;
    if (material.map) material.map.anisotropy = 4;
    if (name.startsWith('rock')) material.normalScale?.setScalar(0.65);
    if (name.startsWith('grass') || name.startsWith('fern')) {
      material.color.multiplyScalar(1.35);
      material.normalScale?.setScalar(0.4);
      material.emissive.set('#597448');
      material.emissiveIntensity = 0.1;
    }
    if (
      material.alphaTest > 0 ||
      material.name.toLowerCase().includes('needle')
    ) {
      material.side = THREE.DoubleSide;
      material.alphaTest = 0.38;
      material.transparent = false;
      material.alphaToCoverage = true;
      material.roughness = 0.96;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse+=diffuseColor.rgb*.09;',
        );
      };
      material.customProgramCacheKey = () => 'alder-needles-v1';
    }
    softenShadowSampling(material);
    for (const [key, items] of chunks) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      mesh.name = `${name} ${key}`;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.userData.fullCount = items.length;
      mesh.userData.density = density;
      if (name.startsWith('pine_') && part.name.includes('wood'))
        mesh.userData.detailRange = 175;
      items.forEach((item, i) => mesh.setMatrixAt(i, placementMatrix(item)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      batches.push(mesh);
      if (mesh.userData.detailRange) {
        const trunkHeight = { pine_a: 21.5, pine_b: 24, pine_c: 19.6 }[name];
        const lowGeometry = new THREE.CylinderGeometry(
          0.07,
          0.4,
          trunkHeight,
          5,
          1,
        );
        lowGeometry.translate(0, trunkHeight / 2, 0);
        owned.add(lowGeometry);
        const low = new THREE.InstancedMesh(
          lowGeometry,
          material,
          items.length,
        );
        low.instanceMatrix = mesh.instanceMatrix;
        low.name = `${name} distant trunks ${key}`;
        low.castShadow = true;
        low.receiveShadow = true;
        low.computeBoundingSphere();
        low.visible = false;
        mesh.userData.distant = low;
        group.add(low);
        batches.push(low);
      }
    }
  });
  return batches;
}

function makeSignTexture(
  lines,
  {
    background = '#183c38',
    accent = '#e3b255',
    width = 1024,
    height: canvasHeight = 384,
  } = {},
  owned,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, canvasHeight);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 9;
  ctx.strokeRect(16, 16, width - 32, canvasHeight - 32);
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? '700' : '500'} ${i === 0 ? Math.min(104, (width / line.length) * 1.46) : Math.min(50, (width / line.length) * 1.5)}px "Barlow", "Arial", sans-serif`;
    ctx.fillStyle = i === 0 ? '#fff5d7' : accent;
    ctx.fillText(line, width / 2, canvasHeight * (i === 0 ? 0.4 : 0.75));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  owned.add(texture);
  return texture;
}

function buildStructures(group, owned) {
  const parts = new Map();
  const basic = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      ...extra,
    });
    owned.add(m);
    return m;
  };
  const timber = basic('#58432d'),
    cutTimber = basic('#ab8953'),
    steel = basic('#223d3a', { metalness: 0.45, roughness: 0.56 }),
    cream = basic('#e8dcc0'),
    rubber = basic('#302f29'),
    stone = basic('#8b897b');
  const routeMaterials = ROUTES.map((r) => basic(r.color));
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3();
  const add = (
    geometry,
    material,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    yaw = 0,
  ) => {
    matrix.compose(
      v.set(x, y, z),
      q.setFromAxisAngle(UP, yaw),
      new THREE.Vector3(sx, sy, sz),
    );
    geometry.applyMatrix4(matrix);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  };
  const box = (m, x, y, z, sx, sy, sz, yaw = 0) =>
    add(new THREE.BoxGeometry(1, 1, 1), m, x, y, z, sx, sy, sz, yaw);
  const cylinder = (m, x, y, z, r, h, segments = 8) =>
    add(new THREE.CylinderGeometry(r, r, h, segments), m, x, y, z);
  const sign = (lines, x, y, z, width, canvasHeight, yaw = 0, accent) => {
    const map = makeSignTexture(
      lines,
      { accent, width: 1024, height: canvasHeight > 1 ? 384 : 256 },
      owned,
    );
    const mat = basic('#ffffff', {
      map,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(width, canvasHeight);
    add(geometry, mat, x, y, z, 1, 1, 1, yaw);
  };
  const base = height(0, 250);
  GARAGE_POSTS.forEach(([x, z]) => {
    box(timber, x, height(x, z) + 2.9, z, 0.55, 5.8, 0.55);
    box(stone, x, height(x, z) + 0.25, z, 0.84, 0.5, 0.84);
  });
  box(timber, 0, base + 5.4, 249, 23, 0.48, 0.45);
  box(timber, 0, base + 5.4, 266, 23, 0.48, 0.45);
  box(timber, -11, base + 5.4, 257.5, 0.4, 0.44, 17);
  box(timber, 11, base + 5.4, 257.5, 0.4, 0.44, 17);
  // Shallow pitched roof with visible warm timber rafters beneath it.
  for (const side of [-1, 1]) {
    const geo = new THREE.BoxGeometry(12.7, 0.23, 22);
    geo.rotateZ(side * -0.14);
    add(geo, steel, side * 6.2, base + 6.02, 257.5);
  }
  for (let i = 0; i < 8; i++)
    box(cutTimber, 0, base + 5.55, 247.3 + i * 2.9, 25, 0.22, 0.22);
  box(timber, 0, base + 1.7, 269, 23, 3.4, 0.3);
  for (let x = -10; x <= 10; x += 1.05)
    box(cutTimber, x, base + 1.7, 268.8, 0.06, 3.2, 0.08);
  sign(
    ['NORTH CASCADE', 'TRAIL DRIVING PARK  /  BASECAMP'],
    0,
    base + 4.48,
    247.7,
    16,
    1.62,
    Math.PI,
    '#dab775',
  );
  sign(
    ['GARAGE', 'CHOOSE YOUR LINE'],
    0,
    base + 2.28,
    268.57,
    7.8,
    1.22,
    Math.PI,
  );
  // Workbench, stacked tires, fuel cans and a well-used trailhead apron.
  box(timber, 7.4, base + 1.2, 266, 5.2, 0.25, 1.6);
  for (const x of [5.2, 9.6]) box(steel, x, base + 0.55, 266, 0.18, 1.1, 1.3);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++)
      cylinder(
        rubber,
        -8 + j * 1.25,
        base + 0.2 + i * 0.38,
        265,
        0.57,
        0.34,
        12,
      );
  for (let i = 0; i < 3; i++) {
    box(routeMaterials[1], 5.6 + i * 0.9, base + 1.7, 266, 0.55, 0.78, 0.33);
    box(steel, 5.6 + i * 0.9, base + 2.14, 266, 0.2, 0.1, 0.16);
  }
  for (const x of [-5, 0, 5]) {
    box(cream, x, base + 0.018, 254, 0.11, 0.015, 9);
  }
  cylinder(timber, -28, height(-28, 249) + 2, 249, 0.3, 4);
  sign(
    ['TRAILS', '01 FERNWOOD  /  02 GRANITE  /  03 SKYLINE'],
    -28,
    height(-28, 249) + 3.2,
    249,
    6.5,
    2.4,
    Math.PI,
  );
  box(stone, -28, height(-28, 249) + 0.65, 249, 3.8, 1.3, 2);
  for (let r = 0; r < ROUTES.length; r++) {
    const route = ROUTES[r],
      mat = routeMaterials[r];
    route.gates.forEach((gate, index) => {
      for (const side of [-1, 1]) {
        const x =
            gate.x + Math.cos(gate.heading) * (gate.width / 2 + 0.45) * side,
          z = gate.z + Math.sin(gate.heading) * (gate.width / 2 + 0.45) * side,
          y = height(x, z);
        cylinder(timber, x, y + 0.82, z, 0.15, 1.64, 6);
        box(mat, x, y + 1.33, z, 0.38, 0.54, 0.14, -gate.heading);
      }
      if (index % 4 === 0) {
        const x = gate.x + Math.cos(gate.heading) * 9.6,
          z = gate.z + Math.sin(gate.heading) * 9.6,
          y = height(x, z);
        cylinder(timber, x, y + 1.65, z, 0.13, 3.3, 6);
        sign(
          [
            `${String(r + 1).padStart(2, '0')}  ${route.name.toUpperCase()}`,
            index === 0
              ? 'START  ↑'
              : `${Math.round((index / (route.gates.length - 1)) * 100)}%  /  KEEP FOLLOWING THE MARKERS`,
          ],
          x,
          y + 2.65,
          z,
          4.4,
          1.25,
          -gate.heading,
          route.color,
        );
      }
    });
  }
  // Skyline lookout pavilion: a destination visible from the northern ridge.
  const lx = 191,
    lz = -248,
    ly = height(lx, lz);
  for (const dx of [-3, 3])
    for (const dz of [-2, 2])
      box(timber, lx + dx, ly + 1.8, lz + dz, 0.25, 3.6, 0.25);
  box(steel, lx, ly + 3.7, lz, 7, 0.22, 5);
  box(timber, lx, ly + 0.8, lz + 1.6, 5.5, 0.18, 0.75);
  sign(
    ['SKYLINE', 'ELEVATION  42 m'],
    lx,
    ly + 2.7,
    lz + 2.1,
    4,
    1,
    0,
    ROUTES[2].color,
  );
  // Chunk-free primitives are compact and intentionally combined by material.
  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    owned.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Park timber, garage and route furniture';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function createRoadLines(group, owned) {
  const lines = [];
  for (const route of ROUTES) {
    const vertices = [];
    for (let i = 3; i < route.points.length - 3; i += 6) {
      const a = route.points[i],
        b = route.points[i + 1];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz),
        rx = -dz / len,
        rz = dx / len;
      // Low painted edge tabs remain legible through the intersections.
      for (const side of [-1, 1]) {
        const cx = a.x + rx * 6.1 * side,
          cz = a.z + rz * 6.1 * side;
        const points = [
          [-0.09, -1.8],
          [0.09, -1.8],
          [0.09, 1.8],
          [-0.09, 1.8],
        ].map(([w, l]) => {
          const x = cx + rx * w + (dx / len) * l,
            z = cz + rz * w + (dz / len) * l;
          return [x, height(x, z) + 0.045, z];
        });
        for (const k of [0, 1, 2, 0, 2, 3]) vertices.push(...points[k]);
      }
      if (i % 18 === 3) {
        const arrow = [
          [-0.45, 0.6],
          [0.45, 0.6],
          [0, -1.1],
        ];
        for (const [w, l] of arrow) {
          const x = a.x + rx * w + (dx / len) * -l,
            z = a.z + rz * w + (dz / len) * -l;
          vertices.push(x, height(x, z) + 0.05, z);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: route.color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    owned.add(geometry);
    owned.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${route.name} route edge paint`;
    mesh.userData.route = route.id;
    group.add(mesh);
    lines.push(mesh);
  }
  return lines;
}

function createNextGate(group, owned) {
  const arch = new THREE.Group();
  arch.name = 'Next directional checkpoint';
  const color = new THREE.MeshStandardMaterial({
    color: '#e2ad51',
    emissive: '#e2ad51',
    emissiveIntensity: 0.2,
    roughness: 0.65,
  });
  const pole = new THREE.MeshStandardMaterial({
    color: '#213d36',
    metalness: 0.45,
    roughness: 0.5,
  });
  owned.add(color);
  owned.add(pole);
  for (const side of [-1, 1]) {
    const geometry = new THREE.CylinderGeometry(0.13, 0.17, 4.9, 8);
    owned.add(geometry);
    const mesh = new THREE.Mesh(geometry, pole);
    mesh.position.set(side * 7.95, 2.45, 0);
    mesh.castShadow = true;
    arch.add(mesh);
    const flagGeometry = new THREE.BoxGeometry(0.5, 1.7, 0.16);
    owned.add(flagGeometry);
    const flag = new THREE.Mesh(flagGeometry, color);
    flag.position.set(side * 7.95, 3.15, 0);
    arch.add(flag);
  }
  const geometry = new THREE.BoxGeometry(16.4, 0.52, 0.16);
  owned.add(geometry);
  const header = new THREE.Mesh(geometry, color);
  header.position.y = 4.85;
  arch.add(header);
  const map = makeSignTexture(
    ['CHECKPOINT', 'FOLLOW THE COLORED ROUTE'],
    {},
    owned,
  );
  const mat = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  owned.add(mat);
  const signGeometry = new THREE.PlaneGeometry(5.2, 1.8);
  owned.add(signGeometry);
  const sign = new THREE.Mesh(signGeometry, mat);
  sign.position.set(0, 4.92, 0.12);
  arch.add(sign);
  const lineGeometry = new THREE.BoxGeometry(15, 0.035, 0.28);
  owned.add(lineGeometry);
  const line = new THREE.Mesh(lineGeometry, color);
  line.position.y = 0.07;
  arch.add(line);
  group.add(arch);
  return { arch, color, map };
}

function mountainRing(group, owned) {
  const geometry = new THREE.BufferGeometry(),
    vertices = [],
    colors = [];
  const count = 128;
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const sample = (j, outer) => {
      const a = (j / count) * Math.PI * 2;
      const radius = outer ? 680 + 70 * Math.sin(a * 5) : 306;
      const peak = outer
        ? 92 +
          43 * Math.sin(a * 3.1 + 0.3) +
          35 * Math.sin(a * 7.7) +
          20 * Math.cos(a * 13)
        : height(Math.sin(a) * 300, Math.cos(a) * 300) - 3;
      return [Math.sin(a) * radius, peak, Math.cos(a) * radius];
    };
    const a = sample(i, false),
      b = sample(i + 1, false),
      c = sample(i, true),
      d = sample(i + 1, true);
    for (const p of [a, c, b, b, c, d]) {
      vertices.push(...p);
      color.setRGB(
        0.27 + p[1] * 0.0008,
        0.36 + p[1] * 0.0007,
        0.34 + p[1] * 0.0008,
      );
      colors.push(color.r, color.g, color.b);
    }
  }
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  owned.add(geometry);
  owned.add(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Distant alpine ridgelines';
  group.add(mesh);
}

function groundcover() {
  const random = createRandom(68124),
    entries = [];
  for (const route of ROUTES)
    for (let i = 0; i < route.points.length; i += 3) {
      const a = route.points[i],
        b = route.points[(i + 1) % route.points.length],
        dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1])
        for (let j = 0; j < 2; j++) {
          const width = 8.3 + random() * 6,
            x = a.x - (dz / len) * width * side + (random() - 0.5) * 5,
            z = a.z + (dx / len) * width * side + (random() - 0.5) * 5;
          if (trailSample(x, z).distance < 7.7 || Math.hypot(x, z - 250) < 30)
            continue;
          entries.push({
            x,
            z,
            scale: 0.85 + random() * 1.3,
            rotation: random() * 6.28,
            prototype:
              x > 150
                ? 'grass_tall'
                : i % 5 === 0
                  ? 'fern_a'
                  : 'grass_short_lod',
          });
        }
    }
  return entries;
}

/** SceneApp layer: owns its meshes, kit copies and textures, never the renderer. */
export function createParkWorld() {
  const group = new THREE.Group();
  group.name = 'North Cascade · 600 metre driving park';
  const owned = new Set();
  let context,
    coverBatches = [],
    routeLines = [],
    nextGate,
    routeId = ROUTES[0].id,
    gateIndex = 0,
    lastLod = -1;
  const detailMeshes = [];
  let settings = { quality: 'balanced', richness: 1 };
  const stats = {
    trees: placements.filter((p) => p.kind === 'tree').length,
    rocks: placements.filter((p) => p.kind === 'rock').length,
    batches: 0,
    terrainArea: 360000,
    asset: 'Blender forest-kit.glb',
    vegetationInstances: 0,
  };
  return {
    id: 'park-world',
    stats,
    getColliders: () => colliders,
    async init(ctx) {
      context = ctx;
      const suppliedKit = ctx.assets?.get('forestKit');
      const [kit, textures] = await Promise.all([
        suppliedKit
          ? Promise.resolve(suppliedKit)
          : new GLTFLoader()
              .loadAsync(`${ASSET_ROOT}forest-kit.glb`)
              .then((g) => g.scene),
        loadTextures(ctx.renderer, owned),
      ]);
      group.add(terrain(textures, owned));
      mountainRing(group, owned);
      for (const name of ['pine_a', 'pine_b', 'pine_c', 'rock_a', 'rock_b'])
        instanceKit(
          group,
          kit,
          name,
          placements.filter((p) => p.prototype === name),
          owned,
        );
      const cover = groundcover();
      for (const name of ['grass_short_lod', 'grass_tall', 'fern_a'])
        coverBatches.push(
          ...instanceKit(
            group,
            kit,
            name,
            cover.filter((p) => p.prototype === name),
            owned,
            { chunkSize: 75, shadow: false, density: true },
          ),
        );
      buildStructures(group, owned);
      routeLines = createRoadLines(group, owned);
      nextGate = createNextGate(group, owned);
      group.traverse((o) => {
        if (o.isInstancedMesh) stats.batches++;
        if (o.userData.detailRange) detailMeshes.push(o);
      });
      if (!suppliedKit) {
        const geometries = new Set(),
          materials = new Set();
        kit.traverse((o) => {
          if (!o.isMesh) return;
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            for (const value of Object.values(m))
              if (value?.isTexture) owned.add(value);
          }
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
      }
      ctx.scene.add(group);
      this.configure(settings);
      this.setRoute(routeId, gateIndex);
      ctx.renderer.shadowMap.needsUpdate = true;
    },
    update(_dt, elapsed) {
      if (!context || elapsed - lastLod < 0.4) return;
      lastLod = elapsed;
      let changed = false;
      for (const mesh of detailMeshes) {
        const near =
          mesh.boundingSphere.center.distanceTo(context.camera.position) <
          mesh.userData.detailRange + mesh.boundingSphere.radius;
        if (near !== mesh.visible) {
          mesh.visible = near;
          mesh.userData.distant.visible = !near;
          changed = true;
        }
      }
      if (changed) context.renderer.shadowMap.needsUpdate = true;
    },
    configure(patch) {
      settings = { ...settings, ...patch };
      const fraction =
        (settings.quality === 'balanced'
          ? 0.7
          : settings.quality === 'ultra'
            ? 1
            : 0.88) * settings.richness;
      stats.vegetationInstances = 0;
      for (const mesh of coverBatches) {
        mesh.count = Math.max(
          1,
          Math.min(
            mesh.userData.fullCount,
            Math.round(mesh.userData.fullCount * fraction),
          ),
        );
        stats.vegetationInstances += mesh.count;
      }
      if (context) context.renderer.shadowMap.needsUpdate = true;
    },
    setRoute(id, next = 0) {
      routeId = id;
      gateIndex = next;
      const route = ROUTES.find((r) => r.id === id);
      for (const line of routeLines)
        line.material.opacity = line.userData.route === id ? 0.72 : 0.19;
      if (!nextGate) return;
      const gate = route?.gates[next];
      nextGate.arch.visible = Boolean(gate);
      if (!gate) return;
      nextGate.arch.position.set(gate.x, height(gate.x, gate.z), gate.z);
      nextGate.arch.rotation.y = -gate.heading;
      nextGate.color.color.set(route.color);
      nextGate.color.emissive.set(route.color);
      const canvas = nextGate.map.image,
        ctx = canvas.getContext('2d');
      ctx.fillStyle = '#183c38';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = route.color;
      ctx.lineWidth = 12;
      ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff4d9';
      ctx.font = '700 105px Barlow, Arial, sans-serif';
      ctx.fillText(
        next === route.gates.length - 1
          ? 'FINISH'
          : `${String(next + 1).padStart(2, '0')}  /  ${String(route.gates.length).padStart(2, '0')}`,
        512,
        145,
      );
      ctx.fillStyle = route.color;
      ctx.font = '500 47px Barlow, Arial, sans-serif';
      ctx.fillText(route.name.toUpperCase(), 512, 282);
      nextGate.map.needsUpdate = true;
      if (context) context.renderer.shadowMap.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      for (const item of owned) item.dispose();
      owned.clear();
      group.clear();
      coverBatches = [];
      routeLines = [];
      detailMeshes.length = 0;
      nextGate = null;
      context = null;
    },
  };
}

// The same surface contract is also useful to editor tooling importing this layer.
export { height, surface };

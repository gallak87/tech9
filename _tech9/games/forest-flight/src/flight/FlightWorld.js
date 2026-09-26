import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BOUNDS = 2400;
export const RUNWAY = Object.freeze({
  minZ: -450,
  maxZ: 450,
  width: 32,
  heading: 0,
});
export const LANDMARKS = Object.freeze([
  {
    id: 'ridge',
    name: 'West ridge',
    x: -700,
    y: 150,
    z: -800,
    color: '#f1bd68',
  },
  {
    id: 'forest',
    name: 'Forest turn',
    x: -850,
    y: 170,
    z: 500,
    color: '#a9d8cc',
  },
  {
    id: 'approach',
    name: 'Home approach',
    x: 0,
    y: 90,
    z: 1000,
    color: '#e5dfad',
  },
]);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Shared continuous height query; the runway and apron are exactly level. */
export function groundHeight(x, z) {
  const valley = smooth(350, 1750, Math.abs(x));
  const ridge = 0.65 + 0.35 * Math.sin(z * 0.0027 + x * 0.0018);
  const hills =
    valley * (130 + 230 * ridge) + smooth(1500, 2750, Math.abs(z)) * 170;
  const rolling =
    7 +
    11 * Math.sin(x * 0.005) * Math.cos(z * 0.004) +
    5 * Math.sin(x * 0.013 + z * 0.008);
  const strip = Math.max(
    smooth(55, 180, Math.abs(x)),
    smooth(700, 1000, Math.abs(z)),
  );
  const apron = Math.max(
    smooth(65, 140, Math.abs(x + 100)),
    smooth(125, 220, Math.abs(z - 250)),
  );
  return (hills + Math.max(0, rolling)) * Math.min(strip, apron);
}

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const trees = [];
const treeCells = new Map();
const random = randomSequence(81733);
for (let attempts = 0; trees.length < 4200 && attempts < 30000; attempts++) {
  const close = trees.length < 2200;
  const x = (random() * 2 - 1) * (close ? 1300 : 2320);
  const z = (random() * 2 - 1) * (close ? 1700 : 2320);
  if (Math.abs(x) < 80 && Math.abs(z) < 900) continue;
  if (Math.abs(x + 100) < 100 && Math.abs(z - 250) < 200) continue;
  // Irregular clearings make the treeline readable from the air.
  if (Math.sin(x * 0.012 + Math.cos(z * 0.006)) + Math.cos(z * 0.011) > 1.48)
    continue;
  const height = 17 + random() * 22;
  const tree = {
    x,
    z,
    y: groundHeight(x, z),
    height,
    radius: height * 0.19,
    angle: random() * Math.PI * 2,
    tone: random(),
  };
  trees.push(tree);
  const key = `${Math.floor(x / 80)},${Math.floor(z / 80)}`;
  if (!treeCells.has(key)) treeCells.set(key, []);
  treeCells.get(key).push(tree);
}

/** Conservative visual proxies, indexed by the same placements as the forest. */
export function getObstacle(x, y, z, radius = 3) {
  if (
    x > -123 - radius &&
    x < -77 + radius &&
    z > 169 - radius &&
    z < 203 + radius &&
    y < 15 + radius &&
    y > -radius
  ) {
    return { id: 'hangar', name: 'the hangar' };
  }
  for (
    let ix = Math.floor((x - 12 - radius) / 80);
    ix <= Math.floor((x + 12 + radius) / 80);
    ix++
  ) {
    for (
      let iz = Math.floor((z - 12 - radius) / 80);
      iz <= Math.floor((z + 12 + radius) / 80);
      iz++
    ) {
      for (const tree of treeCells.get(`${ix},${iz}`) ?? []) {
        const relativeY = y - tree.y;
        if (relativeY < -radius || relativeY > tree.height + radius) continue;
        const treeRadius =
          relativeY < tree.height * 0.2
            ? 0.65
            : tree.radius * clamp(1.35 - relativeY / tree.height, 0.1, 1);
        if ((x - tree.x) ** 2 + (z - tree.z) ** 2 < (treeRadius + radius) ** 2)
          return { id: 'tree', name: 'the trees' };
      }
    }
  }
  return null;
}

function canvasTexture(width, height, draw, repeat = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createFlightWorld() {
  const group = new THREE.Group();
  group.name = 'Forest airfield';
  const resources = new Set();
  const markers = [];
  let windsock;
  let disposed = false;
  const keep = (resource) => {
    resources.add(resource);
    return resource;
  };
  const material = (color, options = {}) =>
    keep(
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options }),
    );
  function mesh(geometry, surface, x = 0, y = 0, z = 0, parent = group) {
    keep(geometry);
    const item = new THREE.Mesh(geometry, surface);
    item.position.set(x, y, z);
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(w, h, d, surface, x, y, z, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), surface, x, y, z, parent);
  }
  function horizontal(w, d, surface, x, y, z) {
    const item = mesh(new THREE.PlaneGeometry(w, d), surface, x, y, z);
    item.rotation.x = -Math.PI / 2;
    return item;
  }
  function terrain() {
    const texture = keep(
      canvasTexture(
        256,
        256,
        (ctx, w, h) => {
          ctx.fillStyle = '#c6c8b7';
          ctx.fillRect(0, 0, w, h);
          const rng = randomSequence(961);
          for (let i = 0; i < 18000; i++) {
            const v = Math.floor(115 + rng() * 115);
            ctx.fillStyle = `rgba(${v},${v + 5},${v - 10},0.24)`;
            ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 3);
          }
        },
        true,
      ),
    );
    const geometry = new THREE.PlaneGeometry(6500, 6500, 320, 320);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const color = new THREE.Color();
    const forestFloor = new THREE.Color('#647b5c');
    const meadow = new THREE.Color('#b6b084');
    const shale = new THREE.Color('#a2a49a');
    const mown = new THREE.Color('#a9af7d');
    // Concentrate terrain samples near the airfield, with one continuous surface.
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i) / 3250,
        pz = p.getZ(i) / 3250;
      const x = Math.sign(px) * Math.pow(Math.abs(px), 1.55) * 3250;
      const z = Math.sign(pz) * Math.pow(Math.abs(pz), 1.2) * 3250;
      const y = groundHeight(x, z);
      p.setXYZ(i, x, y - 0.045, z);
      const patch =
        Math.sin(x * 0.006 + Math.cos(z * 0.004) * 1.8) *
        Math.cos(z * 0.005 + Math.sin(x * 0.003));
      const glade = smooth(0.08, 0.75, patch);
      color.copy(forestFloor).lerp(meadow, glade * 0.82);
      const slope =
        Math.hypot(
          groundHeight(x + 5, z) - groundHeight(x - 5, z),
          groundHeight(x, z + 5) - groundHeight(x, z - 5),
        ) / 10;
      color.lerp(
        shale,
        smooth(130, 290, y) * smooth(0.1, 0.32, slope) * (0.5 + 0.4 * glade),
      );
      const cut =
        (1 - smooth(28, 85, Math.abs(x))) * (1 - smooth(465, 720, Math.abs(z)));
      color.lerp(mown, cut * 0.88);
      color.toArray(colors, i * 3);
      geometry.attributes.uv.setXY(i, x / 7, z / 7);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = material('#ffffff', {
      map: texture,
      vertexColors: true,
      roughness: 1,
    });
    surface.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vFlightTerrain;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFlightTerrain = position;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFlightTerrain;
        float fieldHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float fieldNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fieldHash(i), fieldHash(i + vec2(1., 0.)), f.x), mix(fieldHash(i + vec2(0., 1.)), fieldHash(i + 1.), f.x), f.y);
        }
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float patchwork = fieldNoise(vFlightTerrain.xz * .023) * .65 + fieldNoise(vFlightTerrain.xz * .087) * .35;
        float fineCover = fieldNoise(vFlightTerrain.xz * .7);
        diffuseColor.rgb *= .77 + patchwork * .38 + fineCover * .08;
      `,
      );
    };
    surface.customProgramCacheKey = () => 'flight-terrain-mottling';
    mesh(geometry, surface);
  }
  function airport() {
    const asphalt = keep(
      canvasTexture(
        256,
        512,
        (ctx, w, h) => {
          ctx.fillStyle = '#555a58';
          ctx.fillRect(0, 0, w, h);
          const rng = randomSequence(1988);
          for (let i = 0; i < 30000; i++) {
            const shade = 35 + Math.floor(rng() * 65);
            ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 2},.22)`;
            ctx.fillRect(rng() * w, rng() * h, 1, 1);
          }
          ctx.strokeStyle = '#404644';
          ctx.lineWidth = 0.6;
          for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            let x = rng() * w,
              y = rng() * h;
            ctx.moveTo(x, y);
            for (let n = 0; n < 8; n++) {
              x += (rng() - 0.5) * 25;
              y += 8 + rng() * 10;
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        },
        true,
      ),
    );
    asphalt.repeat.set(2, 35);
    const tarmac = material('#ffffff', { map: asphalt });
    horizontal(38, 914, material('#939683'), 0, 0.002, 0);
    horizontal(32, 900, tarmac, 0, 0.025, 0);
    horizontal(100, 138, material('#818780'), -82, 0.035, 270);
    horizontal(85, 14, material('#6c726c'), -50, 0.04, 285);
    const white = material('#e5e5d5');
    const yellow = material('#d8b24c');
    for (const x of [-14.6, 14.6]) horizontal(0.28, 888, white, x, 0.055, 0);
    for (let z = -372; z <= 372; z += 46)
      horizontal(0.65, 23, white, 0, 0.06, z);
    for (const end of [-1, 1]) {
      for (const x of [-10, -7, -4, 4, 7, 10])
        horizontal(1.4, 24, white, x, 0.06, end * 430);
      const number = keep(
        canvasTexture(256, 256, (ctx) => {
          ctx.clearRect(0, 0, 256, 256);
          ctx.fillStyle = '#eeeee1';
          ctx.font = 'bold 170px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(end === 1 ? '36' : '18', 128, 195);
        }),
      );
      const label = horizontal(
        11,
        17,
        material('#ffffff', {
          map: number,
          transparent: true,
          depthWrite: false,
        }),
        0,
        0.065,
        end * 394,
      );
      if (end < 0) label.rotation.z = Math.PI;
    }
    horizontal(85, 0.25, yellow, -50, 0.065, 285);
    for (let x = -120; x <= -55; x += 20) {
      horizontal(0.2, 22, yellow, x, 0.065, 316);
      horizontal(12, 0.2, yellow, x, 0.065, 305);
    }
    const lamp = material('#d8d4bd');
    const glow = material('#e9d59f', {
      emissive: '#e9cb7b',
      emissiveIntensity: 0.65,
    });
    for (let z = -435; z <= 435; z += 60)
      for (const x of [-18, 18]) {
        mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.35, 6), lamp, x, 0.17, z);
        mesh(new THREE.SphereGeometry(0.19, 6, 4), glow, x, 0.4, z);
      }
    const wall = material('#aaa999'),
      dark = material('#293a35'),
      red = material('#ba613d'),
      metal = material('#747f7b', { metalness: 0.35, roughness: 0.6 });
    const hangar = new THREE.Group();
    hangar.position.set(-100, 0, 186);
    group.add(hangar);
    box(1, 8, 34, wall, -22, 4, 0, hangar);
    box(1, 8, 34, wall, 22, 4, 0, hangar);
    box(44, 8, 1, wall, 0, 4, 16.5, hangar);
    box(43, 0.2, 33, dark, 0, 0.15, 0, hangar);
    box(13, 8, 0.5, dark, -14.5, 4, -16.7, hangar);
    box(13, 8, 0.5, dark, 14.5, 4, -16.7, hangar);
    box(17, 0.8, 1, wall, 0, 7.6, -16.7, hangar);
    for (let z = -16; z <= 16; z += 2)
      for (const x of [-22.55, 22.55])
        box(0.13, 8.2, 0.12, metal, x, 4, z, hangar);
    const roof = new THREE.CylinderGeometry(
      22.8,
      22.8,
      35,
      28,
      1,
      true,
      0,
      Math.PI,
    );
    roof.rotateZ(Math.PI / 2);
    roof.rotateY(Math.PI / 2);
    roof.scale(1, 0.33, 1);
    const roofMesh = mesh(
      roof,
      material('#737f7b', {
        side: THREE.DoubleSide,
        metalness: 0.4,
        roughness: 0.75,
      }),
      0,
      8,
      0,
      hangar,
    );
    roofMesh.castShadow = true;
    const sign = keep(
      canvasTexture(1024, 128, (ctx) => {
        ctx.fillStyle = '#283a35';
        ctx.fillRect(0, 0, 1024, 128);
        ctx.fillStyle = '#d9d7bb';
        ctx.font = 'bold 61px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FOREST  FLIGHT  /  FIELD  36', 512, 86);
      }),
    );
    const signMesh = mesh(
      new THREE.PlaneGeometry(26, 3.25),
      material('#ffffff', { map: sign }),
      0,
      9.5,
      -17.6,
      hangar,
    );
    signMesh.rotation.y = Math.PI;
    box(10, 4.5, 8, wall, -142, 2.25, 233).castShadow = true;
    box(10.8, 0.45, 8.8, red, -142, 4.65, 233);
    box(
      4.5,
      1.4,
      0.04,
      material('#6e9b9c', { metalness: 0.3, roughness: 0.25 }),
      -142,
      3,
      228.96,
    );
    box(1.7, 3.2, 0.1, dark, -145, 1.6, 228.94);
    for (const x of [-137, -135, -133])
      mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.5, 12), red, x, 0.75, 245);
    // A left-of-strip windsock is visible during both departure and final approach.
    mesh(new THREE.CylinderGeometry(0.1, 0.17, 9, 8), metal, -43, 4.5, 340);
    windsock = new THREE.Group();
    windsock.position.set(-43, 8.7, 340);
    group.add(windsock);
    for (let i = 0; i < 6; i++) {
      const segment = mesh(
        new THREE.CylinderGeometry(
          0.6 - i * 0.073,
          0.527 - i * 0.073,
          0.58,
          12,
          1,
          true,
        ),
        i % 2 ? white : red,
        0,
        0,
        0,
        windsock,
      );
      segment.rotation.z = Math.PI / 2;
      segment.position.set(i * 0.58 + 0.29, -i * 0.045, 0);
      segment.material.side = THREE.DoubleSide;
    }
  }
  function forest(kit) {
    const far = trees.filter(
      (tree) => Math.abs(tree.x) > 470 || Math.abs(tree.z) > 820,
    );
    const near = trees.filter(
      (tree) => Math.abs(tree.x) <= 470 && Math.abs(tree.z) <= 820,
    );
    const crownParts = [];
    for (const [r, h, y] of [
      [0.19, 0.46, 0.49],
      [0.16, 0.4, 0.67],
      [0.1, 0.32, 0.85],
    ]) {
      const part = new THREE.ConeGeometry(r, h, 9, 3);
      const vertices = part.attributes.position;
      for (let v = 0; v < vertices.count; v++) {
        const x = vertices.getX(v),
          z = vertices.getZ(v);
        const angle = Math.atan2(z, x);
        const ragged =
          1 +
          Math.sin(angle * 7.0 + y * 23) * 0.17 +
          Math.cos(angle * 13.0 + y * 31) * 0.08;
        const elevation = vertices.getY(v);
        vertices.setXYZ(
          v,
          x * ragged + elevation * 0.018,
          elevation + Math.sin(angle * 5 + y * 19) * Math.hypot(x, z) * 0.16,
          z * ragged,
        );
      }
      part.computeVertexNormals();
      part.translate(0, y, 0);
      crownParts.push(part);
    }
    const crown = keep(mergeGeometries(crownParts));
    crownParts.forEach((part) => part.dispose());
    const trunk = keep(new THREE.CylinderGeometry(0.014, 0.025, 0.72, 5));
    trunk.translate(0, 0.36, 0);
    const crownMaterial = material('#647a58', { roughness: 1 });
    const woodMaterial = material('#6f6650');
    const matrix = new THREE.Matrix4(),
      position = new THREE.Vector3(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const chunks = new Map();
    for (const tree of far) {
      const key = `${Math.floor(tree.x / 500)},${Math.floor(tree.z / 500)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(tree);
    }
    for (const entries of chunks.values()) {
      const leaves = new THREE.InstancedMesh(
        crown,
        crownMaterial,
        entries.length,
      );
      const trunks = new THREE.InstancedMesh(
        trunk,
        woodMaterial,
        entries.length,
      );
      for (let i = 0; i < entries.length; i++) {
        const tree = entries[i];
        position.set(tree.x, tree.y, tree.z);
        rotation.setFromAxisAngle(up, tree.angle);
        scale.setScalar(tree.height);
        matrix.compose(position, rotation, scale);
        leaves.setMatrixAt(i, matrix);
        trunks.setMatrixAt(i, matrix);
        color.set('#496956').lerp(new THREE.Color('#8a9e76'), tree.tone);
        leaves.setColorAt(i, color);
      }
      leaves.computeBoundingSphere();
      trunks.computeBoundingSphere();
      group.add(leaves, trunks);
    }
    kit.updateMatrixWorld(true);
    for (let kind = 0; kind < 3; kind++) {
      const prototype = kit.getObjectByName(
        ['pine_a', 'pine_b', 'pine_c'][kind],
      );
      const entries = near.filter((_, i) => i % 3 === kind);
      if (!prototype || !entries.length) continue;
      const bounds = new THREE.Box3().setFromObject(prototype);
      const originalHeight = bounds.max.y - bounds.min.y;
      const inverse = new THREE.Matrix4().copy(prototype.matrixWorld).invert();
      prototype.traverse((part) => {
        if (!part.isMesh) return;
        const local = new THREE.Matrix4().multiplyMatrices(
          inverse,
          part.matrixWorld,
        );
        const geometry = keep(part.geometry.clone().applyMatrix4(local));
        const surface = keep(part.material.clone());
        surface.roughness = 1;
        const batch = new THREE.InstancedMesh(
          geometry,
          surface,
          entries.length,
        );
        batch.castShadow = true;
        batch.receiveShadow = true;
        for (let i = 0; i < entries.length; i++) {
          const tree = entries[i];
          position.set(tree.x, tree.y, tree.z);
          rotation.setFromAxisAngle(up, tree.angle);
          scale.setScalar(tree.height / originalHeight);
          matrix.compose(position, rotation, scale);
          batch.setMatrixAt(i, matrix);
        }
        batch.computeBoundingSphere();
        group.add(batch);
      });
    }
  }
  function guides() {
    for (const point of LANDMARKS) {
      const marker = new THREE.Group();
      marker.position.set(point.x, point.y, point.z);
      const surface = keep(
        new THREE.MeshBasicMaterial({
          color: point.color,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        }),
      );
      mesh(new THREE.TorusGeometry(24, 0.55, 6, 64), surface, 0, 0, 0, marker);
      const wing = mesh(
        new THREE.TorusGeometry(28, 0.16, 3, 48, Math.PI * 0.7),
        surface,
        0,
        0,
        0,
        marker,
      );
      wing.rotation.z = Math.PI * 0.15;
      marker.rotation.y =
        point.id === 'ridge' ? -0.85 : point.id === 'forest' ? 0.15 : 0;
      group.add(marker);
      markers.push(marker);
    }
  }
  return {
    id: 'flight-world',
    async init({ scene }) {
      scene.add(group);
      terrain();
      airport();
      guides();
      const gltf = await new GLTFLoader().loadAsync(
        `${import.meta.env?.BASE_URL ?? './'}assets/forest-kit.glb`,
      );
      gltf.scene.traverse((part) => {
        if (!part.isMesh) return;
        resources.add(part.geometry);
        for (const surface of Array.isArray(part.material)
          ? part.material
          : [part.material]) {
          resources.add(surface);
          for (const value of Object.values(surface))
            if (value?.isTexture) resources.add(value);
        }
      });
      if (disposed) {
        for (const resource of resources) resource.dispose();
        resources.clear();
        return;
      }
      forest(gltf.scene);
    },
    update(dt, elapsed = 0) {
      if (windsock) {
        windsock.rotation.y = -0.45 + Math.sin(elapsed * 0.6) * 0.13;
        windsock.rotation.z = Math.sin(elapsed * 2.5) * 0.04;
      }
      for (const marker of markers)
        marker.children[1].rotation.z = elapsed * 0.08;
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}

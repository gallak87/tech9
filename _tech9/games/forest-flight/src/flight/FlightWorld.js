import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { treeCells, randomSequence } from './LandscapeLayout.js';
import { createLandscape } from './Landscape.js';
export { groundHeight } from './LandscapeLayout.js';

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
/** Conservative visual proxies, indexed by the same placements as the forest. */
export function getObstacle(x, y, z, radius = 3) {
  if (
    x > -147 - radius &&
    x < -137 + radius &&
    z > 229 - radius &&
    z < 237 + radius &&
    y > -radius &&
    y < 5 + radius
  )
    return { id: 'office', name: 'the airfield office' };
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
  let landscape;
  let context;
  let settings = { quality: 'high', richness: 1 };
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
    surface.polygonOffset = true;
    surface.polygonOffsetFactor = -1;
    surface.polygonOffsetUnits = -2 - Math.round(y * 200);
    return item;
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
      const badgeTexture = keep(
        canvasTexture(256, 256, (ctx) => {
          ctx.fillStyle = 'rgba(29, 56, 46, 0.88)';
          ctx.beginPath();
          ctx.arc(128, 128, 91, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = point.color;
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.fillStyle = '#fff5dc';
          ctx.font = '600 112px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(LANDMARKS.indexOf(point) + 1), 128, 132);
        }),
      );
      const badge = new THREE.Sprite(
        keep(
          new THREE.SpriteMaterial({
            map: badgeTexture,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      badge.scale.set(18, 18, 1);
      marker.add(badge);
      group.add(marker);
      markers.push(marker);
    }
  }
  return {
    id: 'flight-world',
    get stats() {
      return landscape?.stats ?? {};
    },
    async init(initialContext) {
      context = initialContext;
      context.scene.add(group);
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
      landscape = await createLandscape(context, gltf.scene);
      if (disposed) {
        landscape.dispose();
        return;
      }
      landscape.configure(settings);
    },
    configure(next) {
      settings = { ...settings, ...next };
      landscape?.configure(settings);
    },
    update(dt, elapsed = 0) {
      landscape?.update(context.camera.position, elapsed);
      if (windsock) {
        windsock.rotation.y = -0.45 + Math.sin(elapsed * 0.6) * 0.13;
        windsock.rotation.z = Math.sin(elapsed * 2.5) * 0.04;
      }
      for (const marker of markers)
        marker.children[1].rotation.z = elapsed * 0.08;
    },
    dispose() {
      disposed = true;
      landscape?.dispose();
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}

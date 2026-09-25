import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  coastDistance,
  islandHeight,
  ROCKS,
  DOCK_PARTS,
  GATES,
  DOCK_ZONE,
  seededRandom,
} from './islandDefinition.js';

export function createIslandWorld(rules) {
  const group = new THREE.Group(),
    owned = new Set(),
    foliage = [],
    gateObjects = [];
  let context,
    disposed = false,
    dockRing;
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      ...extra,
    });
    owned.add(m);
    return m;
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    owned.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const box = (x, y, z, w, h, d, mat) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cylinder = (x, y, z, r1, r2, h, mat) =>
    mesh(new THREE.CylinderGeometry(r1, r2, h, 12), mat, x, y, z);
  const random = seededRandom();
  function label(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#173c42';
    c.beginPath();
    c.arc(64, 64, 57, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f2d59d';
    c.lineWidth = 5;
    c.stroke();
    c.fillStyle = '#fff2d4';
    c.font = 'bold 68px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 67);
    const tex = new THREE.CanvasTexture(canvas);
    owned.add(tex);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true });
    owned.add(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.7, 1.7, 1);
    return sprite;
  }
  function instancePrototype(kit, name, placements) {
    const prototype = kit.getObjectByName(name);
    prototype.updateWorldMatrix(true, true);
    const inverse = prototype.matrixWorld.clone().invert();
    prototype.traverse((part) => {
      if (!part.isMesh) return;
      const geo = part.geometry
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld),
        );
      owned.add(geo);
      const mat = part.material.clone();
      owned.add(mat);
      mat.side = THREE.DoubleSide;
      mat.envMapIntensity = 0.35;
      if (mat.alphaTest > 0) {
        mat.alphaTest = 0.43;
        mat.color.multiplyScalar(1.13);
      }
      const inst = new THREE.InstancedMesh(geo, mat, placements.length);
      inst.castShadow = inst.receiveShadow = true;
      placements.forEach((p, i) => {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, islandHeight(p.x, p.z) - 0.1, p.z),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            p.angle,
          ),
          new THREE.Vector3(p.s, p.s, p.s),
        );
        inst.setMatrixAt(i, m);
      });
      inst.userData.maxCount = placements.length;
      inst.computeBoundingSphere();
      foliage.push(inst);
      group.add(inst);
    });
  }
  return {
    id: 'tidebreak-island',
    stats: { islandDiameter: 160, navWidth: 520 },
    async init(ctx) {
      context = ctx;
      const loader = new THREE.TextureLoader();
      const floor = await loader.loadAsync(
        './assets/textures/forest-floor-color.jpg',
      );
      owned.add(floor);
      if (disposed) {
        floor.dispose();
        return;
      }
      floor.colorSpace = THREE.SRGBColorSpace;
      floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
      floor.anisotropy = 8;
      const sand = await loader.loadAsync('./assets/textures/path-color.jpg');
      owned.add(sand);
      sand.colorSpace = THREE.SRGBColorSpace;
      sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
      sand.anisotropy = 8;
      if (disposed) {
        sand.dispose();
        return;
      }
      const landGeo = new THREE.PlaneGeometry(196, 196, 196, 196);
      landGeo.rotateX(-Math.PI / 2);
      const shoreDistances = [];
      const pos = landGeo.attributes.position,
        uv = landGeo.attributes.uv,
        colors = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          z = pos.getZ(i),
          h = islandHeight(x, z);
        pos.setY(i, h);
        uv.setXY(i, x / 5, z / 5);
        shoreDistances.push(coastDistance(x, z));
        const shore = coastDistance(x, z),
          col = new THREE.Color(shore > -5 ? '#eadab6' : '#a6bb86');
        col.multiplyScalar(
          0.96 + 0.07 * Math.sin(x * 0.24) * Math.cos(z * 0.17),
        );
        colors.push(col.r, col.g, col.b);
      }
      landGeo.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      landGeo.computeVertexNormals();
      landGeo.setAttribute(
        'shoreDistance',
        new THREE.Float32BufferAttribute(shoreDistances, 1),
      );
      const landMat = material('#ffffff', { vertexColors: true, map: floor });
      landMat.onBeforeCompile = (shader) => {
        shader.uniforms.sandMap = { value: sand };
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nattribute float shoreDistance; varying float vShoreDistance;',
          )
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvShoreDistance=shoreDistance;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform sampler2D sandMap;varying float vShoreDistance;',
          )
          .replace(
            '#include <map_fragment>',
            `vec4 soil=texture2D(map,vMapUv);vec4 beach=texture2D(sandMap,vMapUv*0.67);float bank=smoothstep(-9.0,-3.0,vShoreDistance+soil.r*2.0);diffuseColor*=mix(soil*1.25,beach*1.6,bank);float wet=1.0-smoothstep(0.1,2.0,-vShoreDistance);diffuseColor.rgb*=1.0-wet*0.20;`,
          );
      };
      landMat.customProgramCacheKey = () => 'tidebreak-land-shelf';
      mesh(landGeo, landMat);
      const rockTex = await loader.loadAsync(
        './assets/textures/shore-rock-diff.jpg',
      );
      owned.add(rockTex);
      rockTex.colorSpace = THREE.SRGBColorSpace;
      if (disposed) {
        rockTex.dispose();
        return;
      }
      const rockMat = material('#abb1a1', { map: rockTex });
      for (const r of ROCKS) {
        const rock = mesh(
          new THREE.DodecahedronGeometry(1, 1),
          rockMat,
          r.x,
          0.12,
          r.z,
        );
        rock.scale.set(r.radius, r.height, r.radius);
        rock.rotation.y = r.angle;
      }
      const kit = (await new GLTFLoader().loadAsync('./assets/forest-kit.glb'))
        .scene;
      kit.traverse((o) => {
        if (o.isMesh) {
          owned.add(o.geometry);
          for (const m of [].concat(o.material)) {
            owned.add(m);
            Object.values(m).forEach((v) => {
              if (v?.isTexture) owned.add(v);
            });
          }
        }
      });
      if (disposed) {
        owned.forEach((r) => r.dispose());
        return;
      }
      const placements = [[], [], []];
      for (let i = 0; i < 380; i++) {
        const a = random() * Math.PI * 2,
          r = Math.sqrt(random()) * 75,
          x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        if (
          coastDistance(x, z) > -6 ||
          (x > -10 && x < 10 && z > 52) ||
          Math.hypot(x + 43, z + 37) < 11
        )
          continue;
        placements[i % 3].push({
          x,
          z,
          s: 0.6 + random() * 0.56,
          angle: random() * 6.28,
        });
      }
      ['pine_a', 'pine_b', 'pine_c'].forEach((name, i) =>
        instancePrototype(kit, name, placements[i]),
      );
      const grass = [];
      for (let i = 0; i < 380; i++) {
        const a = random() * 6.28,
          r = 57 + random() * 17,
          x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        if (coastDistance(x, z) < -2.5)
          grass.push({ x, z, s: 0.7 + random(), angle: random() * 6.28 });
      }
      instancePrototype(kit, 'grass_short', grass);
      const scrubGeo = new THREE.IcosahedronGeometry(1, 1);
      owned.add(scrubGeo);
      const scrubMat = material('#708258', { roughness: 1 });
      const shrubs = [];
      for (let i = 0; i < 210; i++) {
        const a = random() * Math.PI * 2,
          r = 56 + random() * 19,
          x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        if (coastDistance(x, z) < -4)
          shrubs.push({ x, z, s: 0.55 + random() * 1.3 });
      }
      const scrub = new THREE.InstancedMesh(scrubGeo, scrubMat, shrubs.length);
      scrub.receiveShadow = true;
      shrubs.forEach((p, i) => {
        scrub.setMatrixAt(
          i,
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, islandHeight(p.x, p.z) + p.s * 0.35, p.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              random() * 6.28,
            ),
            new THREE.Vector3(p.s * 1.3, p.s * 0.8, p.s),
          ),
        );
      });
      scrub.computeBoundingSphere();
      group.add(scrub);
      const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
      owned.add(pebbleGeo);
      const pebbles = [];
      for (let i = 0; i < 180; i++) {
        const a = random() * Math.PI * 2,
          r = 75 + random() * 11,
          x = Math.cos(a) * r,
          z = Math.sin(a) * r,
          d = coastDistance(x, z);
        if (d > -2.5 && d < 0.8 && !(Math.abs(x) < 9 && z > 0))
          pebbles.push({ x, z, s: 0.16 + random() * 0.32 });
      }
      const stones = new THREE.InstancedMesh(
        pebbleGeo,
        rockMat,
        pebbles.length,
      );
      stones.receiveShadow = true;
      pebbles.forEach((p, i) =>
        stones.setMatrixAt(
          i,
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, islandHeight(p.x, p.z) + p.s * 0.1, p.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              random() * 6.28,
            ),
            new THREE.Vector3(p.s * 1.6, p.s * 0.7, p.s),
          ),
        ),
      );
      stones.computeBoundingSphere();
      group.add(stones);
      const timber = material('#82694c'),
        planks = material('#b59d73'),
        iron = material('#203739', { metalness: 0.55, roughness: 0.4 }),
        cream = material('#eae4c9'),
        red = material('#bd5536');
      for (const d of DOCK_PARTS) {
        box(d.x, 0.9, d.z, d.width, 0.35, d.depth, timber);
        const n = Math.ceil(d.depth / 0.55);
        for (let i = 0; i < n; i++)
          box(
            d.x,
            1.1,
            d.z - d.depth / 2 + ((i + 0.5) * d.depth) / n,
            d.width - 0.08,
            0.08,
            d.depth / n - 0.035,
            planks,
          );
        for (const side of [-1, 1])
          for (let z = d.z - d.depth / 2 + 1; z < d.z + d.depth / 2; z += 5.5)
            cylinder(
              d.x + side * (d.width / 2 - 0.22),
              0.7,
              z,
              0.17,
              0.24,
              3,
              timber,
            );
      }
      // Fender row leaves the east-side mooring approach unobstructed.
      for (const x of [-6, -2, 2, 6])
        cylinder(x, 0.65, 103.2, 0.25, 0.25, 1.1, iron).rotation.x =
          Math.PI / 2;
      for (const x of [-6, 6]) {
        cylinder(x, 1.55, 101, 0.11, 0.15, 0.8, iron);
        box(x, 1.93, 101, 0.65, 0.1, 0.1, iron);
      }
      box(1.2, 1.55, 87, 1, 0.8, 1, red);
      box(-1, 1.4, 89, 0.7, 0.6, 0.8, cream);
      // Lighthouse gives each side of the course a stable landmark.
      const lx = -43,
        lz = -37,
        ly = islandHeight(lx, lz);
      cylinder(lx, ly + 0.4, lz, 5, 5.5, 0.8, rockMat);
      cylinder(lx, ly + 7.5, lz, 2.4, 3.3, 15, cream);
      cylinder(lx, ly + 13.2, lz, 2.6, 2.8, 2, red);
      cylinder(lx, ly + 15.5, lz, 3.5, 3.5, 0.55, iron);
      const glass = material('#becfd0', { metalness: 0.4, roughness: 0.18 });
      cylinder(lx, ly + 17, lz, 2.0, 2.0, 2.5, glass);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        cylinder(
          lx + Math.cos(a) * 2,
          ly + 17,
          lz + Math.sin(a) * 2,
          0.07,
          0.07,
          2.5,
          iron,
        );
      }
      cylinder(lx, ly + 18.7, lz, 0.25, 2.7, 1.3, iron);
      cylinder(
        lx,
        ly + 17,
        lz,
        0.65,
        0.65,
        1,
        material('#ffe5a9', { emissive: '#ffd597', emissiveIntensity: 0.8 }),
      );
      for (const gate of GATES) {
        const root = new THREE.Group();
        root.userData.gate = gate.id;
        group.add(root);
        const mats = [];
        for (const side of [-1, 1]) {
          const x = gate.x + gate.nz * gate.halfWidth * side,
            z = gate.z - gate.nx * gate.halfWidth * side;
          const color = material(side === -1 ? '#de7041' : '#e5b85f', {
            metalness: 0.12,
            roughness: 0.5,
          });
          mats.push(color);
          const buoy = new THREE.Group();
          buoy.position.set(x, 0, z);
          root.add(buoy);
          const add = (geo, mat, y) => {
            owned.add(geo);
            const m = new THREE.Mesh(geo, mat);
            m.position.y = y;
            m.castShadow = true;
            buoy.add(m);
            return m;
          };
          add(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 16), color, 0.35);
          add(new THREE.ConeGeometry(0.52, 1.2, 16), color, 1.2);
          add(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), iron, 2);
          add(
            new THREE.SphereGeometry(0.18, 8, 6),
            material('#fff1b2', {
              emissive: '#ffbd4d',
              emissiveIntensity: 1.3,
            }),
            2.9,
          );
          const number = label(String(gate.id).padStart(2, '0'));
          number.position.y = 3.6;
          buoy.add(number);
        }
        gateObjects.push({ root, mats });
      }
      dockRing = mesh(
        new THREE.RingGeometry(DOCK_ZONE.radius - 0.13, DOCK_ZONE.radius, 72),
        new THREE.MeshBasicMaterial({
          color: '#edcc89',
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        DOCK_ZONE.x,
        0.065,
        DOCK_ZONE.z,
      );
      owned.add(dockRing.material);
      dockRing.rotation.x = -Math.PI / 2;
      ctx.scene.add(group);
    },
    configure(settings) {
      for (const f of foliage)
        f.count = Math.max(
          1,
          Math.floor(
            f.userData.maxCount *
              Math.min(
                1,
                (settings.quality === 'balanced' ? 0.78 : 1) *
                  settings.richness,
              ),
          ),
        );
    },
    update(dt, time) {
      for (let i = 0; i < gateObjects.length; i++) {
        const gate = gateObjects[i];
        gate.root.position.y = Math.sin(time * 1.3 + i) * 0.08;
        gate.mats.forEach((m) => {
          m.emissive.set(i === rules.nextGate ? '#a66120' : '#000000');
          m.emissiveIntensity = i === rules.nextGate ? 0.28 : 0;
        });
      }
      if (dockRing)
        dockRing.material.opacity = rules.nextGate === 3 ? 0.65 : 0.18;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context?.scene.remove(group);
      owned.forEach((r) => r.dispose());
      owned.clear();
      group.clear();
    },
  };
}

import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { beamTransform } from '../../track/geometry.js';
import { sampleCarrierMotion } from './motion.js';

const ONE = new T.Vector3(1, 1, 1);
const UP = new T.Vector3(0, 1, 0);

const ROLES = [
  'loading and roller handling',
  'port hydraulic outrigger',
  'exposed radiator balcony',
  'starboard service workshop',
  'suspended freight galleries',
  'port drive machinery',
  'passing-deck cooling banks',
  'upper return workshop',
  'overhead crane works',
  'saltwind heat exchange',
  'procession service terminus',
];

/** Carrier-specific work districts. Worldkit supplies the manufactured parts;
 * Nomad owns the seated load beds, arrangement, motion and racing exclusions.
 * The finish is borrowed. All packed buffers and the kit are owned here.
 */
export function createNomadDistricts({ track, finish = null, shape = false }) {
  const group = new T.Group();
  group.name = 'Nomad / carrier working districts';
  const report = {
    source: '@worldkit/environment/industrial',
    carriers: [],
    assemblies: 0,
    batches: 0,
    instances: 0,
    triangles: 0,
  };
  group.userData.nomadDistricts = report;
  if (shape)
    return {
      group,
      report,
      update() {},
      dispose() {
        group.clear();
      },
    };

  const kit = createIndustrialKit();
  kit.materials.shell.color.set('#aca696');
  kit.materials.shell.roughness = 0.48;
  kit.materials.shell.clearcoat = 0.22;
  kit.materials.dark.color.set('#28363d');
  kit.materials.dark.roughness = 0.7;
  // The kit's world-space finish is useful for buildings. Moving carrier
  // machinery instead retains its own assembly-local substrate and tool axes.
  for (const parts of Object.values(kit.prototypes))
    for (const part of parts)
      if (!part.geometry.attributes.industrialCoord)
        part.geometry.setAttribute(
          'industrialCoord',
          part.geometry.attributes.position.clone(),
        );
  for (const kind of ['shell', 'steel', 'dark', 'cast', 'machined']) {
    const material = kit.materials[kind];
    finish?.bind(material, kind, 'part');
    if (!finish || kind === 'machined') continue;
    const compile = material.onBeforeCompile,
      key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'texture2D(industrialDetail,vec2(industrialLocal.y,length(industrialLocal.xz))/3.).rgb',
          '(texture2D(industrialDetail,industrialLocal.yz/7.).rgb*iw.x+texture2D(industrialDetail,industrialLocal.xz/7.).rgb*iw.y+texture2D(industrialDetail,industrialLocal.xy/7.).rgb*iw.z)',
        )
        .replaceAll('industrialPoint.xz*.015', 'industrialLocal.xz*.015');
    };
    material.customProgramCacheKey = () =>
      key + '-nomad-working-district-local-v1';
  }
  const roots = new Map(),
    packed = [],
    owned = new Set(),
    boxCache = new Map();
  const placements = [];
  let disposed = false;

  const ownGeometry = (geometry) => {
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    if (!geometry.attributes.industrialCoord)
      geometry.setAttribute(
        'industrialCoord',
        geometry.attributes.position.clone(),
      );
    owned.add(geometry);
    return geometry;
  };
  function boxGeometry(size) {
    const key = size.join('/');
    if (!boxCache.has(key))
      boxCache.set(
        key,
        ownGeometry(
          new RoundedBoxGeometry(
            ...size,
            1,
            Math.min(0.45, Math.min(...size) * 0.12),
          ),
        ),
      );
    return boxCache.get(key);
  }
  const unitBox = boxGeometry([1, 1, 1]);
  function rootFor(carrier) {
    const root = new T.Group();
    root.name = `Nomad / ${carrier.name} working district`;
    root.userData.carrierId = carrier.id;
    root.position.copy(carrier.origin);
    root.quaternion.copy(carrier.quaternion);
    root.scale.copy(carrier.scale);
    group.add(root);
    roots.set(carrier.id, root);
    return { root, byMaterial: new Map(), carrier, records: [] };
  }
  function put(district, geometry, material, matrix, name) {
    if (!district.byMaterial.has(material))
      district.byMaterial.set(material, []);
    district.byMaterial.get(material).push({ geometry, matrix, name });
  }
  function plate(
    district,
    center,
    size,
    material = kit.materials.dark,
    name = 'fitted load-bed plate',
  ) {
    put(
      district,
      boxGeometry(size),
      material,
      new T.Matrix4().makeTranslation(...center),
      name,
    );
  }
  function beam(
    district,
    from,
    to,
    width = 1.8,
    depth = width,
    material = kit.materials.steel,
  ) {
    const pose = beamTransform(
      new T.Vector3(...from),
      new T.Vector3(...to),
      width,
      depth,
    );
    put(
      district,
      unitBox,
      material,
      new T.Matrix4().compose(pose.position, pose.quaternion, pose.scale),
      'connected load-bed brace',
    );
  }
  function feed(district, points, radius = 0.75) {
    const path = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    );
    const geometry = ownGeometry(
      new T.TubeGeometry(
        path,
        Math.max(12, points.length * 4),
        radius,
        8,
        false,
      ),
    );
    put(
      district,
      geometry,
      kit.materials.dark,
      new T.Matrix4(),
      'seated pressure feed',
    );
  }
  function assembly(
    district,
    name,
    {
      x = 0,
      z = 0,
      scale = ONE,
      yaw = 0,
      plane = 130,
      ceiling = false,
      title = name,
    } = {},
  ) {
    const parts = kit.prototypes[name];
    if (!parts) throw new Error('Unknown Nomad district assembly: ' + name);
    const q = new T.Quaternion().setFromAxisAngle(UP, yaw);
    const stretch = Array.isArray(scale) ? new T.Vector3(...scale) : scale;
    const orientation = new T.Matrix4().compose(new T.Vector3(), q, stretch);
    const bounds = new T.Box3();
    for (const part of parts) {
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox.clone().applyMatrix4(orientation));
    }
    const y = plane - (ceiling ? bounds.max.y : bounds.min.y);
    const matrix = new T.Matrix4().compose(new T.Vector3(x, y, z), q, stretch);
    for (const part of parts)
      put(district, part.geometry, part.material, matrix, title);
    const record = {
      name,
      title,
      carrierId: district.carrier.id,
      sourcePlane: plane,
      attachment: ceiling
        ? 'underside of retained roof'
        : 'retained roof or seated outrigger load bed',
      min: bounds.min
        .clone()
        .add(new T.Vector3(x, y, z))
        .toArray(),
      max: bounds.max
        .clone()
        .add(new T.Vector3(x, y, z))
        .toArray(),
    };
    district.records.push(record);
    placements.push(record);
    report.assemblies++;
    return record;
  }
  // The side boxes are service beds seated through the actual upper wall
  // sockets at X±90/Y95/Z±95. Their heavy diagonals remain outboard of the road.
  function outrigger(district, side, z = 80) {
    plate(district, [side * 99, 128.4, z], [34, 3.2, 128]);
    for (const anchorZ of [-95, 88]) {
      const targetZ = T.MathUtils.clamp(anchorZ, z - 54, z + 54);
      beam(
        district,
        [side * 90, 95, anchorZ],
        [side * 112, 126.8, targetZ],
        3.4,
        3.4,
      );
      beam(
        district,
        [side * 90, 95, anchorZ],
        [side * 84, 126.8, targetZ],
        2.5,
        2.5,
      );
      plate(
        district,
        [side * 90, 95, anchorZ],
        [3, 9, 9],
        kit.materials.cast,
        'wall-socket bearing shoe',
      );
    }
    return 130;
  }
  function roofCooling(
    district,
    side,
    z = 80,
    title = 'outboard cooling bank',
  ) {
    outrigger(district, side, z);
    assembly(district, 'coolingBank', {
      x: side * 100,
      z,
      plane: 130,
      scale: [0.2, 0.34, 0.62],
      title,
    });
    feed(
      district,
      [
        [side * 90, 95, 88],
        [side * 118, 101, 88],
        [side * 118, 142, z + 15],
        [side * 106, 145, z + 15],
      ],
      1.1,
    );
  }
  function roofHydraulic(
    district,
    side,
    z = 70,
    title = 'outboard hydraulic workshop',
  ) {
    outrigger(district, side, z);
    assembly(district, 'hydraulicBank', {
      x: side * 100,
      z: z - 24,
      plane: 130,
      scale: [0.38, 0.65, 0.55],
      title,
    });
    assembly(district, 'driveGearbox', {
      x: side * 100,
      z: z + 35,
      plane: 130,
      scale: [0.36, 0.42, 0.48],
      title: 'coupled drive and service reducer',
    });
    feed(
      district,
      [
        [side * 90, 95, 88],
        [side * 115, 101, 88],
        [side * 115, 139, z - 24],
        [side * 105, 139, z - 24],
      ],
      0.95,
    );
  }
  function suspendedGallery(district, z = 80, length = 0.7) {
    // It hangs from fitted roof saddles, well above the cargo driving volume.
    assembly(district, 'serviceDeck', {
      z,
      scale: [4.2, 0.38, length],
      plane: 113,
      ceiling: true,
      title: 'suspended cargo service gallery',
    });
    for (const x of [-34, 34])
      for (const dz of [-42, 42]) {
        beam(district, [x, 113, z + dz], [x, 127, z + dz], 1.2, 1.2);
        plate(
          district,
          [x, 126.6, z + dz],
          [7, 1.6, 7],
          kit.materials.steel,
          'roof hanger saddle',
        );
      }
  }
  function ceilingHydraulics(district, side, z = 90) {
    assembly(district, 'hydraulicBank', {
      x: side * 39,
      z,
      scale: [0.35, 0.25, 0.52],
      plane: 126.5,
      ceiling: true,
      title: 'roof-fed cargo handling power pack',
    });
    feed(
      district,
      [
        [side * 41, 126, z - 24],
        [side * 49, 126, z - 24],
        [side * 49, 118, z + 15],
        [side * 43, 118, z + 15],
      ],
      0.7,
    );
  }
  function rooftopHandling(
    district,
    name,
    z = -75,
    scale = [0.6, 0.3, 0.7],
    title = name,
  ) {
    const placed = assembly(district, name, { z, scale, plane: 130, title });
    const width = Math.min(134, placed.max[0] - placed.min[0] + 4);
    plate(
      district,
      [0, 129.3, z],
      [width, 1.4, placed.max[2] - placed.min[2] + 4],
      kit.materials.steel,
      'roof machinery foundation',
    );
  }

  try {
    for (const carrier of track.carriers) {
      const d = rootFor(carrier);
      if (carrier.index === 0) {
        rooftopHandling(
          d,
          'gantry',
          -70,
          [0.64, 0.24, 0.9],
          'loading-gantry crown',
        );
        assembly(d, 'transferBed', {
          z: 80,
          scale: [0.58, 0.19, 0.52],
          plane: 126.5,
          ceiling: true,
          title: 'overhead roller handling bed',
        });
        ceilingHydraulics(d, 1, 80);
      } else if (carrier.index === 1) {
        roofHydraulic(d, -1, 65, 'port-side ascent hydraulic station');
        assembly(d, 'louverPanel', {
          x: -91,
          z: 55,
          scale: [1.05, 0.45, 0.24],
          yaw: Math.PI / 2,
          plane: 130,
          title: 'ascent drive heat exchanger',
        });
      } else if (carrier.index === 2) {
        roofCooling(d, -1, 80, 'balcony heat-exchanger bank');
        roofHydraulic(d, 1, 75, 'balcony circulation station');
      } else if (carrier.index === 3) {
        roofHydraulic(d, 1, 75, 'upper dive service workshop');
      } else if (carrier.index === 4) {
        rooftopHandling(
          d,
          'factoryBay',
          -65,
          [0.55, 0.23, 0.8],
          'freight-cathedral lifting frame',
        );
        suspendedGallery(d, 80, 0.72);
        ceilingHydraulics(d, -1, 80);
        ceilingHydraulics(d, 1, 80);
      } else if (carrier.index === 5) {
        roofHydraulic(d, -1, 70, 'overtaking hull drive station');
        assembly(d, 'driveWheel', {
          x: -100,
          z: 70,
          scale: [0.44, 0.64, 0.68],
          plane: 130,
          title: 'exposed overtake transmission wheel',
        });
      } else if (carrier.index === 6) {
        roofCooling(d, -1, 80, 'passing-deck port circulation bank');
        roofCooling(d, 1, 80, 'passing-deck starboard circulation bank');
      } else if (carrier.index === 7) {
        roofHydraulic(d, 1, 70, 'return-hold upper workshop');
        assembly(d, 'louverPanel', {
          x: 92,
          z: 75,
          scale: [0.95, 0.4, 0.24],
          yaw: Math.PI / 2,
          plane: 130,
          title: 'return-hold exchanger',
        });
      } else if (carrier.index === 8) {
        rooftopHandling(
          d,
          'gantry',
          -70,
          [0.67, 0.34, 0.95],
          'crane-alley lifting crown',
        );
        ceilingHydraulics(d, -1, 80);
      } else if (carrier.index === 9) {
        rooftopHandling(
          d,
          'coolingBank',
          -70,
          [0.62, 0.37, 0.55],
          'saltwind central heat exchanger',
        );
        rooftopHandling(
          d,
          'hydraulicBank',
          90,
          [0.85, 0.55, 0.8],
          'saltwind circulation reservoir',
        );
      } else {
        rooftopHandling(
          d,
          'serviceTower',
          -60,
          [0.95, 0.65, 0.85],
          'terminus service mast',
        );
        suspendedGallery(d, 80, 0.7);
        ceilingHydraulics(d, 1, 80);
      }

      let batches = 0,
        instanceCount = 0,
        triangleCount = 0;
      for (const [material, entries] of d.byMaterial) {
        const unique = [...new Set(entries.map((entry) => entry.geometry))];
        const normalized = new Map();
        const allAttributes = new Map();
        for (const geometry of unique)
          for (const [name, attribute] of Object.entries(geometry.attributes))
            allAttributes.set(name, attribute.itemSize);
        for (const geometry of unique) {
          let prepared = geometry;
          if ([...allAttributes].some(([name]) => !geometry.attributes[name])) {
            prepared = geometry.clone();
            owned.add(prepared);
            for (const [name, itemSize] of allAttributes)
              if (!prepared.attributes[name])
                prepared.setAttribute(
                  name,
                  new T.Float32BufferAttribute(
                    new Float32Array(
                      prepared.attributes.position.count * itemSize,
                    ),
                    itemSize,
                  ),
                );
          }
          normalized.set(geometry, prepared);
        }
        const vertexCount = unique.reduce(
          (sum, geometry) => sum + geometry.attributes.position.count,
          0,
        );
        const batch = new T.BatchedMesh(
          entries.length,
          vertexCount,
          0,
          material,
        );
        packed.push(batch);
        d.root.add(batch);
        batch.name = `Nomad / ${carrier.id} / ${material.name}`;
        batch.castShadow = true;
        batch.receiveShadow = true;
        batch.perObjectFrustumCulled = true;
        batch.sortObjects = false;
        const ids = new Map();
        for (const geometry of unique)
          ids.set(geometry, batch.addGeometry(normalized.get(geometry)));
        for (const entry of entries) {
          const instance = batch.addInstance(ids.get(entry.geometry));
          batch.setMatrixAt(instance, entry.matrix);
          triangleCount += entry.geometry.attributes.position.count / 3;
        }
        batch.computeBoundingSphere();
        batches++;
        instanceCount += entries.length;
      }
      report.carriers.push({
        id: carrier.id,
        role: ROLES[carrier.index],
        batches,
        instances: instanceCount,
        triangles: triangleCount,
        assemblies: d.records,
      });
      report.batches += batches;
      report.instances += instanceCount;
      report.triangles += triangleCount;
    }
  } catch (error) {
    for (const batch of packed) batch.dispose();
    for (const geometry of owned) geometry.dispose();
    kit.dispose();
    group.clear();
    throw error;
  }
  return {
    group,
    report,
    placements,
    update() {
      if (disposed) return;
      for (const carrier of track.carriers)
        roots
          .get(carrier.id)
          .position.copy(carrier.origin)
          .add(
            sampleCarrierMotion(carrier, track.presentationTime).translation,
          );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const batch of packed) batch.dispose();
      for (const geometry of owned) geometry.dispose();
      kit.dispose();
    },
  };
}

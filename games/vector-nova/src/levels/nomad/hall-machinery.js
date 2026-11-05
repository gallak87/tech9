import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { indexedTriangles } from '../../physics/collision-world.js';
import { beamTransform } from '../../track/geometry.js';
import { sampleCarrierMotion } from './motion.js';

export const NOMAD_HALL_GEOMETRY_VERSION = 'nomad-crane-hoist-bridge-v2';
const CARRIER_ID = 'nomad-crane-alley';

/** One roof-hung hoist drive for Crane Alley. All meshes use the retained hull's
 * local metres. Worldkit supplies manufactured machinery; fitted bearers and
 * hangers join its load path to actual ceiling seats. The finish is borrowed.
 * collisionTriangles are the exact packed faces in the nominal world frame;
 * collisionRecords borrow the packed geometry and its nominal matrix.
 */
export function createNomadHallMachinery({
  track,
  finish = null,
  shape = false,
}) {
  const group = new T.Group();
  group.name = 'Nomad / Crane Alley suspended hoist drive';
  const collisionTriangles = [],
    collisionRecords = [],
    seats = [],
    assemblies = [];
  const geometryVersion = NOMAD_HALL_GEOMETRY_VERSION;
  const bounds = new T.Box3();
  const report = {
    source: '@worldkit/environment/industrial',
    carrierId: CARRIER_ID,
    geometryVersion,
    triangles: 0,
    batches: 0,
    assemblies,
    seats,
  };
  group.userData.nomadHallMachinery = report;
  let disposed = false,
    kit = null;
  const buffers = new Set(),
    temporary = new Set();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const geometry of temporary) geometry.dispose();
    temporary.clear();
    for (const geometry of buffers) geometry.dispose();
    buffers.clear();
    kit?.dispose();
  };
  const result = {
    group,
    geometryVersion,
    collisionTriangles,
    collisionRecords,
    bounds,
    report,
    update() {},
    dispose,
  };
  if (shape) return result;
  const carrier = track.carriers.find((entry) => entry.id === CARRIER_ID);
  if (!carrier) throw new Error('Nomad Crane Alley carrier is required.');
  kit = createIndustrialKit();
  kit.materials.shell.color.set('#344b59');
  kit.materials.shell.roughness = 0.43;
  kit.materials.shell.clearcoat = 0.25;
  kit.materials.dark.color.set('#1b2933');
  kit.materials.cast.color.set('#35454a');
  kit.materials.steel.color.set('#6d7773');
  kit.materials.machined.color.set('#ba945c');
  kit.materials.machined.roughness = 0.32;
  kit.materials.amber.color.set('#ba9454');
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
    material.customProgramCacheKey = () => key + '-nomad-hoist-local-v1';
  }
  const root = new T.Group();
  root.name = 'Nomad / Crane Alley hoist source frame';
  root.userData.carrierId = carrier.id;
  root.userData.motionGroup = carrier.id;
  root.quaternion.copy(carrier.quaternion);
  root.scale.copy(carrier.scale);
  group.add(root);
  const byMaterial = new Map();
  const nominalMatrix = new T.Matrix4().compose(
    carrier.origin,
    carrier.quaternion,
    carrier.scale,
  );
  const put = (source, material, matrix) => {
    let geometry = source.clone();
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.applyMatrix4(matrix);
    if (!geometry.attributes.industrialCoord)
      geometry.setAttribute(
        'industrialCoord',
        geometry.attributes.position.clone(),
      );
    if (!geometry.attributes.uv)
      geometry.setAttribute(
        'uv',
        new T.BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 2),
          2,
        ),
      );
    temporary.add(geometry);
    bounds.union(
      new T.Box3().setFromBufferAttribute(geometry.attributes.position),
    );
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(geometry);
  };
  const unit = new T.BoxGeometry(1, 1, 1);
  temporary.add(unit);
  const plate = (position, size, material = kit.materials.dark) =>
    put(
      unit,
      material,
      new T.Matrix4().compose(
        new T.Vector3(...position),
        new T.Quaternion(),
        new T.Vector3(...size),
      ),
    );
  const beam = (from, to, width, depth, material = kit.materials.steel) => {
    const pose = beamTransform(
      new T.Vector3(...from),
      new T.Vector3(...to),
      width,
      depth,
    );
    put(
      unit,
      material,
      new T.Matrix4().compose(pose.position, pose.quaternion, pose.scale),
    );
  };
  const assembly = (name, position, scale, title, rotation = [0, 0, 0]) => {
    const quaternion = new T.Quaternion().setFromEuler(
      new T.Euler(...rotation),
    );
    const matrix = new T.Matrix4().compose(
      new T.Vector3(...position),
      quaternion,
      new T.Vector3(...scale),
    );
    for (const part of kit.prototypes[name])
      put(part.geometry, part.material, matrix);
    assemblies.push({ name, title, position, scale, rotation });
  };
  try {
    // Six roof saddles have real underside contacts at Y126.8, not at the
    // outer roof's Y130. Their broad caps meet the ceiling without floating.
    for (const side of [-1, 1])
      for (const z of [85, 155, 230]) {
        const x = side * 58;
        seats.push({
          position: [x, 126.8, z],
          normal: [0, -1, 0],
          kind: 'retained roof underside',
        });
        plate([x, 126.25, z], [10, 1.1, 14], kit.materials.cast);
        beam([x, 125.7, z], [x, 122.4, z], 3.4, 4.2);
        beam([x, 125.7, z], [side * 45, 122.4, z], 2.2, 2.2);
      }
    for (const side of [-1, 1]) {
      plate([side * 58, 122.4, 157.5], [5, 4, 160]);
      plate([side * 58, 124.4, 157.5], [8, 1, 160], kit.materials.steel);
    }
    for (const z of [140, 170, 225]) plate([0, 123.9, z], [116, 3, 8]);
    // Invert the real roller assembly: its feet meet the upper load frame,
    // leaving the bronze working drum and open cast bearing cheeks underneath.
    // A low cradle would hide this whole face from the actual chase camera.
    assembly(
      'feedRoll',
      [0, 121, 140],
      [0.4, 0.24, 0.7],
      'roof-hung bronze winding drum and open cast bearings',
      [Math.PI, 0, 0],
    );
    assembly(
      'driveGearbox',
      [49, 103.72, 140],
      [0.5, 0.21, 0.65],
      'shaft-aligned starboard hoist reduction',
    );
    for (const z of [126, 154]) beam([58, 125.7, 155], [61, 98.5, z], 2.2, 2.2);
    assembly(
      'louverPanel',
      [-28, 109.5, 210],
      [0.7, 0.24, 0.65],
      'port cooler working face',
    );
    assembly(
      'serviceDeck',
      [50, 119, 183],
      [0.8, 0.26, 0.7],
      'outboard hoist service bridge',
    );
    // A seated cooler load bed and connected pressure return explain why the
    // ribbed bank belongs to this drive, rather than becoming loose ceiling art.
    plate([-28, 99.2, 210], [58, 2, 17]);
    for (const x of [-52, -3]) beam([x, 122.5, 225], [x, 100.2, 210], 1.8, 1.8);
    const path = new T.CatmullRomCurve3(
      [
        [-3, 111, 210],
        [36, 111, 210],
        [49, 111, 165],
        [49, 109, 157],
      ].map((point) => new T.Vector3(...point)),
      false,
      'centripetal',
    );
    const pipe = new T.TubeGeometry(path, 18, 1.1, 8, false);
    temporary.add(pipe);
    put(pipe, kit.materials.dark, new T.Matrix4());
    for (const [material, geometries] of byMaterial) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry)
        throw new Error('Nomad hoist geometry could not be packed.');
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      buffers.add(geometry);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = `Nomad / suspended hoist / ${material.name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.motionGroup = carrier.id;
      root.add(mesh);
      const record = {
        id: mesh.name,
        kind: 'structure',
        motionGroup: carrier.id,
        geometry,
        nominalMatrix: nominalMatrix.clone(),
      };
      collisionRecords.push(record);
      const positions = geometry.attributes.position.array;
      collisionTriangles.push(
        ...indexedTriangles(
          positions,
          Uint32Array.from(
            { length: positions.length / 3 },
            (_, index) => index,
          ),
          { id: record.id, kind: record.kind, motionGroup: record.motionGroup },
          nominalMatrix,
        ),
      );
      report.triangles += geometry.attributes.position.count / 3;
      report.batches++;
    }
    for (const geometry of temporary) geometry.dispose();
    temporary.clear();
    result.update = () => {
      if (!disposed)
        root.position
          .copy(carrier.origin)
          .add(
            sampleCarrierMotion(carrier, track.presentationTime ?? 0)
              .translation,
          );
    };
    result.update();
    return result;
  } catch (error) {
    dispose();
    throw error;
  }
}

import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { assetURL } from '../../assets/url.js';
import { createLifetime } from '../../core/lifecycle.js';
import { createRavelFoilFinish } from '../ravel/foil.js';
import { createRavelMembraneMaterial } from '../ravel/track/road.js';
import {
  createSailbreakPlan,
  createSailGeometry,
  sailPoint,
} from './scenery.js';
import { createReceiverAnchorPlan } from './receiver-anchor.js';
import {
  createReceiverWingPlan,
  assessReceiverBay,
} from './receiver-wing-plan.js';
import { createOpenJawGeometry, SPINDLE_JAWS } from './jaw-housings.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const Y = new T.Vector3(0, 1, 0);

/** Five working anchor stations in the heliopause. The old circuit's ENV is
 * intentionally not constructed: these sheets and socketed fleet placements
 * belong to this course's actual transfer/receiver geometry. */
export async function createRavelFreestyleEnvironment(context) {
  const lifetime = createLifetime(),
    group = new T.Group();
  group.name = 'Ravel Sailbreak / five folded-sail fleet stations';
  const geometries = new Set(),
    materials = new Set();
  try {
    const finish = lifetime.own(createIndustrialFinish(context.view?.renderer));
    const foilFinish = lifetime.own(
      createRavelFoilFinish(context.view?.renderer),
    );
    lifetime.defer(() => {
      for (const geometry of geometries) geometry.dispose();
    });
    lifetime.defer(() => {
      for (const material of materials) material.dispose();
    });
    const plan = createSailbreakPlan(context.track);
    const report = {
      sails: [],
      stays: 0,
      batches: 0,
      anchorStations: [],
      wingStations: [],
      jawStations: [],
      bayStations: [],
    };
    group.userData.sailbreak = report;
    const loaded = await Promise.allSettled([
      ...[
        'ravel/anchor-fleet.glb',
        'ravel/tension-gallery.glb',
        'freestyle-ravel/receiver-wing.glb',
        'freestyle-ravel/receiver-jaw.glb',
        'freestyle-ravel/receiver-bay.glb',
      ].map(async (file) => {
        const { scene } = await new GLTFLoader().loadAsync(
          assetURL(`assets/levels/${file}`),
        );
        scene.updateWorldMatrix(true, true);
        scene.traverse((object) => {
          if (!object.isMesh) return;
          geometries.add(object.geometry);
          for (const material of [object.material].flat())
            materials.add(material);
        });
        lifetime.defer(() => scene.clear());
        return scene;
      }),
      finish.ready,
      foilFinish.ready,
    ]);
    const failed = loaded.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    const [fleet, gallery, wingScene, jawScene, bayScene] = loaded
      .slice(0, 5)
      .map((result) => result.value);
    // The DCC asset exports metre UVs. Keep the same physical foil scale as
    // canonical collector panels instead of stretching a tiny repeat over it.
    wingScene.traverse((object) => {
      if (!object.isMesh) return;
      const uv = object.geometry.getAttribute('uv');
      const coordinates = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) {
        coordinates[i * 2] = uv.getX(i) * 24;
        coordinates[i * 2 + 1] = uv.getY(i) * 16;
      }
      object.geometry.setAttribute(
        'roadCoord',
        new T.BufferAttribute(coordinates, 2),
      );
    });
    const metal = lifetime.own(
      new T.MeshStandardMaterial({
        name: 'Sailbreak / seated copper load hems and taut stays',
        color: '#95836b',
        metalness: 0.8,
        roughness: 0.4,
      }),
    );
    finish.bind(metal, 'steel');
    const silver = lifetime.own(
      createRavelMembraneMaterial('#d3dddf', null, foilFinish),
    );
    const gold = lifetime.own(
      createRavelMembraneMaterial('#d6c19d', null, foilFinish),
    );
    for (const material of [silver, gold]) {
      material.bumpScale = 0.7;
      material.roughness = 0.42;
      material.clearcoat = 0;
    }
    const allMaterials = new Set([metal, silver, gold]);
    for (const material of materials) {
      allMaterials.add(material);
      if (!/Bridge|Glass|Power|glazing/i.test(material.name))
        finish.bind(
          material,
          /Ceramic/i.test(material.name)
            ? 'shell'
            : /Graphite|Interior/i.test(material.name)
              ? 'dark'
              : 'steel',
        );
    }
    // Keep every contact triangle/receiver/VFX owner. These private coatings
    // use Ravel's actual aluminized cloth rather than Skywell's concrete grid.
    const racingFoil = lifetime.own(
      createRavelMembraneMaterial('#ccd5d8', 18, foilFinish),
    );
    racingFoil.name = 'Sailbreak / bonded silver racing foil';
    racingFoil.roughness = 0.58;
    racingFoil.metalness = 0.72;
    racingFoil.clearcoat = 0;
    racingFoil.envMapIntensity = 0.72;
    racingFoil.bumpScale = 0.7;
    const throatFoil = lifetime.own(
      createRavelMembraneMaterial('#c6d1d7', null, foilFinish),
    );
    throatFoil.name = 'Sailbreak / continuous silver receiving throat';
    throatFoil.bumpScale = 1.1;
    throatFoil.clearcoat = 0;
    for (const material of [racingFoil, throatFoil]) allMaterials.add(material);
    const receivingFoils = new Map();
    function receivingFoilFor(original) {
      if (!receivingFoils.has(original)) {
        // Each arrival has independent clean-catch emission. Sharing one
        // coating would let the last zone overwrite another zone's flash.
        const material = lifetime.own(
          createRavelMembraneMaterial('#4b9486', null, foilFinish),
        );
        material.name = 'Sailbreak / green bonded receiving foil';
        material.metalness = 0.42;
        material.bumpScale = 0.7;
        material.clearcoat = 0;
        material.emissive.set('#235e59');
        material.emissiveIntensity = original.emissiveIntensity;
        receivingFoils.set(original, material);
        allMaterials.add(material);
      }
      return receivingFoils.get(original);
    }
    const roadRestores = [];
    context.road?.group.traverse((object) => {
      if (object.name === 'Flush expansion joint') {
        const visible = object.visible;
        object.visible = false;
        roadRestores.push(() => {
          object.visible = visible;
        });
      }
      if (!object.isMesh || !object.geometry.hasAttribute('roadCoord')) return;
      const original = object.material;
      const replace = (material) =>
        /satin mineral-composite running slab/.test(material.name)
          ? racingFoil
          : /fitted limestone induction throat/.test(material.name)
            ? throatFoil
            : /woven turquoise receiver inlay/.test(material.name)
              ? receivingFoilFor(material)
              : material;
      const replacement = Array.isArray(original)
        ? original.map(replace)
        : replace(original);
      object.material = replacement;
      roadRestores.push(() => {
        object.material = original;
      });
    });
    // Restore borrowed slots before disposing this owner's foil materials/maps.
    lifetime.defer(() => {
      for (const restore of roadRestores) restore();
    });
    const entries = new Map();
    function part(geometry, material, matrix, name) {
      const key = geometry.uuid + material.uuid;
      if (!entries.has(key))
        entries.set(key, { geometry, material, matrices: [], name });
      entries.get(key).matrices.push(matrix);
      allMaterials.add(material);
    }
    function prototype(
      root,
      placement,
      materialMap = null,
      geometryMap = null,
    ) {
      root.updateWorldMatrix(true, true);
      const inverse = root.matrixWorld.clone().invert();
      root.traverse((object) => {
        if (!object.isMesh) return;
        const material =
          materialMap?.get(object.material.name) ?? object.material;
        part(
          geometryMap?.get(object.geometry) ?? object.geometry,
          material,
          placement
            .clone()
            .multiply(inverse.clone().multiply(object.matrixWorld)),
          root.name,
        );
      });
    }
    const cableGeometry = lifetime.own(new T.CylinderGeometry(1, 1, 1, 6));
    const kneeGeometry = lifetime.own(new RoundedBoxGeometry(1, 1, 1, 1, 0.08));
    for (const sail of plan.sails) {
      const geometry = lifetime.own(createSailGeometry(sail));
      const mesh = new T.Mesh(geometry, sail.gold ? gold : silver);
      mesh.name = `Sailbreak / ${sail.id}`;
      mesh.receiveShadow = true;
      mesh.userData.aoExclude = true;
      group.add(mesh);
      report.sails.push({ id: sail.id, outboard: sail.outboard });
      // Continuous hems are authored on the actual folded perimeter.
      for (const [axis, value] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ]) {
        const points = Array.from({ length: 49 }, (_, i) =>
          sailPoint(sail, axis ? i / 48 : value, axis ? value : i / 48),
        );
        const geometry = lifetime.own(
          new T.TubeGeometry(new T.CatmullRomCurve3(points), 64, 1.6, 5),
        );
        part(geometry, metal, new T.Matrix4(), 'folded collector perimeter');
      }
    }
    const gallerySegment = gallery.getObjectByName('tension_gallery_segment');
    const crown = gallery.getObjectByName('sail_load_crown');
    const wingRoot = wingScene.getObjectByName('receiver_foil_wing');
    const jawRoot = jawScene.getObjectByName('receiver_jaw');
    const bayRoot = bayScene.getObjectByName('receiver_service_bay');
    const openJaws = createOpenJawGeometry(
      fleet.getObjectByName('tension_spindle'),
    );
    for (const geometry of openJaws.replacements.values())
      geometries.add(geometry);
    if (!gallerySegment || !crown || !wingRoot || !jawRoot || !bayRoot)
      throw new Error('Sailbreak structural prototypes are missing');
    const wingVariations = [
      [0.85, 1, 0],
      [1, 1, -0.45],
      [1.15, 0.75, -0.25],
      [0.9, 0.7, 0],
      [1.1, 0.9, 0.15],
    ];
    for (const station of plan.stations) {
      const { index, sail, frame, side } = station;
      const anchor = createReceiverAnchorPlan({
        track: context.track,
        station,
      });
      if (!anchor.clearance.safe)
        throw new Error(
          `Sailbreak anchor corridor blocked: ${anchor.clearance.blockers.map((item) => item.name).join(', ')}`,
        );
      for (const item of anchor.prototypes)
        prototype(
          item.prototype === 'sail_load_crown'
            ? crown
            : fleet.getObjectByName(item.prototype),
          item.matrix,
          null,
          item.prototype === 'tension_spindle' ? openJaws.replacements : null,
        );
      {
        for (const center of SPINDLE_JAWS) {
          const matrix = anchor.prototypes[0].matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(...center.toArray()));
          prototype(jawRoot, matrix);
          report.jawStations.push({ index, matrix: matrix.toArray() });
        }
      }
      for (const item of anchor.gallery) prototype(gallerySegment, item.matrix);
      for (const item of [...anchor.arms, ...anchor.stays]) {
        const delta = item.b.clone().sub(item.a);
        const matrix = new T.Matrix4().compose(
          item.a.clone().add(item.b).multiplyScalar(0.5),
          new T.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
          new T.Vector3(item.width, delta.length(), item.width),
        );
        part(
          anchor.stays.includes(item) ? cableGeometry : kneeGeometry,
          metal,
          matrix,
          item.name,
        );
      }
      if ([0, 1].includes(index)) {
        // A real working room wraps the solid C keel near road height. Its
        // backplate enters the graphite section by 2m; the upright room is
        // inboard of the membrane, leaving its floor/overhang unobstructed.
        const angle = ((index === 0 ? 75 : 265) * Math.PI) / 180;
        const nativeSeat = new T.Vector3(
          147 * Math.cos(angle),
          147 * Math.sin(angle),
          -12,
        );
        const position = nativeSeat
          .clone()
          .applyMatrix4(anchor.prototypes[0].matrix);
        const rotation = frame.quaternion
          .clone()
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              Y,
              index === 1 ? 0 : (side * Math.PI) / 2,
            ),
          );
        const scale = index === 0 ? 0.945 : 1.05;
        const matrix = new T.Matrix4().compose(
          position,
          rotation,
          new T.Vector3(scale, scale, scale),
        );
        const clearance = assessReceiverBay(context.track, bayRoot, matrix);
        if (!clearance.safe)
          throw new Error(
            `Sailbreak working bay corridor blocked: ${clearance.blockers.map((item) => item.name).join(', ')}`,
          );
        prototype(bayRoot, matrix);
        report.bayStations.push({
          index,
          matrix: matrix.toArray(),
          nativeSeat: nativeSeat.toArray(),
          clearance,
        });
      }
      report.anchorStations.push({
        index,
        clearance: anchor.clearance,
        prototypes: anchor.prototypes.map((item) => ({
          prototype: item.prototype,
          matrix: item.matrix.toArray(),
        })),
        links: [...anchor.arms, ...anchor.stays, ...anchor.gallery].map(
          ({ a, b, name }) => ({ a: a.toArray(), b: b.toArray(), name }),
        ),
      });
      const cutterRoot = fleet.getObjectByName('anchor_cutter');
      const [preferredScale, preferredAlongScale, preferredYaw] =
        wingVariations[index];
      const wing = createReceiverWingPlan({
        track: context.track,
        station,
        anchor,
        wingRoot,
        cutterRoot,
        preferredScale,
        preferredAlongScale,
        preferredYaw,
      });
      if (!wing.clearance.safe)
        throw new Error(
          `Sailbreak wing corridor blocked: ${wing.clearance.blockers.map((item) => item.name).join(', ')}`,
        );
      const wingMaterials = new Map([
        ['Foil / receiver collector membrane', sail.gold ? gold : silver],
      ]);
      for (const item of wing.prototypes)
        prototype(
          item.prototype === 'receiver_foil_wing' ? wingRoot : cutterRoot,
          item.matrix,
          item.prototype === 'receiver_foil_wing' ? wingMaterials : null,
        );
      for (const item of wing.stays) {
        const delta = item.b.clone().sub(item.a);
        const matrix = new T.Matrix4().compose(
          item.a.clone().add(item.b).multiplyScalar(0.5),
          new T.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
          new T.Vector3(item.width, delta.length(), item.width),
        );
        part(cableGeometry, metal, matrix, item.name);
      }
      report.wingStations.push({
        index,
        clearance: wing.clearance,
        rootContactError: wing.rootContactError,
        scale: wing.scale,
        alongScale: wing.alongScale,
        yaw: wing.yaw,
        prototypes: wing.prototypes.map((item) => ({
          prototype: item.prototype,
          matrix: item.matrix.toArray(),
        })),
        links: wing.stays.map(({ a, b, name }) => ({
          a: a.toArray(),
          b: b.toArray(),
          name,
        })),
      });
    }
    report.stays = report.wingStations.reduce(
      (count, station) => count + station.links.length,
      0,
    );
    const byMaterial = new Map();
    for (const entry of entries.values()) {
      if (!byMaterial.has(entry.material)) byMaterial.set(entry.material, []);
      byMaterial.get(entry.material).push(entry);
    }
    for (const [material, sources] of byMaterial) {
      const count = sources.reduce(
        (n, source) => n + source.matrices.length,
        0,
      );
      const vertices = sources.reduce(
        (n, source) => n + source.geometry.attributes.position.count,
        0,
      );
      const indices = sources.reduce(
        (n, source) =>
          n +
          (source.geometry.index?.count ??
            source.geometry.attributes.position.count),
        0,
      );
      const needsUv = sources.some(({ geometry }) =>
        geometry.hasAttribute('uv'),
      );
      const batch = lifetime.own(
        new T.BatchedMesh(count, vertices, indices, material),
      );
      batch.name = `Sailbreak / spatially culled ${material.name}`;
      batch.perObjectFrustumCulled = true;
      batch.sortObjects = false;
      batch.receiveShadow = true;
      // Keep local saddle/bay contact depth. The distant fleet and immense
      // crescent do not earn the full extra shadow-map cost in chase views.
      batch.castShadow =
        /receiver load chassis|formed jaw fittings|recessed pin bearings|service bay|seated winding roller/i.test(
          material.name,
        );
      for (const source of sources) {
        let geometry = source.geometry;
        if (!geometry.index || (needsUv && !geometry.hasAttribute('uv'))) {
          geometry = new T.BufferGeometry();
          for (const [name, attribute] of Object.entries(
            source.geometry.attributes,
          ))
            geometry.setAttribute(name, attribute);
          geometry.setIndex(
            source.geometry.index ??
              Array.from(
                { length: geometry.attributes.position.count },
                (_, i) => i,
              ),
          );
          if (!geometry.hasAttribute('uv'))
            geometry.setAttribute(
              'uv',
              new T.Float32BufferAttribute(
                new Float32Array(geometry.attributes.position.count * 2),
                2,
              ),
            );
        }
        let id;
        try {
          id = batch.addGeometry(geometry);
        } finally {
          if (geometry !== source.geometry) geometry.dispose();
        }
        for (const matrix of source.matrices)
          batch.setMatrixAt(batch.addInstance(id), matrix);
      }
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      group.add(batch);
      report.batches++;
    }
    return {
      group,
      setReflection(texture) {
        for (const material of allMaterials) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      },
      dispose() {
        group.clear();
        lifetime.dispose();
      },
    };
  } catch (error) {
    group.clear();
    lifetime.dispose();
    throw error;
  }
}

import * as T from 'three';
import {
  carrierMotionRules,
  sampleCarrierMotion,
  NOMAD_MOTION_RULES,
} from './motion.js';
import kitManifest from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const DETAILS = [
  { suffix: '', distance: 0 },
  { suffix: '_mid', distance: 1800 },
  { suffix: '_far', distance: 4500 },
];
const wheelAnchors = kitManifest.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');

function prototypeParts(source, kind) {
  const materials = new Map();
  for (const [level, detail] of DETAILS.entries()) {
    const root = source.getObjectByName(`nomad_${kind}${detail.suffix}`);
    if (!root) throw new Error('Nomad carrier kit is missing a detail tier.');
    // Hull clones included their prototype root's transform. The former wheel
    // InstancedMesh baked only transforms below the wheel prototype root.
    const inverse = (
      kind === 'wheel'
        ? root.matrixWorld
        : (root.parent?.matrixWorld ?? new T.Matrix4())
    )
      .clone()
      .invert();
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material) || !mesh.geometry?.attributes.position)
        throw new Error(
          'Nomad fleet parts require one material and a position attribute.',
        );
      if (!materials.has(mesh.material))
        materials.set(
          mesh.material,
          DETAILS.map(() => []),
        );
      materials
        .get(mesh.material)
        [level].push({
          geometry: mesh.geometry,
          matrix: inverse.clone().multiply(mesh.matrixWorld),
        });
    });
  }
  return materials;
}

// BatchedMesh copies these borrowed attributes into its own buffers. A packing
// view supplies only absent, unused UVs and owns no source geometry or material.
function packingView(geometry, needsUv) {
  const packed = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes))
    packed.setAttribute(name, attribute);
  if (geometry.index) packed.setIndex(geometry.index);
  if (needsUv && !packed.hasAttribute('uv'))
    packed.setAttribute(
      'uv',
      new T.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 2),
        2,
      ),
    );
  packed.computeBoundingBox();
  packed.computeBoundingSphere();
  return packed;
}

/** Exact authored hulls and rolling wheels, packed by material across the fleet.
 * Sources and finishes remain borrowed; only native batch buffers/textures are
 * owned here. LOD changes replace geometry IDs rather than entire scene trees.
 */
export function createNomadFleetBatches({
  track,
  source,
  carriers = track.carriers,
}) {
  const group = new T.Group();
  group.name = 'Nomad / armored moving fleet';
  const batches = [],
    placements = carriers.map((carrier) => ({
      carrier,
      matrix: new T.Matrix4(),
      level: 0,
      slots: [],
    }));
  let disposed = false;
  const report = {
    batches: 0,
    hullInstances: 0,
    wheelInstances: 0,
    hullTriangles: DETAILS.map(() => 0),
    wheelTriangles: DETAILS.map(() => 0),
  };
  const position = new T.Vector3(),
    cameraPosition = new T.Vector3();
  const worldPosition = new T.Vector3(),
    matrix = new T.Matrix4(),
    rotation = new T.Matrix4();

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const batch of batches) batch.dispose();
  }

  function update(frame = {}) {
    if (disposed) return;
    const time = track.presentationTime ?? 0;
    if (frame.camera) {
      group.updateWorldMatrix(true, false);
      cameraPosition.setFromMatrixPosition(frame.camera.matrixWorld);
    }
    for (const placement of placements) {
      const { carrier } = placement,
        motion = sampleCarrierMotion(carrier, time);
      position.copy(carrier.origin).add(motion.translation);
      placement.matrix.compose(position, carrier.quaternion, carrier.scale);
      let level = placement.level;
      if (frame.camera) {
        worldPosition.copy(position).applyMatrix4(group.matrixWorld);
        const distance =
          cameraPosition.distanceTo(worldPosition) / frame.camera.zoom;
        level =
          distance >= DETAILS[2].distance
            ? 2
            : distance >= DETAILS[1].distance
              ? 1
              : 0;
      }
      const changed = level !== placement.level;
      // Inspection and pause retain the same rigid pose. Avoid uploading ten
      // identical matrix textures every displayed frame; camera LOD changes
      // still refresh the selected prototype's local transform immediately.
      if (!changed && placement.time === time) continue;
      placement.level = level;
      placement.time = time;
      const angle =
        (NOMAD_MOTION_RULES.convoySpeed * time + motion.translation.z) /
        (24 * carrier.scale.x);
      rotation.makeRotationX(angle);
      for (const slot of placement.slots) {
        const part = slot.parts[level];
        if (changed) {
          slot.batch.setVisibleAt(slot.instance, Boolean(part));
          if (part) slot.batch.setGeometryIdAt(slot.instance, part.id);
        }
        if (!part) continue;
        matrix.copy(placement.matrix);
        if (slot.base) matrix.multiply(slot.base).multiply(rotation);
        matrix.multiply(part.matrix);
        slot.batch.setMatrixAt(slot.instance, matrix);
      }
    }
  }

  try {
    source.updateWorldMatrix(true, true);
    for (const kind of ['carrier', 'wheel']) {
      for (const [material, tiers] of prototypeParts(source, kind)) {
        const parts = tiers.flat(),
          count = Math.max(...tiers.map((tier) => tier.length));
        const copies = kind === 'wheel' ? wheelAnchors.length : 1;
        const batch = new T.BatchedMesh(
          carriers.length * count * copies,
          parts.reduce(
            (sum, part) => sum + part.geometry.attributes.position.count,
            0,
          ),
          parts.reduce(
            (sum, part) => sum + (part.geometry.index?.count ?? 0),
            0,
          ),
          material,
        );
        batches.push(batch);
        group.add(batch);
        batch.name = `Nomad / ${kind === 'wheel' ? 'rolling bogies' : 'armored hulls'} / ${material.name}`;
        batch.userData.nomadFleetKind = kind;
        batch.perObjectFrustumCulled = true;
        batch.sortObjects = false;
        batch.castShadow = true;
        batch.receiveShadow = true;
        const needsUv = parts.some((part) => part.geometry.hasAttribute('uv'));
        const packedTiers = tiers.map((tier, level) =>
          tier.map((part) => {
            const packed = packingView(part.geometry, needsUv);
            try {
              const id = batch.addGeometry(packed);
              report[kind === 'wheel' ? 'wheelTriangles' : 'hullTriangles'][
                level
              ] +=
                (packed.index?.count ?? packed.attributes.position.count) / 3;
              return {
                id,
                matrix: part.matrix,
                box: packed.boundingBox.clone(),
                sphere: packed.boundingSphere.clone(),
              };
            } finally {
              packed.dispose();
            }
          }),
        );
        const bounds = new T.Box3();
        for (const placement of placements) {
          const { carrier } = placement;
          const nominal = new T.Matrix4().compose(
            carrier.origin,
            carrier.quaternion,
            carrier.scale,
          );
          const carrierBounds = new T.Box3();
          for (let partIndex = 0; partIndex < count; partIndex++) {
            const levels = packedTiers.map((tier) => tier[partIndex]);
            for (let copy = 0; copy < copies; copy++) {
              const base =
                kind === 'wheel'
                  ? new T.Matrix4()
                      .makeScale(1, 1, carrier.scale.x / carrier.scale.z)
                      .setPosition(
                        new T.Vector3().fromArray(wheelAnchors[copy].position),
                      )
                  : null;
              const initial = levels.find(Boolean);
              const instance = batch.addInstance(initial.id);
              if (!levels[0]) batch.setVisibleAt(instance, false);
              placement.slots.push({ batch, instance, parts: levels, base });
              for (const part of levels) {
                if (!part) continue;
                if (base) {
                  // Include every wheel rotation, not only its initial pose.
                  const sphere = part.sphere.clone().applyMatrix4(part.matrix);
                  const radius =
                    (sphere.center.length() + sphere.radius) *
                    Math.max(
                      Math.abs(carrier.scale.x),
                      Math.abs(carrier.scale.y),
                    );
                  const centre = new T.Vector3()
                    .fromArray(wheelAnchors[copy].position)
                    .applyMatrix4(nominal);
                  carrierBounds.union(
                    new T.Box3(
                      centre.clone().addScalar(-radius),
                      centre.clone().addScalar(radius),
                    ),
                  );
                } else {
                  matrix.multiplyMatrices(nominal, part.matrix);
                  carrierBounds.union(part.box.clone().applyMatrix4(matrix));
                }
              }
            }
          }
          const motion = carrierMotionRules(carrier);
          carrierBounds.expandByVector(
            new T.Vector3(
              2 * Math.abs(motion.lateralAmplitude),
              2 *
                NOMAD_MOTION_RULES.groundGrade *
                Math.abs(motion.longitudinalAmplitude),
              2 * Math.abs(motion.longitudinalAmplitude),
            ),
          );
          bounds.union(carrierBounds);
        }
        // These conservative bounds cover all tiers, wheel angles and the full
        // bounded motion. Native per-instance culling still uses exact poses.
        batch.boundingBox = bounds;
        batch.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
        report[kind === 'wheel' ? 'wheelInstances' : 'hullInstances'] +=
          batch.instanceCount;
      }
    }
    report.batches = batches.length;
    update();
    return { group, update, dispose, report };
  } catch (error) {
    dispose();
    throw error;
  }
}

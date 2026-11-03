import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { assetURL } from '../../assets/url.js';
import { createRavelCanopies } from './canopies.js';
import { createRavelRigging } from './rigging.js';

/** Richness comes from a fleet holding a working solar loom: drivable lower
 * sails, overlapping collector sheets and ships with seated tension hardware. */
export function createRavelEnvironment({ track, view }) {
  const group = new T.Group();
  group.name = 'Ravel / solar loom anchor fleet';
  const finish = createIndustrialFinish(view?.renderer);
  const canopies = createRavelCanopies({ track });
  group.add(canopies.group);
  const rigging = createRavelRigging({ track, finish });
  group.add(rigging.group);
  // Fleet and edge rigging are added from their retained editable asset kit.
  const geometries = new Set(),
    materials = new Set();
  let fleet = null,
    disposed = false;
  const cableGeometry = new T.CylinderGeometry(1, 1, 1, 6);
  const cableMaterial = new T.MeshStandardMaterial({
    color: '#7b7566',
    metalness: 0.8,
    roughness: 0.3,
  });
  geometries.add(cableGeometry);
  materials.add(cableMaterial);
  const cableMatrices = [],
    guideMatrices = [];
  const guideGeometry = new T.TorusGeometry(3.8, 0.65, 8, 24);
  geometries.add(guideGeometry);
  const cable = (a, b, radius = 0.65) => {
    const delta = b.clone().sub(a);
    if (delta.length() < 1) return;
    cableMatrices.push(
      new T.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.clone().normalize(),
        ),
        new T.Vector3(radius, delta.length(), radius),
      ),
    );
  };
  const fleetReady = new GLTFLoader()
    .loadAsync(assetURL('assets/levels/ravel/anchor-fleet.glb'))
    .then((gltf) => {
      fleet = gltf.scene;
      fleet.traverse((o) => {
        if (o.isMesh) {
          geometries.add(o.geometry);
          materials.add(o.material);
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      if (disposed) {
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        fleet.clear();
        return;
      }
      const definitions = [
        ['loom_carrier', 1040, -180, 175, 1, 0],
        ['anchor_cutter', 3240, 155, 115, 1, -0.15],
        ['tension_spindle', 3600, -300, 170, 1, 0.3],
        ['loom_carrier', 5100, 175, 110, 0.8, 0.2],
        ['anchor_cutter', 6500, -145, 95, 1.2, -0.25],
        ['tension_spindle', 7850, 500, 620, 1.2, -0.2],
        ['loom_carrier', 8700, -700, 490, 1.2, -0.35],
        ['anchor_cutter', 9500, 850, 600, 1.1, 0.3, 650],
        ['tension_spindle', 10300, -430, 280, 1, 0],
        ['loom_carrier', 11600, 175, 125, 0.8, 0.15],
        ['anchor_cutter', 12800, -150, 110, 1, -0.25],
      ];
      const instances = new Map();
      for (const [name, s, x, y, scale, yaw, guideLift = 180] of definitions) {
        const root = fleet.getObjectByName(name);
        if (!root) throw new Error('Ravel fleet is missing ' + name);
        root.updateWorldMatrix(true, true);
        const frame = track.sample(s);
        const placement = new T.Matrix4().compose(
          frame.position
            .clone()
            .addScaledVector(frame.right, x)
            .addScaledVector(frame.up, y),
          frame.quaternion
            .clone()
            .multiply(
              new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
            ),
          new T.Vector3(scale, scale, scale),
        );
        let socketIndex = 0;
        root.traverse((o) => {
          if (
            o.userData.anchorKind === 'cable' ||
            o.userData.anchorKind === 'tow'
          ) {
            const anchor = new T.Vector3()
              .setFromMatrixPosition(
                root.matrixWorld.clone().invert().multiply(o.matrixWorld),
              )
              .applyMatrix4(placement);
            const station = T.MathUtils.euclideanModulo(
              s + (socketIndex++ % 2 ? 100 : -100),
              track.length,
            );
            const bands = track.roadBands.filter(
              (b) => station >= b.start && station <= b.end,
            );
            if (bands.length) {
              const values = bands.flatMap((b) => [
                typeof b.min === 'function' ? b.min(station) : b.min,
                typeof b.max === 'function' ? b.max(station) : b.max,
              ]);
              const lateral = x < 0 ? Math.min(...values) : Math.max(...values);
              const surface = track.surfaceAtTime(station, lateral, 0);
              const stay = (frame, radius, anchorStation) => {
                const side = x < 0 ? -1 : 1;
                const destination = frame.position
                  .clone()
                  .addScaledVector(frame.up, -70)
                  .addScaledVector(frame.right, side * 100);
                const guide = frame.position
                  .clone()
                  .addScaledVector(track.sample(anchorStation).up, guideLift)
                  .addScaledVector(frame.right, side * 150);
                cable(anchor, guide, radius * scale);
                cable(guide, destination, 2.1 * scale);
                guideMatrices.push(
                  new T.Matrix4().compose(
                    guide,
                    frame.quaternion,
                    new T.Vector3(scale, scale, scale),
                  ),
                );
              };
              stay(surface, 0.7, station);
              const secondStation = station + 45;
              if (track.surfaceCoverage(secondStation, lateral) > 0)
                stay(
                  track.surfaceAtTime(secondStation, lateral, 0),
                  0.4,
                  secondStation,
                );
            }
          }
          if (!o.isMesh) return;
          const key = o.geometry.uuid + o.material.uuid;
          if (!instances.has(key))
            instances.set(key, {
              geometry: o.geometry,
              material: o.material,
              matrices: [],
            });
          const relative = root.matrixWorld
            .clone()
            .invert()
            .multiply(o.matrixWorld);
          instances
            .get(key)
            .matrices.push(placement.clone().multiply(relative));
        });
      }
      if (cableMatrices.length) {
        const stays = new T.InstancedMesh(
          cableGeometry,
          cableMaterial,
          cableMatrices.length,
        );
        stays.name = 'Ravel / fleet to sail tension stays';
        cableMatrices.forEach((matrix, index) =>
          stays.setMatrixAt(index, matrix),
        );
        stays.computeBoundingSphere();
        group.add(stays);
      }
      if (guideMatrices.length) {
        const guides = new T.InstancedMesh(
          guideGeometry,
          cableMaterial,
          guideMatrices.length,
        );
        guides.name = 'Ravel / seated outboard tension guides';
        guideMatrices.forEach((matrix, index) =>
          guides.setMatrixAt(index, matrix),
        );
        guides.computeBoundingSphere();
        group.add(guides);
      }
      for (const { geometry, material, matrices } of instances.values()) {
        const batch = new T.InstancedMesh(geometry, material, matrices.length);
        batch.name = 'Ravel / anchor fleet / ' + material.name;
        matrices.forEach((m, i) => batch.setMatrixAt(i, m));
        batch.computeBoundingSphere();
        batch.receiveShadow = true;
        group.add(batch);
      }
    });
  const ready = Promise.all([finish.ready, fleetReady]);
  return {
    group,
    ready,
    finish,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      canopies.dispose();
      rigging.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      fleet?.clear();
      finish.dispose();
    },
  };
}

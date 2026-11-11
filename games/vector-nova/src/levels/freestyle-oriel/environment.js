import * as T from 'three';
import { createOrielTrack } from '../oriel/track/model.js';
import { createOrielEnvironment } from '../oriel/environment/index.js';
import { createCivicKit } from '../oriel/environment/civic-kit.js';
import { createLifetime } from '../../core/lifecycle.js';
import { createOrielStoneMaps } from '../oriel/environment/stone-maps.js';
import {
  createSunvaultWorks,
  foundedSunvaultFootY,
  addSunvaultInstances,
} from './civic-works.js';
import { finishSunvaultShell } from './shell-finish.js';
import { createSunvaultGardens } from './gardens.js';
import { finishHabitatMaterial } from '../oriel/environment/habitat.js';
import { createGardenQuarter } from '../oriel/environment/garden-quarter.js';
import { createSunvaultQuarterPlan } from './quarter-plan.js';

// The original continuous inhabited shell is a world asset, not another road.
// Scale around its axial sun (y=1000); its radial material/light convention is
// therefore retained. Close arrival courts are authored at the new road scale.
export async function createOrielFreestyleEnvironment(context) {
  const lifetime = createLifetime(),
    group = new T.Group();
  group.name =
    'Oriel Sunvault / the inhabited cylinder and five arrival courts';
  lifetime.defer(() => group.clear());
  try {
    const sourceTrack = createOrielTrack();
    const shell = lifetime.own(
      await createOrielEnvironment({
        ...context,
        track: sourceTrack,
        road: null,
      }),
    );
    shell.group.scale.setScalar(5);
    shell.group.position.y = -4000;
    group.add(shell.group);
    const kit = lifetime.own(await createCivicKit());
    const maps = await createOrielStoneMaps(context.view.renderer, lifetime);
    const shellFinish = finishSunvaultShell(shell.group, lifetime, kit, maps);
    const works = await createSunvaultWorks(lifetime, maps);
    const finishes = new Set([...works.materials, ...shellFinish.materials]);
    const quarter = await createGardenQuarter({
      track: sourceTrack,
      lifetime,
      stoneMaps: maps,
    });
    const quarterPlan = createSunvaultQuarterPlan({
      track: context.track,
      sourceGroup: quarter.group,
      pierParts: works.prototypes.anchor_pier,
    });
    quarter.group.applyMatrix4(quarterPlan.matrix);
    quarter.group.name = 'Sunvault / continuous inhabited water-garden quarter';
    group.add(quarter.group);
    for (const material of quarter.materials) {
      if (/warm limestone/.test(material.name)) {
        material.color.multiplyScalar(0.9);
        material.roughness = 0.86;
        material.normalScale.set(0.28, 0.28);
      }
      if (/pale honed coping/.test(material.name))
        material.color.multiplyScalar(0.94);
      if (/blue-green glazing and channel/.test(material.name))
        material.envMapIntensity = 0.8;
      finishes.add(material);
    }
    const quarterRotation = new T.Quaternion().setFromRotationMatrix(
      quarterPlan.matrix,
    );
    const quarterAnchors = quarter.plantingAnchors.map((anchor) => ({
      kind: anchor.kind,
      position: anchor.position.clone().applyMatrix4(quarterPlan.matrix),
      quaternion: anchor.quaternion.clone().premultiply(quarterRotation),
      scale: anchor.scale.clone(),
    }));
    const radialFinished = new Set();
    const radial = (material, bounce = 0.12) => {
      if (radialFinished.has(material)) return;
      radialFinished.add(material);
      finishHabitatMaterial(material, { bounce });
    };
    for (const material of works.materials)
      radial(material, material.name === 'WarmLimestone' ? 0.12 : 0.06);
    context.road?.group.traverse((mesh) => {
      // Coplanar straight strips tear across the twisted deck. The running
      // material already supplies metric joints without another depth layer.
      if (mesh.name === 'Flush expansion joint') mesh.visible = false;
      for (const material of [mesh.material].flat().filter(Boolean)) {
        if (
          /running slab|fitted limestone induction throat/.test(material.name)
        ) {
          maps.apply(material);
          maps.coordinates(mesh.geometry, context.track);
          material.color.set(
            /throat/.test(material.name) ? '#c9d0c3' : '#d6cbb5',
          );
          radial(material, 0.14);
        }
        if (material.name === 'Skywell / woven turquoise receiver inlay') {
          // A private receiver clone still carried Skywell's dark carbon PBR.
          // Keep its factual green catch lane, using this world's mineral coat.
          material.name = 'Sunvault / integrated green mineral receiver inlay';
          maps.apply(material);
          maps.coordinates(mesh.geometry, context.track);
          material.color.set('#69afa0');
          material.metalness = 0.04;
          material.roughness = 0.7;
          radial(material, 0.2);
        }
      }
    });
    for (const parts of Object.values(kit.prototypes))
      for (const part of parts)
        for (const material of [part.material].flat()) {
          finishes.add(material);
          if (/limestone|cornice/.test(material.name)) {
            maps.apply(material);
            maps.coordinates(part.geometry);
            radial(material);
          }
          if (/roof/.test(material.name)) {
            material.color.set('#285a60');
            material.roughness = 0.38;
            material.envMapIntensity = 0.6;
          }
          if (/glazing/.test(material.name)) {
            material.color.set('#306b73');
            material.roughness = 0.26;
            material.envMapIntensity = 0.8;
            material.emissive.set('#14363d');
            material.emissiveIntensity = 0.13;
          }
        }
    const stone = lifetime.own(
      new T.MeshStandardMaterial({
        color: '#c6bea6',
        roughness: 0.76,
        metalness: 0.06,
      }),
    );
    const bronze = lifetime.own(
      new T.MeshStandardMaterial({
        color: '#827052',
        roughness: 0.48,
        metalness: 0.55,
      }),
    );
    const geometry = lifetime.own(new T.BoxGeometry(1, 1, 1));
    const placements = {
      pavilion: [],
      tower: [],
      gardenCourt: [],
      waterfront: [],
    };
    const assemblies = {
      anchor_pier: [...quarterPlan.foundations],
      arrival_terrace: [],
      load_cradle: [],
    };
    const arrivalMix = [
      ['gardenCourt', 'waterfront'],
      ['waterfront', 'gardenCourt'],
      ['pavilion', 'waterfront'],
      ['gardenCourt', 'pavilion'],
      ['waterfront', 'gardenCourt'],
    ];
    const staggers = [
      [-18, 48],
      [-40, -8],
      [36, -44],
      [-44, 32],
      [20, -20],
    ];
    for (const [i, jump] of context.track.jumps.entries()) {
      const frame = context.track.sample(jump.target + 40);
      const forward = frame.tangent.clone().setY(0).normalize();
      const right = new T.Vector3(forward.z, 0, -forward.x);
      const heading = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        Math.atan2(forward.x, forward.z),
      );
      assemblies.load_cradle.push(
        new T.Matrix4().compose(
          frame.position,
          frame.quaternion,
          new T.Vector3(1, 1, 1),
        ),
      );
      for (const side of [-1, 1]) {
        const p = frame.position.clone().addScaledVector(right, side * 170);
        p.addScaledVector(forward, staggers[i][side > 0 ? 1 : 0]);
        p.y -= 22;
        const courtHeading = heading
          .clone()
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 1, 0),
              side < 0 ? 2.3 : -2.3,
            ),
          );
        const footY = foundedSunvaultFootY(p, courtHeading);
        const terraceBase = p.clone().add(new T.Vector3(0, -48, 0));
        assemblies.anchor_pier.push(
          new T.Matrix4().compose(
            new T.Vector3(p.x, footY, p.z),
            courtHeading,
            new T.Vector3(1, (terraceBase.y - footY) / 1000, 1),
          ),
        );
        assemblies.arrival_terrace.push(
          new T.Matrix4().compose(
            terraceBase,
            courtHeading,
            new T.Vector3(1, 1, 1),
          ),
        );
        const rotation = courtHeading;
        {
          const category = arrivalMix[i][side > 0 ? 1 : 0];
          const scale =
            category === 'waterfront'
              ? 1.06
              : category === 'gardenCourt'
                ? 1.46
                : 3.1;
          placements[category].push(
            new T.Matrix4().compose(
              p.clone().add(new T.Vector3(0, 6, 0)),
              rotation,
              new T.Vector3(scale, scale, scale),
            ),
          );
          if (side > 0) {
            const towerScale = [2.3, 3.7, 4.1, 3.2, 3.8][i];
            const socket = new T.Vector3(30, 6, -32)
              .applyQuaternion(rotation)
              .add(p);
            placements.tower.push(
              new T.Matrix4().compose(
                socket,
                rotation,
                new T.Vector3(towerScale, towerScale, towerScale),
              ),
            );
          }
          // Formed gallery shoulders visibly carry the road bearing into the
          // civic terrace. Their complete load path stays below the deck.
          const a = frame.position
            .clone()
            .addScaledVector(right, side * 37)
            .add(new T.Vector3(0, -49, 0));
          const b = p
            .clone()
            .addScaledVector(right, -side * 77)
            .add(new T.Vector3(0, -35, 0));
          const delta = b.clone().sub(a);
          const link = new T.Mesh(geometry, stone);
          link.name = 'Sunvault / arrival civic-to-road load shoulder';
          link.position.copy(a).add(b).multiplyScalar(0.5);
          link.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            delta.clone().normalize(),
          );
          link.scale.set(13, delta.length(), 18);
          link.castShadow = link.receiveShadow = true;
          group.add(link);
        }
      }
    }
    // Occupied civic forecourts frame ordinary driving and the first takeoff.
    // They remain outboard of the actual road and the complete air corridor.
    for (const [distance, side, lateral, category, scale] of [
      [430, -1, 185, 'gardenCourt', 1.46],
      [context.track.jumps[0].takeoff - 30, 1, 176, 'waterfront', 1.06],
      [context.track.jumps[0].takeoff + 15, -1, 196, 'gardenCourt', 1.46],
      [context.track.jumps[1].takeoff - 40, -1, 220, 'waterfront', 1.06],
      [context.track.jumps[2].takeoff - 10, 1, 205, 'gardenCourt', 1.46],
      [context.track.jumps[3].takeoff - 90, -1, 235, 'waterfront', 1.06],
      [context.track.jumps[4].takeoff - 20, 1, 215, 'pavilion', 3.1],
      [context.track.jumps[2].recovery + 130, -1, 235, 'waterfront', 1.06],
    ]) {
      const frame = context.track.sample(distance),
        forward = frame.tangent.clone().setY(0).normalize();
      const right = new T.Vector3(forward.z, 0, -forward.x);
      const heading = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        Math.atan2(forward.x, forward.z) + (side < 0 ? 2.3 : -2.3),
      );
      const p = frame.position
        .clone()
        .addScaledVector(right, side * lateral)
        .add(new T.Vector3(0, -22, 0));
      const base = p.clone().add(new T.Vector3(0, -48, 0));
      const footY = foundedSunvaultFootY(p, heading);
      assemblies.anchor_pier.push(
        new T.Matrix4().compose(
          new T.Vector3(p.x, footY, p.z),
          heading,
          new T.Vector3(1, (base.y - footY) / 1000, 1),
        ),
      );
      assemblies.arrival_terrace.push(
        new T.Matrix4().compose(base, heading, new T.Vector3(1, 1, 1)),
      );
      const facing = heading;
      placements[category].push(
        new T.Matrix4().compose(
          p.clone().add(new T.Vector3(0, 6, 0)),
          facing,
          new T.Vector3(scale, scale, scale),
        ),
      );
      if (category === 'waterfront')
        placements.tower.push(
          new T.Matrix4().compose(
            p
              .clone()
              .addScaledVector(right, 36)
              .addScaledVector(forward, 46)
              .add(new T.Vector3(0, 6, 0)),
            heading,
            new T.Vector3(1.65, 1.65, 1.65),
          ),
        );
    }
    for (const [category, matrices] of Object.entries(assemblies))
      for (const part of works.prototypes[category]) {
        addSunvaultInstances({
          group,
          lifetime,
          geometry: part.geometry,
          material: part.material,
          matrices,
          name: `Sunvault / founded ${category}`,
        });
      }
    for (const [category, matrices] of Object.entries(placements))
      for (const part of kit.prototypes[category]) {
        addSunvaultInstances({
          group,
          lifetime,
          geometry: part.geometry,
          material: part.material,
          matrices,
          name: `Sunvault / ${category} arrival architecture`,
        });
      }
    const gardens = createSunvaultGardens({
      lifetime,
      shell,
      civicKit: kit,
      placements,
      stone,
      quarterAnchors,
    });
    group.add(gardens.group);
    for (const material of gardens.materials) finishes.add(material);
    group.userData.sunvault = {
      waterGarden: {
        matrix: quarterPlan.matrix.toArray(),
        ...quarterPlan.provenance,
      },
      assemblies: Object.fromEntries(
        Object.entries(assemblies).map(([name, matrices]) => [
          name,
          matrices.map((matrix) => matrix.toArray()),
        ]),
      ),
      civic: Object.fromEntries(
        Object.entries(placements).map(([name, matrices]) => [
          name,
          matrices.map((matrix) => matrix.toArray()),
        ]),
      ),
      foundationRule:
        'Cylinder axisY1000/radius5000; pier feet ten metres below local radial shell',
    };
    return {
      group,
      update(frame) {
        shell.update?.(frame);
        gardens.update(frame);
        if (context.view?.sun) {
          const target =
            frame.mode === 'fly'
              ? frame.camera.position
              : frame.ship?.group.position;
          if (target) context.view.sun.position.set(0, 1000, target.z - 2200);
        }
      },
      setReflection(texture) {
        shell.setReflection?.(texture);
        shellFinish.settleBounce();
        for (const material of [stone, bronze, ...finishes]) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      },
      dispose: () => lifetime.dispose(),
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

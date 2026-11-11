import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { sweepGeometry, boxProfile } from '../../track/geometry.js';
import { createResources, instanced } from '../saffron/environment/geometry.js';
import {
  createSaffronMaterials,
  applyFossilWeathering,
  applyGeologicalWeathering,
} from '../saffron/environment/materials.js';
import {
  createOssuaryDunes,
  createOssuarySceneryPlan,
  createOssuaryPassageGeometry,
  OSSUARY_PASSAGES,
} from './scenery.js';
import {
  createOssuaryGalleryPlan,
  createOssuaryGalleryScarpGeometry,
  createOssuaryGalleryShoulderGeometry,
  createOssuaryBuriedBeds,
} from './gallery.js';
import { finishOssuaryGlass, finishOssuaryCortex } from './finish.js';
import { attachOssuaryCranioThoracic } from './cranio-thoracic.js';

/** An independent supported route through the approved fossil kit. Original
 * jump, moving sandfall and creature owners are deliberately not constructed. */
export async function createSaffronEliminatorEnvironment({ track, road }) {
  const group = new T.Group(),
    resources = createResources(),
    restores = [];
  const instances = [];
  group.name = 'Saffron Ossuary / cortex galleries and founded dunes';
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const restore of restores.reverse()) restore();
    for (const instance of instances) instance.dispose();
    group.clear();
    resources.dispose();
  }
  try {
    const finish = createSaffronMaterials(resources);
    const results = await Promise.allSettled([
      new GLTFLoader().loadAsync(
        assetURL('assets/levels/saffron/leviathan-kit.glb'),
      ),
      finish.ready,
      new GLTFLoader().loadAsync(
        assetURL('assets/levels/eliminator-saffron/cranio-thoracic.glb'),
      ),
    ]);
    for (const index of [0, 2])
      if (results[index].status === 'fulfilled')
        resources.collect(results[index].value.scene);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    const source = results[0].value.scene;
    source.updateMatrixWorld(true);
    const templates = new Map(),
      treated = new Set();
    function styleMaterial(material, name) {
      if (treated.has(material)) return;
      treated.add(material);
      if (/outcrop/.test(name))
        applyGeologicalWeathering(material, finish.weatheringTexture);
      else
        applyFossilWeathering(
          material,
          finish.weatheringTexture,
          finish.mineralSurface,
        );
      if (/pale_fossil/.test(material.name))
        material.color.setRGB(0.7, 0.63, 0.49);
      if (/chalk_edges/.test(material.name))
        material.color.setRGB(0.83, 0.8, 0.67);
      if (/marrow_ochre/.test(material.name))
        material.color.setRGB(0.23, 0.125, 0.055);
      if (!/outcrop/.test(name)) finishOssuaryCortex(material);
      material.envMapIntensity = 0.35;
    }
    for (const name of [
      'skull',
      'scapula',
      'rib',
      'rib_1',
      'rib_2',
      'vertebra',
      'vertebra_1',
      'vertebra_2',
      'outcrop',
      'outcrop_1',
    ]) {
      const root = source.getObjectByName(name);
      if (!root) throw new Error(`Saffron Ossuary is missing ${name}`);
      const inverse = root.matrixWorld.clone().invert(),
        parts = [],
        bounds = new T.Box3();
      root.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = resources.geometry(
          object.geometry
            .clone()
            .applyMatrix4(inverse.clone().multiply(object.matrixWorld)),
        );
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        for (const material of [object.material].flat())
          styleMaterial(material, name);
        parts.push({ geometry, material: object.material });
      });
      templates.set(name, { parts, bounds });
    }
    const dunes = createOssuaryDunes(track);
    resources.geometry(dunes.geometry);
    const terrain = new T.Mesh(dunes.geometry, finish.terrain);
    terrain.name = 'Ossuary / continuous stratified saffron dune mantle';
    terrain.receiveShadow = true;
    group.add(terrain);
    attachOssuaryCranioThoracic(results[2].value.scene, {
      group,
      resources,
      styleMaterial,
      sedimentMaterial: finish.bedrock,
    });
    const gallery = createOssuaryGalleryPlan(track, templates, dunes);
    for (const passage of OSSUARY_PASSAGES)
      for (const part of templates.get(passage.prototype).parts) {
        const geometry = resources.geometry(
          createOssuaryPassageGeometry(
            track,
            part.geometry,
            passage.fraction * track.length,
            passage.scale,
            dunes,
          ),
        );
        const mesh = new T.Mesh(geometry, part.material);
        mesh.name = `Ossuary / traversable ${passage.prototype} / original porous anatomy`;
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        group.add(mesh);
      }
    for (const part of templates.get('scapula').parts) {
      const geometry = resources.geometry(
        createOssuaryGalleryShoulderGeometry(
          track,
          part.geometry,
          dunes,
          gallery.shoulder,
        ),
      );
      const mesh = new T.Mesh(geometry, part.material);
      mesh.name = 'Ossuary / connected fenestrated cortical shoulder';
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const sedimentGeometry = resources.geometry(
      createOssuaryGalleryScarpGeometry(gallery.sediment.family),
    );
    const sediment = new T.Mesh(sedimentGeometry, finish.bedrock);
    sediment.name = 'Ossuary / founded layered sediment shoulder';
    sediment.applyMatrix4(gallery.sediment.matrix);
    sediment.castShadow = sediment.receiveShadow = true;
    group.add(sediment);
    const plan = createOssuarySceneryPlan(track, templates, dunes);
    const beds = createOssuaryBuriedBeds(track, templates, dunes);
    for (const bed of beds) {
      plan.placements.push(...bed.anatomy);
      const geometry = resources.geometry(
        createOssuaryGalleryScarpGeometry(bed.sediment.family),
      );
      const mesh = new T.Mesh(geometry, finish.bedrock);
      mesh.name = `Ossuary / buried sediment bed / ${bed.name}`;
      mesh.applyMatrix4(bed.sediment.matrix);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const [name, template] of templates) {
      const matrices = plan.placements
        .filter((placement) => placement.prototype === name)
        .map((placement) => placement.matrix);
      if (!matrices.length) continue;
      for (const part of template.parts) {
        const mesh = instanced(
          group,
          `Ossuary / seated ${name}`,
          part.geometry,
          part.material,
          matrices,
        );
        instances.push(mesh);
      }
    }
    // The gold floor has a readable reflecting upper face and open mineral
    // ribs below. No transmission framebuffer or opaque closed-box backing.
    const glass = resources.material(
      new T.MeshPhysicalMaterial({
        name: 'Ossuary / thick smoked-gold mineral glass',
        color: '#bb974e',
        roughness: 0.25,
        metalness: 0.02,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        side: T.DoubleSide,
        forceSinglePass: true,
        clearcoat: 0.46,
        clearcoatRoughness: 0.17,
        ior: 1.46,
        specularIntensity: 0.45,
        specularColor: '#e2ca8a',
        envMapIntensity: 1.5,
      }),
    );
    finishOssuaryGlass(glass, finish.weatheringTexture, track.width);
    road.group.traverse((object) => {
      if (object.userData.drivingSurface) {
        const original = object.material;
        object.material = glass;
        restores.push(() => {
          object.material = original;
        });
      }
      if (object.name === 'Closed underside carrier') {
        const visible = object.visible;
        object.visible = false;
        restores.push(() => {
          object.visible = visible;
        });
      }
    });
    for (const lateral of [-track.width * 0.36, 0, track.width * 0.36]) {
      const geometry = resources.geometry(
        sweepGeometry(track, boxProfile(lateral, -2, 1.8, 3.4), {
          start: 0,
          end: track.length,
          step: 4,
          uvScale: 4,
        }),
      );
      const mesh = new T.Mesh(geometry, road.materials.structure);
      mesh.name = 'Ossuary / warm mineral load spine below the glass';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const side of [-1, 1]) {
      const geometry = resources.geometry(
        sweepGeometry(
          track,
          boxProfile(side * (track.width / 2 - 0.9), -1.75, 1.6, 2.7),
          {
            start: 0,
            end: track.length,
            step: 4,
            uvScale: 4,
          },
        ),
      );
      const mesh = new T.Mesh(geometry, glass);
      mesh.name =
        'Ossuary / thick cast-amber shoulder beneath the contact skin';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const sillMaterial = resources.material(
      new T.MeshStandardMaterial({
        name: 'Ossuary / dark bronze mineral cassette bearings',
        color: '#79542d',
        roughness: 0.64,
        metalness: 0.18,
      }),
    );
    const sillGeometry = resources.geometry(
      new T.BoxGeometry(track.width + 0.6, 1.6, 2.2),
    );
    const sills = [],
      forks = [],
      shaft = resources.geometry(new T.CylinderGeometry(1.5, 2.6, 1, 7));
    const up = new T.Vector3(0, 1, 0);
    function fork(a, b, radius = 1) {
      const direction = b.clone().sub(a),
        length = direction.length();
      forks.push(
        new T.Matrix4().compose(
          a.clone().add(b).multiplyScalar(0.5),
          new T.Quaternion().setFromUnitVectors(up, direction.normalize()),
          new T.Vector3(radius, length, radius),
        ),
      );
    }
    for (let s = 0; s < track.length; s += 18) {
      const frame = track.sample(s);
      sills.push(
        new T.Matrix4().compose(
          frame.position.clone().addScaledVector(frame.up, -3.7),
          frame.quaternion,
          new T.Vector3(1, 1, 1),
        ),
      );
    }
    for (let s = 35; s < track.length; s += 112) {
      const frame = track.sample(s);
      const root = frame.position.clone();
      root.y = dunes.heightAt(root.x, root.z) - 8;
      const neck = frame.position.clone().addScaledVector(frame.up, -21);
      fork(root, neck, 1.6);
      for (const side of [-1, 1])
        fork(
          neck,
          frame.position
            .clone()
            .addScaledVector(frame.right, side * 16)
            .addScaledVector(frame.up, -5.2),
          1,
        );
    }
    for (const [name, geometry, material, matrices] of [
      [
        'Ossuary / seated transverse glass sills',
        sillGeometry,
        sillMaterial,
        sills,
      ],
      [
        'Ossuary / dune-founded forked mineral piers',
        shaft,
        finish.boneDark,
        forks,
      ],
    ])
      instances.push(instanced(group, name, geometry, material, matrices));
    group.userData.ossuary = {
      asset: 'assets/levels/saffron/leviathan-kit.glb',
      staticWorld: true,
      cranioThoracic: 'assets/levels/eliminator-saffron/cranio-thoracic.glb',
      passages: OSSUARY_PASSAGES,
      sceneryCount: plan.placements.length,
      supports: forks.length / 3,
      clearHalfWidth: 54,
      gallery: {
        passages: gallery.passages,
        shoulder: gallery.shoulder,
        sediment: gallery.sediment.matrix.toArray(),
      },
      beds: beds.map((bed) => ({
        name: bed.name,
        fraction: bed.fraction,
        anatomy: bed.anatomy.map((part) => ({
          prototype: part.prototype,
          matrix: part.matrix.toArray(),
        })),
      })),
    };
    return {
      group,
      setReflection(texture) {
        for (const material of [...treated, glass]) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

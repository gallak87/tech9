import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beamTransform } from '../../track/geometry.js';
import { collectRoadSurfaces } from '../../pickups/device-mount.js';
import { assetURL } from '../../assets/url.js';
import { sampleCarrierMotion, NOMAD_MOTION_RULES } from './motion.js';
import { createNomadDust } from './dust.js';
import { createNomadDistricts } from './districts.js';
import { createNomadGuidance } from './guidance.js';
import { createNomadFleetBatches } from './fleet-batches.js';
import { createNomadCompanions } from './companions.js';
import { bindNomadArmourFinish } from './armour-finish.js';
import { createNomadWheelContacts } from './wheel-contact.js';
import { createNomadHallMachinery } from './hall-machinery.js';
import kitManifest from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

function saltMaterial(clock) {
  const material = new T.MeshStandardMaterial({
    color: '#d7d9d3',
    roughness: 0.94,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nomadSaltTravel = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 saltPoint;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsaltPoint=position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 saltPoint; uniform float nomadSaltTravel;
      vec2 saltHash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 p=vec2(saltPoint.x,saltPoint.z+nomadSaltTravel)/8.;
        vec2 cell=floor(p),f=fract(p);float first=9.,second=9.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 g=vec2(float(x),float(y));vec2 r=g+.18+.64*saltHash(cell+g)-f;
          float d=dot(r,r);if(d<first){second=first;first=d;}else{second=min(second,d);}}
        float edge=(sqrt(second)-sqrt(first));
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float aa=max(.001,fwidth(edge));
        float crack=(1.-smoothstep(.016-aa,.035+aa,edge))*(1.-smoothstep(.07,.25,footprint));
        float grain=fract(sin(dot(floor(p*25.),vec2(127.1,311.7)))*43758.5453);
        grain=mix(.5,grain,1.-smoothstep(.05,.35,footprint*25.));
        diffuseColor.rgb*=.96+grain*.055;
        diffuseColor.rgb*=1.-crack*.28;`,
      );
  };
  material.customProgramCacheKey = () => 'nomad-moving-salt-v2-filtered';
  return material;
}

/** Ground-going procession with attached working districts and salt wakes. */
export function createNomadEnvironment({
  track,
  shape = false,
  road = null,
  prototypeOnly = false,
  settings = {},
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Nomad / the salt procession';
  const geometries = new Set(),
    materials = new Set(),
    instances = new Set();
  const carrierRoots = new Map(),
    freight = [];
  const clock = { value: 0 };
  const positions = [
    -18000, 0, -400, -18000, 0, 24000, 18000, 0, -400, 18000, 0, 24000,
  ];
  for (let i = 0; i < positions.length; i += 3)
    positions[i + 1] =
      track.saltPlane.height - track.saltPlane.grade * positions[i + 2];
  const saltGeometry = new T.BufferGeometry();
  saltGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  saltGeometry.setIndex([0, 1, 2, 2, 1, 3]);
  saltGeometry.computeVertexNormals();
  saltGeometry.computeBoundingSphere();
  const salt = saltMaterial(clock);
  geometries.add(saltGeometry);
  materials.add(salt);
  const basin = new T.Mesh(saltGeometry, salt);
  basin.name = 'Nomad / actual salt basin';
  basin.receiveShadow = true;
  group.add(basin);
  const districts = createNomadDistricts({
    track,
    finish: road?.finish,
    shape,
  });
  const hall = createNomadHallMachinery({ track, finish: road?.finish, shape });
  const visualCarriers = [...track.carriers, ...createNomadCompanions(track)];
  const visualTrack = Object.create(track);
  visualTrack.carriers = visualCarriers;
  const dust = shape ? null : createNomadDust({ track: visualTrack, settings });
  const contacts = shape
    ? null
    : createNomadWheelContacts({ track, carriers: visualCarriers });
  const guidance = road
    ? createNomadGuidance({ track, surfaces: collectRoadSurfaces(road.group) })
    : null;
  group.add(districts.group);
  group.add(hall.group);
  if (dust) group.add(dust.group);
  if (contacts) group.add(contacts.group);
  if (guidance) group.add(guidance.group);
  const hullGrey = new T.MeshStandardMaterial({
    color: '#a29a88',
    roughness: 0.8,
    metalness: 0.15,
  });
  materials.add(hullGrey);
  const greyGeometry = new T.BoxGeometry(1, 1, 1);
  geometries.add(greyGeometry);
  for (const carrier of visualCarriers) {
    const root = new T.Group();
    root.name = carrier.name;
    root.position.copy(carrier.origin);
    root.quaternion.copy(carrier.quaternion);
    root.scale.copy(carrier.scale);
    carrierRoots.set(carrier.id, root);
    group.add(root);
    if (shape || (prototypeOnly && ![0, 5, 6].includes(carrier.index))) {
      for (const side of [-1, 1]) {
        const shoulder = new T.Mesh(greyGeometry, hullGrey);
        shoulder.position.set(side * 74, 78, 0);
        shoulder.scale.set(24, 98, 740);
        shoulder.castShadow = true;
        shoulder.receiveShadow = true;
        root.add(shoulder);
      }
    }
  }
  let source = null,
    fleet = null,
    disposed = false,
    failed = false;
  const sources = new Set();
  const disposeModels = (scenes) => {
    const gs = new Set(),
      ms = new Set(),
      ts = new Set();
    for (const scene of scenes)
      scene.traverse((object) => {
        if (object.geometry) gs.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (!material) continue;
          ms.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture) ts.add(value);
        }
      });
    for (const geometry of gs) geometry.dispose();
    for (const material of ms) material.dispose();
    for (const texture of ts)
      if (!road?.finish?.ownedTextures.has(texture)) texture.dispose();
  };
  const releaseSource = () => {
    disposeModels(sources);
    sources.clear();
    source = null;
  };
  const ownedLoad = (path) =>
    Promise.resolve()
      .then(() => loadAsset(assetURL(path)))
      .then(({ scene }) => {
        if (disposed || failed) {
          disposeModels([scene]);
          return null;
        }
        sources.add(scene);
        return scene;
      });
  const ready = shape
    ? Promise.resolve()
    : Promise.all([
        ownedLoad('assets/levels/nomad/carrier-kit.glb'),
        ownedLoad('assets/levels/nomad/route-supports.glb'),
        ownedLoad('assets/levels/nomad/receiver-crown.glb'),
        ownedLoad('assets/levels/nomad/interior-freight.glb'),
        ownedLoad('assets/levels/nomad/companion-armour.glb'),
        ownedLoad('assets/levels/nomad/saltwind-gallery.glb'),
        ownedLoad('assets/levels/nomad/wallride-service.glb'),
      ])
        .then(
          ([
            scene,
            supportScene,
            crownScene,
            interiorScene,
            armourScene,
            saltwindScene,
            wallrideScene,
          ]) => {
            source = scene;
            if (disposed) {
              releaseSource();
              return;
            }
            const hull = source.getObjectByName('nomad_carrier');
            const wheel = source.getObjectByName('nomad_wheel');
            const cargo = source.getObjectByName('nomad_freight');
            if (!hull || !wheel || !cargo)
              throw new Error(
                'Nomad carrier kit is missing a required prototype.',
              );
            source.updateMatrixWorld(true);
            const baseMaterials = new Map();
            source.traverse((mesh) => {
              if (mesh.isMesh)
                for (const material of Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material])
                  baseMaterials.set(material.name, material);
            });
            const discarded = new Set();
            for (const extra of [
              supportScene,
              crownScene,
              interiorScene,
              armourScene,
              saltwindScene,
              wallrideScene,
            ])
              extra.traverse((mesh) => {
                if (!mesh.isMesh) return;
                const aliases = (material) => {
                  const alias = baseMaterials.get(material.name);
                  if (alias && alias !== material) discarded.add(material);
                  return alias ?? material;
                };
                mesh.material = Array.isArray(mesh.material)
                  ? mesh.material.map(aliases)
                  : aliases(mesh.material);
              });
            for (const material of discarded) material.dispose();
            const finishedMaterials = new Set();
            for (const scene of [
              source,
              supportScene,
              crownScene,
              interiorScene,
              armourScene,
              saltwindScene,
              wallrideScene,
            ])
              scene.traverse((mesh) => {
                if (!mesh.isMesh) return;
                mesh.geometry.setAttribute(
                  'industrialCoord',
                  mesh.geometry.attributes.position.clone(),
                );
                for (const material of Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material]) {
                  if (
                    finishedMaterials.has(material) ||
                    /rubber|amber|glazing/.test(material.name)
                  )
                    continue;
                  finishedMaterials.add(material);
                  const kind = /ivory|oxide/.test(material.name)
                    ? 'shell'
                    : /navy|machinery/.test(material.name)
                      ? 'dark'
                      : 'steel';
                  road?.finish?.bind(material, kind, 'part');
                  const compile = material.onBeforeCompile,
                    key = material.customProgramCacheKey();
                  material.onBeforeCompile = (shader, renderer) => {
                    compile.call(material, shader, renderer);
                    // A rigidly attached, metre-scaled finish stays with the vehicle.
                    // Generic industrial lathe coordinates become local triplanar here.
                    shader.fragmentShader = shader.fragmentShader
                      .replace(
                        'texture2D(industrialDetail,vec2(industrialLocal.y,length(industrialLocal.xz))/3.).rgb',
                        '(texture2D(industrialDetail,industrialLocal.yz/7.).rgb*iw.x+texture2D(industrialDetail,industrialLocal.xz/7.).rgb*iw.y+texture2D(industrialDetail,industrialLocal.xy/7.).rgb*iw.z)',
                      )
                      .replaceAll(
                        'industrialPoint.xz*.015',
                        'industrialLocal.xz*.015',
                      );
                  };
                  material.customProgramCacheKey = () =>
                    key + '-nomad-attached-finish-v1';
                  if (road?.finish && /ivory/.test(material.name))
                    bindNomadArmourFinish(material);
                }
              });
            const anchors = kitManifest.prototypes.find(
              (part) => part.name === 'nomad_carrier',
            ).anchors;
            fleet = createNomadFleetBatches({
              track,
              source,
              excludeHullIds: saltwindScene.getObjectByName(
                'nomad_saltwind_hull',
              )
                ? ['nomad-saltwind']
                : [],
              carriers: visualCarriers.filter(
                (carrier) =>
                  !prototypeOnly || [0, 5, 6].includes(carrier.index),
              ),
            });
            group.add(fleet.group);
            if (!prototypeOnly) {
              const sourceArmour = armourScene.getObjectByName(
                'nomad_companion_armour',
              );
              if (!sourceArmour)
                throw new Error('Nomad companion armour is missing.');
              for (const id of [
                'nomad-companion-starboard-heavy',
                'nomad-companion-port-tender',
              ]) {
                const armour = sourceArmour.clone(true);
                // Both inward shoulders retain the same fitted source sockets.
                if (id.endsWith('port-tender')) armour.scale.x = -1;
                armour.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                carrierRoots.get(id).add(armour);
              }
            }
            for (const carrier of track.carriers) {
              if (prototypeOnly && ![0, 5, 6].includes(carrier.index)) continue;
              const root = carrierRoots.get(carrier.id);
              if (carrier.id === 'nomad-portside-dive') {
                const sourceWall = wallrideScene.getObjectByName(
                  'nomad_wallride_service',
                );
                if (!sourceWall)
                  throw new Error('Nomad Portside service belt is missing.');
                const wall = sourceWall.clone(true);
                wall.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(wall);
              }
              if (carrier.id === 'nomad-saltwind') {
                const sourceHull = saltwindScene.getObjectByName(
                  'nomad_saltwind_hull',
                );
                if (sourceHull) {
                  const hull = sourceHull.clone(true);
                  hull.traverse((mesh) => {
                    if (mesh.isMesh) {
                      mesh.castShadow = true;
                      mesh.receiveShadow = true;
                    }
                  });
                  root.add(hull);
                }
                const sourceGallery = saltwindScene.getObjectByName(
                  'nomad_saltwind_gallery',
                );
                if (!sourceGallery)
                  throw new Error('Nomad Saltwind service wing is missing.');
                const gallery = sourceGallery.clone(true);
                gallery.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(gallery);
              }
              if (carrier.id === 'nomad-freight-cathedral') {
                const sourceInterior = interiorScene.getObjectByName(
                  'nomad_interior_freight',
                );
                if (!sourceInterior)
                  throw new Error('Nomad freight installation is missing.');
                const interior = sourceInterior.clone(true);
                interior.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(interior);
              }
              if (carrier.id === 'nomad-passing-deck') {
                const sourceCrown = crownScene.getObjectByName(
                  'nomad_receiver_crown',
                );
                if (!sourceCrown)
                  throw new Error('Nomad receiving cargo crown is missing.');
                const crown = sourceCrown.clone(true);
                crown.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(crown);
              }
              const sourceSupports = supportScene.getObjectByName(carrier.id);
              if (sourceSupports) {
                const supports = sourceSupports.clone(true);
                supports.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(supports);
              }
              for (const anchor of anchors.filter(
                (entry) => entry.kind === 'freight-hook',
              )) {
                const container = cargo.clone(true);
                container.position.fromArray(anchor.safeLoadCentre);
                container.traverse((mesh) => {
                  if (mesh.isMesh) {
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                  }
                });
                root.add(container);
                const cableGeometry = new T.CylinderGeometry(0.28, 0.28, 1, 6);
                geometries.add(cableGeometry);
                const cables = new T.InstancedMesh(
                  cableGeometry,
                  baseMaterials.get('Nomad / navy structural steel'),
                  4,
                );
                cables.name = 'Nomad / crane hook and suspended load stays';
                cables.castShadow = true;
                instances.add(cables);
                root.add(cables);
                freight.push({ container, carrier, anchor, cables });
              }
            }
            update();
          },
        )
        .catch((cause) => {
          failed = true;
          dispose();
          throw new Error(
            'The Nomad carrier kit could not load. Reload to try again.',
            { cause },
          );
        });
  function update(frame = {}) {
    if (disposed) return;
    const time = track.presentationTime;
    clock.value = time * NOMAD_MOTION_RULES.convoySpeed;
    for (const carrier of visualCarriers) {
      const root = carrierRoots.get(carrier.id);
      root.position
        .copy(carrier.origin)
        .add(sampleCarrierMotion(carrier, time).translation);
    }
    fleet?.update(frame);
    const matrix = new T.Matrix4();
    for (const { container, carrier, anchor, cables } of freight) {
      const sway =
        Math.sin(
          ((frame.settings?.reducedMotion ?? settings.reducedMotion)
            ? 0
            : time * 0.48) +
            carrier.index * 0.7,
        ) * 2;
      container.position
        .fromArray(anchor.safeLoadCentre)
        .add(new T.Vector3(sway, 0, 0));
      container.rotation.z = sway * 0.012;
      const hook = new T.Vector3().fromArray(anchor.position);
      for (let index = 0; index < 4; index++) {
        const corner = new T.Vector3(
          index & 1 ? 10 : -10,
          10.3,
          index & 2 ? 15 : -15,
        )
          .applyEuler(container.rotation)
          .add(container.position);
        const transform = beamTransform(hook, corner, 0.55);
        matrix.compose(
          transform.position,
          transform.quaternion,
          transform.scale,
        );
        cables.setMatrixAt(index, matrix);
      }
      cables.instanceMatrix.needsUpdate = true;
      if (!cables.boundingSphere) {
        cables.computeBoundingSphere();
        cables.boundingSphere.radius += 4;
      }
    }
    districts.update(frame);
    hall.update(frame);
    dust?.update(frame);
    contacts?.update(frame);
    guidance?.update(frame);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    districts.dispose();
    hall.dispose();
    dust?.dispose();
    contacts?.dispose();
    guidance?.dispose();
    fleet?.dispose();
    for (const instance of instances) instance.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    releaseSource();
  }
  return { group, ready, carrierRoots, update, dispose };
}

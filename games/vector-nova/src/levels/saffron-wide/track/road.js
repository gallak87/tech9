import {
  SAFFRON_SOLIDS,
  roadRuns,
  toeProfile,
  createBaffleGeometry,
  bafflePlacements,
  receivingBeacons,
  deckEndGeometry,
} from './solids.js';
import * as THREE from 'three';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  seededRandom,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createLandformSurvey } from '../environment/terrain.js';
import { sampleSaffronDeposits, saffronSandSection } from './sand.js';

const SIDES = [-1, 1];

// Raceway geometry follows the same sampled frames in production and review.
// Only the two structural breaks remove deck; the dune skip is a chosen line.
export function createSaffronRoad(
  { track, settings = {}, collisionWorld = null },
  { shape = false } = {},
) {
  const group = new THREE.Group();
  const survey = createLandformSurvey(track);
  group.name = shape ? 'Saffron route review' : 'Saffron fused-glass raceway';
  const geometries = new Set(),
    materials = new Set();
  const ownGeometry = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const material = (parameters) => {
    const m = new THREE.MeshStandardMaterial(parameters);
    materials.add(m);
    return m;
  };
  const lens = (color, transmission, thickness) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: shape ? 0xb5b3a4 : color,
      roughness: shape ? 0.75 : 0.29,
      metalness: shape ? 0.04 : 0.02,
      transmission: !shape && settings.quality !== 'low' ? transmission : 0,
      thickness,
      ior: 1.46,
      transparent: !shape,
      opacity: shape ? 1 : 0.58,
      depthWrite: shape,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      specularIntensity: 0.28,
      specularColor: 0xd8b762,
      attenuationColor: 0x80501b,
      attenuationDistance: 6,
      clearcoat: shape ? 0 : 0.15,
      clearcoatRoughness: 0.34,
    });
    materials.add(m);
    return m;
  };
  const solidGlass = (color) =>
    material({
      color: shape ? 0xb5b3a4 : color,
      roughness: shape ? 0.75 : 0.29,
      metalness: shape ? 0.04 : 0.02,
    });
  const smoke = solidGlass(0x967026);
  const amber = lens(0xd6ad4e, 0.14, 2.8);
  const glass = lens(0xe8bd61, 0.12, 3.8);
  if (!shape) {
    for (const mat of [smoke, amber, glass]) {
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader =
          `varying vec3 vGlassPoint;\n${shader.vertexShader}`.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvGlassPoint=position;',
          );
        shader.fragmentShader = `varying vec3 vGlassPoint;
          float gHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
          float gNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
          ${shader.fragmentShader}`
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          float mineral=gNoise(vGlassPoint*vec3(.13,.015,.018));
          float warped=gNoise(vGlassPoint*.034);
          float vein=pow(1.-abs(sin(vGlassPoint.x*.17+vGlassPoint.z*.025+warped*4.)),18.);
          diffuseColor.rgb*=.82+mineral*.32;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.61,.40,.13),vein*.14);`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor+=mineral*.035+vein*.025;',
          );
      };
      mat.customProgramCacheKey = () => 'saffron-internal-gold-glass-v5';
    }
  }
  const honey = solidGlass(0xc39d55);
  const support = material({
    color: shape ? 0xc1bbad : 0xac7835,
    roughness: 0.43,
    metalness: 0.18,
  });
  const bone = material({
    color: shape ? 0xe3e0d4 : 0xe6d5a5,
    roughness: 0.72,
    metalness: 0.02,
  });
  const seam = material({ color: 0x6b522e, roughness: 0.55, metalness: 0.1 });
  const lamp = material({
    color: 0xffe6a2,
    emissive: 0xfbc75b,
    emissiveIntensity: shape ? 0.1 : 0.45,
    roughness: 0.4,
  });
  const sand = material({
    color: shape ? 0xa5a18d : 0xcda45a,
    roughness: 0.97,
    metalness: 0,
  });
  if (!shape)
    sand.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `varying vec3 vSandPoint;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSandPoint=position;',
        );
      shader.fragmentShader =
        `varying vec3 vSandPoint;\n${shader.fragmentShader}`.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      float ripples=sin(vSandPoint.x*1.5+vSandPoint.z*.8+sin(vSandPoint.z*.025)*3.);
      diffuseColor.rgb*=.90+ripples*.045;`,
        );
    };
  const add = (name, geometry, mat) => {
    const mesh = new THREE.Mesh(ownGeometry(geometry), mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const runs = roadRuns(track);
  const profile = (points, start, end, mat, name) =>
    add(
      name,
      sweepGeometry(
        track,
        points.length === 2 &&
          points[0][1] === points[1][1] &&
          points[0][0] > points[1][0]
          ? [...points].reverse()
          : points,
        { start, end, step: SAFFRON_SOLIDS.step },
      ),
      mat,
    );
  for (const [start, end] of runs) {
    const top = profile(
      SAFFRON_SOLIDS.top,
      start,
      end,
      smoke,
      'Smoked gold travel ribbon',
    );
    top.renderOrder = 2;
    top.userData.drivingSurface = true;
    top.userData.roadSurface = true;
    top.userData.interval = [start, end];
    profile(
      SAFFRON_SOLIDS.underside,
      start,
      end,
      glass,
      'Thick fused amber underside',
    );
    for (const side of SIDES) {
      profile(
        [
          [side * 16.8, 0.018],
          [side * 20, 0.018],
        ],
        start,
        end,
        glass,
        'Translucent lens shoulder',
      );
      profile(
        toeProfile(side),
        start,
        end,
        honey,
        'Continuous grounded baffle toe',
      );
      profile(
        [
          [side * 19.48, 0.035],
          [side * 19.78, 0.035],
        ],
        start,
        end,
        bone,
        'Pale inside shoulder',
      );
      profile(
        [
          [side * 16.72, 0.037],
          [side * 16.85, 0.037],
        ],
        start,
        end,
        seam,
        'Dark curb seam',
      );
      profile(
        boxProfile(side * 8.8, -2.7, 0.48, 0.8),
        start,
        end,
        honey,
        'Restrained glass structural web',
      );
    }
  }
  const ends = add(
    'Solid fused-glass ramp end faces',
    deckEndGeometry(track),
    glass,
  );
  ends.material.side = THREE.DoubleSide;
  for (const section of track.sections.filter((s) =>
    ['sandfall', 'return'].includes(s.id),
  ))
    profile(
      [
        [-16.5, 0.045],
        [16.5, 0.045],
      ],
      section.start,
      section.end,
      honey,
      'Honey-opaque reinforced turn panels',
    );
  const box = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const instanced = (name, geometry, mat, entries) => {
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    const transform = new THREE.Object3D();
    entries.forEach((entry, i) => {
      if (entry.matrix) transform.matrix.copy(entry.matrix);
      else {
        const frame = track.sample(entry.s);
        transform.position.copy(framePoint(frame, entry.x ?? 0, entry.y ?? 0));
        transform.quaternion.copy(frame.quaternion);
        if (entry.rotation) transform.rotateY(entry.rotation);
        transform.scale.fromArray(entry.scale ?? [1, 1, 1]);
        transform.updateMatrix();
      }
      mesh.setMatrixAt(i, transform.matrix);
    });
    group.add(mesh);
    return mesh;
  };
  // Two separated aero vanes are swept along each short baffle, with tapered
  // ends and open shadow slots. Continuous toes keep the boundaries grounded.
  const vaneGeometry = () => ownGeometry(createBaffleGeometry());
  const { vanes, clamps } = bafflePlacements(track);
  const panelRims = [],
    lensSills = [],
    laminae = [],
    bubbles = [],
    arrowFittings = [],
    warning = receivingBeacons(track),
    footBeams = [],
    supportRecords = [],
    feet = [];
  const random = seededRandom(7007);
  for (let s = 5; s < track.length; s += 16) {
    if (
      track.isGap(s) ||
      track.jumps.some(
        (j) =>
          !j.optional &&
          (Math.abs(s - j.takeoff) < 8 || Math.abs(s - j.landingStart) < 8),
      )
    )
      continue;
    for (const side of SIDES) {
      if (Math.round(s / 16) % 3 === 0)
        arrowFittings.push({
          s,
          x: side * 19.05,
          y: 0.12,
          scale: [0.38, 0.18, 3.8],
        });
    }
    // Broad, gently offset lens sections, with narrow dark joins and sparse
    // inclusions sunk visibly under the transparent shoulder material.
    lensSills.push({ s, x: 0, y: -2.9, scale: [39, 0.32, 0.42] });
    panelRims.push({ s, x: 0, y: 0.035, scale: [33.6, 0.018, 0.075] });
    if (!shape) {
      for (let i = 0; i < 4; i++) {
        const radius = 0.18 + random() * 0.22;
        bubbles.push({
          s: s + random() * 12,
          x: (random() - 0.5) * 34,
          y: -0.35 - random() * 1.8,
          scale: [radius, radius * 0.5, radius * 1.4],
        });
      }
      for (const side of [-1, 0, 1]) {
        laminae.push({
          s: s + random() * 4,
          x: side * (17.4 + random() * 1.7),
          y: -0.7 - random() * 1.0,
          scale: [0.65 + random() * 1.1, 0.07, 2 + random() * 5],
          rotation: (random() - 0.5) * 0.25,
        });
      }
    }
  }
  for (let s = 40; s < track.length; s += 80) {
    if (track.isGap(s)) continue;
    const f = track.sample(s);
    const foot = f.position.clone();
    foot.y -= 22;
    for (const side of SIDES) {
      const from = framePoint(f, side * 12, -3.5),
        to = foot.clone().addScaledVector(f.right, side * 4.8);
      to.y = survey.heightAt(to.x, to.z) + 1.2;
      const beam = beamTransform(from, to, 2.1, 3.1),
        o = new THREE.Object3D();
      o.position.copy(beam.position);
      o.quaternion.copy(beam.quaternion);
      o.scale.copy(beam.scale);
      o.updateMatrix();
      supportRecords.push({ s, from: from.clone(), to: to.clone() });
      footBeams.push({ matrix: o.matrix.clone() });
      const shoe = new THREE.Object3D();
      shoe.position.copy(to);
      shoe.position.y -= 1;
      shoe.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
      shoe.scale.set(12, 3.4, 13);
      shoe.updateMatrix();
      feet.push({ matrix: shoe.matrix.clone() });
    }
  }
  for (const j of track.jumps) {
    const begin = j.optional ? 5 : -18.5,
      end = 18.5;
    for (let x = begin; x < end; x += 3)
      warning.push({ s: j.takeoff - 3, x, y: 0.09, scale: [1.6, 0.12, 1.5] });
  }
  instanced('Split tapered baffle vanes', vaneGeometry(), bone, vanes);
  instanced('Baffle ceramic anchors', box, honey, clamps);
  instanced('Glass lens section seams', box, seam, panelRims);
  instanced('Deep lens compression sills', box, support, lensSills);
  instanced('Subsurface mineral laminae', box, amber, laminae);
  if (!shape)
    instanced(
      'Subsurface ancient gas inclusions',
      ownGeometry(new THREE.SphereGeometry(1, 4, 3)),
      material({
        color: 0x967236,
        roughness: 0.16,
        metalness: 0.05,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
      bubbles,
    );
  instanced('Pale physical direction fittings', box, bone, arrowFittings);
  instanced('Jump lip and receiving beacons', box, lamp, warning);
  const collarGeometry = ownGeometry(
    new THREE.TorusGeometry(0.5, 0.13, 4, 8).rotateX(Math.PI / 2),
  );
  const collars = instanced(
    'Support compression collars',
    collarGeometry,
    seam,
    feet,
  );
  const legMesh = instanced(
    'Forked gold ceramic support legs',
    box,
    support,
    footBeams,
  );
  const shoeGeometry = ownGeometry(new THREE.CylinderGeometry(0.38, 0.7, 1, 6));
  const footMesh = instanced(
    'Broad fossil shelf shoes',
    shoeGeometry,
    support,
    feet,
  );
  const plannedSupportContacts = [];
  for (const [i, support] of collisionWorld?.supports ?? []) {
    legMesh.setMatrixAt(i, support.leg);
    footMesh.setMatrixAt(i, support.shoe);
    collars.setMatrixAt(i, support.collar);
    if (support.contact) plannedSupportContacts.push(support.contact);
  }
  legMesh.computeBoundingSphere();
  footMesh.computeBoundingSphere();
  collars.computeBoundingSphere();
  legMesh.castShadow = footMesh.castShadow = true;
  const sands = [];
  for (const zone of sampleSaffronDeposits(track, 0)) {
    const rows = 30,
      cols = 10,
      positions = new Float32Array((rows + 1) * (cols + 1) * 3),
      indices = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j,
          b = a + cols + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setIndex(indices);
    const mesh = add(`Migrating sand / ${zone.id}`, geometry, sand);
    mesh.frustumCulled = false;
    sands.push({ mesh, rows, cols });
  }
  const opticalMaterials = [amber, glass];
  const opticalTransmission = [0.14, 0.12];
  let currentQuality = settings.quality ?? 'high';
  let lastTime = null,
    disposed = false;
  function update({ time = 0, settings: nextSettings = settings } = {}) {
    if (disposed) return;
    if (
      !shape &&
      nextSettings.quality &&
      nextSettings.quality !== currentQuality
    ) {
      currentQuality = nextSettings.quality;
      opticalMaterials.forEach((m, i) => {
        m.transmission = currentQuality === 'low' ? 0 : opticalTransmission[i];
        m.needsUpdate = true;
      });
    }
    if (time === lastTime) return;
    lastTime = time;
    const zones = sampleSaffronDeposits(track, time);
    sands.forEach(({ mesh, rows, cols }, index) => {
      const attribute = mesh.geometry.getAttribute('position');
      for (let i = 0; i <= rows; i++) {
        const section = saffronSandSection(zones[index], i / rows),
          frame = track.sample(section.distance);
        for (let j = 0; j <= cols; j++) {
          const v = (j / cols) * 2 - 1;
          const point = framePoint(
            frame,
            section.lateral + v * section.halfWidth,
            0.055 +
              section.depth * Math.max(0, 1 - v * v) ** 0.75 +
              Math.max(0, 1 - v * v) *
                0.045 *
                Math.sin(section.distance * 1.1 + v * 13),
          );
          attribute.setXYZ(i * (cols + 1) + j, point.x, point.y, point.z);
        }
      }
      attribute.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    });
  }
  update();
  group.userData.openSpans = track.jumps
    .filter((j) => !j.optional)
    .map((j) => ({ id: j.id, start: j.takeoff, end: j.landingStart }));
  group.userData.surfaceCoverage = track.surfaceCoverage;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    geometries.clear();
    materials.clear();
  };
  let supportsAnchored = false;
  function anchorToFossils(fossils) {
    if (shape || disposed || supportsAnchored) return;
    supportsAnchored = true;
    fossils.updateMatrixWorld(true);
    const targets = [];
    fossils.traverse((o) => {
      if (o.isMesh && /authored (skull|vertebra)/.test(o.name)) targets.push(o);
    });
    const ray = new THREE.Raycaster(),
      contacts = [...plannedSupportContacts];
    supportRecords.forEach(({ s, from, to }, i) => {
      if (collisionWorld?.supports?.has(i)) return;
      if (
        !(
          s > track.landmarks.skullStart - 30 &&
          s < track.landmarks.skullEnd + 30
        ) &&
        !track.jumps.some(
          (j) => !j.optional && s > j.takeoff - 80 && s < j.landingEnd + 60,
        )
      )
        return;
      const frame = track.sample(s),
        candidates = [to];
      for (const offset of [-8, 8, -16, 16])
        candidates.push(to.clone().addScaledVector(frame.right, offset));
      let hit, direction;
      for (const candidate of candidates) {
        direction = candidate.clone().sub(from).normalize();
        ray.set(from, direction);
        ray.near = 1.5;
        ray.far = from.distanceTo(candidate) + 30;
        hit = ray
          .intersectObjects(targets, false)
          .find((h) => h.point.y < from.y - 1.5);
        if (hit) break;
      }
      if (!hit) return;
      const world = hit.object.matrixWorld.clone();
      if (hit.instanceId !== undefined) {
        const instance = new THREE.Matrix4();
        hit.object.getMatrixAt(hit.instanceId, instance);
        world.multiply(instance);
      }
      const normal = hit.face.normal
        .clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(world));
      if (normal.dot(direction) > 0) normal.negate();
      const endpoint = hit.point.clone().addScaledVector(normal, 1.2);
      const beam = beamTransform(from, endpoint, 2.1, 3.1),
        leg = new THREE.Object3D();
      leg.position.copy(beam.position);
      leg.quaternion.copy(beam.quaternion);
      leg.scale.copy(beam.scale);
      leg.updateMatrix();
      legMesh.setMatrixAt(i, leg.matrix);
      const shoe = new THREE.Object3D();
      shoe.position.copy(hit.point).addScaledVector(normal, 0.25);
      shoe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      shoe.scale.set(12, 3.4, 13);
      shoe.updateMatrix();
      footMesh.setMatrixAt(i, shoe.matrix);
      shoe.position.copy(endpoint).addScaledVector(normal, 1);
      shoe.scale.set(4, 4, 4);
      shoe.updateMatrix();
      collars.setMatrixAt(i, shoe.matrix);
      contacts.push({
        s,
        index: i,
        point: hit.point.toArray(),
        normal: normal.toArray(),
        source: hit.object.name,
      });
    });
    legMesh.instanceMatrix.needsUpdate =
      footMesh.instanceMatrix.needsUpdate =
      collars.instanceMatrix.needsUpdate =
        true;
    legMesh.computeBoundingSphere();
    footMesh.computeBoundingSphere();
    collars.computeBoundingSphere();
    group.userData.fossilSupportContacts = contacts;
  }
  group.userData.dispose = dispose;
  return {
    group,
    anchorToFossils,
    update,
    reset: () => {
      lastTime = null;
      update({ time: 0 });
    },
    dispose,
  };
}

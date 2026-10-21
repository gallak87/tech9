import * as T from 'three';
import { createOpalineKit } from '@worldkit/environment/opaline';
import {
  createOceanLayer,
  createIslandCoast,
} from '@worldkit/environment/ocean';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLifetime } from '../../../core/lifecycle.js';
import { roadIntervals } from '../track/geometry.js';
import { createShelfBankGeometry } from './strata.js';
import { createMineralVeilGeometry } from './mineral-veil.js';
import { createSurgeFlow, createVeilMaterial } from './flow.js';
import { OPALINE_SUN } from '../backdrop/index.js';

const UP = new T.Vector3(0, 1, 0);
function randomSource(seed = 7319) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function upright(frame) {
  const forward = frame.tangent.clone();
  forward.y = 0;
  forward.normalize();
  const right = new T.Vector3(forward.z, 0, -forward.x);
  return new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, UP, forward),
  );
}
/** The kit supplies mineral forms and materials; this recipe composes one authored canyon. */
export function createOpalineEnvironment({ track, road, settings = {} }) {
  const lifetime = createLifetime(),
    group = new T.Group();
  group.name = 'Opaline / river-cut porcelain world';
  lifetime.defer(() => group.clear());
  try {
    const kit = lifetime.own(
      createOpalineKit({ textures: road.textures, detail: 'high' }),
    );
    const farKit = lifetime.own(
      createOpalineKit({ textures: road.textures, detail: 'low' }),
    );
    kit.materials.stone.color.set('#d8d5d3');
    kit.materials.shadow.color.set('#ccc6d3');
    farKit.materials.stone.color.set('#cac9cc');
    farKit.materials.shadow.color.set('#ccc6d3');
    const random = randomSource();
    const routePoints = [];
    for (let s = 0; s < track.length; s += 18)
      routePoints.push(track.sample(s).position);
    const regions = [
      { start: 0, end: track.jumps[0].landingStart + 650 },
      {
        start: track.landmarks.veil.start - 80,
        end: track.landmarks.veil.end + 80,
      },
    ];
    // Keep exact full-span tapers shared with the collision collector.
    const activeSpans = roadIntervals(track).filter(
      (span) => !span.constructed,
    );
    function mesh(geometry, material, name, { shadow = true } = {}) {
      lifetime.own(geometry);
      const item = new T.Mesh(geometry, material);
      item.name = name;
      item.castShadow = shadow;
      item.receiveShadow = true;
      group.add(item);
      return item;
    }
    const bankMeshes = [];
    for (const span of activeSpans)
      for (const side of [-1, 1])
        bankMeshes.push(
          mesh(
            createShelfBankGeometry(track, { ...span, side }),
            [kit.materials.stone, kit.materials.shadow],
            'Opaline / continuous mineral cliff ' + side,
          ),
        );
    const entries = kit.prototypes.map(() => []);
    const frameMatrix = new T.Matrix4(),
      scaleVector = new T.Vector3();
    function mass(index, position, scale, yaw = 0) {
      frameMatrix.compose(
        position,
        new T.Quaternion().setFromAxisAngle(UP, yaw),
        scaleVector.set(...scale),
      );
      entries[index].push({
        matrix: frameMatrix.clone(),
        position: position.clone(),
      });
    }
    // Check every route corridor, including places where the layout doubles back.
    for (let s = 0; s < track.length; s += 135) {
      const f = track.sample(s);
      for (const side of [-1, 1]) {
        const offset = side * (270 + random() * 130),
          p = f.position.clone().addScaledVector(f.right, offset);
        const index = Math.floor(random() * 5),
          size = 1.2 + random() * 1.6;
        const dimensions = kit.prototypes[index].bounds.getSize(
          new T.Vector3(),
        );
        const radius = Math.hypot(dimensions.x, dimensions.z) * 0.5 * size;
        if (
          routePoints.some(
            (q) => Math.hypot(p.x - q.x, p.z - q.z) < radius + 45,
          )
        )
          continue;
        p.y = -80;
        mass(index, p, [size, 1.3 + random() * 1.1, size], random() * 6.28);
      }
    }
    // Embedded broken ledges give the continuous shelf a different silhouette
    // through each district while leaving every drive/landing corridor clear.
    for (let s = 340; s < track.length; s += 185) {
      if (track.isGap(s)) continue;
      const f = track.sample(s),
        index = [0, 1, 2, 5][Math.floor(random() * 4)],
        size = 0.44 + random() * 0.3;
      const dimensions = kit.prototypes[index].bounds.getSize(new T.Vector3());
      const radius = Math.hypot(dimensions.x, dimensions.z) * 0.5 * size;
      const p = f.position
        .clone()
        .addScaledVector(f.right, 75 + radius + random() * 22);
      if (
        routePoints.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < radius + 28)
      )
        continue;
      p.y = f.position.y - 22;
      mass(index, p, [size, 0.52 + random() * 0.42, size], random() * 6.28);
    }
    // A single distant escarpment family frames all seven authored districts.
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2,
        radius = 1750 + random() * 430;
      mass(
        i % 5,
        new T.Vector3(Math.cos(angle) * radius, -160, Math.sin(angle) * radius),
        [3.8 + random() * 2.4, 1.7 + random() * 2.9, 3 + random() * 2],
        random() * 6.28,
      );
    }
    const lods = [];
    entries.forEach((placements, index) => {
      const pair = [kit, farKit].map((source, detail) => {
        const part = source.prototypes[index],
          instance = lifetime.own(
            new T.InstancedMesh(
              part.geometry,
              part.material,
              Math.max(1, placements.length),
            ),
          );
        instance.name =
          'Opaline / ' + part.name + (detail ? ' distant' : ' near');
        instance.castShadow = !detail;
        instance.receiveShadow = true;
        instance.count = 0;
        group.add(instance);
        return instance;
      });
      lods.push({ placements, near: pair[0], far: pair[1] });
    });
    const landmarkDetails = [];
    const veil = track.landmarks.veil,
      veilMaterial = createVeilMaterial(lifetime);
    const { surface: veilSurface, crust: veilCrust } =
      createMineralVeilGeometry(track, veil.start, veil.end);
    const mineralWindow = mesh(
      veilSurface,
      veilMaterial,
      'Opaline / emerald windows inside mineral wall',
      { shadow: false },
    );
    mineralWindow.userData.aoExclude = true;
    mesh(
      veilCrust,
      kit.materials.stone,
      'Opaline / thick pearl crust around four mineral windows',
    );
    for (const [i, s] of [veil.start + 25, veil.end - 35].entries()) {
      const f = track.sample(s),
        part = kit.archParts[0],
        arch = new T.Mesh(part.geometry, part.material);
      arch.name = 'Opaline / eroded veil buttress';
      arch.position.copy(f.position);
      arch.position.y -= 12;
      arch.quaternion.copy(upright(f));
      arch.scale.set(i ? 1.1 : 1.3, i ? 1.2 : 1.35, 1.4);
      arch.castShadow = true;
      arch.receiveShadow = true;
      group.add(arch);
      landmarkDetails.push({
        mesh: arch,
        near: part,
        far: farKit.archParts[0],
      });
    }
    // Heavy overlapping shelf caps and uneven seams root the thin wall in geology.
    for (let s = veil.start + 65; s < veil.end; s += 175) {
      const f = track.sample(s),
        part = kit.prototypes[5],
        cap = new T.Mesh(part.geometry, kit.materials.stone);
      cap.name = 'Opaline / overhanging mineral roof';
      cap.position
        .copy(f.position)
        .addScaledVector(f.right, 35)
        .addScaledVector(f.up, 92);
      cap.quaternion.copy(upright(f));
      cap.scale.set(1.15, 0.75, 2.3);
      cap.castShadow = true;
      cap.receiveShadow = true;
      group.add(cap);
      landmarkDetails.push({
        mesh: cap,
        near: part,
        far: farKit.prototypes[5],
      });
    }
    // Small offset shelves overlap at the shell's outer edges. Their thickness
    // and uneven spacing replace the former continuous tubular outlines.
    for (const [edge, x, y] of [
      [0, -12, 98],
      [1, 44, 10],
    ]) {
      for (let s = veil.start + 12; s < veil.end; s += 36 + random() * 14) {
        const f = track.sample(s),
          part = kit.prototypes[edge ? 5 : 2],
          rim = new T.Mesh(part.geometry, kit.materials.stone);
        rim.name = 'Opaline / broken overlapping mineral window crust';
        rim.position
          .copy(f.position)
          .addScaledVector(f.right, x + (random() - 0.5) * 6)
          .addScaledVector(f.up, y + (random() - 0.5) * 4);
        rim.quaternion
          .copy(upright(f))
          .multiply(
            new T.Quaternion().setFromAxisAngle(UP, (random() - 0.5) * 0.32),
          );
        rim.scale.set(
          0.22 + random() * 0.09,
          0.13 + random() * 0.08,
          0.4 + random() * 0.13,
        );
        rim.castShadow = true;
        rim.receiveShadow = true;
        group.add(rim);
        landmarkDetails.push({
          mesh: rim,
          near: part,
          far: farKit.prototypes[edge ? 5 : 2],
        });
      }
    }
    const coast = createIslandCoast({
      x: 0,
      z: 0,
      radius: 24,
      level: -24,
      harmonics: [],
    });
    const ocean = lifetime.own(
      createOceanLayer({
        id: 'Opaline / iridescent river',
        coast,
        halfSize: 3600,
        quality: 'balanced',
        waterColor: '#063b2b',
        distortionScale: 0.7,
        normalSize: 128,
      }),
    );
    ocean.init({
      scene: group,
      definition: {
        environment: {
          sun: { position: OPALINE_SUN.toArray(), color: '#fff8ef' },
        },
      },
    });
    const water = group.getObjectByName('Opaline / iridescent river');
    water.userData.aoExclude = true;
    water.material.uniforms.size.value = 0.65;
    water.material.fragmentShader = water.material.fragmentShader.replace(
      'vec3 outgoingLight = albedo;',
      'albedo=mix(albedo,vec3(.006,.048,.028),.58); vec3 outgoingLight = albedo;',
    );
    water.material.needsUpdate = true;
    group.updateMatrixWorld(true);
    const veinRay = new T.Raycaster();
    const flows = track.surgeZones.map((zone) => {
      const flow = createSurgeFlow(track, zone, lifetime);
      group.add(flow.sheet, ...flow.curtains);
      const warningMaterial = lifetime.own(
        new T.MeshStandardMaterial({
          color: '#82b39c',
          emissive: '#3fc38e',
          emissiveIntensity: 0.18,
          roughness: 0.28,
        }),
      );
      // Branching wet veins follow the actual inner bank instead of floating pickups.
      const pieces = [];
      for (let s = zone.start + 12; s < zone.end - 12; s += 49) {
        for (const branch of [0, 1]) {
          const coords = branch
            ? [
                [0, 27, 7],
                [4, 31, 10],
                [9, 35, 12],
                [15, 39, 15],
              ]
            : [
                [-8, 22, 2.8],
                [-4, 25, 5],
                [0, 28, 9.2],
                [2, 33, 11.4],
                [6, 38, 13.3],
                [9, 41, 21],
              ];
          const points = coords
            .map(([along, x, y]) => {
              const f = track.sample(s + along);
              veinRay.set(f.position.clone().addScaledVector(f.up, y), f.right);
              veinRay.far = x + 45;
              const hit = veinRay.intersectObjects(bankMeshes, false)[0];
              return hit?.point.clone().addScaledVector(hit.face.normal, 0.18);
            })
            .filter(Boolean);
          if (points.length > 2)
            pieces.push(
              lifetime.own(
                new T.TubeGeometry(
                  new T.CatmullRomCurve3(points),
                  18,
                  branch ? 0.16 : 0.28,
                  5,
                  false,
                ),
              ),
            );
        }
      }
      if (pieces.length) {
        const vein = mesh(
          mergeGeometries(pieces),
          warningMaterial,
          'Opaline / pressure veins embedded in mineral',
        );
        vein.castShadow = false;
      }
      return { ...flow, zone, warningMaterial };
    });
    let quality,
      lastCamera = new T.Vector3(Infinity, Infinity, Infinity),
      disposed = false;
    function configure(camera, nextQuality) {
      const next = nextQuality === 'low' ? 'low' : 'high',
        changed = next !== quality;
      if (changed) {
        quality = next;
        water.reflectionStride = next === 'low' ? 12 : 6;
        water.renderTarget.setSize(
          next === 'low' ? 384 : 768,
          next === 'low' ? 384 : 768,
        );
      }
      if (
        !camera ||
        (!changed && lastCamera.distanceToSquared(camera.position) < 35 ** 2)
      )
        return;
      lastCamera.copy(camera.position);
      for (const detail of landmarkDetails) {
        const part =
          quality === 'high' &&
          camera.position.distanceToSquared(detail.mesh.position) < 700 ** 2
            ? detail.near
            : detail.far;
        detail.mesh.geometry = part.geometry;
        detail.mesh.material = part.material;
      }
      for (const lod of lods) {
        let n = 0,
          f = 0;
        for (const entry of lod.placements) {
          const d = camera.position.distanceToSquared(entry.position);
          if (d > 4700 ** 2) continue;
          const near = quality === 'high' && d < 600 ** 2,
            target = near ? lod.near : lod.far;
          target.setMatrixAt(near ? n++ : f++, entry.matrix);
        }
        for (const [target, count] of [
          [lod.near, n],
          [lod.far, f],
        ]) {
          target.count = count;
          target.visible = count > 0;
          target.instanceMatrix.needsUpdate = true;
          if (count) {
            target.computeBoundingBox();
            target.computeBoundingSphere();
          }
        }
      }
    }
    group.userData.metrics = {
      recipe: 'opaline-canyon-v1',
      proofAreas: regions,
      masses: entries.flat().length,
      loadState: 'ready',
    };
    return {
      group,
      ready: Promise.resolve(),
      update(frame = {}) {
        if (disposed) return;
        const current = frame.settings ?? settings,
          time = frame.time ?? frame.state?.time ?? 0;
        configure(frame.camera, current.quality);
        ocean.update(current.reducedMotion ? 0 : (frame.dt ?? 0));
        for (const flow of flows) {
          const pulse = flow.update(time, current.reducedMotion);
          flow.warningMaterial.emissiveIntensity =
            0.18 + pulse.warning * 1.4 + pulse.strength * 0.9;
          flow.warningMaterial.color.set(pulse.active ? '#b4e3bf' : '#82b39c');
          if (flow.zone.id === 'veil-crosscurrent')
            veilMaterial.uniforms.pressure.value = Math.max(
              pulse.warning,
              pulse.strength,
            );
        }
        veilMaterial.uniforms.clock.value = current.reducedMotion ? 0 : time;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        lifetime.dispose();
      },
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

import * as T from 'three';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { sweepGeometry } from '../../../track/geometry.js';
import { sampleCarrierMotion } from '../motion.js';

function roadMaterial(shape) {
  const material = new T.MeshStandardMaterial({
    name: 'Nomad / worn load-deck steel plates',
    color: shape ? '#87969c' : '#75796f',
    roughness: 0.56,
    metalness: shape ? 0.1 : 0.42,
  });
  if (shape) return material;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 steelCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsteelCoord=roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 steelCoord;
        float nomadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 p=steelCoord;
        vec2 plate=vec2(p.x,p.y+mod(floor(p.x/18.),2.)*4.);
        vec2 cell=mod(plate,vec2(18.,8.));
        vec2 edge=min(cell,vec2(18.,8.)-cell);
        vec2 aa=max(fwidth(p),vec2(.025));
        float seam=1.-smoothstep(.025,.065+aa.x,edge.x);
        seam=max(seam,1.-smoothstep(.025,.065+aa.y,edge.y));
        float variation=nomadHash(floor(plate/vec2(18.,8.)));
        diffuseColor.rgb*=.88+.23*variation;
        diffuseColor.rgb*=1.-seam*.23;
        float shoulder=smoothstep(18.,24.,abs(p.y));
        float diagonal=step(.48,fract((p.x+p.y)*.12));
        float paint=shoulder*diagonal*.26;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.29,.066),paint);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(.5-variation)*.12,.40,.72);',
    );
  };
  material.customProgramCacheKey = () => 'nomad-working-deck-v4';
  return material;
}

/** Nominal rigid deck buffers are translated by their owning carrier each frame. */
export function createNomadRoad({
  track,
  shape = false,
  collisionOnly = false,
  view = null,
}) {
  const group = new T.Group();
  group.name = 'Nomad / carrier-owned racing decks';
  const geometries = new Set(),
    materials = new Set();
  const finish = createIndustrialFinish(
    !shape && !collisionOnly ? view?.renderer : null,
  );
  const steel = roadMaterial(shape || collisionOnly);
  if (!shape && !collisionOnly) finish.bind(steel, 'steel', 'road');
  const dark = new T.MeshStandardMaterial({
    color: '#1a2830',
    roughness: 0.76,
    metalness: 0.52,
  });
  const armor = new T.MeshStandardMaterial({
    color: '#a99c83',
    roughness: 0.64,
    metalness: 0.35,
  });
  const amber = new T.MeshStandardMaterial({
    color: '#d89638',
    roughness: 0.66,
    metalness: 0.12,
  });
  const light = new T.MeshStandardMaterial({
    color: '#ffda9b',
    emissive: '#ffd291',
    emissiveIntensity: 1.1,
    roughness: 0.42,
  });
  for (const material of [steel, dark, armor, amber, light])
    materials.add(material);
  const owners = new Map();
  const pinMatrices = new Map();
  const pinGeometry = new T.BoxGeometry(0.35, 0.16, 1.7);
  geometries.add(pinGeometry);
  const owner = (id) => {
    if (!owners.has(id)) {
      const child = new T.Group();
      child.name = `Nomad / ${id} road support`;
      child.userData.motionGroup = id;
      owners.set(id, child);
      group.add(child);
    }
    return owners.get(id);
  };
  const add = (parent, name, geometry, material, info = {}) => {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = !info.drivingSurface;
    mesh.userData = {
      ...info,
      motionGroup: parent.userData.motionGroup,
      nominalMatrixWorld: new T.Matrix4(),
    };
    parent.add(mesh);
    return mesh;
  };
  const variableSweep = (profile, span, kind = 'deck') => {
    const geometry = sweepGeometry(track, profile, span);
    const positions = geometry.attributes.position,
      coords = geometry.attributes.roadCoord;
    const point = new T.Vector3();
    for (let index = 0; index < positions.count; index++) {
      const s = coords.getX(index),
        x = coords.getY(index);
      const frame = track.sample(s);
      const height = point
        .fromBufferAttribute(positions, index)
        .sub(frame.position)
        .dot(frame.up);
      const half = track.halfWidthAt?.(s) ?? track.width / 2;
      const lateral =
        kind === 'edge'
          ? x + Math.sign(x) * (half - track.width / 2)
          : (x * half) / (track.width / 2);
      point
        .copy(frame.position)
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, height);
      positions.setXYZ(index, point.x, point.y, point.z);
      coords.setY(index, lateral);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };
  for (const [index, run] of track.roadRuns.entries()) {
    const parent = owner(run.carrierId);
    const half = track.width / 2;
    const span = { start: run.start, end: run.end, step: 4, transverseStep: 4 };
    add(
      parent,
      `Nomad deck ${index}`,
      variableSweep(
        [
          [-half, 0],
          [half, 0],
        ],
        span,
      ),
      steel,
      { drivingSurface: true, roadSurface: true, collisionKind: 'deck' },
    );
    add(
      parent,
      `Nomad deck keel ${index}`,
      variableSweep(
        [
          [-half, 0],
          [-half, -1.4],
          [half, -1.4],
          [half, 0],
        ],
        span,
      ),
      dark,
      { collisionKind: 'structure' },
    );
    for (const side of [-1, 1]) {
      const x = side * (half + 0.8);
      const profile = [
        [x - 0.55, -0.6],
        [x - 0.55, 1.05],
        [x - 0.22, 1.35],
        [x + 0.42, 1.35],
        [x + 0.65, 1.05],
        [x + 0.65, -0.6],
      ];
      if (side > 0) profile.reverse();
      add(
        parent,
        `Nomad ${index} carrier guard ${side}`,
        variableSweep(profile, span, 'edge'),
        armor,
        { collisionKind: 'rail', roadBoundary: true },
      );
      add(
        parent,
        `Nomad ${index} inset guidance ${side}`,
        variableSweep(
          [
            [side * (half - 1.35), 0.035],
            [side * (half - 0.65), 0.035],
          ],
          span,
          'edge',
        ),
        amber,
      );
      if (!collisionOnly)
        for (let s = run.start + 12; s < run.end - 10; s += 32) {
          const f = track.sample(s);
          if (!pinMatrices.has(parent)) pinMatrices.set(parent, []);
          pinMatrices.get(parent).push(
            new T.Matrix4().compose(
              f.position
                .clone()
                .addScaledVector(
                  f.right,
                  side * ((track.halfWidthAt?.(s) ?? half) + 0.2),
                )
                .addScaledVector(f.up, 1.45),
              f.quaternion,
              new T.Vector3(1, 1, 1),
            ),
          );
        }
    }
  }
  for (const [parent, matrices] of pinMatrices) {
    const pins = new T.InstancedMesh(pinGeometry, light, matrices.length);
    pins.name = 'Nomad / seated amber navigation pins';
    matrices.forEach((matrix, index) => pins.setMatrixAt(index, matrix));
    pins.computeBoundingSphere();
    parent.add(pins);
  }
  let disposed = false;
  return {
    group,
    finish,
    owners,
    ready: finish.ready,
    update() {
      for (const carrier of track.carriers) {
        const child = owners.get(carrier.id);
        if (child)
          child.position.copy(
            sampleCarrierMotion(carrier, track.presentationTime).translation,
          );
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      finish.dispose();
    },
  };
}

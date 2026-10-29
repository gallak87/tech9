import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';

export function createCrucibleRoad({ track, view }) {
  const group = new T.Group();
  group.name = 'Crucible / graphite dispatch ring';
  const finish = createIndustrialFinish(view?.renderer);
  const geometries = new Set(),
    materials = new Set();
  const material = (settings) => {
    const m = new T.MeshStandardMaterial(settings);
    materials.add(m);
    return m;
  };
  const steel = material({
    name: 'Crucible / rolled graphite running skins',
    color: '#53616b',
    roughness: 0.48,
    metalness: 0.68,
  });
  steel.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord;varying vec2 steelCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsteelCoord=roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 steelCoord;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 p=steelCoord;vec2 cell=mod(vec2(p.x+mod(floor(p.y/8.),2.)*6.,p.y),vec2(12.,8.));
      vec2 edge=min(cell,vec2(12.,8.)-cell);vec2 aa=max(fwidth(p),vec2(.025));
      float seam=(1.-smoothstep(.025,.07+aa.x,edge.x))*min(1.,.07/aa.x)+(1.-smoothstep(.025,.07+aa.y,edge.y))*min(1.,.07/aa.y);
      diffuseColor.rgb*=1.-clamp(seam,0.,1.)*.22;`,
      );
  };
  steel.customProgramCacheKey = () => 'crucible-rolled-skins-v1';
  finish.bind(steel, 'steel', 'road');
  const dark = material({ color: '#26343c', roughness: 0.65, metalness: 0.6 });
  finish.bind(dark, 'dark');
  const rim = material({ color: '#b8bbb3', roughness: 0.4, metalness: 0.35 });
  finish.bind(rim, 'shell');
  const amber = material({
    color: '#d8a149',
    emissive: '#9a5b1e',
    emissiveIntensity: 0.28,
    roughness: 0.5,
    metalness: 0.35,
  });
  const signal = material({
    color: '#d33c31',
    emissive: '#b72c21',
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });
  const add = (name, g, m) => {
    geometries.add(g);
    const mesh = new T.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const sweep = (name, profile, m, range = {}) =>
    add(name, sweepGeometry(track, profile, { step: 4, ...range }), m);
  const deck = sweep(
    'Continuous 44 m running skin',
    [
      [-22, 0],
      [22, 0],
    ],
    steel,
  );
  deck.userData.roadSurface = true;
  sweep(
    'Closed dispatch box girder',
    [
      [-23, -0.08],
      [-22, -4.4],
      [22, -4.4],
      [23, -0.08],
    ],
    dark,
  );
  for (const side of [-1, 1]) {
    sweep(
      'Pale containment shoulder',
      [
        [side * 20.4, 0.02],
        [side * 22, 0.02],
      ],
      rim,
    );
    sweep(
      'Visible continuous crash rail',
      boxProfile(side * 22.1, 0.82, 0.7, 1.65),
      dark,
    );
    sweep('Seated rail cap', boxProfile(side * 22.1, 1.68, 0.84, 0.16), rim);
    sweep(
      'Amber verge guidance',
      [
        [side * 20.05, 0.035],
        [side * 20.35, 0.035],
      ],
      amber,
    );
  }
  const details = [];
  for (let d = 16; d < track.length; d += 32)
    for (const lane of [-7.3, 7.3])
      details.push(
        sweepGeometry(
          track,
          [
            [lane - 0.07, 0.03],
            [lane + 0.07, 0.03],
          ],
          { start: d, end: d + 6, step: 3 },
        ),
      );
  if (details.length) {
    add('Broken lane guidance', mergeGeometries(details), rim);
    details.forEach((g) => g.dispose());
  }
  for (const d of track.cutGates)
    for (const side of [-1, 1]) {
      const frame = track.sample(d),
        m = new T.Mesh(new T.BoxGeometry(0.4, 4, 1.8), signal);
      geometries.add(m.geometry);
      m.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * 23.1)
        .addScaledVector(frame.up, 3.4);
      m.quaternion.copy(frame.quaternion);
      m.name = 'Crucible cut signal housing';
      group.add(m);
    }
  let disposed = false;
  return {
    group,
    finish,
    ready: finish.ready,
    setReflection(texture) {
      for (const m of materials) {
        m.envMap = texture;
        m.needsUpdate = true;
      }
    },
    update(frame) {
      const cut = frame.eliminator,
        remaining = cut?.nextCut - cut?.elapsed,
        warning = remaining >= 0 && remaining <= 3 && !cut?.result;
      signal.emissiveIntensity = warning
        ? frame.settings.reducedMotion
          ? 1.4
          : 1.1 + Math.sin(frame.time * 8) * 0.3
        : 0.8;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      finish.dispose();
      group.clear();
    },
  };
}

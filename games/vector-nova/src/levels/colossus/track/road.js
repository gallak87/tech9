import * as T from 'three';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { sheetGeometry, rimGeometry } from './surface.js';
import { createColossusPaint } from './presentation.js';

function workingSteel(shape) {
  const material = new T.MeshStandardMaterial({
    name: 'Colossus / worn working-channel steel',
    color: shape ? '#a0a7ac' : '#7f919a',
    roughness: 0.68,
    metalness: shape ? 0.1 : 0.4,
  });
  if (!shape) {
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
float steelHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float steelNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(steelHash(i),steelHash(i+vec2(1,0)),f.x),mix(steelHash(i+vec2(0,1)),steelHash(i+vec2(1,1)),f.x),f.y);}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 p=steelCoord;
          float seams=1.-smoothstep(.045,.095,abs(mod(p.x+9.,18.)-9.));
          float longitudinal=1.-smoothstep(.035,.075,abs(mod(p.y+6.,12.)-6.));
          float broad=(steelNoise(p*vec2(.018,.08))-.5);
          float stain=steelNoise(p*vec2(.042,.13)+17.);
          float scratches=sin(p.x*3.+sin(p.y*2.))*.018/(1.+length(fwidth(p))*3.);
          float brushed=smoothstep(.3,.85,steelNoise(p*vec2(.003,.24)));
          float grime=smoothstep(22.,36.,abs(p.y));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.18,.19),stain*.055+grime*.14);
          diffuseColor.rgb*=(.90+steelHash(floor(p/vec2(18.,12.)))*.16)+broad*.035+brushed*.012+scratches-seams*.42-longitudinal*.24;
        `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+grime*.18,.38,.88);',
        );
    };
    material.customProgramCacheKey = () => 'colossus-working-steel-v4';
  }
  return material;
}
export function createColossusRoad({
  track,
  shape = false,
  collectSolid = null,
  view = null,
}) {
  const group = new T.Group();
  group.name = 'Colossus / continuous machine working surfaces';
  const geometries = new Set(),
    materials = new Set();
  const finish = createIndustrialFinish(
    !shape && !collectSolid ? view?.renderer : null,
  );
  const steel = workingSteel(shape);
  if (!shape && !collectSolid) finish.bind(steel, 'steel', 'road');
  materials.add(steel);
  const dark = new T.MeshStandardMaterial({
    color: '#28363d',
    roughness: 0.75,
    metalness: 0.45,
  });
  materials.add(dark);
  const rim = new T.MeshStandardMaterial({
    color: '#a89e78',
    roughness: 0.435,
    metalness: 0.4,
  });
  materials.add(rim);
  const amber = new T.MeshStandardMaterial({
    color: '#e8b04b',
    emissive: '#8b5015',
    emissiveIntensity: 0.25,
    roughness: 0.8,
  });
  materials.add(amber);
  const add = (name, geometry, material, info) => {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = info?.kind !== 'deck';
    mesh.receiveShadow = true;
    mesh.userData.drivingSurface = info?.kind === 'deck';
    mesh.userData.roadSurface = info?.kind === 'deck';
    group.add(mesh);
    if (info) collectSolid?.({ name, geometry, ...info });
    return mesh;
  };
  for (const [i, run] of track.runs.entries()) {
    for (let start = run.start; start < run.end - 0.01; start += 150) {
      const end = Math.min(run.end, start + 150),
        info = { start: Math.max(0, start), end };
      add(
        'working-sheet-' + i + '-' + start,
        sheetGeometry(track, start, end),
        steel,
        { kind: 'deck', ...info },
      );
      add(
        'channel-backing-' + i + '-' + start,
        sheetGeometry(track, start, end, { lift: -3 }),
        dark,
        { kind: 'structure', ...info },
      );
      const cuts = [
        start,
        end,
        ...track.ejectors
          .flatMap((e) => [e.openingStart, e.openingEnd])
          .filter((s) => s > start && s < end),
      ].sort((a, b) => a - b);
      for (let n = 0; n < cuts.length - 1; n++) {
        const a = cuts[n],
          b = cuts[n + 1],
          mid = (a + b) / 2;
        if (
          track.ejectors.some(
            (e) => mid >= e.openingStart && mid <= e.openingEnd,
          )
        )
          continue;
        for (const side of [-1, 1])
          add(
            'formed-rim-' + side + '-' + a,
            rimGeometry(track, a, b, side),
            rim,
            { kind: 'rail', roadBoundary: true, start: a, end: b },
          );
      }
    }
  }
  if (!collectSolid) {
    const paint = createColossusPaint(track);
    for (const jump of track.jumps)
      for (let i = 0; i < 3; i++) {
        const end = jump.takeoff - 12 - i * 20;
        add(
          'launch-lip-warning',
          paint.rectangle(end - 2, end, {
            min: -32,
            max: 32,
            lift: 0.035,
          }),
          amber,
        );
      }
    paint.dispose();
  }
  let disposed = false;
  return {
    group,
    finish,
    ready: finish.ready,
    ownedTextures: finish.ownedTextures,
    setReflection(texture) {
      for (const m of materials) {
        m.envMap = texture;
        m.envMapIntensity = 0.5;
        m.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      finish.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}

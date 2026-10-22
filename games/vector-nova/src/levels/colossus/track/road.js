import * as T from 'three';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { sheetGeometry, rimGeometry } from './surface.js';
import { createColossusPaint } from './presentation.js';

function workingSteel(shape, track) {
  const material = new T.MeshStandardMaterial({
    name: 'Colossus / worn working-channel steel',
    color: shape ? '#a0a7ac' : '#7f919a',
    roughness: 0.68,
    metalness: shape ? 0.1 : 0.4,
  });
  if (!shape) {
    material.onBeforeCompile = (shader) => {
      for (const [name, start, end] of [
        ['millZone', 0, track.sections.find((s) => s.id === 'press').start],
        [
          'returnZone',
          ...['start', 'end'].map(
            (k) => track.sections.find((s) => s.id === 'return')[k],
          ),
        ],
        [
          'headZone',
          ...['start', 'end'].map(
            (k) => track.sections.find((s) => s.id === 'headstock')[k],
          ),
        ],
      ])
        shader.uniforms[name] = { value: new T.Vector2(start, end) };

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
uniform vec2 millZone,returnZone,headZone;
float workRange(float d,vec2 z){return smoothstep(z.x,z.x+24.,d)*(1.-smoothstep(z.y-24.,z.y,d));}
float steelHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float steelNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(steelHash(i),steelHash(i+vec2(1,0)),f.x),mix(steelHash(i+vec2(0,1)),steelHash(i+vec2(1,1)),f.x),f.y);}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 p=steelCoord;
          // Large staggered fabrication plates, with sparse anchored fasteners.
          float row=floor((p.y+36.)/18.);
          vec2 plate=vec2(p.x+mod(row,2.)*24.,p.y+36.);
          vec2 cell=mod(plate,vec2(48.,18.));
          vec2 edge=min(cell,vec2(48.,18.)-cell);
          vec2 aa=max(fwidth(p),vec2(.025));
          float seams=(1.-smoothstep(.055,.11+aa.x,edge.x))*min(1.,.11/aa.x);
          float longitudinal=(1.-smoothstep(.04,.08+aa.y,edge.y))*min(1.,.08/aa.y);
          float boltDistance=length(edge-vec2(1.4,1.2));
          float fastener=(1.-smoothstep(.18,.28+max(aa.x,aa.y),boltDistance))*(1.-smoothstep(.25,1.2,max(aa.x,aa.y)));
          float broad=steelNoise(p*vec2(.012,.07))-.5;
          float stain=steelNoise(p*vec2(.018,.17)+17.);
          float grime=smoothstep(25.,36.,abs(p.y))*(.5+.5*stain);
          float workZone=clamp(workRange(p.x,millZone)+workRange(p.x,headZone),0.,1.);
          float contact=exp(-pow((abs(p.y)-14.)/8.,2.))*workZone;
          float returnWear=workRange(p.x,returnZone)*(1.-smoothstep(10.,29.,abs(p.y)));
          float workingWear=max(contact,returnWear*.65)*(.7+.3*steelNoise(p*vec2(.006,.22)));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.19,.19),grime*.35);
          diffuseColor.rgb*=.94+steelHash(floor(plate/vec2(48.,18.)))*.1+broad*.05;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.12,workingWear);
          diffuseColor.rgb*=1.-seams*.48-longitudinal*.3-fastener*.32;
        `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+grime*.16-workingWear*.14,.44,.88);',
        );
    };
    material.customProgramCacheKey = () => 'colossus-working-steel-v5';
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
  const steel = workingSteel(shape, track);
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

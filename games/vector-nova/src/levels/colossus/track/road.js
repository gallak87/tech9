import * as T from 'three';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { sheetGeometry, rimGeometry } from './surface.js';
import { createColossusPaint } from './presentation.js';

function workingSteel(shape, track) {
  const material = new T.MeshStandardMaterial({
    name: 'Colossus / process-finished working-channel steel',
    color: shape ? '#a0a7ac' : '#7c898c',
    roughness: shape ? 0.68 : 0.57,
    metalness: shape ? 0.1 : 0.74,
  });
  if (shape) return material;
  const section = (id) => {
    const result = track.sections.find((entry) => entry.id === id);
    if (!result) throw new Error('Missing process section: ' + id);
    return result;
  };
  const zones = {
    millZone: new T.Vector2(0, section('press').start),
    augerZone: new T.Vector2(
      section('crossfeed').start,
      section('gantry').start,
    ),
    forgeZone: new T.Vector2(section('press').start, section('dive').start),
    returnZone: new T.Vector2(section('return').start, section('return').end),
    coolingZone: new T.Vector2(
      section('cooling').start,
      section('cooling').end,
    ),
    headZone: new T.Vector2(section('crown').start, track.length),
  };
  // Same placement stations as the paired coolingBank assemblies. Gravity in
  // the sheet frame determines the broad drainage tail; it is not a road stripe.
  const coolingStations = [];
  for (
    let d = zones.coolingZone.x + 85;
    d < zones.coolingZone.y - 80;
    d += 190
  ) {
    const frame = track.sample(d);
    const downhill = new T.Vector2(-frame.tangent.y, -frame.right.y);
    if (downhill.lengthSq() < 0.0001) downhill.set(-1, 0);
    downhill.normalize();
    coolingStations.push(new T.Vector3(d, downhill.x, downhill.y));
  }
  const coolingCount = coolingStations.length;
  if (!coolingCount) coolingStations.push(new T.Vector3(-1e6, -1, 0));
  material.onBeforeCompile = (shader) => {
    for (const [name, value] of Object.entries(zones))
      shader.uniforms[name] = { value };
    shader.uniforms.coolingStations = { value: coolingStations };
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
uniform vec2 millZone,augerZone,forgeZone,returnZone,coolingZone,headZone;
uniform vec3 coolingStations[${coolingStations.length}];
float workRange(float d,vec2 z){return smoothstep(z.x,z.x+36.,d)*(1.-smoothstep(z.y-36.,z.y,d));}
float steelHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float steelNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(steelHash(i),steelHash(i+vec2(1,0)),f.x),mix(steelHash(i+vec2(0,1)),steelHash(i+vec2(1,1)),f.x),f.y);}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
          vec2 p=steelCoord;
          // Retained fabrication joints. Process finish is independent of plates.
          float row=floor((p.y+36.)/18.);
          vec2 plate=vec2(p.x+mod(row,2.)*24.,p.y+36.);
          vec2 cell=mod(plate,vec2(48.,18.));
          vec2 edge=min(cell,vec2(48.,18.)-cell);
          vec2 aa=max(fwidth(p),vec2(.025));
          float seams=(1.-smoothstep(.055,.11+aa.x,edge.x))*min(1.,.11/aa.x);
          float longitudinal=(1.-smoothstep(.04,.08+aa.y,edge.y))*min(1.,.08/aa.y);
          float boltDistance=length(edge-vec2(1.4,1.2));
          float fastener=(1.-smoothstep(.18,.28+max(aa.x,aa.y),boltDistance))*(1.-smoothstep(.25,1.2,max(aa.x,aa.y)));

          // One broad rubbed workpiece footprint, with softer worked shoulders.
          // No ubiquitous twin wheel-track pattern: the hull is a hovercraft.
          float mill=clamp(workRange(p.x,millZone)+workRange(p.x,augerZone),0.,1.);
          float forge=workRange(p.x,forgeZone);
          float head=workRange(p.x,headZone);
          float returned=workRange(p.x,returnZone);
          float lateral=abs(p.y);
          float bed=1.-smoothstep(15.,26.,lateral);
          float margin=smoothstep(15.,32.,lateral);
          float slowVariation=.86+.14*steelNoise(p*vec2(.004,.04));
          float polish=clamp(bed*(mill*.92+forge*.35+returned*.38)+head*(1.-smoothstep(27.,35.,lateral)),0.,1.)*slowVariation;
          // Compact dark mill scale remains at unworked margins, especially dies.
          // The oxide is almost neutral; amber remains reserved for safety paint.
          float oxide=(margin*(.18+.72*forge+.32*mill)+.03+.09*forge)*(1.-head*.9)*slowVariation;

          // Wide cooling footprints follow installed banks and drain down the
          // actual sheet slope. 28–68 m falloffs survive driving distance.
          float wash=0.;
          for(int i=0;i<${coolingStations.length};i++){
            vec3 station=coolingStations[i];
            vec2 flow=station.yz;
            vec2 q=vec2(p.x-station.x,p.y);
            float along=dot(q,flow);
            float across=dot(q,vec2(-flow.y,flow.x));
            vec2 curtainCoord=vec2(along/46.,across/28.);
            vec2 drainCoord=vec2((along-43.)/68.,across/(8.+9.*smoothstep(0.,90.,along)));
            float curtain=exp(-dot(curtainCoord,curtainCoord));
            float drained=exp(-dot(drainCoord,drainCoord))*.65;
            wash=max(wash,max(curtain,drained));
          }
          wash*=workRange(p.x,coolingZone);
          oxide*=1.-wash*.7;
          diffuseColor.rgb*=mix(vec3(1.),vec3(.43,.47,.45),oxide);
          diffuseColor.rgb*=1.+polish*(.35-head*.20)-wash*.10;
          diffuseColor.rgb*=.965+steelHash(floor(plate/vec2(48.,18.)))*.055;
          diffuseColor.rgb*=1.-seams*.48-longitudinal*.3-fastener*.32;
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
          // Applied after the shared finish's restrained substrate texture.
          // Keep broad reflections legible, with no mirror-like signal glare.
          roughnessFactor=clamp(roughnessFactor+oxide*.22-polish*.25-wash*.20,.32+head*.18,.84);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
          metalnessFactor=clamp(metalnessFactor-oxide*.42+polish*.16-wash*.10,.28,.90);`,
      );
  };
  material.customProgramCacheKey = () =>
    'colossus-working-steel-process-v1-' + coolingCount;
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
        m.envMapIntensity = m === steel ? 0.85 : 0.5;
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

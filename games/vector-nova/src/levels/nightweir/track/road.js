import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createAsphalt } from '../../halcyon/track/asphalt.js';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';

export function roadIntervals(track) {
  const out = [];
  let start = -70;
  for (const j of track.jumps) {
    out.push({ start, end: j.takeoff });
    start = j.landingStart;
  }
  out.push({ start, end: track.length });
  return out;
}
export function createNightweirRoad({
  track,
  shape = false,
  renderer = null,
  collectSolid = null,
}) {
  const group = new T.Group();
  group.name = 'Nightweir / wet municipal causeway';
  const geometries = new Set(),
    materials = new Set(),
    half = track.width / 2;
  const mat = (name, values) => {
    const m = new T.MeshStandardMaterial({ name, ...values });
    materials.add(m);
    return m;
  };
  const asphalt =
    !shape && !collectSolid && renderer
      ? createAsphalt(renderer, track.width, {
          uvLength: 12,
          label: 'Nightweir',
          moisture: 0.32,
        })
      : null;
  const deck =
    asphalt?.material ??
    mat('Nightweir / neutral driving sheet', {
      color: '#455057',
      roughness: 0.75,
    });
  if (asphalt) {
    deck.color.set('#d7e1e5');
    deck.normalScale.set(1.6, 1.6);
    // Rain-darkened mineral aggregate stays readable under the low storm sun.
    // The inherited maps remain metre-scaled; only this city's damp finish is
    // lifted above mirror-like puddle roughness.
    const finish = deck.onBeforeCompile;
    deck.onBeforeCompile = (shader) => {
      finish(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'float asphaltWet = clamp(roadMoisture * (.38 + .85 * smoothstep(.25,.75,asphaltMacro)),0.,1.);',
          `float edgeDistance=min(roadMetres.x,${track.width.toFixed(1)}-roadMetres.x);
         float drainage=(1.-smoothstep(1.2,4.8,edgeDistance))
           *smoothstep(.34,.72,asphaltNoise(roadMetres*vec2(.7,.045)));
         float asphaltWet=max(smoothstep(.62,.83,asphaltMacro)*.78,drainage*.94)
           *clamp(roadMoisture*2.5,0.,1.);`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        // Unequal resurfaced strips give metre-scale construction to the
        // municipal road while retaining the licensed fine aggregate below.
        vec2 repairCell=floor(roadMetres/vec2(5.5,67.));
        float repairSeed=asphaltHash(repairCell+vec2(31.,7.));
        vec2 repairLocal=mod(roadMetres,vec2(5.5,67.));
        float repairStart=8.+repairSeed*14.;
        float repairEnd=repairStart+22.+asphaltHash(repairCell+19.)*19.;
        float repairEdge=min(min(repairLocal.x-.35,5.15-repairLocal.x),min(repairLocal.y-repairStart,repairEnd-repairLocal.y));
        repairEdge+=(asphaltNoise(roadMetres*2.7)-.5)*.13;
        float footprint=max(fwidth(repairEdge),.015);
        float repair=smoothstep(-footprint,footprint,repairEdge)*step(.58,repairSeed);
        float seal=(1.-smoothstep(.06,.13+footprint,abs(repairEdge)))*step(-.3,repairEdge)*step(.58,repairSeed);
        diffuseColor.rgb*=1.-repair*.055-seal*.055;
        float laneSpacing=${((track.width - 4) / 8).toFixed(2)};
        float laneEdge=abs(mod(roadMetres.x-2.+laneSpacing*.5,laneSpacing)-laneSpacing*.5);
        float laneDash=abs(mod(roadMetres.y,14.)-7.);
        float lanePaint=(1.-smoothstep(.075,.075+fwidth(laneEdge),laneEdge))
          *(1.-smoothstep(1.9,2.0+fwidth(laneDash),laneDash));
        lanePaint*=step(2.+laneSpacing*.5,roadMetres.x)*step(roadMetres.x,${(track.width - 2).toFixed(1)}-laneSpacing*.5);
        lanePaint*=mix(.28,.62,smoothstep(.2,.7,asphaltMacro));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.46,.47,.43),lanePaint);`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nroughnessFactor=max(roughnessFactor,mix(.88,.30,asphaltWet));roughnessFactor=clamp(roughnessFactor+repair*.035-seal*.025,.28,.88);roughnessFactor=mix(roughnessFactor,.82,lanePaint);',
        );
    };
    deck.customProgramCacheKey = () => 'nightweir-damp-asphalt-v6';
  }

  const concrete = mat('Nightweir / damp precast curb', {
    color: '#87908c',
    roughness: 0.82,
    metalness: 0.025,
  });
  const iron = mat('Nightweir / blackened drain castings', {
    color: '#28353a',
    roughness: 0.4,
    metalness: 0.76,
  });
  const rust = mat('Nightweir / oxide bridge steel', {
    color: '#694533',
    roughness: 0.57,
    metalness: 0.6,
  });
  const paint = mat('Nightweir / weathered ivory line paint', {
    color: '#d0d0b6',
    roughness: 0.74,
  });
  const lamp = mat('Nightweir / warm road lantern glass', {
    color: '#ffd7a1',
    emissive: '#ffb568',
    emissiveIntensity: 1.2,
    roughness: 0.36,
  });
  const drainWater = mat('Nightweir / retained gutter water', {
    color: '#14282d',
    roughness: 0.18,
    metalness: 0.25,
  });
  const red = mat('Nightweir / outboard spillway indicators', {
    color: '#c45032',
    emissive: '#913018',
    emissiveIntensity: 0.6,
    roughness: 0.55,
  });
  const concreteMaps =
    !shape && !collectSolid
      ? createHelionCeramicMaps(renderer, [concrete])
      : null;
  const add = (name, g, m, info) => {
    geometries.add(g);
    const mesh = new T.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.roadSurface = mesh.userData.drivingSurface =
      info?.kind === 'deck';
    group.add(mesh);
    if (info && collectSolid) collectSolid({ name, geometry: g, ...info });
    return mesh;
  };
  for (const [i, run] of roadIntervals(track).entries()) {
    const range = { ...run, step: 4, uvScale: 12 },
      route = { start: Math.max(0, run.start), end: run.end };
    add(
      'Asphalt deck ' + i,
      sweepGeometry(
        track,
        [
          [-half, 0],
          [half, 0],
        ],
        range,
      ),
      deck,
      { kind: 'deck', ...route },
    );
    add(
      'Bridge steel soffit ' + i,
      sweepGeometry(
        track,
        [
          [half, 0],
          [half + 1, -1.8],
          [half - 2, -5.5],
          [-half + 2, -5.5],
          [-half - 1, -1.8],
          [-half, 0],
        ],
        range,
      ),
      rust,
      { kind: 'structure', ...route },
    );
    for (const side of [-1, 1]) {
      const curb = add(
        'Precast curb ' + i + ' ' + side,
        sweepGeometry(
          track,
          [
            [side * half, 0],
            [side * (half + 0.3), 1.0],
            [side * (half + 1.3), 1.2],
            [side * (half + 1.8), 0.7],
            [side * (half + 1.8), -2.7],
          ],
          range,
        ),
        concrete,
        { kind: 'rail', roadBoundary: true, ...route },
      );
      // Precast carries its own physical substrate scale; asphalt retains its 2.05 m repeat.
      const uv = curb.geometry.attributes.uv,
        coord = curb.geometry.attributes.roadCoord;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, uv.getX(k) * 1.8, coord.getX(k));
      add(
        'Open storm gutter ' + i + ' ' + side,
        sweepGeometry(
          track,
          [
            [side * (half + 1.5), 0.35],
            [side * (half + 2), -1.8],
            [side * (half + 4.2), -1.9],
            [side * (half + 4.8), 0.4],
          ],
          range,
        ),
        iron,
        { kind: 'structure', ...route },
      );
      add(
        'Ivory shoulder line ' + i + ' ' + side,
        sweepGeometry(
          track,
          [
            [side * (half - 1.8), 0.025],
            [side * (half - 1.45), 0.025],
          ],
          range,
        ),
        paint,
      );
    }
    for (const s of [run.start, run.end]) {
      const f = track.sample(s),
        g = new T.PlaneGeometry(track.width, 5.5);
      g.applyMatrix4(
        new T.Matrix4().compose(
          framePoint(f, 0, -2.75),
          f.quaternion,
          new T.Vector3(1, 1, 1),
        ),
      );
      add('Finite bridge end ' + i + ' ' + s, g, iron, {
        kind: 'structure',
        ...route,
      });
    }
  }
  const unit = new T.BoxGeometry(1, 1, 1),
    formed = new RoundedBoxGeometry(1, 1, 1, 1, 0.06);
  geometries.add(unit);
  geometries.add(formed);
  const lists = {
    grates: [],
    posts: [],
    hoods: [],
    glass: [],
    markers: [],
    underframes: [],
    channelWater: [],
    catchFrames: [],
    drainPipes: [],
  };
  const fixtures = [];
  const place = (list, f, x, y, z, w, h, d) =>
    list.push(
      new T.Matrix4().compose(
        framePoint(f, x, y).addScaledVector(f.tangent, z),
        f.quaternion,
        new T.Vector3(w, h, d),
      ),
    );
  for (let s = 6; s < track.length; s += 12) {
    if (track.isGap(s)) continue;
    const f = track.sample(s);
    for (const side of [-1, 1]) {
      for (const dz of [-0.7, 0, 0.7])
        place(lists.grates, f, side * (half + 3.1), 0.3, dz, 3.2, 0.22, 0.24);
      if (Math.round(s / 12) % 4 === 0)
        place(lists.markers, f, side * (half + 1.2), 1.35, 0, 0.45, 0.28, 2.4);
    }
    if (f.up.y > 0.75) {
      for (const side of [-1, 1])
        place(
          lists.channelWater,
          f,
          side * (half + 3.1),
          -1.63,
          0,
          2.15,
          0.04,
          11.8,
        );
    }
    if (Math.round(s / 12) % 7 === 0) {
      if (f.up.y > 0.75) {
        for (const side of [-1, 1]) {
          for (const dz of [-2, 2])
            place(
              lists.catchFrames,
              f,
              side * (half + 3.1),
              -0.5,
              dz,
              3.8,
              2.6,
              0.45,
            );
          place(
            lists.catchFrames,
            f,
            side * (half + 4.7),
            -0.5,
            0,
            0.45,
            2.6,
            4.3,
          );
          place(lists.drainPipes, f, side * (half + 3.2), -4.5, 0, 1.4, 6, 1.4);
        }
      }
      for (const side of [-1, 1]) {
        place(lists.posts, f, side * (half + 3.8), 4.1, 0, 0.6, 8.2, 0.7);
        place(lists.hoods, f, side * (half + 3.8), 8.3, 0, 3.4, 0.9, 2.5);
        place(lists.glass, f, side * (half + 3.8), 7.85, 0, 2.6, 0.14, 1.8);
        fixtures.push(framePoint(f, side * (half + 3.5), 7.65));
      }
      place(lists.underframes, f, 0, -6.8, 0, track.width + 10, 2.6, 3.5);
    }
  }
  for (const [id, material] of [
    ['grates', iron],
    ['posts', iron],
    ['hoods', iron],
    ['glass', lamp],
    ['markers', red],
    ['underframes', rust],
    ['channelWater', drainWater],
    ['catchFrames', iron],
    ['drainPipes', rust],
  ]) {
    const list = lists[id],
      mesh = new T.InstancedMesh(formed, material, list.length);
    mesh.name = 'Nightweir / ' + id;
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = id !== 'glass';
    mesh.receiveShadow = true;
    group.add(mesh);
    if (
      collectSolid &&
      ['posts', 'hoods', 'underframes', 'catchFrames', 'drainPipes'].includes(
        id,
      )
    )
      list.forEach((matrix, i) =>
        collectSolid({
          name: id + ' ' + i,
          geometry: unit,
          matrix,
          kind: 'structure',
        }),
      );
  }
  const lamps = Array.from({ length: 6 }, () => {
    const l = new T.PointLight('#ffe1b7', 0, 90, 2);
    group.add(l);
    return l;
  });
  let disposed = false;
  return {
    group,
    ready: Promise.all([asphalt?.ready, concreteMaps?.ready]),
    setReflection(texture) {
      for (const m of [deck, concrete, iron, rust, drainWater]) {
        m.envMap = texture;
        m.envMapIntensity = 0.75;
        m.needsUpdate = true;
      }
    },
    update({ camera } = {}) {
      if (!camera) return;
      const near = fixtures
        .map((p) => ({ p, d: p.distanceToSquared(camera.position) }))
        .sort((a, b) => a.d - b.d);
      lamps.forEach((l, i) => {
        const f = near[i];
        // Preserve the warmed shader's light count as fixtures enter/leave range.
        l.intensity = f && f.d < 180 * 180 ? 300 : 0;
        if (f) l.position.copy(f.p);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      asphalt?.dispose();
      concreteMaps?.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}

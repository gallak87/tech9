import * as T from 'three';
import { batchRavelRoad } from './batches.js';
import { RAVEL_WAVE_RULES } from '../waves.js';

const resolve = (value, s) => (typeof value === 'function' ? value(s) : value);
const point = (track, s, x, time) =>
  track.pointAtTime
    ? track.pointAtTime(s, x, time)
    : (track.surfaceAtTime?.(s, x, time) ?? track.sampleBranchSurface(s, x))
        .position;
const bounds = (band, s) => [resolve(band.min, s), resolve(band.max, s)];
const covered = (track, s, x) => (track.surfaceCoverage?.(s, x) ?? 1) > 0;

function animateMaterial(material, clock) {
  const prepare = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.flatShading = false;
  material.onBeforeCompile = (shader) => {
    prepare?.(shader);
    shader.uniforms.ravelTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform float ravelTime; attribute vec3 ravelWave; attribute vec3 ravelWaveUp;
      attribute vec3 ravelDs; attribute vec3 ravelDx; attribute vec3 ravelUpDs; attribute vec3 ravelGradient;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        if(ravelWave.x>0.00001){
          float phase=ravelWave.y+ravelWave.z*ravelTime;
          float pulse=.5+.5*cos(phase);
          float h=ravelWave.x*pulse;
          float hs=ravelGradient.x*pulse-.5*ravelWave.x*ravelGradient.z*sin(phase);
          float hx=ravelGradient.y*pulse;
          vec3 ds=ravelDs+ravelWaveUp*hs+ravelUpDs*h;
          vec3 dx=ravelDx+ravelWaveUp*hx;
          objectNormal=normalize(cross(ds,dx));
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += ravelWaveUp * ravelWave.x * (.5 + .5*cos(ravelWave.y + ravelWave.z*ravelTime));',
      );
  };
  material.customProgramCacheKey = () => baseKey + '-live-membrane-v2';
  return material;
}

export function createRavelMembraneMaterial(color, center = 0) {
  const material = new T.MeshPhysicalMaterial({
    name: 'Ravel / bonded aluminized sail cloth',
    color,
    roughness: 0.29,
    metalness: 0.68,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    side: T.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.racingCenter = { value: center };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 sailCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsailCoord=roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 sailCoord; uniform float racingCenter;
        float sailLine(float distance, float width){return 1.-smoothstep(width,width+max(.015,fwidth(distance)),abs(distance));}
        float sailHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 panelCoord=sailCoord+vec2(mod(floor((sailCoord.y+6.)/12.),2.)*40.,6.);
        vec2 panel=floor(panelCoord/vec2(80.,12.));
        float variation=sailHash(panel);
        vec2 cell=abs(fract(panelCoord/vec2(80.,12.)-.5)-.5)*vec2(80.,12.);
        float seam=1.-smoothstep(.045,.045+max(fwidth(sailCoord.x),fwidth(sailCoord.y)),min(cell.x,cell.y));
        float transverse=sailCoord.y-racingCenter-6.*sin(sailCoord.x/170.);
        float line=sailLine(transverse,7.);
        float pin=sailLine(abs(transverse)-7.4,.12);
        float dash=step(.34,fract(sailCoord.x/24.));
        diffuseColor.rgb*=mix(.97,1.03,variation);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.19,.12),seam*.18);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.15,.17,.17),line*.54);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.72,.66),pin*.8);
        float arrow=sailLine(transverse,.16)*dash;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.82,.62),arrow*.65);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor, .4, line);
        roughnessFactor+=sin(sailCoord.x*.71+sailCoord.y*.31)*.025;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float strain=sailCoord.x*.72+sin(sailCoord.y*.21)*2.+sin(sailCoord.x*.09+sailCoord.y*.18);
        float fiber=sailCoord.y*2.6+sin(sailCoord.x*.38)*.8;
        float fold=(sin(strain)*.026+sin(fiber)*.006)*(1.-smoothstep(.3,1.1,max(fwidth(strain),fwidth(fiber))));
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
        vec3 rx=cross(sy,normal),ry=cross(normal,sx);float det=dot(sx,rx);
        normal=normalize(abs(det)*normal-sign(det)*(dFdx(fold)*rx+dFdy(fold)*ry)*(1.-line*.7));`,
      );
  };
  material.customProgramCacheKey = () => 'ravel-aluminized-membrane-v3';
  return material;
}

function gridGeometry(
  track,
  band,
  start,
  end,
  time,
  side = null,
  transverseStep = 4,
) {
  const mid = (start + end) / 2;
  const [low, high] = bounds(band, mid);
  const rows = Math.max(1, Math.ceil((end - start) / 4));
  const maxWidth = Math.max(
    ...[start, mid, end].map((s) => {
      const [a, b] = bounds(band, s);
      return b - a;
    }),
  );
  const columns =
    side === null ? Math.max(2, Math.ceil(maxWidth / transverseStep)) : 1;
  const fractions = Array.from({ length: columns + 1 }, (_, i) => i / columns);
  if (side === null) {
    for (const jump of track.jumps.filter((j) => j.optional))
      for (const x of [jump.lateralMin, jump.lateralMax, 3])
        if (Number.isFinite(x) && x > low && x < high)
          fractions.push((x - low) / (high - low));
  }
  fractions.sort((a, b) => a - b);
  const fs = fractions.filter((v, i) => !i || v - fractions[i - 1] > 1e-5);
  const positions = [],
    coords = [],
    indices = [],
    stations = [],
    waveParams = [],
    waveUps = [],
    alongs = [],
    acrosses = [],
    upDerivatives = [],
    gradients = [];
  for (let r = 0; r <= rows; r++) {
    const s = start + ((end - start) * r) / rows;
    const [min, max] = bounds(band, s);
    for (const f of fs) {
      let x = T.MathUtils.lerp(min, max, f);
      if (side !== null) x = side < 0 ? min + f * 0.65 : max - (1 - f) * 0.65;
      const p = point(track, s, x, time);
      if (side !== null)
        p.addScaledVector(
          (track.surfaceAtTime?.(s, x, time) ?? track.sample(s)).up,
          0.055,
        );
      const wave = track.waveAt(s, x, 0);
      const up = track.sample(s).up;
      const zone = wave.zone;
      const amplitude =
        (zone?.amplitude ?? RAVEL_WAVE_RULES.amplitude) * wave.weight;
      const frequency =
        (2 * Math.PI) / (zone?.wavelength ?? RAVEL_WAVE_RULES.wavelength);
      const phase = zone ? (s - zone.start) * frequency + (zone.phase ?? 0) : 0;
      const rate = zone
        ? -(zone.speed ?? RAVEL_WAVE_RULES.speed) * frequency
        : 0;
      p.addScaledVector(up, -wave.dynamicHeight);
      positions.push(p.x, p.y, p.z);
      coords.push(s, x);
      stations.push([s, x]);
      waveParams.push(amplitude, phase, rate);
      waveUps.push(up.x, up.y, up.z);
      if (amplitude > 0.00001) {
        const ds = 0.2,
          dx = 0.1;
        const basePoint = (station, lateral) =>
          point(track, station, lateral, 0).addScaledVector(
            track.sample(station).up,
            -track.waveAt(station, lateral, 0).dynamicHeight,
          );
        const along = basePoint(s + ds, x)
          .sub(basePoint(s - ds, x))
          .multiplyScalar(1 / (2 * ds));
        const across = basePoint(s, x + dx)
          .sub(basePoint(s, x - dx))
          .multiplyScalar(1 / (2 * dx));
        const upDs = track
          .sample(s + ds)
          .up.sub(track.sample(s - ds).up)
          .multiplyScalar(1 / (2 * ds));
        const amp = (station, lateral) => {
          const w = track.waveAt(station, lateral, 0);
          return (w.zone?.amplitude ?? RAVEL_WAVE_RULES.amplitude) * w.weight;
        };
        alongs.push(...along.toArray());
        acrosses.push(...across.toArray());
        upDerivatives.push(...upDs.toArray());
        gradients.push(
          (amp(s + ds, x) - amp(s - ds, x)) / (2 * ds),
          (amp(s, x + dx) - amp(s, x - dx)) / (2 * dx),
          frequency,
        );
      } else {
        alongs.push(0, 0, 0);
        acrosses.push(0, 0, 0);
        upDerivatives.push(0, 0, 0);
        gradients.push(0, 0, 0);
      }
    }
  }
  const width = fs.length;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < width - 1; c++) {
      const n = r * width + c,
        next = n + width;
      const s = (stations[n][0] + stations[next][0]) / 2;
      const x =
        (stations[n][1] +
          stations[n + 1][1] +
          stations[next][1] +
          stations[next + 1][1]) /
        4;
      if (!covered(track, s, x)) continue;
      indices.push(n, next, n + 1, n + 1, next, next + 1);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('roadCoord', new T.Float32BufferAttribute(coords, 2));
  geometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute(
      coords.map((v, i) => v / (i % 2 ? 4 : 20)),
      2,
    ),
  );
  geometry.setAttribute(
    'ravelWave',
    new T.Float32BufferAttribute(waveParams, 3),
  );
  geometry.setAttribute(
    'ravelWaveUp',
    new T.Float32BufferAttribute(waveUps, 3),
  );
  for (const [name, values] of Object.entries({
    ravelDs: alongs,
    ravelDx: acrosses,
    ravelUpDs: upDerivatives,
    ravelGradient: gradients,
  }))
    geometry.setAttribute(name, new T.Float32BufferAttribute(values, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 12;
  return { geometry, stations, side };
}

export function createRavelRoad({ track, collisionOnly = false }) {
  const group = new T.Group();
  group.name = 'Ravel / live aluminized sail terrain';
  const waveClock = { value: 0 };
  group.userData.waveClock = waveClock;
  const materials = {
    main: createRavelMembraneMaterial('#d8dddb'),
    inner: createRavelMembraneMaterial('#cfdcd4', -100),
    middle: createRavelMembraneMaterial('#d7dce3'),
    outer: createRavelMembraneMaterial('#e1ccad', 100),
  };
  const edge = new T.MeshStandardMaterial({
    color: '#625846',
    roughness: 0.34,
    metalness: 0.75,
    side: T.DoubleSide,
  });
  for (const m of [...Object.values(materials), edge])
    animateMaterial(m, waveClock);
  const lineEdge = new T.MeshStandardMaterial({
    color: '#a3a295',
    metalness: 0.78,
    roughness: 0.3,
    side: T.DoubleSide,
  });
  animateMaterial(lineEdge, waveClock);
  const marker = new T.MeshStandardMaterial({
    color: '#f0cb75',
    emissive: '#77500e',
    emissiveIntensity: 0.25,
  });
  const geometries = new Set(),
    mounts = [];
  const cuts = [
    0,
    track.length,
    ...track.jumps.flatMap((j) => [j.takeoff, j.landingStart]),
    ...(track.waveZones ?? []).flatMap((z) => [z.start, z.end]),
    ...track.sections.flatMap((s) => [s.start, s.end]),
  ];
  const bands = track.roadBands ?? [
    {
      id: 'main',
      branch: 'main',
      start: 0,
      end: track.length,
      min: -22,
      max: 22,
    },
  ];
  const add = (name, part, material, dynamic, driving) => {
    const { geometry } = part;
    geometries.add(geometry);
    if (!geometry.index?.count) return;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = !dynamic;
    mesh.castShadow = false;
    mesh.userData.drivingSurface = driving;
    mesh.userData.roadSurface = driving;
    mesh.userData.deforming = dynamic;
    group.add(mesh);
  };
  for (const band of bands) {
    const split = [
      band.start,
      band.end,
      ...cuts.filter((s) => s > band.start && s < band.end),
    ];
    for (let s = band.start + 160; s < band.end; s += 160) split.push(s);
    split.sort((a, b) => a - b);
    const stations = split.filter((v, i) => !i || v - split[i - 1] > 0.001);
    for (let i = 0; i < stations.length - 1; i++) {
      const start = stations[i],
        end = stations[i + 1];
      if (end - start < 0.01) continue;
      const dynamic =
        band.wave !== false &&
        (track.waveZones ?? []).some((z) => z.start < end && z.end > start);
      if (collisionOnly && dynamic) continue;
      const mat = materials[band.branch] ?? materials.main;
      add(
        `Ravel ${band.id} membrane ${i}`,
        gridGeometry(track, band, start, end, 0, null, collisionOnly ? 8 : 4),
        mat,
        dynamic,
        true,
      );
      if (!collisionOnly) {
        const center = { inner: -100, middle: 0, outer: 100 }[band.branch] ?? 0;
        const [low, high] = bounds(band, (start + end) / 2);
        if (low <= center && high >= center)
          for (const side of [-1, 1]) {
            const rail = {
              min: (s) => center + 6 * Math.sin(s / 170) + side * 8.4 - 0.33,
              max: (s) => center + 6 * Math.sin(s / 170) + side * 8.4 + 0.33,
            };
            add(
              `Ravel ${band.id} racing seam ${side}`,
              gridGeometry(track, rail, start, end, 0, -1),
              lineEdge,
              dynamic,
              false,
            );
          }
      }
      if (!collisionOnly)
        for (const side of [-1, 1])
          add(
            `Ravel ${band.id} reinforced edge ${side}`,
            gridGeometry(track, band, start, end, 0, side),
            edge,
            dynamic,
            false,
          );
    }
  }
  if (!collisionOnly) {
    const cube = new T.BoxGeometry(1, 1, 1);
    geometries.add(cube);
    for (const jump of track.jumps) {
      for (const before of [35, 75, 120]) {
        const s = jump.takeoff - before;
        const x = jump.optional ? (jump.lateralMin + jump.lateralMax) / 2 : 0;
        if (!covered(track, s, x)) continue;
        const f = track.surfaceAtTime(s, x, 0);
        const mesh = new T.Mesh(cube, marker);
        mesh.name = 'Ravel jump approach chevron';
        mesh.position.copy(f.position).addScaledVector(f.up, 0.09);
        mesh.quaternion.copy(f.quaternion);
        mesh.scale.set(
          jump.optional
            ? Math.max(12, (jump.lateralMax - jump.lateralMin) * 0.7)
            : (track.mainWidth ?? 100) * 0.75,
          0.12,
          1.4,
        );
        group.add(mesh);
        if ((track.waveZones ?? []).some((z) => s >= z.start && s <= z.end))
          mounts.push({ mesh, s, x });
      }
      const s = jump.landingStart + 6;
      const f = track.sample(s);
      const mesh = new T.Mesh(cube, marker);
      mesh.name = 'Ravel receiving shelf marker';
      mesh.position.copy(f.position).addScaledVector(f.up, 0.08);
      mesh.quaternion.copy(f.quaternion);
      mesh.scale.set((track.mainWidth ?? 100) * 0.9, 0.12, 2);
      group.add(mesh);
    }
  }
  const roadBatches = [];
  if (!collisionOnly) {
    const entries = group.children.filter(
      (mesh) =>
        mesh.userData.drivingSurface ||
        mesh.name.includes('reinforced edge') ||
        mesh.name.includes('racing seam'),
    );
    roadBatches.push(...batchRavelRoad(entries));
    for (const batch of roadBatches) group.add(batch);
    for (const old of entries) {
      old.removeFromParent();
      old.geometry.dispose();
      geometries.delete(old.geometry);
    }
  }
  let lastTime = null,
    disposed = false;
  return {
    group,
    update({ time = 0 }) {
      if (disposed || lastTime === time) return;
      lastTime = time;
      group.userData.sampleTime = time;
      waveClock.value = time;
      for (const { mesh, s, x } of mounts) {
        const f = track.surfaceAtTime(s, x, time);
        mesh.position.copy(f.position).addScaledVector(f.up, 0.09);
        mesh.quaternion.copy(f.quaternion);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of roadBatches) batch.dispose();
      for (const g of geometries) g.dispose();
      for (const m of [...Object.values(materials), edge, lineEdge, marker])
        m.dispose();
      group.clear();
      mounts.length = 0;
    },
  };
}

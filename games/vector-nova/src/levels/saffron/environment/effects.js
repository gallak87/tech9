import * as T from 'three';
import { sandfallAnchors } from './fossils.js';
import { horizontalFrame, randomSequence, UP } from './geometry.js';

import { sampleBurrower, GRAZER_DURATION } from '../grazer.js';
import { createGrazerPath } from './grazer-path.js';
import { createTerrainColorSampler } from './terrain.js';
export { sampleBurrower } from '../grazer.js';

const SAND_HALF_WIDTH = 260;

function sandDisplacement(distance, cross, age, travel, breach, motion) {
  const settling =
    (age >= 0 ? 1 : 0) * (1 - T.MathUtils.smoothstep(age, 20, GRAZER_DURATION));
  if (!settling) return 0;
  const head = Math.exp(-(((distance - travel - 30) / 65) ** 2));
  const tail = Math.exp(-(((distance - travel + 130) / 190) ** 2)) * 0.55;
  const core = Math.max(0, 1 - (cross / 100) ** 2) ** 2;
  const passed =
    T.MathUtils.smoothstep(travel - distance, 50, 140) *
    T.MathUtils.smoothstep(distance, -60, 80);
  const lateralWander =
    Math.sin(distance * 0.017) * 11 + Math.sin(distance * 0.039 + 1.4) * 6;
  const shoulder = Math.abs(cross + lateralWander);
  // Unequal deposited shoulders imply a settling furrow between them. This
  // overlay only lifts sand; the physical terrain never becomes a depression.
  const berm =
    Math.exp(-(((shoulder - 108) / 31) ** 2)) *
    passed *
    (3.5 + Math.sin(distance * 0.026 + cross * 0.006));
  const wakeDistance = distance - travel;
  const reach =
    T.MathUtils.smoothstep(Math.abs(cross), 90, 140) *
    (1 - T.MathUtils.smoothstep(Math.abs(cross), 225, 280)) *
    Math.exp(-((wakeDistance / 265) ** 2));
  const emergence = Math.exp(-(((age - 3.5) / 1.5) ** 2));
  const dive = Math.exp(-(((age - 12) / 2) ** 2));
  const ripple =
    motion *
    T.MathUtils.smoothstep(age, 0, 2) *
    Math.pow(
      0.5 +
        0.5 *
          Math.sin(
            (shoulder +
              wakeDistance * 0.32 +
              Math.sin(distance * 0.013 + cross * 0.008) * 21) *
              0.031 -
              age * 2.6,
          ),
      1.7,
    ) *
    reach *
    (2 + emergence * 6 + dive * 4);
  return (
    settling * (core * (head + tail) * 19 * (1 - breach * 0.65) + berm + ripple)
  );
}

// One material-batched receiving body for all four sources. Subdividing the
// existing terrain triangles preserves their exact contact plane everywhere;
// only the low irregular deposit rises above it, with its outer skirt buried.
function impactBedLift(x, z, sourceIndex) {
  const v = z - x * 0.15;
  const angle = Math.atan2(v / 16, x / 14);
  const broken =
    1 +
    Math.sin(angle * 3 + sourceIndex) * 0.12 +
    Math.cos(angle * 5 - sourceIndex) * 0.08;
  const radius = Math.hypot(x / 14, v / 16) / broken;
  return 2.6 * Math.pow(Math.max(0, 1 - radius * radius), 1.3);
}

function impactBedPoint(frame, origin, survey, sourceIndex, radius, angle) {
  const broken =
    1 +
    Math.sin(angle * 3 + sourceIndex) * 0.12 +
    Math.cos(angle * 5 - sourceIndex) * 0.08;
  const x = Math.cos(angle) * radius * 14 * broken;
  const z = Math.sin(angle) * radius * 16 * broken + x * 0.15;
  const point = origin
    .clone()
    .addScaledVector(frame.right, x)
    .addScaledVector(frame.forward, z);
  point.y =
    survey.heightAt(point.x, point.z) + impactBedLift(x, z, sourceIndex) - 0.04;
  return point;
}

function createSandfallReceivingBeds(
  track,
  survey,
  materials,
  resources,
  falls,
) {
  const positions = [],
    colors = [],
    indices = [];
  const colorAt = createTerrainColorSampler();
  const source = survey.meshData;
  const subdivisions = 8;
  for (const [sourceIndex, [s, lateral]] of falls.entries()) {
    const frame = horizontalFrame(track, s);
    const origin = frame.position.clone().addScaledVector(frame.right, lateral);
    for (let t = 0; t < source.indices.length; t += 3) {
      const vertices = [0, 1, 2].map((offset) => {
        const n = source.indices[t + offset] * 3;
        return {
          x: source.positions[n],
          y: source.positions[n + 1],
          z: source.positions[n + 2],
        };
      });
      if (
        Math.max(...vertices.map((p) => p.x)) < origin.x - 25 ||
        Math.min(...vertices.map((p) => p.x)) > origin.x + 25 ||
        Math.max(...vertices.map((p) => p.z)) < origin.z - 25 ||
        Math.min(...vertices.map((p) => p.z)) > origin.z + 25
      )
        continue;
      const palette = vertices.map((p) => colorAt(p.x, p.z).clone());
      const rows = [];
      for (let i = 0; i <= subdivisions; i++) {
        rows[i] = [];
        for (let j = 0; j <= subdivisions - i; j++) {
          const weights = [
            1 - (i + j) / subdivisions,
            i / subdivisions,
            j / subdivisions,
          ];
          const point = { x: 0, y: 0, z: 0 };
          for (const [n, weight] of weights.entries()) {
            point.x += vertices[n].x * weight;
            point.y += vertices[n].y * weight;
            point.z += vertices[n].z * weight;
          }
          const dx = point.x - origin.x,
            dz = point.z - origin.z;
          const x = dx * frame.right.x + dz * frame.right.z;
          const z = dx * frame.forward.x + dz * frame.forward.z;
          rows[i][j] = positions.length / 3;
          positions.push(
            point.x,
            point.y + impactBedLift(x, z, sourceIndex) - 0.04,
            point.z,
          );
          colors.push(
            ...['r', 'g', 'b'].map((channel) =>
              palette.reduce(
                (sum, color, n) => sum + color[channel] * weights[n],
                0,
              ),
            ),
          );
        }
      }
      for (let i = 0; i < subdivisions; i++) {
        for (let j = 0; j < subdivisions - i; j++) {
          indices.push(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
          if (j < subdivisions - i - 1)
            indices.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
        }
      }
    }
  }
  const geometry = resources.geometry(new T.BufferGeometry());
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const substrate = materials.terrain ?? materials.sand;
  const material = resources.material(substrate.clone());
  material.name = 'Saffron / matte sandfall receiving deposits';
  material.vertexColors = true;
  material.roughness = 0.97;
  material.onBeforeCompile = substrate.onBeforeCompile;
  material.customProgramCacheKey = () => substrate.customProgramCacheKey();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Saffron / terrain-seated sandfall receiving fans';
  mesh.receiveShadow = true;
  return mesh;
}

export function createDesertEffects(
  track,
  survey,
  materials,
  resources,
  burrower,
) {
  const group = new T.Group();
  group.name = 'Saffron / living moving ridge and bone sandfalls';
  const path = createGrazerPath(track, survey);
  const ridgeStart = -620;
  const ridgeEnd = path.length + 320;
  const ridgeGeometry = resources.geometry(new T.BufferGeometry());
  const source = survey.meshData;
  const liftedHeights = Float32Array.from(
    { length: source.positions.length / 3 },
    (_, index) => source.positions[index * 3 + 1],
  );
  const remap = new Map();
  const ridgePositions = [],
    ridgeIndices = [],
    ridgeColors = [],
    ridgeAlpha = [];
  const colorAt = createTerrainColorSampler();
  const rest = [];
  const projected = new Map();
  function sourceVertex(index) {
    if (projected.has(index)) return projected.get(index);
    const [x, y, z] = source.positions.subarray(index * 3, index * 3 + 3);
    const dx = x - path.start.x,
      dz = z - path.start.z;
    const vertex = {
      index,
      x,
      y: y - 0.04,
      z,
      distance: dx * path.forward.x + dz * path.forward.z,
      cross: (dx * path.right.x + dz * path.right.z) / SAND_HALF_WIDTH,
    };
    projected.set(index, vertex);
    return vertex;
  }
  // Reuse the displayed terrain's triangles exactly. Resampling an unrelated
  // dense plane was a different surface between survey vertices and exposed
  // its rectangular extent even when no mound was present.
  for (let i = 0; i < source.indices.length; i += 3) {
    const triangle = source.indices.slice(i, i + 3);
    const vertices = triangle.map(sourceVertex);
    if (
      Math.max(...vertices.map((p) => p.distance)) < ridgeStart ||
      Math.min(...vertices.map((p) => p.distance)) > ridgeEnd ||
      Math.max(...vertices.map((p) => p.cross)) < -1 ||
      Math.min(...vertices.map((p) => p.cross)) > 1
    )
      continue;
    for (const index of triangle) {
      if (!remap.has(index)) {
        const vertex = sourceVertex(index);
        remap.set(index, rest.length);
        rest.push(vertex);
        ridgePositions.push(vertex.x, vertex.y, vertex.z);
        colorAt(vertex.x, vertex.z).toArray(ridgeColors, ridgeColors.length);
        ridgeAlpha.push(0);
      }
      ridgeIndices.push(remap.get(index));
    }
  }
  ridgeGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(ridgePositions, 3),
  );
  ridgeGeometry.setAttribute(
    'color',
    new T.Float32BufferAttribute(ridgeColors, 3),
  );
  ridgeGeometry.setAttribute(
    'sandLiftAlpha',
    new T.Float32BufferAttribute(ridgeAlpha, 1),
  );
  ridgeGeometry.setIndex(ridgeIndices);
  ridgeGeometry.computeVertexNormals();
  const ridgeVertices = ridgeGeometry.attributes.position;
  const alphaVertices = ridgeGeometry.attributes.sandLiftAlpha;
  const substrate = materials.terrain ?? materials.sand;
  const ridgeMaterial = resources.material(substrate.clone());
  ridgeMaterial.name = 'Saffron / terrain-matched lifted sand';
  ridgeMaterial.transparent = true;
  ridgeMaterial.depthWrite = false;
  ridgeMaterial.vertexColors = true;
  const finish = substrate.onBeforeCompile;
  ridgeMaterial.onBeforeCompile = (shader) => {
    finish.call(substrate, shader);
    shader.vertexShader =
      `attribute float sandLiftAlpha; varying float vSandLiftAlpha;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSandLiftAlpha=sandLiftAlpha;',
      );
    shader.fragmentShader =
      `varying float vSandLiftAlpha;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a*=vSandLiftAlpha;',
      );
  };
  ridgeMaterial.customProgramCacheKey = () =>
    `saffron-terrain-lift-v2-${substrate.customProgramCacheKey()}`;
  const ridge = new T.Mesh(ridgeGeometry, ridgeMaterial);
  ridge.name = 'Saffron / deforming ridge raised by subsurface burrower';
  ridge.receiveShadow = true;
  ridge.frustumCulled = false;
  group.add(ridge);

  const positions = [];
  const phases = [];
  const drops = [];
  const kinds = [];
  const random = randomSequence(0x34ad);
  const falls = sandfallAnchors(track);
  group.add(
    createSandfallReceivingBeds(track, survey, materials, resources, falls),
  );
  for (const [sourceIndex, [s, lateral, height]] of falls.entries()) {
    const frame = horizontalFrame(track, s);
    const origin = frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(UP, height);
    const drop = origin.y - survey.heightAt(origin.x, origin.z);
    for (let i = 0; i < 135; i++) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, lateral + (random() - 0.5) * 10)
        .addScaledVector(frame.forward, (random() - 0.5) * 7)
        .addScaledVector(UP, height);
      positions.push(...position.toArray());
      phases.push(random());
      drops.push(drop);
      kinds.push(0);
    }
    for (let i = 0; i < 80; i++) {
      const radius = Math.sqrt(random()) * 0.88;
      const angle = random() * Math.PI * 2;
      const p = impactBedPoint(
        frame,
        origin,
        survey,
        sourceIndex,
        radius,
        angle,
      );
      p.y += 0.14;
      positions.push(...p.toArray());
      phases.push(random());
      drops.push(random());
      kinds.push(1);
    }
  }
  // Interleave sources and grain/dust samples so the low draw range covers
  // every fall instead of dropping entire emitters from the end of the buffer.
  const perFall = phases.length / falls.length,
    order = [];
  for (let i = 0; i < perFall; i++)
    for (let f = 0; f < falls.length; f++)
      order.push(f * perFall + ((i * 71) % perFall));
  for (const [array, stride] of [
    [positions, 3],
    [phases, 1],
    [drops, 1],
    [kinds, 1],
  ]) {
    const reordered = order.flatMap((index) =>
      array.slice(index * stride, index * stride + stride),
    );
    array.splice(0, array.length, ...reordered);
  }
  const grainsGeometry = resources.geometry(new T.BufferGeometry());
  grainsGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  grainsGeometry.setAttribute('kind', new T.Float32BufferAttribute(kinds, 1));
  grainsGeometry.setAttribute('drop', new T.Float32BufferAttribute(drops, 1));
  grainsGeometry.setAttribute('phase', new T.Float32BufferAttribute(phases, 1));
  const grainsMaterial = resources.material(
    new T.ShaderMaterial({
      name: 'Saffron / sparse sandfall grains',
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, strength: { value: 0.5 } },
      vertexShader: `attribute float kind; attribute float phase; attribute float drop; uniform float time; uniform float strength; varying float opacity; varying float grainKind; void main(){ float age=fract(phase+time*.064); vec3 p=position; p.y-=age*age*drop; p.x+=sin(phase*31.+age*3.)*age*2.;if(kind>.5){p=position+vec3(0.,sin(age*3.14159)*(1.+drop*3.),0.);} vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v; gl_PointSize=clamp(850./max(-v.z,1.),.65,1.8); opacity=sin(age*3.14159)*strength*.75;grainKind=kind;if(kind>.5){gl_PointSize=clamp(7200.*(.55+age*.75)/max(-v.z,1.),4.,32.);opacity*=.14;} }`,
      fragmentShader: `varying float opacity; varying float grainKind; void main(){float r=length(gl_PointCoord-.5)*2.;vec3 sandColor=mix(vec3(.34,.22,.105),vec3(.42,.31,.18),grainKind);gl_FragColor=vec4(sandColor,exp(-r*r*3.8)*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    }),
  );
  const grains = new T.Points(grainsGeometry, grainsMaterial);
  grains.name = 'Saffron / slow gold grains falling through fossil apertures';
  grains.frustumCulled = false;
  group.add(grains);
  const disturbanceGeometry = resources.geometry(new T.BufferGeometry());
  const disturbanceSeeds = new Float32Array(320 * 3);
  for (let i = 0; i < disturbanceSeeds.length; i++)
    disturbanceSeeds[i] = random();
  disturbanceGeometry.setAttribute(
    'position',
    new T.BufferAttribute(
      new Float32Array(disturbanceSeeds.length),
      3,
    ).setUsage(T.DynamicDrawUsage),
  );
  disturbanceGeometry.setAttribute(
    'seed',
    new T.BufferAttribute(disturbanceSeeds, 3),
  );
  const disturbanceMaterial = resources.material(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { clock: { value: 0 }, strength: { value: 0 } },
      vertexShader: `
        attribute vec3 seed; uniform float clock; uniform float strength; varying float alpha;
        void main() {
          float age=fract(seed.y+clock*.31);
          float broad=step(.76,seed.z);
          float grain=step(.44,seed.z)*(1.-broad);
          vec4 v=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*v;
          float dustSize=mix(clamp(18000./max(1.,-v.z),5.,34.),clamp(29000./max(1.,-v.z),8.,44.),broad);
          gl_PointSize=mix(dustSize,clamp(1350./max(1.,-v.z),.7,2.),grain);
          alpha=strength*sin(age*3.14159)*mix(mix(.075,.18,grain),.085,broad);
        }`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.52,.35,.17,alpha*exp(-r*r*3.6));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    }),
  );
  const disturbance = new T.Points(disturbanceGeometry, disturbanceMaterial);
  disturbance.name = 'Saffron / sand disturbed by the actual breach';
  disturbance.frustumCulled = false;
  group.add(disturbance);
  let lastPresentation = sampleBurrower(-1);
  let lastAge = null;
  let lastMotion = null;
  let lastDustAge = null;
  let disposed = false;
  function update({
    time = 0,
    state,
    motion,
    settings = {},
    reviewing = false,
  } = {}) {
    if (disposed) return;
    const simulation = motion?.motion?.saffron ?? motion?.saffron;
    const age = simulation
      ? simulation.grazer?.startedAt == null
        ? -1
        : Math.max(0, time - simulation.grazer.startedAt)
      : state
        ? -1
        : time;
    const event = sampleBurrower(age);
    const travel = path.length * event.traveling;
    const motionAmount = settings.reducedMotion ? 0 : 1;
    lastPresentation = event;
    if (age !== lastAge || motionAmount !== lastMotion) {
      for (let k = 0; k < rest.length; k++) {
        const p = rest[k];
        const edge =
          T.MathUtils.smoothstep(p.distance, ridgeStart, ridgeStart + 100) *
          (1 - T.MathUtils.smoothstep(p.distance, ridgeEnd - 100, ridgeEnd)) *
          (1 - T.MathUtils.smoothstep(Math.abs(p.cross), 0.78, 1));
        const lift =
          edge *
          sandDisplacement(
            p.distance,
            p.cross * SAND_HALF_WIDTH,
            age,
            travel,
            event.breach,
            motionAmount,
          );
        ridgeVertices.setXYZ(k, p.x, p.y + lift, p.z);
        liftedHeights[p.index] = p.y + lift;
        alphaVertices.setX(k, T.MathUtils.smoothstep(lift, 0.06, 0.75) * edge);
      }
      ridgeVertices.needsUpdate = true;
      alphaVertices.needsUpdate = true;
      ridgeGeometry.computeVertexNormals();
      lastAge = age;
      lastMotion = motionAmount;
    }
    const groundHeight = path.heightAt(travel);
    burrower.scale.setScalar(1);
    burrower.position.copy(path.start).addScaledVector(path.forward, travel);
    burrower.position.y = groundHeight - 58 + event.breach * 60;
    burrower.quaternion.copy(path.quaternion);
    burrower.userData.setPose?.(time, {
      age,
      travel,
      path,
      groundHeight,
      exposure: event.breach,
      motion: motionAmount,
    });
    burrower.visible = age > 2 && age < 20 && !reviewing;
    ridge.visible = age >= 0 && age < GRAZER_DURATION && !reviewing;
    disturbance.position.copy(burrower.position);
    disturbance.position.y = groundHeight + 1;
    disturbance.quaternion.copy(path.quaternion);
    disturbance.visible =
      age > 2 && age < 22 && !settings.reducedMotion && !reviewing;
    if (disturbance.visible && age !== lastDustAge) {
      const positions = disturbanceGeometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const sx = disturbanceSeeds[i * 3],
          sy = disturbanceSeeds[i * 3 + 1],
          sz = disturbanceSeeds[i * 3 + 2];
        const phase = (sy + age * 0.31) % 1;
        const side = sx > 0.5 ? 1 : -1;
        const broad = sz >= 0.76;
        const trail = sz * 180;
        const x =
          side * (broad ? 70 + phase * 70 : 48 + phase * 27 - trail * 0.06);
        const z = broad
          ? -80 - trail * 0.9 - phase * 45
          : 45 - trail - phase * 24;
        const lift = broad
          ? phase * (4 + sx * 8)
          : Math.sin(phase * Math.PI) * (2 + sx * 7);
        const worldX =
          path.start.x + path.forward.x * (travel + z) + path.right.x * x;
        const worldZ =
          path.start.z + path.forward.z * (travel + z) + path.right.z * x;
        // Powder peels from the actual moving surface. A head-height origin
        // buried tail particles in rising terrain and in the creature's berms.
        const surface = Math.max(
          survey.heightAt(worldX, worldZ),
          survey.heightAt(worldX, worldZ, liftedHeights),
        );
        positions.setXYZ(i, x, surface + lift + 2 - disturbance.position.y, z);
      }
      positions.needsUpdate = true;
      lastDustAge = age;
    }
    disturbanceGeometry.setDrawRange(0, settings.quality === 'low' ? 120 : 320);
    disturbanceMaterial.uniforms.clock.value = Math.max(0, age);
    disturbanceMaterial.uniforms.strength.value = Math.max(
      event.breach,
      age > 10 ? 1 - T.MathUtils.smoothstep(age, 17, 22) : 0,
    );
    grains.visible = !settings.reducedMotion && !reviewing;
    grainsGeometry.setDrawRange(
      0,
      settings.quality === 'low' ? 430 : phases.length,
    );
    grainsMaterial.uniforms.time.value = time;
    grainsMaterial.uniforms.strength.value = 0.25 + event.breach * 0.1;
    group.visible = !reviewing;
  }
  update();
  return {
    group,
    update,
    getPresentation: () => ({
      ...lastPresentation,
      active: burrower.visible,
      pathStart: path.start.toArray(),
      pathEnd: path.start
        .clone()
        .addScaledVector(path.forward, path.length)
        .toArray(),
      forward: path.forward.toArray(),
      travel: path.length * lastPresentation.traveling,
      position: burrower.position.toArray(),
      eventDuration: GRAZER_DURATION,
      triggerPolicy: 'once-per-lap',
      disturbanceWidth: SAND_HALF_WIDTH * 2,
      sandfallCount: falls.length,
      pointsHigh: phases.length,
      pointsLow: 430,
    }),
    dispose() {
      disposed = true;
      group.clear();
    },
  };
}

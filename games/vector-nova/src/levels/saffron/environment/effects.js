import * as T from 'three';
import { sandfallAnchors } from './fossils.js';
import { horizontalFrame, randomSequence, UP } from './geometry.js';

import { sampleBurrower, GRAZER_DURATION } from '../grazer.js';
import { createGrazerPath } from './grazer-path.js';
export { sampleBurrower } from '../grazer.js';

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
  const ridgeStart = -500;
  const ridgeEnd = path.length + 160;
  const rows = 120;
  const columns = 8;
  const ridgeGeometry = resources.geometry(
    new T.PlaneGeometry(1, 1, rows, columns),
  );
  const ridgeVertices = ridgeGeometry.attributes.position;
  const rest = [];
  for (let j = 0; j <= columns; j++) {
    for (let i = 0; i <= rows; i++) {
      const distance = T.MathUtils.lerp(ridgeStart, ridgeEnd, i / rows);
      const cross = (j / columns - 0.5) * 2;
      const p = path.start
        .clone()
        .addScaledVector(path.forward, distance)
        .addScaledVector(path.right, cross * 90);
      p.y = survey.heightAt(p.x, p.z) - 0.7;
      rest.push({ x: p.x, y: p.y, z: p.z, distance, cross });
    }
  }
  const ridge = new T.Mesh(ridgeGeometry, materials.sand);
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
  for (const [s, lateral, height] of falls) {
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
      const p = origin.clone();
      p.y = survey.heightAt(p.x, p.z) + 1;
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
      vertexShader: `attribute float kind; attribute float phase; attribute float drop; uniform float time; uniform float strength; varying float opacity; void main(){ float age=fract(phase+time*.064); vec3 p=position; p.y-=age*age*drop; p.x+=sin(phase*31.+age*3.)*age*2.;if(kind>.5){float a=phase*61.;p=position+vec3(cos(a)*(4.+age*22.),age*(4.+drop*9.),sin(a)*(3.+age*14.));} vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v; gl_PointSize=clamp(1100./max(-v.z,1.),1.2,3.2); opacity=sin(age*3.14159)*strength;if(kind>.5){gl_PointSize=clamp(7200./max(-v.z,1.),5.,42.);opacity*=.12;} }`,
      fragmentShader: `varying float opacity; void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.82,.65,.39,(1.-smoothstep(.25,1.,r))*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
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
    new T.BufferAttribute(disturbanceSeeds, 3),
  );
  const disturbanceMaterial = resources.material(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { clock: { value: 0 }, strength: { value: 0 } },
      vertexShader: `uniform float clock;uniform float strength;varying float alpha;void main(){float age=fract(position.y+clock*.31);float side=position.x>.5?1.:-1.;float grain=step(.44,position.z);float trail=position.z*180.;vec3 p=vec3(side*(48.+age*25.-trail*.08),sin(age*3.14159)*(3.+position.x*10.),64.-trail-age*26.);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=mix(clamp(8500./max(1.,-v.z),3.,27.),clamp(1800./max(1.,-v.z),1.,4.),grain);alpha=strength*sin(age*3.14159)*mix(.07,.4,grain);}`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.65,.46,.24,alpha*(1.-smoothstep(.1,1.,r)));}`,
    }),
  );
  const disturbance = new T.Points(disturbanceGeometry, disturbanceMaterial);
  disturbance.name = 'Saffron / sand disturbed by the actual breach';
  disturbance.frustumCulled = false;
  group.add(disturbance);
  let lastPresentation = sampleBurrower(-1);
  let lastAge = null;
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
    lastPresentation = event;
    if (age !== lastAge) {
      for (let k = 0; k < rest.length; k++) {
        const p = rest[k];
        const head = Math.exp(-(((p.distance - travel - 30) / 65) ** 2));
        const tail =
          Math.exp(-(((p.distance - travel + 130) / 190) ** 2)) * 0.55;
        const across = Math.max(0, 1 - p.cross * p.cross) ** 2;
        const settling =
          (age >= 0 ? 1 : 0) *
          (1 - T.MathUtils.smoothstep(age, 20, GRAZER_DURATION));
        const passed =
          T.MathUtils.smoothstep(travel - p.distance, 50, 140) *
          T.MathUtils.smoothstep(p.distance, -60, 80);
        const berm =
          Math.exp(-(((Math.abs(p.cross) - 0.64) / 0.17) ** 2)) * passed * 4;
        ridgeVertices.setXYZ(
          k,
          p.x,
          p.y +
            settling *
              (across * (head + tail) * 19 * (1 - event.breach * 0.65) + berm),
          p.z,
        );
      }
      ridgeVertices.needsUpdate = true;
      ridgeGeometry.computeVertexNormals();
      lastAge = age;
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
      motion: settings.reducedMotion ? 0 : 1,
    });
    burrower.visible = age > 2 && age < 20 && !reviewing;
    disturbance.position.copy(burrower.position);
    disturbance.position.y = groundHeight + 1;
    disturbance.quaternion.copy(path.quaternion);
    disturbance.visible =
      age > 2 && age < 22 && !settings.reducedMotion && !reviewing;
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
    grainsMaterial.uniforms.strength.value = 0.4 + event.breach * 0.18;
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

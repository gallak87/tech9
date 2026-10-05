import * as T from 'three';
import { sandfallAnchors } from './fossils.js';
import { horizontalFrame, randomSequence, UP } from './geometry.js';

import { sampleBurrower, GRAZER_DURATION } from '../grazer.js';
import { createGrazerPath } from './grazer-path.js';
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
  const berm = Math.exp(-(((Math.abs(cross) - 110) / 24) ** 2)) * passed * 5;
  const radius = Math.hypot((distance - travel) * 0.9, cross);
  const ring =
    T.MathUtils.smoothstep(radius, 70, 110) *
    (1 - T.MathUtils.smoothstep(radius, 220, 310));
  const emergence = Math.exp(-(((age - 3.5) / 1.5) ** 2));
  const dive = Math.exp(-(((age - 12) / 2) ** 2));
  const ripple =
    motion *
    T.MathUtils.smoothstep(age, 0, 2) *
    (0.5 + 0.5 * Math.sin(radius * 0.065 - age * 5)) *
    ring *
    (4 + emergence * 8 + dive * 6);
  return (
    settling * (core * (head + tail) * 19 * (1 - breach * 0.65) + berm + ripple)
  );
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
  const rows = 160;
  const columns = 32;
  const ridgeGeometry = resources.geometry(
    new T.PlaneGeometry(1, 1, rows, columns),
  );
  // Replacing the plane's XY positions with forward/right XZ coordinates
  // reverses its winding. Keep the displaced surface visible from above.
  const indices = ridgeGeometry.index;
  for (let i = 0; i < indices.count; i += 3) {
    const second = indices.getX(i + 1);
    indices.setX(i + 1, indices.getX(i + 2));
    indices.setX(i + 2, second);
  }
  const ridgeVertices = ridgeGeometry.attributes.position;
  const rest = [];
  for (let j = 0; j <= columns; j++) {
    for (let i = 0; i <= rows; i++) {
      const distance = T.MathUtils.lerp(ridgeStart, ridgeEnd, i / rows);
      const cross = (j / columns - 0.5) * 2;
      const p = path.start
        .clone()
        .addScaledVector(path.forward, distance)
        .addScaledVector(path.right, cross * SAND_HALF_WIDTH);
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
      vertexShader: `
        uniform float clock; uniform float strength; varying float alpha;
        void main() {
          float age=fract(position.y+clock*.31);
          float side=position.x>.5?1.:-1.;
          float broad=step(.76,position.z);
          float grain=step(.44,position.z)*(1.-broad);
          float trail=position.z*180.;
          vec3 p=vec3(side*(48.+age*25.-trail*.08),sin(age*3.14159)*(3.+position.x*10.),64.-trail-age*26.);
          float angle=position.x*6.2831853;
          float radius=100.+age*170.;
          vec3 ring=vec3(cos(angle)*radius,age*(10.+position.x*8.),sin(angle)*radius-10.);
          p=mix(p,ring,broad);
          vec4 v=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*v;
          float dustSize=mix(clamp(8500./max(1.,-v.z),3.,27.),clamp(15500./max(1.,-v.z),6.,42.),broad);
          gl_PointSize=mix(dustSize,clamp(1800./max(1.,-v.z),1.,4.),grain);
          alpha=strength*sin(age*3.14159)*mix(mix(.07,.4,grain),.11,broad);
        }`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.65,.46,.24,alpha*(1.-smoothstep(.1,1.,r)));}`,
    }),
  );
  const disturbance = new T.Points(disturbanceGeometry, disturbanceMaterial);
  disturbance.name = 'Saffron / sand disturbed by the actual breach';
  disturbance.frustumCulled = false;
  group.add(disturbance);
  let lastPresentation = sampleBurrower(-1);
  let lastAge = null;
  let lastMotion = null;
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
        ridgeVertices.setXYZ(
          k,
          p.x,
          p.y +
            sandDisplacement(
              p.distance,
              p.cross * SAND_HALF_WIDTH,
              age,
              travel,
              event.breach,
              motionAmount,
            ),
          p.z,
        );
      }
      ridgeVertices.needsUpdate = true;
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

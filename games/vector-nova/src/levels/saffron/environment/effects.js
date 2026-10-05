import * as T from 'three';
import { sandfallAnchors } from './fossils.js';
import {
  horizontalFrame,
  randomSequence,
  routePosition,
  UP,
} from './geometry.js';

/** Pure clock; paused frames reuse time, and replay/reset requires no history. */
export function sampleBurrower(time = 0) {
  const age = ((time % 48) + 48) % 48;
  const traveling = T.MathUtils.smoothstep(age, 0, 29);
  const breach = Math.sin(Math.PI * T.MathUtils.clamp((age - 25) / 14, 0, 1));
  return {
    age,
    traveling,
    breach,
    phase:
      age < 25
        ? 'moving-ridge'
        : age < 33
          ? 'breaching'
          : age < 39
            ? 'diving'
            : 'settling',
    intensity: Math.max(0.12, breach),
  };
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
  const ridgeStart = track.landmarks.vistaStart - 180;
  const ridgeEnd = track.landmarks.vistaEnd - 30;
  const rows = 120;
  const columns = 8;
  const ridgeGeometry = resources.geometry(
    new T.PlaneGeometry(1, 1, rows, columns),
  );
  const ridgeVertices = ridgeGeometry.attributes.position;
  const rest = [];
  for (let j = 0; j <= columns; j++) {
    for (let i = 0; i <= rows; i++) {
      const s = T.MathUtils.lerp(ridgeStart, ridgeEnd, i / rows);
      const frame = horizontalFrame(track, s);
      const lateral =
        -110 -
        (i / rows) ** 3 * 120 +
        Math.sin((i / rows) * Math.PI) * 32 +
        (0.5 - j / columns) * 88;
      const p = frame.position.clone().addScaledVector(frame.right, lateral);
      p.y = survey.heightAt(p.x, p.z) - 1.8;
      rest.push({
        x: p.x,
        y: p.y,
        z: p.z,
        i: i / rows,
        cross: (j / columns - 0.5) * 2,
      });
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
      vertexShader: `uniform float clock;uniform float strength;varying float alpha;void main(){float age=fract(position.y+clock*.11);float a=position.x*6.283;float radius=18.+age*70.;vec3 p=vec3(cos(a)*radius,age*(35.+position.z*60.),sin(a)*radius);p.x+=age*age*18.;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(12000./max(1.,-v.z),4.,36.);alpha=strength*sin(age*3.14159)*.055;}`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.65,.46,.24,alpha*(1.-smoothstep(.1,1.,r)));}`,
    }),
  );
  const disturbance = new T.Points(disturbanceGeometry, disturbanceMaterial);
  disturbance.name = 'Saffron / sand disturbed by the actual breach';
  disturbance.frustumCulled = false;
  group.add(disturbance);
  let lastPresentation = sampleBurrower(0);
  let disposed = false;
  function update({ time = 0, state, settings = {}, reviewing = false } = {}) {
    if (disposed) return;
    const d = state
      ? ((state.distance % track.length) + track.length) % track.length
      : null;
    const routePhase =
      d === null
        ? null
        : T.MathUtils.clamp(
            (d - (track.landmarks.vistaStart - 100)) /
              (track.landmarks.vistaEnd - track.landmarks.vistaStart + 120),
            0,
            1,
          );
    const event = sampleBurrower(
      routePhase === null ? time : 5 + routePhase * 38,
    );
    lastPresentation = event;
    const s =
      routePhase === null
        ? T.MathUtils.lerp(ridgeStart, ridgeEnd, event.traveling)
        : T.MathUtils.clamp(d + 240, ridgeStart, ridgeEnd + 100);
    const current = T.MathUtils.clamp(
      (s - ridgeStart) / (ridgeEnd - ridgeStart),
      0,
      1,
    );
    for (let k = 0; k < rest.length; k++) {
      const p = rest[k];
      const head = Math.exp(-(((p.i - current) / 0.12) ** 2));
      const tail = Math.exp(-(((p.i - current + 0.13) / 0.2) ** 2)) * 0.45;
      const across = Math.max(0, 1 - p.cross * p.cross) ** 2;
      ridgeVertices.setXYZ(
        k,
        p.x,
        p.y +
          across *
            (head + tail) *
            57 *
            (1 - event.breach * 0.4) *
            (1 - T.MathUtils.smoothstep(event.age, 37, 43)),
        p.z,
      );
    }
    ridgeVertices.needsUpdate = true;
    ridgeGeometry.computeVertexNormals();
    const frame = horizontalFrame(track, s);
    const position = routePosition(
      track,
      s,
      -110 -
        event.traveling ** 3 * 120 +
        Math.sin(event.traveling * Math.PI) * 32,
    );
    position.y =
      survey.heightAt(position.x, position.z) - 54 + event.breach * 154;
    if (d !== null) {
      const drivingFrame = horizontalFrame(track, d);
      position
        .copy(drivingFrame.position)
        .addScaledVector(drivingFrame.forward, 380)
        .addScaledVector(drivingFrame.right, -240);
      position.y =
        survey.heightAt(position.x, position.z) - 62 + event.breach * 158;
      frame.quaternion.copy(drivingFrame.quaternion);
    }
    burrower.scale.setScalar(0.82);
    burrower.position.copy(position);
    burrower.quaternion
      .copy(frame.quaternion)
      .multiply(new T.Quaternion().setFromAxisAngle(UP, 0.12));
    burrower.rotateX(-event.breach * 0.05);
    burrower.userData.setPose?.(
      settings.reducedMotion ? 0 : time,
      settings.reducedMotion ? 0.2 : event.breach,
    );
    burrower.visible = event.breach > 0.035 && !reviewing;
    disturbance.position.copy(position);
    disturbance.position.y = survey.heightAt(position.x, position.z) + 1;
    disturbance.visible =
      event.breach > 0.03 && !settings.reducedMotion && !reviewing;
    disturbanceGeometry.setDrawRange(0, settings.quality === 'low' ? 120 : 320);
    disturbanceMaterial.uniforms.clock.value = time;
    disturbanceMaterial.uniforms.strength.value = event.breach;
    grains.visible = !settings.reducedMotion && !reviewing;
    grainsGeometry.setDrawRange(
      0,
      settings.quality === 'low' ? 430 : phases.length,
    );
    grainsMaterial.uniforms.time.value = time;
    grainsMaterial.uniforms.strength.value = 0.4 + event.breach * 0.38;
    group.visible = !reviewing;
  }
  update();
  return {
    group,
    update,
    getPresentation: () => ({
      ...lastPresentation,
      active: burrower.visible,
      ridgeRouteStart: ridgeStart,
      ridgeRouteEnd: ridgeEnd,
      position: burrower.position.toArray(),
      eventPeriod: 48,
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

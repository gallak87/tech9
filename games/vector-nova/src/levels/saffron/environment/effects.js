import * as T from 'three';
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
        -285 + Math.sin((i / rows) * Math.PI) * 32 + (0.5 - j / columns) * 88;
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
  const random = randomSequence(0x34ad);
  const falls = [
    [track.landmarks.sandfall - 40, -58, 60],
    [track.landmarks.sandfall + 80, -58, 73],
    [track.landmarks.skullStart + 60, 58, 72],
    [track.landmarks.skullEnd - 80, -58, 76],
  ];
  for (const [s, lateral, height] of falls) {
    const frame = horizontalFrame(track, s);
    for (let i = 0; i < 135; i++) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, lateral + (random() - 0.5) * 10)
        .addScaledVector(frame.forward, (random() - 0.5) * 7)
        .addScaledVector(UP, height);
      positions.push(...position.toArray());
      phases.push(random());
    }
  }
  const grainsGeometry = resources.geometry(new T.BufferGeometry());
  grainsGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  grainsGeometry.setAttribute('phase', new T.Float32BufferAttribute(phases, 1));
  const grainsMaterial = resources.material(
    new T.ShaderMaterial({
      name: 'Saffron / sparse sandfall grains',
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, strength: { value: 0.5 } },
      vertexShader: `attribute float phase; uniform float time; uniform float strength; varying float opacity; void main(){ float age=fract(phase+time*.064); vec3 p=position; p.y-=age*age*84.; p.x+=sin(phase*31.+age*3.)*age*2.; vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v; gl_PointSize=clamp(1100./max(-v.z,1.),1.2,3.2); opacity=sin(age*3.14159)*strength; }`,
      fragmentShader: `varying float opacity; void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.82,.65,.39,(1.-smoothstep(.25,1.,r))*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    }),
  );
  const grains = new T.Points(grainsGeometry, grainsMaterial);
  grains.name = 'Saffron / slow gold grains falling through fossil apertures';
  grains.frustumCulled = false;
  group.add(grains);
  let lastPresentation = sampleBurrower(0);
  let disposed = false;
  function update({ time = 0, settings = {}, reviewing = false } = {}) {
    if (disposed) return;
    const event = sampleBurrower(time);
    lastPresentation = event;
    const current = event.traveling;
    for (let k = 0; k < rest.length; k++) {
      const p = rest[k];
      const head = Math.exp(-(((p.i - current) / 0.12) ** 2));
      const tail = Math.exp(-(((p.i - current + 0.13) / 0.2) ** 2)) * 0.45;
      const across = Math.max(0, 1 - p.cross * p.cross) ** 2;
      ridgeVertices.setXYZ(
        k,
        p.x,
        p.y + across * (head + tail) * 17 * (1 - event.breach * 0.32),
        p.z,
      );
    }
    ridgeVertices.needsUpdate = true;
    ridgeGeometry.computeVertexNormals();
    const s = T.MathUtils.lerp(ridgeStart, ridgeEnd, event.traveling);
    const frame = horizontalFrame(track, s);
    const position = routePosition(
      track,
      s,
      -285 + Math.sin(event.traveling * Math.PI) * 32,
    );
    position.y =
      survey.heightAt(position.x, position.z) - 54 + event.breach * 139;
    burrower.position.copy(position);
    burrower.quaternion
      .copy(frame.quaternion)
      .multiply(new T.Quaternion().setFromAxisAngle(UP, Math.PI));
    burrower.rotateX(-event.breach * 0.2);
    burrower.userData.setPose?.(
      settings.reducedMotion ? 0 : time,
      settings.reducedMotion ? 0.2 : event.breach,
    );
    burrower.visible = event.breach > 0.035 && !reviewing;
    grains.visible = !settings.reducedMotion && !reviewing;
    grainsGeometry.setDrawRange(
      0,
      settings.quality === 'low' ? 270 : phases.length,
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
      pointsLow: 270,
    }),
    dispose() {
      disposed = true;
      group.clear();
    },
  };
}

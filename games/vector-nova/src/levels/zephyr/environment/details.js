import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundFrame } from '../../../environment/placement.js';
import { beamTransform } from '../../../track/geometry.js';
import { finishZephyrMaterial } from './materials.js';

export function createZephyrDetails({ track, stoneTexture }) {
  const group = new T.Group();
  group.name = 'Zephyr / attached abutments and curtain spray';
  const stone = new T.MeshStandardMaterial({
    name: 'Zephyr carved plinth stone',
    color: '#8e8475',
    roughness: 0.85,
  });
  const bronze = new T.MeshStandardMaterial({
    name: 'Zephyr aged bronze connections',
    color: '#926846',
    metalness: 0.72,
    roughness: 0.4,
  });
  finishZephyrMaterial(stone, { stoneTexture });
  finishZephyrMaterial(bronze);
  const boxes = [],
    ties = [];
  const unit = new T.BoxGeometry(1, 1, 1);
  const matrix = new T.Matrix4();
  function point(s, x, y, z = 0) {
    const f = groundFrame(track, s);
    return f.position
      .addScaledVector(f.right, x)
      .addScaledVector(f.up, y)
      .addScaledVector(f.tangent, z);
  }
  function box(s, x, y, z, w, h, d) {
    const f = groundFrame(track, s);
    matrix.compose(
      point(s, x, y, z),
      new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        Math.atan2(f.tangent.x, f.tangent.z),
      ),
      new T.Vector3(w, h, d),
    );
    boxes.push(unit.clone().applyMatrix4(matrix));
  }
  function tie(a, b, w = 1.4) {
    const t = beamTransform(a, b, w, w);
    matrix.compose(t.position, t.quaternion, t.scale);
    ties.push(unit.clone().applyMatrix4(matrix));
  }
  const rose = track.landmarks.roseWindow.s;
  for (const side of [-1, 1]) {
    box(rose, side * 88, -54, 0, 39, 39, 40);
    for (let s = rose + 44; s < track.jumps[1].takeoff - 36; s += 58) {
      box(s, side * 43, -46, 0, 17, 62, 24);
      const f = track.sample(s),
        foot = point(s, side * 43, -36);
      if (foot.clone().sub(f.position).dot(f.up) < -12)
        tie(f.position.clone().addScaledVector(f.up, -9), foot);
    }
    box(track.landmarks.chapelLanding.s + 94, side * 60, -44, 0, 25, 39, 139);
  }
  for (const s of [40, 1390, 1735, track.landmarks.halo.s]) {
    const f = track.sample(s);
    box(s, 0, -56, 0, 23, 28, 22);
    for (const side of [-1, 1])
      tie(
        f.position
          .clone()
          .addScaledVector(f.right, side * 8)
          .addScaledVector(f.up, -5),
        point(s, 0, -43),
        1.8,
      );
  }
  // Structural arms run below the banked road from the needle's carved roots
  // to actual keel saddles. They never rise through the driving envelope.
  for (const s of [2090, 2250, 2430, 2570]) {
    const f = track.sample(s),
      center = new T.Vector3(
        track.landmarks.cloudspire.position[0],
        f.position.y - 56,
        track.landmarks.cloudspire.position[2],
      );
    const end = f.position.clone().addScaledVector(f.up, -12);
    const radial = end.clone().sub(center);
    radial.y = 0;
    radial.normalize();
    const root = center.clone().addScaledVector(radial, 29);
    let previous = root;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8,
        next = root.clone().lerp(end, t);
      next.y -= Math.sin(t * Math.PI) * 12;
      tie(previous, next, 2.2);
      previous = next;
    }
    tie(root.clone().add(new T.Vector3(0, 20, 0)), end, 1.05);
  }
  for (const [pieces, material, name] of [
    [boxes, stone, 'Stone foundations meeting island terraces'],
    [ties, bronze, 'Bronze bridge-to-stone struts'],
  ]) {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((p) => p.dispose());
    const m = new T.Mesh(geometry, material);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  unit.dispose();
  const vertices = [],
    seeds = [];
  for (const c of track.curtains)
    for (let i = 0; i < 128; i++) {
      const side = i % 2 ? 1 : -1;
      const foot = i >= 96;
      vertices.push(
        ...point(
          c.s,
          side * (19 + ((i * 13) % 17)),
          foot ? -45 : ((i * 17) % 39) - 6,
          ((i * 19) % 15) - 7,
        ).toArray(),
      );
      seeds.push(i * 0.618, foot ? 8 : 0.7);
    }
  const sprayGeometry = new T.BufferGeometry();
  sprayGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(vertices, 3),
  );
  sprayGeometry.setAttribute(
    'seedSize',
    new T.Float32BufferAttribute(seeds, 2),
  );
  const clock = { value: 0 };
  const sprayMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { clock },
    vertexShader: `attribute vec2 seedSize;uniform float clock;varying float alpha;
 void main(){float phase=fract(clock*.27+seedSize.x);vec3 p=position+vec3(sin(seedSize.x*11.+phase*3.)*2.,phase*5.,cos(seedSize.x*7.+phase*2.)*2.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=min(170.,seedSize.y*950./max(5.,-mv.z));alpha=sin(phase*3.14159)*.1;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.05,1.,r))*alpha;gl_FragColor=vec4(.76,.85,.87,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  const spray = new T.Points(sprayGeometry, sprayMaterial);
  spray.name = 'Zephyr / source-fed layered spray';
  spray.userData.aoExclude = true;
  group.add(spray);
  return {
    group,
    update(frame) {
      clock.value =
        frame.waterTime ?? (frame.settings.reducedMotion ? 0 : frame.time);
      sprayGeometry.setDrawRange(
        0,
        frame.settings.quality === 'low' ? 160 : 256,
      );
    },
  };
}

import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { COMBAT_RULES } from './combat.js';

// Shared endpoint frames stitch a ribbon through bends without overlapping
// quad seams. A decorative live head closes the interval between emissions.
export function createIonRibbon(root) {
  const capacity = 266;
  const positions = new Float32Array(capacity * 18),
    uvs = new Float32Array(capacity * 12),
    fades = new Float32Array(capacity * 6);
  const geometry = new T.BufferGeometry();
  for (const [name, array, size] of [
    ['position', positions, 3],
    ['uv', uvs, 2],
    ['fade', fades, 1],
  ])
    geometry.setAttribute(
      name,
      new T.BufferAttribute(array, size).setUsage(T.DynamicDrawUsage),
    );
  const material = new T.ShaderMaterial({
    name: 'Ion / continuous suspended filaments',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new T.Color(DEVICE_COLORS.ion) },
      time: { value: 0 },
    },
    vertexShader: `attribute float fade; varying float life; varying vec2 at; varying vec3 world; void main(){life=fade;at=uv;world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float life; varying vec2 at; varying vec3 world; uniform vec3 color; uniform float time;
      void main(){float edge=smoothstep(0.,.13,at.x)*(1.-smoothstep(.87,1.,at.x));
      float thread=pow(.5-.5*cos(at.x*18.8496+sin(dot(world,vec3(.09,.13,.11))-time)*.45),5.);
      float core=pow(thread,3.);float alpha=edge*(.015+thread*.75)*life;
      if(alpha<.002)discard;gl_FragColor=vec4(mix(color*1.8,vec3(1.7,1.2,2.),core*.2),alpha); }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  root.add(mesh);
  const frames = Array.from({ length: capacity }, () => ({
    a: new T.Vector3(),
    b: new T.Vector3(),
    up: new T.Vector3(),
    right: new T.Vector3(),
    aUp: new T.Vector3(),
    bUp: new T.Vector3(),
    aRight: new T.Vector3(),
    bRight: new T.Vector3(),
  }));
  const quaternion = new T.Quaternion(),
    direction = new T.Vector3(),
    point = new T.Vector3();
  const previous = new Map(),
    heads = new Map(),
    segments = [];
  return {
    update(state, combat, reducedMotion) {
      material.uniforms.time.value = reducedMotion ? 0 : state.time * 3;
      segments.length = 0;
      segments.push(...state.wakes);
      heads.clear();
      for (const [id, e] of Object.entries(state.emitters))
        if (e.kind === 'ion' && e.tail) {
          const pose = combat.pose(id);
          if (!pose) continue;
          point
            .set(0, 0, -3)
            .applyQuaternion(pose.quaternion)
            .add(pose.position);
          heads.set(e.burst, point.clone());
          segments.push({
            a: e.tail,
            b: point.toArray(),
            quaternion: pose.quaternion.toArray(),
            age: 0,
            burst: e.burst,
          });
        }
      const count = Math.min(capacity, segments.length);
      previous.clear();
      for (let i = 0; i < count; i++) {
        const s = segments[i],
          f = frames[i];
        f.a.fromArray(s.a);
        f.b.fromArray(s.b);
        quaternion.fromArray(s.quaternion);
        f.up.set(0, 1, 0).applyQuaternion(quaternion);
        direction.subVectors(f.b, f.a).normalize();
        f.right.crossVectors(f.up, direction).normalize();
        f.aUp.copy(f.up);
        f.bUp.copy(f.up);
        f.aRight.copy(f.right);
        f.bRight.copy(f.right);
        f.head = heads.get(s.burst);
        f.aFade = f.bFade = Math.max(0, 1 - s.age / COMBAT_RULES.wakeLifetime);
        const index = previous.get(s.burst);
        if (
          index !== undefined &&
          frames[index].b.distanceToSquared(f.a) < 0.1
        ) {
          const prev = frames[index];
          f.aUp.add(prev.up).normalize();
          prev.bUp.copy(f.aUp);
          f.aRight.add(prev.right).normalize();
          prev.bRight.copy(f.aRight);
          f.aFade = prev.bFade = (f.aFade + prev.bFade) * 0.5;
        }
        previous.set(s.burst, i);
      }
      const corners = [
        [0, -1],
        [1, -1],
        [1, 1],
        [0, -1],
        [1, 1],
        [0, 1],
      ];
      for (let i = 0; i < count; i++) {
        const f = frames[i];
        for (let j = 0; j < 6; j++) {
          const [end, side] = corners[j],
            at = i * 6 + j;
          const headGap = f.head ? (end ? f.b : f.a).distanceTo(f.head) : 20;
          const opening = Math.min(1, headGap / 6);
          point
            .copy(end ? f.b : f.a)
            .addScaledVector(end ? f.bUp : f.aUp, -0.22)
            .addScaledVector(
              end ? f.bRight : f.aRight,
              side * 2.25 * (0.68 + 0.32 * opening),
            );
          point.toArray(positions, at * 3);
          uvs[at * 2] = (side + 1) / 2;
          uvs[at * 2 + 1] = end;
          fades[at] = (end ? f.bFade : f.aFade) * Math.min(1, headGap / 5);
        }
      }
      geometry.setDrawRange(0, count * 6);
      for (const a of Object.values(geometry.attributes)) a.needsUpdate = true;
    },
  };
}

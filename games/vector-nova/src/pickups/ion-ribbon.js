import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { COMBAT_RULES } from './combat.js';

// Shared endpoint frames stitch a ribbon through bends without overlapping
// quad seams. A decorative live head closes the interval between emissions.
export function createIonRibbon(root) {
  const capacity = 266;
  const positions = new Float32Array(capacity * 36),
    uvs = new Float32Array(capacity * 24),
    fades = new Float32Array(capacity * 12),
    layers = new Float32Array(capacity * 12);
  const geometry = new T.BufferGeometry();
  for (const [name, array, size] of [
    ['position', positions, 3],
    ['uv', uvs, 2],
    ['fade', fades, 1],
    ['layer', layers, 1],
  ])
    geometry.setAttribute(
      name,
      new T.BufferAttribute(array, size).setUsage(T.DynamicDrawUsage),
    );
  const material = new T.ShaderMaterial({
    name: 'Ion / luminous filaments and suspended wake',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new T.Color(DEVICE_COLORS.ion) },
      time: { value: 0 },
    },
    vertexShader: `attribute float fade, layer; varying float life, veil; varying vec2 at; varying vec3 world;
      void main(){life=fade;veil=layer;at=uv;world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float life, veil; varying vec2 at; varying vec3 world; uniform vec3 color; uniform float time;
      void main(){
        float edge=smoothstep(0.,.12,at.x)*(1.-smoothstep(.88,1.,at.x));
        float flow=dot(world,vec3(.13,.19,.21))-time;
        float braid=sin(flow*.8+at.x*7.)*.42;
        float wave=.5-.5*cos(at.x*18.8496+braid);
        float thread=pow(wave,4.), core=pow(wave,20.);
        float current=.82+.18*sin(flow*1.2);
        float haze=exp(-pow((at.x-.5)*3.,2.));
        float wisps=pow(.5+.5*sin(at.x*34.+flow*.65),18.)*
          (.5+.5*sin(flow*.35+at.x*9.));
        float light=(thread*.72+wisps*.2+haze*.08)*current;
        if(veil>.5){
          float center=abs(at.x-.5);
          light=exp(-center*8.)*.26*current+wisps*.1;
          core=exp(-center*45.)*.48;
        }
        float alpha=edge*(light+core*.2)*life;
        if(alpha<.002)discard;
        gl_FragColor=vec4(mix(color*2.2,vec3(2.4,1.9,2.8),core*.65),min(.9,alpha));
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  root.add(mesh);
  // One soft luminous node per actual wake deposit. The ribbon connects them;
  // their spacing follows emission speed, with no extra collision objects.
  const nodeGeometry = new T.SphereGeometry(1, 12, 8);
  const nodeLife = new T.InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  ).setUsage(T.DynamicDrawUsage);
  nodeGeometry.setAttribute('pulseLife', nodeLife);
  const nodeMaterial = new T.ShaderMaterial({
    name: 'Ion / deposited pulse glow',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: T.AdditiveBlending,
    uniforms: {
      color: { value: new T.Color(DEVICE_COLORS.ion) },
      time: { value: 0 },
    },
    vertexShader: `attribute float pulseLife; varying float life; varying vec3 facing, view, local;
      void main(){
        life=pulseLife;
        vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);
        mat3 basis=mat3(instanceMatrix);
        vec3 corrected=normal/vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]));
        facing=normalize(normalMatrix*basis*corrected);
        local=position;
        view=-p.xyz;gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `uniform vec3 color; uniform float time; varying float life; varying vec3 facing, view, local;
      void main(){
        float face=max(0.,dot(normalize(facing),normalize(view)));
        float glow=pow(face,2.5),core=pow(face,12.);
        float coil=pow(.5+.5*sin(atan(local.y,local.x)*2.+local.z*6.-time*2.),5.);
        float spine=exp(-dot(local.xy,local.xy)*9.);
        float light=glow*(.48+coil*.22)+spine*.18;
        gl_FragColor=vec4(mix(color*2.4,vec3(2.7,2.1,3.),min(.8,core*.65+spine*.2)),light*life);
      }`,
  });
  const nodes = new T.InstancedMesh(nodeGeometry, nodeMaterial, capacity);
  nodes.name = 'Ion / wake pulse nodes';
  nodes.instanceMatrix.setUsage(T.DynamicDrawUsage);
  nodes.frustumCulled = false;
  nodes.userData.aoExclude = nodes.userData.reflectionExclude = true;
  nodes.count = 0;
  root.add(nodes);
  const nodeTransform = new T.Object3D();
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
      nodeMaterial.uniforms.time.value = reducedMotion ? 0 : state.time;
      nodes.count = Math.min(capacity, state.wakes.length);
      for (let index = 0; index < nodes.count; index++) {
        const wake = state.wakes[index];
        nodeTransform.position.fromArray(wake.b);
        nodeTransform.quaternion.fromArray(wake.quaternion);
        nodeTransform.scale.set(1.4, 0.95, 2.9);
        nodeTransform.updateMatrix();
        nodes.setMatrixAt(index, nodeTransform.matrix);
        nodeLife.setX(
          index,
          Math.max(0, 1 - wake.age / COMBAT_RULES.wakeLifetime) *
            (reducedMotion ? 0.65 : 1),
        );
      }
      nodes.instanceMatrix.needsUpdate = true;
      nodeLife.needsUpdate = true;
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
        for (let layer = 0; layer < 2; layer++)
          for (let j = 0; j < 6; j++) {
            const [end, side] = corners[j],
              at = i * 12 + layer * 6 + j;
            const headGap = f.head ? (end ? f.b : f.a).distanceTo(f.head) : 20;
            const opening = Math.min(1, headGap / 6);
            point
              .copy(end ? f.b : f.a)
              .addScaledVector(
                end ? f.bUp : f.aUp,
                layer ? 0.15 + side * 0.85 * opening : -0.22,
              )
              .addScaledVector(
                end ? f.bRight : f.aRight,
                layer ? 0 : side * 2.25 * (0.68 + 0.32 * opening),
              );
            point.toArray(positions, at * 3);
            uvs[at * 2] = (side + 1) / 2;
            uvs[at * 2 + 1] = end;
            fades[at] = (end ? f.bFade : f.aFade) * Math.min(1, headGap / 5);
            layers[at] = layer;
          }
      }
      geometry.setDrawRange(0, count * 12);
      for (const a of Object.values(geometry.attributes)) a.needsUpdate = true;
    },
    dispose() {
      // Geometry/materials belong to the combat root; release instance buffers.
      nodes.dispose();
    },
  };
}

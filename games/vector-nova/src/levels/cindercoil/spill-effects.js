import * as T from 'three';
import { sampleSpill } from './mechanics.js';
import { createCindercoilPlumeResources } from './plume.js';

/** Heat spreads over the deck; smoke is emitted only where the spill touches it. */
export function createSpillEffects(track, zone, pulse) {
  const group = new T.Group();
  group.name = 'Cindercoil / spill contact glow and rising smoke';
  const positions = [],
    edges = [],
    indices = [];
  const count = Math.ceil((zone.end - zone.start) / 2);
  for (let i = 0; i <= count; i++) {
    const distance = T.MathUtils.lerp(zone.start, zone.end, i / count);
    const frame = track.sample(distance),
      flow = sampleSpill(zone, distance);
    for (const edge of [-1, 0, 1]) {
      const lateral = T.MathUtils.clamp(
        flow.center + edge * (flow.halfWidth + 2.6),
        -track.width / 2,
        track.width / 2,
      );
      positions.push(
        ...frame.position
          .clone()
          .addScaledVector(frame.right, lateral)
          .addScaledVector(frame.up, 0.08)
          .toArray(),
      );
      edges.push(edge);
    }
    if (i) {
      const a = (i - 1) * 3,
        b = i * 3;
      for (let j = 0; j < 2; j++)
        indices.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    }
  }
  const glowGeometry = new T.BufferGeometry();
  glowGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  glowGeometry.setAttribute(
    'spillEdge',
    new T.Float32BufferAttribute(edges, 1),
  );
  glowGeometry.setIndex(indices);
  glowGeometry.computeBoundingSphere();
  const glowMaterial = new T.ShaderMaterial({
    name: 'Cindercoil / soft contact heat glow',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: { spillPulse: pulse },
    vertexShader: `attribute float spillEdge; varying float heatEdge;
      void main(){heatEdge=spillEdge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float heatEdge;uniform float spillPulse;
      void main(){float alpha=(1.-smoothstep(.1,1.,abs(heatEdge)))*.24*spillPulse;
      gl_FragColor=vec4(1.,.16,.012,alpha);
      #include <colorspace_fragment>}`,
  });
  const glow = new T.Mesh(glowGeometry, glowMaterial);
  glow.name = 'Cindercoil / lava glow on ceramic';
  glow.userData.aoExclude = true;
  group.add(glow);

  const time = { value: 0 };
  const { geometry, material } = createCindercoilPlumeResources({
    time,
    pulse,
    heated: true,
  });
  const emitterCount = 12,
    maximum = emitterCount * 4;
  const ages = new T.InstancedBufferAttribute(new Float32Array(maximum), 1);
  geometry.setAttribute('plumeAge', ages);
  const smoke = new T.InstancedMesh(geometry, material, maximum);
  smoke.name = 'Cindercoil / lava contact smoke plumes';
  smoke.frustumCulled = false;
  smoke.userData.aoExclude = true;
  smoke.userData.reflectionExclude = true;
  smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);
  group.add(smoke);
  const emitters = Array.from({ length: emitterCount }, (_, i) => {
    const distance = T.MathUtils.lerp(
      zone.start,
      zone.end,
      (i + 0.5) / emitterCount,
    );
    const frame = track.sample(distance),
      flow = sampleSpill(zone, distance);
    const lateral = T.MathUtils.clamp(
      flow.center + (i % 2 ? -1 : 1) * flow.halfWidth * 0.35,
      -track.width / 2 + 1,
      track.width / 2 - 1,
    );
    return {
      frame,
      origin: frame.position
        .clone()
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 0.3),
    };
  });
  const pose = new T.Object3D();
  let disposed = false;
  const update = ({ time: clock = 0, settings = {} } = {}) => {
    if (disposed) return;
    time.value = settings.reducedMotion ? 0 : clock;
    const layers = settings.quality === 'low' ? 2 : 4;
    smoke.count = emitterCount * layers;
    for (let i = 0; i < smoke.count; i++) {
      const emitter = Math.floor(i / layers),
        layer = i % layers;
      const { frame, origin } = emitters[emitter];
      const age = T.MathUtils.euclideanModulo(
        time.value * 0.12 + layer / layers + emitter * 0.61803398875,
        1,
      );
      const size = 1.6 + age * 4;
      pose.position
        .copy(origin)
        .addScaledVector(frame.right, -zone.side * age * 3.5)
        .addScaledVector(frame.tangent, -age * 2);
      pose.position.y += age * 17 + size * 0.85;
      pose.scale.set(size * 1.25, size, size * 0.9);
      pose.rotation.set(emitter * 0.7 + layer, layer * 1.6, emitter * 1.2);
      pose.updateMatrix();
      smoke.setMatrixAt(i, pose.matrix);
      ages.setX(i, age);
    }
    smoke.instanceMatrix.needsUpdate = true;
    ages.needsUpdate = true;
  };
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      glowGeometry.dispose();
      glowMaterial.dispose();
      geometry.dispose();
      material.dispose();
      smoke.dispose();
      group.clear();
    },
  };
}

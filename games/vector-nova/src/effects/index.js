import * as T from 'three';
export function createEffects(scene) {
  const count = 48,
    positions = new Float32Array(count * 3),
    velocities = [],
    geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const material = new T.PointsMaterial({
    color: '#ffba65',
    size: 0.13,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sparks = new T.Points(geometry, material);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let life = 0;
  return {
    impact(frame, lateral) {
      life = 0.5;
      for (let i = 0; i < count; i++) {
        const p = frame.position
          .clone()
          .addScaledVector(frame.right, lateral)
          .addScaledVector(frame.up, 0.6);
        positions.set(p.toArray(), i * 3);
        velocities[i] = frame.tangent
          .clone()
          .multiplyScalar(-15 - (i % 9) * 3)
          .addScaledVector(frame.up, 3 + (i % 5) * 1.8)
          .addScaledVector(frame.right, Math.sin(i * 19) * 6);
      }
      geometry.attributes.position.needsUpdate = true;
    },
    update(dt) {
      if (life <= 0) return;
      life -= dt;
      material.opacity = Math.max(0, life * 2);
      for (let i = 0; i < count; i++) {
        positions[i * 3] += velocities[i].x * dt;
        positions[i * 3 + 1] += velocities[i].y * dt;
        positions[i * 3 + 2] += velocities[i].z * dt;
        velocities[i].y -= dt * 12;
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(sparks);
    },
  };
}

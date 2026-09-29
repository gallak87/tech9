import * as T from 'three';
export function createEffects(scene, { refinedSparks = false } = {}) {
  const count = 48,
    positions = new Float32Array(count * 3),
    directions = new Float32Array(count * 3),
    velocities = [],
    geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const variation = (i, salt) => {
    const value = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const material = new T.PointsMaterial({
    color: '#ffba65',
    size: 0.13,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  // Existing contact particles get directional optical falloff and varied
  // velocities. The particle budget and simulation event stay unchanged.
  if (refinedSparks) {
    geometry.setAttribute(
      'sparkVelocity',
      new T.BufferAttribute(directions, 3),
    );
    geometry.setAttribute(
      'sparkHeat',
      new T.Float32BufferAttribute(
        Array.from({ length: count }, (_, i) => 0.55 + variation(i, 7) * 0.45),
        1,
      ),
    );
    material.size = 0.28;
    material.blending = T.AdditiveBlending;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
         attribute vec3 sparkVelocity;
         attribute float sparkHeat;
         varying vec2 sparkAxis;
         varying float heat;`,
        )
        .replace(
          'gl_PointSize = size;',
          `vec3 viewVelocity=mat3(modelViewMatrix)*sparkVelocity;
         sparkAxis=normalize(viewVelocity.xy+vec2(.001));
         heat=sparkHeat;
         gl_PointSize=size*(.65+heat*.55);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
         varying vec2 sparkAxis;
         varying float heat;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `vec2 sparkUV=(gl_PointCoord-.5)*vec2(2.,-2.);
         vec2 elongated=vec2(dot(sparkUV,sparkAxis),dot(sparkUV,vec2(-sparkAxis.y,sparkAxis.x))*4.);
         float radius=dot(elongated,elongated);
         diffuseColor.a*=heat*exp(-radius*2.)*(1.-smoothstep(.5,1.,radius));
         #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'orbital-contact-streak-falloff';
  }
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
          .multiplyScalar(
            -15 - (refinedSparks ? variation(i, 0) * 28 : (i % 9) * 3),
          )
          .addScaledVector(
            frame.up,
            3 + (refinedSparks ? variation(i, 1) * 7 : (i % 5) * 1.8),
          )
          .addScaledVector(
            frame.right,
            (refinedSparks ? variation(i, 2) * 2 - 1 : Math.sin(i * 19)) * 6,
          );
        directions.set(velocities[i].toArray(), i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
      if (refinedSparks) geometry.attributes.sparkVelocity.needsUpdate = true;
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
        directions.set(velocities[i].toArray(), i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
      if (refinedSparks) geometry.attributes.sparkVelocity.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(sparks);
    },
  };
}

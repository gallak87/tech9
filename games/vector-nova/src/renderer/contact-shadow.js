import * as T from 'three';

/** Local ambient occlusion beneath the hovering chassis. This analytic footprint
 * supplements directional shadows where the craft is under broad city shade.
 * Vertices follow the actual running surface, including grades and banking. */
export function createContactShadow({ surfaceStep = 0, opacity = 1 } = {}) {
  const geometry = new T.PlaneGeometry(
    9,
    12,
    surfaceStep ? 18 : 4,
    surfaceStep ? 24 : 6,
  );
  const positions = geometry.attributes.position;
  const surfaceLateral = new T.Float32BufferAttribute(
    new Float32Array(positions.count),
    1,
  );
  geometry.setAttribute('surfaceLateral', surfaceLateral);
  const surfaceCoverage = new T.Float32BufferAttribute(
    new Float32Array(positions.count).fill(1),
    1,
  );
  geometry.setAttribute('surfaceCoverage', surfaceCoverage);
  const footprint = Array.from({ length: positions.count }, (_, i) => [
    positions.getX(i),
    positions.getY(i),
  ]);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: T.DoubleSide,
    fog: true,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      opacity: { value: opacity },
      roadHalfWidth: { value: 1e6 },
    },
    vertexShader: `varying vec2 footprintUV;
      attribute float surfaceLateral;
      attribute float surfaceCoverage;
      varying float lateral;
      varying float coverage;
      #include <fog_pars_vertex>
      void main() {
        footprintUV = uv * 2. - 1.;
        lateral = surfaceLateral;
        coverage = surfaceCoverage;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 footprintUV;
      uniform float opacity;
      uniform float roadHalfWidth;
      varying float lateral;
      varying float coverage;
      #include <fog_pars_fragment>
      void main() {
        vec2 q=footprintUV;
        float chassis=exp(-dot(q*vec2(1.6,1.15),q*vec2(1.6,1.15))*1.4);
        vec2 left=q-vec2(.27,-.26), right=q-vec2(-.27,-.26);
        float pods=exp(-dot(left*vec2(2.6,1.3),left*vec2(2.6,1.3))*2.)+
                   exp(-dot(right*vec2(2.6,1.3),right*vec2(2.6,1.3))*2.);
        float edge=1.-smoothstep(.72,1.,max(abs(q.x),abs(q.y)));
        float alpha=clamp(chassis*.35+pods*.22,0.,.52)*edge;
        alpha*=1.-smoothstep(roadHalfWidth-.2,roadHalfWidth,abs(lateral));
        gl_FragColor=vec4(.009,.016,.024,alpha*opacity*coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Chassis ambient contact footprint';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    update(track, state, coverageAt) {
      const runningSurface = track.sampleSurface?.(
        state.distance,
        state.lateral,
      );
      material.uniforms.roadHalfWidth.value =
        surfaceStep && !runningSurface ? track.width / 2 : 1e6;
      const c = Math.cos(state.heading),
        s = Math.sin(state.heading);
      const frames = new Map();
      const frameAt = (distance) => {
        if (!frames.has(distance)) frames.set(distance, track.sample(distance));
        return frames.get(distance);
      };
      footprint.forEach(([x, z], i) => {
        const distance = state.distance - x * s + z * c;
        const lateral = state.lateral + x * c + z * s;
        surfaceLateral.setX(i, lateral);
        // Open magnetic spans must not leave a dark decal suspended over the
        // planet. The road owns which parts of its visual surface are solid.
        surfaceCoverage.setX(i, coverageAt ? coverageAt(distance, lateral) : 1);
        let p;
        const surface = track.sampleSurface?.(distance, lateral);
        if (surface) {
          p = surface.position.clone().addScaledVector(surface.up, 0.08);
          if (
            !surface.period &&
            (lateral < surface.bounds.min || lateral > surface.bounds.max)
          )
            surfaceCoverage.setX(i, 0);
        } else if (surfaceStep) {
          // Match the actual two triangles of each swept road span. Sampling
          // only the smooth centreline lets the decal cut into the coarser
          // rendered deck at crests and roll changes, exposing hard patches.
          const step = track.length / Math.ceil(track.length / surfaceStep);
          const start = Math.floor(distance / step) * step;
          const a = frameAt(start),
            b = frameAt(start + step);
          const t = (distance - start) / step;
          const u = (lateral + track.width / 2) / track.width;
          const leftA = a.position
            .clone()
            .addScaledVector(a.right, -track.width / 2);
          const rightA = a.position
            .clone()
            .addScaledVector(a.right, track.width / 2);
          const leftB = b.position
            .clone()
            .addScaledVector(b.right, -track.width / 2);
          const rightB = b.position
            .clone()
            .addScaledVector(b.right, track.width / 2);
          p =
            t + u <= 1
              ? leftA
                  .multiplyScalar(1 - t - u)
                  .addScaledVector(leftB, t)
                  .addScaledVector(rightA, u)
              : rightA
                  .multiplyScalar(1 - t)
                  .addScaledVector(leftB, 1 - u)
                  .addScaledVector(rightB, t + u - 1);
          p.addScaledVector(a.up, 0.06);
        } else {
          const f = track.sample(distance);
          p = f.position
            .addScaledVector(f.right, lateral)
            .addScaledVector(f.up, 0.025);
        }
        positions.setXYZ(i, p.x, p.y, p.z);
      });
      positions.needsUpdate = true;
      surfaceLateral.needsUpdate = true;
      surfaceCoverage.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

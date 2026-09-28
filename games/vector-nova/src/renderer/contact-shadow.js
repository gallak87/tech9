import * as T from 'three';

/** Local ambient occlusion beneath the hovering chassis. This analytic footprint
 * supplements directional shadows where the craft is under broad city shade.
 * Vertices follow the actual running surface, including grades and banking. */
export function createContactShadow() {
  const geometry = new T.PlaneGeometry(9, 12, 4, 6);
  const positions = geometry.attributes.position;
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
    uniforms: T.UniformsUtils.clone(T.UniformsLib.fog),
    vertexShader: `varying vec2 footprintUV;
      #include <fog_pars_vertex>
      void main() {
        footprintUV = uv * 2. - 1.;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 footprintUV;
      #include <fog_pars_fragment>
      void main() {
        vec2 q=footprintUV;
        float chassis=exp(-dot(q*vec2(1.6,1.15),q*vec2(1.6,1.15))*1.4);
        vec2 left=q-vec2(.27,-.26), right=q-vec2(-.27,-.26);
        float pods=exp(-dot(left*vec2(2.6,1.3),left*vec2(2.6,1.3))*2.)+
                   exp(-dot(right*vec2(2.6,1.3),right*vec2(2.6,1.3))*2.);
        float edge=1.-smoothstep(.72,1.,max(abs(q.x),abs(q.y)));
        float alpha=clamp(chassis*.35+pods*.22,0.,.52)*edge;
        gl_FragColor=vec4(.009,.016,.024,alpha);
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
    update(track, state) {
      const c = Math.cos(state.heading),
        s = Math.sin(state.heading);
      footprint.forEach(([x, z], i) => {
        const f = track.sample(state.distance - x * s + z * c);
        const p = f.position
          .addScaledVector(f.right, state.lateral + x * c + z * s)
          .addScaledVector(f.up, 0.025);
        positions.setXYZ(i, p.x, p.y, p.z);
      });
      positions.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

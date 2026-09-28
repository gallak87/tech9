import * as T from 'three';

/** Cloud-only source image on a true sky sphere. World geometry is never part of
 * this texture. The same sky radiance supplies PMREM reflections and lighting. */
export async function createSky() {
  const texture = await new T.TextureLoader().loadAsync(
    '/assets/sky/halcyon-clouds-v1.png',
  );
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const sunDirection = new T.Vector3(-0.62, 0.145, 0.77).normalize();
  const material = new T.ShaderMaterial({
    name: 'Halcyon cloud radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      cloudSky: { value: texture },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `varying vec3 skyDirection;
      void main(){skyDirection=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform sampler2D cloudSky;
      uniform vec3 sunDirection;
      const float PI=3.141592653589793;
      void main(){
        vec3 ray=normalize(skyDirection);
        // Sunset in the panorama is aligned to the scene's western solar key.
        float u=fract(atan(ray.z,ray.x)/(2.*PI)+.34);
        float v=asin(clamp(ray.y,-1.,1.))/PI+.5;
        vec3 radiance=texture2D(cloudSky,vec2(u,v)).rgb*.82;
        // The bounded image is not an HDR source. A compact analytical solar
        // contribution restores bright reflection energy in the same direction.
        float disk=dot(ray,sunDirection);
        radiance+=vec3(1.,.58,.31)*(.06*pow(max(disk,0.),48.)+5.*smoothstep(.99994,.999976,disk));
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(10000, 32, 16), material);
  mesh.name = 'Halcyon atmospheric sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return {
    mesh,
    texture,
    sunDirection,
    dispose() {
      texture.dispose();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

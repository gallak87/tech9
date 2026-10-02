import * as T from 'three';

/** Selected ash panorama; all nearby caldera forms remain authored geometry. */
export async function createCindercoilBackdrop({
  shape = false,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  let texture;
  try {
    texture = shape
      ? new T.DataTexture(new Uint8Array([90, 105, 122, 255]), 1, 1)
      : await loadTexture('/assets/levels/cindercoil/cindercoil-sky-v2.png');
    texture.needsUpdate = true;
  } catch (cause) {
    throw new Error(
      'The Cindercoil ash sky could not load. Reload to try again.',
      { cause },
    );
  }
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Cindercoil / cool slate clouds and muted horizon';
  const sunDirection = new T.Vector3(-0.4, 0.63, -0.48).normalize();
  const material = new T.ShaderMaterial({
    name: 'Cindercoil / ash sky radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: { ashSky: { value: texture }, shape: { value: shape ? 1 : 0 } },
    vertexShader: `varying vec3 ray; void main(){ ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `varying vec3 ray; uniform sampler2D ashSky; uniform float shape;
      const float PI=3.141592653589793;
      void main(){
        vec3 direction=normalize(ray);
        float u=fract(atan(direction.z,direction.x)/(2.*PI)+.34);
        float v=asin(clamp(direction.y,-1.,1.))/PI+.5;
        // Overlap the panorama ends so imperfect authored edge matches cannot
        // create a visible meridian. Source pixels remain unchanged.
        float overlap=.04;
        float panoramaU=u*(1.-overlap);
        // Analytic UV derivatives stay continuous across the longitude wrap;
        // implicit derivatives there select a visibly wrong, tiny mip level.
        vec3 dx=dFdx(direction),dy=dFdy(direction);
        float longitudeScale=(1.-overlap)/(2.*PI*max(dot(direction.xz,direction.xz),.000001));
        float latitudeScale=1./(PI*sqrt(max(1.-direction.y*direction.y,.000001)));
        vec2 uvDx=vec2((direction.x*dx.z-direction.z*dx.x)*longitudeScale,dx.y*latitudeScale);
        vec2 uvDy=vec2((direction.x*dy.z-direction.z*dy.x)*longitudeScale,dy.y*latitudeScale);
        vec3 radiance=textureGrad(ashSky,vec2(panoramaU,v),uvDx,uvDy).rgb;
        if(panoramaU<overlap){
          vec3 opposite=textureGrad(ashSky,vec2(panoramaU+1.-overlap,v),uvDx,uvDy).rgb;
          radiance=mix(opposite,radiance,smoothstep(0.,overlap,panoramaU));
        }
        // The source pole rows carry longitude detail; blend their mean at the
        // last few degrees rather than pinching those clouds into a bright star.
        float poleV=direction.y>0. ? .99 : .01;
        vec3 poleColor=(textureLod(ashSky,vec2(.125,poleV),3.).rgb+textureLod(ashSky,vec2(.375,poleV),3.).rgb+textureLod(ashSky,vec2(.625,poleV),3.).rgb+textureLod(ashSky,vec2(.875,poleV),3.).rgb)*.25;
        radiance=mix(radiance,poleColor,smoothstep(.965,.998,abs(direction.y)));
        radiance*=.86;
        radiance=mix(radiance,mix(vec3(.17,.21,.26),vec3(.08,.12,.19),max(0.,direction.y)),shape);
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(5000, 32, 16), material);
  sky.name = 'Cindercoil / selected ash panorama';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#e4e0d5',
    sunIntensity: 1.85,
    ambientSky: '#a9c5df',
    ambientGround: '#66748b',
    ambientIntensity: 1.05,
    fillColor: '#b0d1e4',
    fillIntensity: 0.62,
    environmentIntensity: 0.38,
    far: 6500,
    ownedTextures: [texture],
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      sky.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}

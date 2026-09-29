import * as THREE from 'three';

// Integrate emission through a small local volume. The proxy's faces never
// supply visible shading: radial/axial density goes to zero before its bounds.
// This removes the view-angle streaks produced by transparent cone surfaces.
export function createOrbitalPlumeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Orbital ion exhaust / integrated emission volume',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    uniforms: {
      glowColor: { value: new THREE.Color(0x339fcb) },
      strength: { value: 0.15 },
      flowTime: { value: 0 },
      boostMix: { value: 0 },
    },
    vertexShader: `
      varying vec3 localPosition;
      varying vec3 localEye;
      void main() {
        localPosition = position;
        // transpose(normalMatrix) is the inverse model-view linear transform;
        // writing its dot products explicitly keeps the GLSL1 path supported.
        vec3 translation = -modelViewMatrix[3].xyz;
        localEye = vec3(dot(normalMatrix[0],translation),
          dot(normalMatrix[1],translation),dot(normalMatrix[2],translation));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }`,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float strength;
      uniform float flowTime;
      uniform float boostMix;
      varying vec3 localPosition;
      varying vec3 localEye;
      void main() {
        vec3 ray = normalize(localPosition-localEye);
        vec3 safeRay = (step(vec3(0.),ray)*2.-1.)*max(abs(ray),vec3(.00001));
        vec3 inverseRay = 1./safeRay;
        vec3 a = (vec3(-.36,-.36,-1.)-localEye)*inverseRay;
        vec3 b = (vec3(.36,.36,0.)-localEye)*inverseRay;
        vec3 nearBox = min(a,b), farBox = max(a,b);
        float start = max(0.,max(nearBox.x,max(nearBox.y,nearBox.z)));
        float end = min(farBox.x,min(farBox.y,farBox.z));
        float stepLength = max(0.,end-start)/28.;
        float transmission = 1.;
        vec3 radiance = vec3(0.);
        for(int sampleIndex=0;sampleIndex<28;sampleIndex++) {
          vec3 p = localEye + ray*(start+(float(sampleIndex)+.5)*stepLength);
          float aft = clamp(-p.z,0.,1.);
          float radius = .245*(1.-aft*.44)*(1.-smoothstep(.67,1.,aft)*.84);
          float radial = length(p.xy)/max(radius,.007);
          float boundary = 1.-smoothstep(.68,1.15,radial);
          float envelope = exp(-radial*radial*3.2)*boundary;
          float core = exp(-radial*radial*21.)*boundary;
          float axial = smoothstep(.012,.095,aft)*(1.-smoothstep(.69,1.,aft))*exp(-aft*1.45);
          float flow = .94+.06*sin(aft*26.-flowTime*(14.+boostMix*9.));
          float density = (envelope*.72+core*2.5)*axial*flow;
          float alpha = 1.-exp(-density*stepLength*strength*5.3);
          float coreMix = core/(envelope+core+.0001);
          vec3 color = mix(glowColor*1.15,vec3(.60,.91,1.),coreMix*.9);
          color *= 1.1+boostMix*.8;
          radiance += transmission*alpha*color;
          transmission *= 1.-alpha;
        }
        float opacity = 1.-transmission;
        if(opacity<.001) discard;
        gl_FragColor = vec4(radiance/max(opacity,.001),opacity);
      }`,
  });
}

export function createOrbitalPlumeGeometry() {
  const geometry = new THREE.BoxGeometry(0.72, 0.72, 1);
  geometry.translate(0, 0, -0.5);
  return geometry;
}

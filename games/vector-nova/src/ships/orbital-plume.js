import * as THREE from 'three';

// Integrate emission through a small local volume. The proxy's faces never
// supply visible shading: radial/axial density goes to zero before its bounds.
// This removes the view-angle streaks produced by transparent cone surfaces.
export function createOrbitalPlumeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Ion exhaust / pressure core and turbulent envelope',
    transparent: true,
    // Ray integration computes extinction as well as emission. Normal alpha
    // compositing preserves that transmission; additive blending left sharp
    // background shadows visible through even the dense engine core.
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    uniforms: {
      glowColor: { value: new THREE.Color(0x339fcb) },
      strength: { value: 0.15 },
      flowTime: { value: 0 },
      boostMix: { value: 0 },
      thrustMix: { value: 0 },
      reducedMotion: { value: 0 },
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
      uniform float thrustMix;
      uniform float reducedMotion;
      varying vec3 localPosition;
      varying vec3 localEye;
      void main() {
        vec3 ray = normalize(localPosition-localEye);
        vec3 safeRay = (step(vec3(0.),ray)*2.-1.)*max(abs(ray),vec3(.00001));
        vec3 inverseRay = 1./safeRay;
        vec3 a = (vec3(-.36,-.36,-1.)-localEye)*inverseRay;
        vec3 b = (vec3(.36,.36,.07)-localEye)*inverseRay;
        vec3 nearBox = min(a,b), farBox = max(a,b);
        float start = max(0.,max(nearBox.x,max(nearBox.y,nearBox.z)));
        float end = min(farBox.x,min(farBox.y,farBox.z));
        float stepLength = max(0.,end-start)/28.;
        float transmission = 1.;
        vec3 radiance = vec3(0.);
        for(int sampleIndex=0;sampleIndex<28;sampleIndex++) {
          vec3 p = localEye + ray*(start+(float(sampleIndex)+.5)*stepLength);
          float aft = clamp(-p.z,-.07,1.);
          // Axial compression is fixed in the engine frame; only the softer
          // shear layer advects aft. This reads as thrust rather than a laser.
          float phase = aft*23.-flowTime*7.;
          vec2 eddy = vec2(sin(phase+p.y*13.),cos(phase*.83+p.x*11.));
          eddy += .38*vec2(sin(phase*1.73+p.y*21.),cos(phase*1.31-p.x*19.));
          float shear = smoothstep(.25,.94,aft)*(.009+thrustMix*.021+boostMix*.008);
          p.xy += eddy*shear*(1.-reducedMotion);
          // Smooth pressure cells have luminous bulges and dimmer waists;
          // they are part of the gas density, never detached rings or beads.
          vec3 cellDistance = (vec3(aft)-vec3(.13,.37,.57))/vec3(.095,.08,.064);
          vec3 cells = exp(-cellDistance*cellDistance)*vec3(1.,.72,.46);
          float compression = max(cells.x,max(cells.y,cells.z));
          float radius = .25*(1.-max(aft,0.)*.24)*(1.-smoothstep(.45,1.,aft)*.96);
          radius *= mix(1.,.84+.2*compression,thrustMix);
          float radial = length(p.xy)/max(radius,.007);
          float boundary = 1.-smoothstep(.68,1.15,radial);
          float envelope = exp(-radial*radial*3.2)*boundary;
          float core = exp(-radial*radial*64.)*boundary*(1.-smoothstep(.34,.68,aft));
          // The transverse radius contracts towards each cell's axial tips.
          // Long spindle cells decay aft into the dim continuous central flow.
          float pressureCell = exp(-radial*radial*(16.+70.*(1.-compression)))*compression*boundary;
          // Emission begins slightly inside the authored aperture. The nozzle
          // lip stays opaque and the engine cavity gains an attached hot root.
          float axial = smoothstep(-.07,-.005,aft)*(1.-smoothstep(.52,.97,aft))*exp(-max(aft,0.)*.65);
          float flow = 1.+.035*sin(aft*26.-flowTime*(14.+thrustMix*9.))*(1.-reducedMotion);
          float wisps = 1.-smoothstep(.38,.92,aft)*(.23+.23*sin(phase*1.3+p.x*24.))*(1.-reducedMotion);
          // Past the final compression the broad envelope disperses. Two
          // faint moving filaments carry flow aft without a flat blue paddle.
          float dispersal = smoothstep(.57,.77,aft);
          vec2 transverse = p.xy/max(radius,.007);
          vec2 strandA = transverse-vec2(.26+.13*sin(phase*.81),.1*cos(phase*.67));
          vec2 strandB = transverse-vec2(-.24+.11*cos(phase*.73),.12*sin(phase*.91));
          float filaments = exp(-dot(strandA,strandA)*34.)*(.65+.35*sin(phase*1.13));
          filaments += exp(-dot(strandB,strandB)*42.)*(.3+.3*cos(phase*.93));
          float bulk = envelope*(.95+thrustMix*.28*compression)*mix(1.,.07,dispersal);
          float density = (bulk+core*1.4+thrustMix*pressureCell*2.6)*axial*flow*wisps;
          density += filaments*dispersal*.48*(1.-smoothstep(.74,1.,aft))*flow;
          // Boost spills a soft blue corona outward from the throat before
          // folding into the longer wake. It remains inside this same volume.
          float coronaRadius = .31*(1.-smoothstep(.08,.7,aft)*.65);
          float coronaDistance = length(p.xy)/coronaRadius;
          float corona = exp(-coronaDistance*coronaDistance*2.8);
          corona *= (1.-smoothstep(.27,.35,length(p.xy)))*(1.-smoothstep(.25,.7,aft));
          density += boostMix*corona*.55*axial*flow;
          float alpha = 1.-exp(-density*stepLength*strength*5.3);
          // White lives in the narrow pressure spine and early compression
          // knots. The broad envelope remains saturated cobalt/cyan gas.
          float whiteHeat = clamp(core*.2+thrustMix*pressureCell*(.61+boostMix*.18),0.,.8);
          vec3 color = mix(glowColor*1.4,vec3(.72,.88,1.),whiteHeat);
          color *= 1.25+thrustMix*(.4+.25*compression)+boostMix*.4;
          radiance += transmission*alpha*color;
          transmission *= 1.-alpha;
        }
        float opacity = 1.-transmission;
        if(opacity<.001) discard;
        gl_FragColor = vec4(radiance/max(opacity,.001),opacity);
        #include <colorspace_fragment>
      }`,
  });
}

export function createOrbitalPlumeGeometry() {
  const geometry = new THREE.BoxGeometry(0.72, 0.72, 1.07);
  geometry.translate(0, 0, -0.465);
  return geometry;
}

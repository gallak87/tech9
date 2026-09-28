import * as THREE from 'three';

// Subtle object-space finish stays attached to the hull and does not depend on
// UV islands. Frequencies are deliberately broad enough to survive chase scale;
// the fine finish is roughness variation, not a high-contrast dirt overlay.
function finish(material, kind) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 kestrelSurface;
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n kestrelSurface = position;',
    );
    shader.fragmentShader = `varying vec3 kestrelSurface;
      float kestrelHash(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float kestrelNoise(vec3 p) {
        vec3 a=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(kestrelHash(a),kestrelHash(a+vec3(1,0,0)),f.x),
          mix(kestrelHash(a+vec3(0,1,0)),kestrelHash(a+vec3(1,1,0)),f.x),f.y),
          mix(mix(kestrelHash(a+vec3(0,0,1)),kestrelHash(a+vec3(1,0,1)),f.x),
          mix(kestrelHash(a+vec3(0,1,1)),kestrelHash(a+vec3(1,1,1)),f.x),f.y),f.z);
      }
${shader.fragmentShader}`;
    const detail = `float finishFootprint = max(length(dFdx(kestrelSurface)),length(dFdy(kestrelSurface)));
      float microFinish = 1.-smoothstep(.012,.06,finishFootprint);`;
    const response = {
      ceramic: `
        float broad = kestrelNoise(kestrelSurface*vec3(3.,7.,1.8));
        float finishGrain = kestrelNoise(kestrelSurface*84.);
        float airflow = kestrelNoise(kestrelSurface*vec3(24.,19.,1.6));
        diffuseColor.rgb *= .96 + broad*.04;
        roughnessFactor = clamp(roughnessFactor + (broad-.5)*.11 + (finishGrain-.5)*.026*microFinish + airflow*.025,.2,.43);`,
      graphite: `
        float mould = kestrelNoise(kestrelSurface*vec3(8.,4.,2.));
        float weave = sin(kestrelSurface.x*150.)*sin(kestrelSurface.z*150.);
        diffuseColor.rgb *= .91 + mould*.12;
        roughnessFactor = clamp(roughnessFactor + (mould-.5)*.16 + weave*.015*microFinish,.38,.68);`,
      titanium: `
        float brushing = kestrelNoise(kestrelSurface*vec3(95.,70.,1.8));
        float patina = kestrelNoise(kestrelSurface*4.);
        diffuseColor.rgb *= mix(vec3(.87,.91,.94),vec3(1.),patina);
        roughnessFactor = clamp(roughnessFactor + (brushing-.5)*.15*microFinish + (patina-.5)*.06,.25,.53);`,
      heat: `
        float temper = smoothstep(-3.35,-2.72,kestrelSurface.z);
        float oxidation = kestrelNoise(kestrelSurface*vec3(17.,17.,3.));
        vec3 heatTint = mix(vec3(.63,.72,.83),vec3(.92,.74,.50),temper);
        diffuseColor.rgb *= heatTint*(.85+oxidation*.18);
        roughnessFactor = clamp(roughnessFactor + (oxidation-.5)*.18,.43,.78);`,
    }[kind];
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\n${detail}\n${response}`,
    );
  };
  material.customProgramCacheKey = () => `kestrel-finish-2-${kind}`;
  return material;
}

// Own materials per ship; no global resource cache, browser canvas, or network
// assets. Ceramic, glass, composite and heat metal retain distinct responses.
export function createMaterials() {
  return {
    ceramic: finish(
      new THREE.MeshPhysicalMaterial({
        color: 0xe6e4de,
        metalness: 0.06,
        roughness: 0.29,
        clearcoat: 0.7,
        clearcoatRoughness: 0.27,
        envMapIntensity: 1.0,
      }),
      'ceramic',
    ),
    lowerCeramic: new THREE.MeshPhysicalMaterial({
      color: 0x8e9a9f,
      metalness: 0.12,
      roughness: 0.42,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
    }),
    graphite: finish(
      new THREE.MeshStandardMaterial({
        color: 0x252d34,
        metalness: 0.32,
        roughness: 0.55,
      }),
      'graphite',
    ),
    recess: new THREE.MeshStandardMaterial({
      color: 0x0c131a,
      metalness: 0.15,
      roughness: 0.88,
    }),
    titanium: finish(
      new THREE.MeshPhysicalMaterial({
        // Bright machined titanium with a thin diffuse oxide layer: the rim
        // remains readable when a city probe reflects dark road/architecture.
        color: 0xb0bbc3,
        metalness: 0.78,
        roughness: 0.34,
        envMapIntensity: 1.3,
      }),
      'titanium',
    ),
    heat: finish(
      new THREE.MeshStandardMaterial({
        color: 0xaea498,
        metalness: 0.82,
        roughness: 0.61,
      }),
      'heat',
    ),
    enamel: new THREE.MeshPhysicalMaterial({
      color: 0xd7462d,
      metalness: 0.07,
      roughness: 0.33,
      clearcoat: 0.65,
      clearcoatRoughness: 0.21,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x102633,
      metalness: 0.38,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: 1.65,
    }),
    whiteMark: new THREE.MeshStandardMaterial({
      color: 0xe5e9df,
      metalness: 0,
      roughness: 0.6,
    }),
    power: new THREE.MeshStandardMaterial({
      color: 0x58afbf,
      emissive: 0x269daf,
      emissiveIntensity: 1.6,
      metalness: 0.1,
      roughness: 0.38,
    }),
    plume: new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        glowColor: { value: new THREE.Color(0x339fcb) },
        strength: { value: 0.15 },
        flowTime: { value: 0 },
        boostMix: { value: 0 },
      },
      vertexShader: `
        varying float distanceAft; varying vec3 surfaceNormal; varying vec3 eye;
        varying float coreLayer;
        void main() {
          vec4 p = modelViewMatrix * vec4(position,1.0);
          distanceAft = clamp(-position.z,0.0,1.0);
          coreLayer = step(1.5,uv.y);
          surfaceNormal = normalize(normalMatrix * normal);
          eye = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform vec3 glowColor; uniform float strength; uniform float flowTime; uniform float boostMix;
        varying float distanceAft; varying vec3 surfaceNormal; varying vec3 eye;
        varying float coreLayer;
        void main() {
          float aft = distanceAft;
          float facing = abs(dot(normalize(surfaceNormal),normalize(eye)));
          // Optical depth goes to zero at the volume silhouette. Brightening
          // grazing edges made the prior open geometry look like glass shards.
          float softBoundary = pow(smoothstep(.025,.58,facing),1.25);
          // Low-contrast flow travels down the volume, without pulsing the full
          // screen or overpowering the reflective machined hardware.
          float flow = .88 + .12*sin(aft*48.-flowTime*(19.+boostMix*9.));
          float compression = pow(.5+.5*cos((aft-.21)*22.),3.);
          float mouthFade = smoothstep(.035,.16,aft);
          // Finish the optical volume before its mesh tip, including the
          // shorter inner core, so no geometric point remains visible.
          float tailFade = (1.-smoothstep(.48,.84,aft))*pow(max(0.,1.-aft),.65);
          float shellLight = (.17+compression*.48)*flow;
          float coreLight = (.62+compression*.40)*flow;
          float opacity = strength*mouthFade*tailFade*softBoundary*mix(shellLight,coreLight,coreLayer);
          vec3 color = mix(glowColor*.82,vec3(.50,.86,.94),coreLayer*.65+compression*.17);
          gl_FragColor = vec4(color,opacity);
        }`,
    }),
  };
}

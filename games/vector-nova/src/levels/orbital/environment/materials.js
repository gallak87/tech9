import * as THREE from 'three';

function surfaceFinish(material, kind) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 orbitalSurface;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n orbitalSurface = position;',
      );
    shader.fragmentShader = `varying vec3 orbitalSurface;
      float orbitHash(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+31.32); return fract((p.x+p.y)*p.z); }
      float orbitNoise(vec3 p) {
        vec3 a=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(orbitHash(a),orbitHash(a+vec3(1,0,0)),f.x),mix(orbitHash(a+vec3(0,1,0)),orbitHash(a+vec3(1,1,0)),f.x),f.y),
          mix(mix(orbitHash(a+vec3(0,0,1)),orbitHash(a+vec3(1,0,1)),f.x),mix(orbitHash(a+vec3(0,1,1)),orbitHash(a+vec3(1,1,1)),f.x),f.y),f.z);
      }\n${shader.fragmentShader}`;
    const response = {
      ceramic: `float firing=orbitNoise(orbitalSurface*.36); diffuseColor.rgb*=.965+firing*.035;
        roughnessFactor=clamp(roughnessFactor+(firing-.5)*.10,.22,.42);`,
      alloy: `float brushing=orbitNoise(orbitalSurface*vec3(6.,.8,28.));
        float patina=orbitNoise(orbitalSurface*.7); diffuseColor.rgb*=mix(vec3(.91,.94,.97),vec3(1.),patina);
        roughnessFactor=clamp(roughnessFactor+(brushing-.5)*.11+(patina-.5)*.08,.29,.58);`,
      composite: `float mould=orbitNoise(orbitalSurface*vec3(.7,1.3,.5));
        diffuseColor.rgb*=.91+mould*.12; roughnessFactor=clamp(roughnessFactor+(mould-.5)*.11,.52,.8);`,
    }[kind];
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\n${response}`,
    );
  };
  material.customProgramCacheKey = () =>
    `asterion-manufactured-finish-3-${kind}`;
  return material;
}

export function createOrbitalMaterials() {
  const width = 256;
  const normalBytes = new Uint8Array(width * width * 4);
  const roughBytes = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const grain = ((x * 73 + y * 131 + x * y * 17) % 31) - 15;
      normalBytes.set([128 + grain, 128 + grain / 3, 255, 255], i);
      const roughness = 226 + grain + (y % 43 === 0 ? -20 : 0);
      roughBytes.set([roughness, roughness, roughness, 255], i);
    }
  const normalMap = new THREE.DataTexture(normalBytes, width, width);
  const roughnessMap = new THREE.DataTexture(roughBytes, width, width);
  for (const texture of [normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  const standard = (color, roughness, metalness, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const alloy = (color, roughness, metalness, kind = 'alloy', extra = {}) =>
    surfaceFinish(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness,
        metalness,
        roughnessMap,
        normalMap,
        normalScale: new THREE.Vector2(0.12, 0.12),
        ...extra,
      }),
      kind,
    );
  return {
    ceramic: alloy('#d4d6ce', 0.32, 0.055, 'ceramic', {
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.62,
    }),
    ivory: alloy('#a3acae', 0.47, 0.57, 'alloy', { envMapIntensity: 0.58 }),
    titanium: alloy('#a0adb3', 0.49, 0.8, 'alloy', { envMapIntensity: 0.7 }),
    structure: standard('#7d8d95', 0.72, 0.48, {
      roughnessMap,
      normalMap,
      normalScale: new THREE.Vector2(0.08, 0.08),
      envMapIntensity: 0.3,
    }),
    // Large fabricated members carry a controlled factory coating. Broad
    // composite noise reads as stone on a six-metre girder face; its seams,
    // edge breaks and specular response carry the construction instead.
    enamel: new THREE.MeshPhysicalMaterial({
      color: '#5c707b',
      roughness: 0.58,
      metalness: 0.36,
      clearcoat: 0.14,
      clearcoatRoughness: 0.48,
      normalMap,
      normalScale: new THREE.Vector2(0.025, 0.025),
      envMapIntensity: 0.45,
    }),
    edgeAlloy: new THREE.MeshPhysicalMaterial({
      color: '#b7bfc0',
      roughness: 0.38,
      metalness: 0.75,
      normalMap,
      normalScale: new THREE.Vector2(0.025, 0.025),
      envMapIntensity: 0.58,
    }),
    dark: alloy('#29343d', 0.69, 0.22, 'composite', { envMapIntensity: 0.45 }),
    black: standard('#10171f', 0.83, 0.08, { envMapIntensity: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#405c6b',
      roughness: 0.13,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.065,
      envMapIntensity: 0.85,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
    interior: standard('#b9c3b9', 0.82, 0.02, {
      emissive: '#c0bd9a',
      emissiveIntensity: 0.12,
      envMapIntensity: 0.3,
    }),
    solar: standard('#172c49', 0.35, 0.64),
    amber: standard('#e5b45e', 0.32, 0.35, {
      emissive: '#efa54a',
      emissiveIntensity: 0.65,
    }),
    vermilion: standard('#995541', 0.48, 0.42),
  };
}

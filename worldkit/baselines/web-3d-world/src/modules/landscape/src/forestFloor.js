import * as THREE from 'three';
/** Shared scanned floor/path PBR; renderer supplies its own authored or broad terrain color. */
export function createForestFloorMaterial(
  textures,
  { color = '#f4efe3', vertexColors = false } = {},
) {
  const material = new THREE.MeshStandardMaterial({
    map: textures[0],
    normalMap: textures[1],
    roughnessMap: textures[2],
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.97,
    color,
    vertexColors,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pathTexture = { value: textures[3] };
    shader.uniforms.pathNormal = { value: textures[4] };
    shader.uniforms.pathRoughness = { value: textures[5] };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D pathTexture; uniform sampler2D pathNormal; uniform sampler2D pathRoughness;',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = max(.71, roughness * mix(texture2D(roughnessMap,vRoughnessMapUv).g,texture2D(pathRoughness,vRoughnessMapUv*1.28+vec2(.213,.782)).g,pathBlend));',
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec3 mapN = mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(pathNormal,vNormalMapUv*1.28+vec2(.213,.782)).xyz,pathBlend)*2.-1.;',
        ),
      );
  };
  material.customProgramCacheKey = () => 'forest-floor-pbr';
  material.userData.weather = { ground: true };
  return material;
}

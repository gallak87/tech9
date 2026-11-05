/** Keep the animated running skin in GTAO's normal/depth override pass.
 * Reusing its real vertex shader makes hardware depth and geometric normals
 * agree with the beauty surface, including traveling wave derivatives. */
export function installRavelAONormalPass(material) {
  if (material.userData.ravelAONormalPass) return material;
  const normalPass = { value: 0 };
  const compile = material.onBeforeCompile;
  const render = material.onBeforeRender;
  const cacheKey = material.customProgramCacheKey();
  material.allowOverride = false;
  material.userData.ravelAONormalPass = true;
  material.onBeforeCompile = function (shader, renderer) {
    compile?.call(this, shader, renderer);
    shader.uniforms.ravelAONormalPass = normalPass;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float ravelAONormalPass;',
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        if(ravelAONormalPass > .5){
          gl_FragColor=vec4(normalize(normal)*.5+.5,1.);
          return;
        }`,
      );
  };
  material.onBeforeRender = function (
    renderer,
    scene,
    camera,
    geometry,
    object,
    group,
  ) {
    render?.call(this, renderer, scene, camera, geometry, object, group);
    normalPass.value = scene.overrideMaterial?.isMeshNormalMaterial ? 1 : 0;
  };
  material.customProgramCacheKey = () => cacheKey + '-ravel-ao-normal-v1';
  return material;
}

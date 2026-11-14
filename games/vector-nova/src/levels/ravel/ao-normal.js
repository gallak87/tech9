import {
  appendShaderPatch,
  replaceShader,
} from '../../renderer/shader-patch.js';
/** Keep the animated running skin in GTAO's normal/depth override pass.
 * Reusing its real vertex shader makes hardware depth and geometric normals
 * agree with the beauty surface, including traveling wave derivatives. */
export function installRavelAONormalPass(material) {
  if (material.userData.ravelAONormalPass) return material;
  const normalPass = { value: 0 };
  const render = material.onBeforeRender;
  material.allowOverride = false;
  material.userData.ravelAONormalPass = true;
  appendShaderPatch(material, '-ravel-ao-normal-v1', (shader) => {
    shader.uniforms.ravelAONormalPass = normalPass;
    shader.fragmentShader = replaceShader(
      replaceShader(
        shader.fragmentShader,
        '#include <common>',
        '#include <common>\nuniform float ravelAONormalPass;',
      ),
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
        if(ravelAONormalPass > .5){
          gl_FragColor=vec4(normalize(normal)*.5+.5,1.);
          return;
        }`,
    );
  });
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
  return material;
}

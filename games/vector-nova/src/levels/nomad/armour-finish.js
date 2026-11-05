/** Broad coating variation and directional salt wear over the borrowed
 * Worldkit enamel substrate. Coordinates stay attached to the Blender hull.
 */
export function bindNomadArmourFinish(material) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       vec3 armourNormal=abs(normalize(cross(dFdx(industrialLocal),dFdy(industrialLocal))));
       vec2 armourP=armourNormal.x>.6?industrialLocal.zy:
         (armourNormal.y>.6?industrialLocal.zx:industrialLocal.xy);
       float armourTone=industrialNoise(armourP*.025+17.);
       float armourSalt=industrialNoise(armourP*.045+vec2(1.7,9.));
       float armourStreak=industrialNoise(vec2(armourP.x*.31,armourP.y*.025));
       float armourRunoff=smoothstep(.46,.78,armourStreak)*armourSalt;
       diffuseColor.rgb*=mix(.94,1.03,armourTone)*(1.-armourRunoff*.18);
       diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.82,.76,.64),
         smoothstep(.38,.72,armourSalt)*.20);
       roughnessFactor=clamp(roughnessFactor+armourSalt*.12+armourRunoff*.10,.42,.84);`,
    );
  };
  material.customProgramCacheKey = () => key + '-nomad-coating-wear-v2';
}

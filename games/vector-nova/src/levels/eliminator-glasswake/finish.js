import {
  appendShaderPatch,
  replaceShader,
} from '../../renderer/shader-patch.js';
import {
  finishCrystalPane,
  finishIceMaterial,
} from '../glasswake/environment/materials.js';

/** Broad mineral roles follow the existing formed planes: colder compact
 * faces and lower strata, restrained frost crowns, cobalt in the real voids.
 * This is a private finish on the new course, not a change to the source kit. */
export function finishFractureStrata(material, ice) {
  finishIceMaterial(material, ice, { composite: true });
  appendShaderPatch(material, ':fracture-formed-strata-v1', (shader) => {
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      vec3 faultNormal=normalize(vIceNormal);
      float faultWall=1.-smoothstep(.28,.78,abs(faultNormal.y));
      float coldPlane=.5+.5*dot(faultNormal,normalize(vec3(.65,.12,-.72)));
      float lowerStratum=1.-smoothstep(80.,310.,vIcePoint.y);
      vec3 compactTint=mix(vec3(.70,.83,1.0),vec3(.96,.99,1.02),coldPlane);
      compactTint*=mix(vec3(1.),vec3(.81,.91,1.02),lowerStratum*.65);
      diffuseColor.rgb*=mix(vec3(1.),compactTint,faultWall*(1.-frostIce)*.86);
      vec3 cobaltTint=mix(vec3(.72,.88,1.04),vec3(1.02,1.06,1.12),coldPlane);
      diffuseColor.rgb*=mix(vec3(1.),cobaltTint,darkIce);
    `,
    );
  });
}

/** Bonded frost travel bands share the actual clear pane, with no overlay,
 * raised edge or altered contact vertices. The uncoated centre and margins
 * retain the real canyon and compression structure beneath the raceway. */
export function finishFracturePane(material, ice, width) {
  finishCrystalPane(material, ice);
  appendShaderPatch(
    material,
    `:fracture-bonded-frost-v2:${width}`,
    (shader) => {
      shader.vertexShader =
        'attribute vec2 roadCoord; varying vec2 frostCoord;\n' +
        shader.vertexShader;
      shader.vertexShader = replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfrostCoord=roadCoord;',
      );
      shader.fragmentShader =
        'varying vec2 frostCoord;\n' + shader.fragmentShader;
      shader.fragmentShader = replaceShader(
        shader.fragmentShader,
        '#include <alphamap_fragment>',
        `
      #include <alphamap_fragment>
      float frostDistance=abs(abs(frostCoord.y)-${(width / 6).toFixed(5)});
      float travelFrost=1.-smoothstep(4.4,5.1,frostDistance);
      vec3 frozenBand=mix(vec3(.26,.42,.51),vec3(.63,.77,.83),smoothstep(.15,.45,luma));
      diffuseColor.rgb=mix(diffuseColor.rgb,frozenBand,travelFrost*.82);
      // Frost is translucent rather than an opaque road painted onto glass.
      diffuseColor.a=mix(diffuseColor.a,.58,travelFrost);
    `,
      );
      shader.fragmentShader = replaceShader(
        shader.fragmentShader,
        '#include <metalnessmap_fragment>',
        `
      #include <metalnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.70,travelFrost);
    `,
      );
      shader.fragmentShader = replaceShader(
        shader.fragmentShader,
        '#include <lights_fragment_end>',
        `
      #include <lights_fragment_end>
      // A frosted dielectric coat keeps a clear frozen reflection without
      // letting the low sun erase the approach or the acceptance markings.
      reflectedLight.directSpecular*=mix(.56,.34,travelFrost);
      reflectedLight.indirectSpecular*=.72;
    `,
      );
    },
  );
}

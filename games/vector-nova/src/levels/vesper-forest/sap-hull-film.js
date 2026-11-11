import * as T from 'three';
import { replaceShader } from '../../renderer/shader-patch.js';

/** Borrow the current opaque hull skin; only the lower, patchy wet coat is drawn. */
export function createSapHullFilm() {
  const group = new T.Group();
  group.name = 'Vesper sap / lower hull wet resin';
  group.visible = false;
  group.userData.aoExclude = group.userData.reflectionExclude = true;
  const inverse = new T.Matrix4();
  const uniforms = {
    sapHullInverse: { value: inverse },
    sapLower: { value: -0.12 },
    sapHeight: { value: 1.92 },
    sapFilmTime: { value: 0 },
  };
  const material = new T.MeshPhysicalMaterial({
    name: 'Vesper sap / dark amber wet hull film',
    color: 0x7c2d08,
    emissive: 0x803006,
    emissiveIntensity: 0.18,
    roughness: 0.26,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.24,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `uniform mat4 sapHullInverse; varying vec3 sapHullLocal;\n` +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        sapHullLocal=(sapHullInverse*modelMatrix*vec4(position,1.)).xyz;
        transformed+=normal*.025;`,
      );
    shader.fragmentShader =
      `uniform float sapLower,sapHeight,sapFilmTime;
      varying vec3 sapHullLocal;
      float sapHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float sapNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sapHash(i),sapHash(i+vec2(1.,0.)),f.x),mix(sapHash(i+vec2(0.,1.)),sapHash(i+vec2(1.)),f.x),f.y);}\n` +
      replaceShader(
        shader.fragmentShader,
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float height=(sapHullLocal.y-sapLower)/max(sapHeight,.1);
        float wetPatch=sapNoise(sapHullLocal.xz*vec2(1.3,.85));
        float rivulet=pow(.5+.5*sin(sapHullLocal.x*16.+sin(sapHullLocal.z*2.7)*2.3),10.);
        float hem=.24+wetPatch*.21+rivulet*.12;
        float coverage=1.-smoothstep(hem,hem+.12,height);
        coverage*=smoothstep(.18,.42,wetPatch+rivulet*.25);
        diffuseColor.a*=coverage;
        if(diffuseColor.a<.025)discard;
        diffuseColor.rgb*=.65+wetPatch*.45;
        diffuseColor.rgb+=vec3(.025,.006,.001)*rivulet;
      `,
      );
  };
  material.customProgramCacheKey = () => 'vesper-dark-lower-hull-sap-v1';
  let root,
    modelKey,
    disposed = false;
  const parts = [];
  const eligible = (source, ship) => {
    for (let node = source; node && node !== ship; node = node.parent)
      if (node.userData.aoExclude || node.userData.exhaustHeat) return false;
    return true;
  };
  const visible = (source) => {
    for (let node = source; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === root) return true;
    }
    return false;
  };
  function bind(ship) {
    if (root === ship && modelKey === ship.userData) return;
    group.removeFromParent();
    group.clear();
    parts.length = 0;
    root = ship;
    modelKey = ship.userData;
    ship.traverse((source) => {
      if (
        !source.isMesh ||
        !eligible(source, ship) ||
        !source.geometry.getAttribute('normal')
      )
        return;
      const surfaces = Array.isArray(source.material)
        ? source.material
        : [source.material];
      if (surfaces.every((surface) => surface.transparent)) return;
      const mesh = new T.Mesh(source.geometry, material);
      mesh.name = 'Vesper sap / wet lower ' + source.name;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
      group.add(mesh);
      parts.push({ source, mesh });
    });
    ship.add(group);
  }
  return {
    group,
    update(ship, contact, bounds, time = 0) {
      if (disposed) return;
      if (ship) bind(ship);
      group.visible = Boolean(ship && contact && parts.length);
      if (!group.visible) return;
      ship.updateWorldMatrix(true, true);
      inverse.copy(ship.matrixWorld).invert();
      uniforms.sapLower.value = bounds.min[1];
      uniforms.sapHeight.value = Math.max(0.1, bounds.max[1] - bounds.min[1]);
      uniforms.sapFilmTime.value = time;
      for (const { source, mesh } of parts) {
        mesh.visible = visible(source);
        mesh.matrix.multiplyMatrices(inverse, source.matrixWorld);
        mesh.matrixWorldNeedsUpdate = true;
      }
    },
    reset() {
      group.visible = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      parts.length = 0;
      material.dispose();
    },
  };
}

import {
  Material,
  Matrix3,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  RGBADepthPacking,
  Sphere,
  Vector2,
} from 'three';
import { validateFoliageWindGeometry } from './foliage-geometry.js';

const owners = new WeakMap();
const DECLARATIONS = `
attribute vec3 windAnchor;
attribute float windWeight;
attribute vec3 windGradient;
attribute float windPhase;
uniform float foliageWeatherTime;
uniform vec2 foliageWeatherWind;
uniform float foliageMaxOffset;
uniform float foliageResponse;
varying vec2 vFoliageDepthZW;
vec3 foliageWeatherOffset(vec3 anchorWorld, vec3 gradientWorld) {
  float magnitude=length(foliageWeatherWind);
  vec2 direction=foliageWeatherWind/max(magnitude,.0001);
  vec2 crosswind=vec2(-direction.y,direction.x);
  float spatial=dot(anchorWorld.xz,direction)*.012+dot(anchorWorld.xz,crosswind)*.007;
  float slow=sin(foliageWeatherTime*.64+spatial+windPhase*.17);
  float flutter=sin(foliageWeatherTime*2.71+windPhase+spatial*.3);
  float lateral=sin(foliageWeatherTime*1.83+windPhase*1.7);
  float lift=sin(foliageWeatherTime*3.17+windPhase*.73);
  // The existing Weather vector already contains its shared gust strength.
  // Component budgets sum to1, so this never exceeds the authored world margin.
  float reach=min(foliageMaxOffset,.32/max(length(gradientWorld),.00001));
  float strength=clamp(magnitude/5.,0.,1.)*foliageResponse;
  vec2 horizontal=direction*(.68*slow+.12*flutter)+crosswind*(.08*lateral);
  return vec3(horizontal.x,.12*lift,horizontal.y)*(reach*strength);
}
`;

const PREPARE = `
  mat3 foliageToWorld=mat3(modelMatrix);
  vec4 foliageAnchorWorld=vec4(windAnchor,1.);
  #ifdef USE_INSTANCING
    foliageToWorld=foliageToWorld*mat3(instanceMatrix);
    foliageAnchorWorld=instanceMatrix*foliageAnchorWorld;
  #endif
  foliageAnchorWorld=modelMatrix*foliageAnchorWorld;
  mat3 foliageFromWorld=inverse(foliageToWorld);
  vec3 foliageGradientWorld=transpose(foliageFromWorld)*windGradient;
  vec3 foliageLocalOffset=foliageFromWorld*foliageWeatherOffset(foliageAnchorWorld.xyz,foliageGradientWorld);
  float foliageT=clamp(windWeight,0.,1.);
  float foliageWeight=foliageT*foliageT*(3.-2.*foliageT);
  vec3 foliageDerivative=windGradient*(6.*foliageT*(1.-foliageT));
`;

/** Identical displacement is installed in beauty, depth and point-shadow shaders. */
function patchVertex(source) {
  for (const marker of ['#include <common>', '#include <begin_vertex>'])
    if (!source.includes(marker))
      throw new Error(`Foliage wind shader is missing ${marker}`);
  return source
    .replace('#include <common>', `#include <common>\n${DECLARATIONS}`)
    .replace(/void main\s*\(\s*\)\s*\{/, (entry) => `${entry}\n${PREPARE}`)
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      // Inverse-transpose of I + offset x gradient: exact normal differential
      // for the anchored tip deformation, including scaled/rotated instances.
      objectNormal=normalize(objectNormal-foliageDerivative*dot(foliageLocalOffset,objectNormal)/max(.2,1.+dot(foliageDerivative,foliageLocalOffset)));
      #ifdef USE_TANGENT
        objectTangent=normalize(objectTangent+foliageLocalOffset*dot(foliageDerivative,objectTangent));
      #endif
    `,
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed+=foliageLocalOffset*foliageWeight;',
    )
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvFoliageDepthZW=gl_Position.zw;',
    );
}

function inverseWorldBound(mesh, maxOffset) {
  mesh.updateWorldMatrix(true, false);
  const matrix = new Matrix3().setFromMatrix4(mesh.matrixWorld);
  if (Math.abs(matrix.determinant()) < 1e-10)
    throw new Error('Foliage wind requires a nonsingular object transform');
  const e = matrix.invert().elements;
  const columns = Math.max(
    ...[0, 1, 2].map(
      (c) =>
        Math.abs(e[c * 3]) + Math.abs(e[c * 3 + 1]) + Math.abs(e[c * 3 + 2]),
    ),
  );
  const rows = Math.max(
    ...[0, 1, 2].map(
      (r) => Math.abs(e[r]) + Math.abs(e[r + 3]) + Math.abs(e[r + 6]),
    ),
  );
  return maxOffset * Math.sqrt(columns * rows);
}

/**
 * Anchored leaf response to an existing createWeather().condition. No weather
 * state, clock, frame loop, textures, geometry updates or extra draws are owned.
 */
export function createFoliageWind({ maxOffset = 2.4, response = 1 } = {}) {
  if (
    !Number.isFinite(maxOffset) ||
    maxOffset < 0 ||
    !Number.isFinite(response) ||
    response < 0 ||
    response > 1
  )
    throw new RangeError(
      'Foliage wind requires a nonnegative maxOffset and response in 0–1',
    );
  const uniforms = {
    foliageWeatherTime: { value: 0 },
    foliageWeatherWind: { value: new Vector2() },
    foliageMaxOffset: { value: maxOffset },
    foliageResponse: { value: response },
    foliageNormalPass: { value: 0 },
  };
  const materials = new Map(),
    bindings = new Map(),
    shadows = new Set(),
    sharedShadows = new Map();
  let disposed = false;
  function install(material) {
    if (materials.has(material)) return;
    if (owners.has(material))
      throw new Error(
        'Foliage material already belongs to another wind response',
      );
    const previous = material.onBeforeCompile,
      previousKey = material.customProgramCacheKey;
    const previousRender = material.onBeforeRender;
    const previousOverride = material.allowOverride;
    const normalPass =
      material.isMeshStandardMaterial ||
      material.isMeshLambertMaterial ||
      material.isMeshPhongMaterial;
    const baseKey = () =>
      previousKey === Material.prototype.customProgramCacheKey
        ? previous.toString()
        : previousKey.call(material);
    let enabled = true;
    const compile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      if (!enabled) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = patchVertex(shader.vertexShader);
      if (normalPass)
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>\n${shader.fragmentShader.includes('#include <packing>') ? '' : '#include <packing>'}\nuniform float foliageNormalPass;\nvarying vec2 vFoliageDepthZW;`,
          )
          .replace(
            '#include <normal_fragment_begin>',
            `#include <normal_fragment_begin>
            float foliageDepth=.5*vFoliageDepthZW.x/vFoliageDepthZW.y+.5;
            if(foliageNormalPass>2.5){gl_FragColor=packDepthToRGBA(foliageDepth);return;}
            if(foliageNormalPass>1.5){gl_FragColor=vec4(vec3(1.-foliageDepth),diffuseColor.a);return;}
            if(foliageNormalPass>.5){gl_FragColor=vec4(normalize(normal)*.5+.5,1.);return;}
          `,
          );
    };
    const key = () => `${baseKey()}:weather-anchored-foliage-v1:${enabled}`;
    material.onBeforeCompile = compile;
    material.customProgramCacheKey = key;
    material.needsUpdate = true;
    const render = function (renderer, scene, ...args) {
      previousRender?.call(this, renderer, scene, ...args);
      const override = scene.overrideMaterial;
      uniforms.foliageNormalPass.value = override?.isMeshNormalMaterial
        ? 1
        : override?.isMeshDepthMaterial
          ? override.depthPacking === RGBADepthPacking
            ? 3
            : 2
          : 0;
    };
    if (normalPass) {
      material.allowOverride = false;
      material.onBeforeRender = render;
    }
    owners.set(material, materials);
    materials.set(material, () => {
      enabled = false;
      if (material.onBeforeCompile === compile)
        material.onBeforeCompile = previous;
      if (material.customProgramCacheKey === key)
        material.customProgramCacheKey = previousKey;
      if (normalPass && material.onBeforeRender === render)
        material.onBeforeRender = previousRender;
      if (normalPass && material.allowOverride === false)
        material.allowOverride = previousOverride;
      if (owners.get(material) === materials) owners.delete(material);
      material.needsUpdate = true;
    });
  }
  function shadowMaterial(source, previous, distance) {
    const material =
      previous?.clone() ??
      (distance
        ? new MeshDistanceMaterial()
        : new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));
    if (previous) {
      material.onBeforeCompile = previous.onBeforeCompile;
      material.customProgramCacheKey = previous.customProgramCacheKey;
    }
    for (const key of [
      'map',
      'alphaMap',
      'alphaTest',
      'opacity',
      'side',
      'clipShadows',
      'clippingPlanes',
    ])
      material[key] = source[key];
    install(material);
    shadows.add(material);
    return material;
  }
  function bind(mesh) {
    if (disposed) throw new Error('Foliage wind is disposed');
    if (bindings.has(mesh)) {
      mesh.computeBoundingSphere();
      return mesh;
    }
    if (!mesh?.isMesh || Array.isArray(mesh.material))
      throw new TypeError('Foliage wind binds one leaf material per mesh');
    if (
      mesh.isSkinnedMesh ||
      mesh.isBatchedMesh ||
      mesh.geometry.morphAttributes.position?.length
    )
      throw new TypeError('Foliage wind requires baked, unskinned leaf meshes');
    if (!(
      mesh.material.isMeshStandardMaterial ||
      mesh.material.isMeshLambertMaterial ||
      mesh.material.isMeshPhongMaterial
    ))
      throw new TypeError(
        'Foliage wind requires a Standard, Physical, Lambert or Phong leaf material',
      );
    validateFoliageWindGeometry(mesh.geometry);
    inverseWorldBound(mesh, maxOffset);
    if (owners.has(mesh.material) && owners.get(mesh.material) !== materials)
      throw new Error(
        'Foliage material already belongs to another wind response',
      );
    const previousDepth = mesh.customDepthMaterial,
      previousDistance = mesh.customDistanceMaterial;
    let pair =
      !previousDepth && !previousDistance
        ? sharedShadows.get(mesh.material)
        : null;
    if (!pair) {
      pair = [
        shadowMaterial(mesh.material, previousDepth, false),
        shadowMaterial(mesh.material, previousDistance, true),
      ];
      if (!previousDepth && !previousDistance)
        sharedShadows.set(mesh.material, pair);
    }
    install(mesh.material);
    mesh.customDepthMaterial = pair[0];
    mesh.customDistanceMaterial = pair[1];
    const previousSphere = mesh.boundingSphere;
    const previousCompute = mesh.computeBoundingSphere;
    const ownCompute = Object.hasOwn(mesh, 'computeBoundingSphere');
    let ownedSphere;
    mesh.boundingSphere = previousSphere?.clone() ?? new Sphere();
    const compute = function () {
      if (previousCompute) previousCompute.call(this);
      else {
        if (!this.geometry.boundingSphere)
          this.geometry.computeBoundingSphere();
        this.boundingSphere.copy(this.geometry.boundingSphere);
      }
      this.boundingSphere.radius += inverseWorldBound(this, maxOffset);
      ownedSphere = this.boundingSphere;
    };
    mesh.computeBoundingSphere = compute;
    compute.call(mesh);
    bindings.set(mesh, () => {
      if (mesh.customDepthMaterial === pair[0])
        mesh.customDepthMaterial = previousDepth;
      if (mesh.customDistanceMaterial === pair[1])
        mesh.customDistanceMaterial = previousDistance;
      if (mesh.computeBoundingSphere === compute) {
        if (ownCompute) mesh.computeBoundingSphere = previousCompute;
        else delete mesh.computeBoundingSphere;
      }
      if (mesh.boundingSphere === ownedSphere) {
        if (previousSphere === undefined) delete mesh.boundingSphere;
        else mesh.boundingSphere = previousSphere;
      }
    });
    return mesh;
  }
  return {
    maxOffset,
    bind,
    update(condition, { reducedMotion = false } = {}) {
      if (disposed || condition?.paused || reducedMotion) return;
      if (
        ![condition?.time, condition?.windX, condition?.windZ].every(
          Number.isFinite,
        )
      )
        throw new TypeError(
          'Foliage wind requires an existing Weather condition',
        );
      uniforms.foliageWeatherTime.value = condition.time;
      uniforms.foliageWeatherWind.value.set(condition.windX, condition.windZ);
    },
    get stats() {
      return {
        meshes: bindings.size,
        materials: materials.size,
        shadowMaterials: shadows.size,
        time: uniforms.foliageWeatherTime.value,
        maxOffset,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      [...bindings.values()].reverse().forEach((restore) => restore());
      [...materials.values()].reverse().forEach((restore) => restore());
      shadows.forEach((material) => material.dispose());
      bindings.clear();
      materials.clear();
      shadows.clear();
      sharedShadows.clear();
    },
  };
}

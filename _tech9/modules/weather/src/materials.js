import { Vector2, Vector4 } from 'three';
import { surfaceGLSL } from './surfaces.js';

/** Wrap caller hooks. One installation per material; restore only hooks we own. */
export function installWeatherMaterials(targets, field, state) {
  // Validate the entire batch before changing a caller's first material.
  for (const target of targets) {
    if (!target.material?.isMeshStandardMaterial)
      throw new Error(
        'Weather surface targets require MeshStandardMaterial or MeshPhysicalMaterial.',
      );
    for (const key of ['snow', 'wet', 'wind'])
      if (target[key] !== undefined && !Number.isFinite(target[key]))
        throw new Error(`Weather target ${key} must be finite.`);
  }
  const owned = [];
  const uniforms = {
    weatherField: { value: field.texture },
    weatherBounds: {
      value: new Vector4(field.bounds.x, field.bounds.y, ...field.size),
    },
    weatherWet: { value: 0 },
    weatherSnow: { value: 0 },
    weatherWinter: { value: 0 },
    weatherTime: { value: 0 },
    weatherWind: { value: new Vector2() },
  };
  const seen = new Set();
  for (const target of targets) {
    const material = target.material;
    if (!material?.isMeshStandardMaterial)
      throw new Error(
        'Weather surface targets require MeshStandardMaterial or MeshPhysicalMaterial.',
      );
    if (seen.has(material)) continue;
    seen.add(material);
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    const baseKey = previousKey.call(material);
    const snow = Math.max(0, Math.min(1, target.snow ?? 1));
    const wet = Math.max(0, Math.min(1, target.wet ?? 1));
    const wind = Math.max(0, Math.min(1, target.wind ?? 0));
    const ground = target.ground ? 1 : 0;
    const foliage = target.foliage ? 1 : 0;
    const compile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
        ${surfaceGLSL}
        uniform float weatherSnow; uniform float weatherTime; uniform vec2 weatherWind;
        varying vec3 vWeatherPosition; varying vec3 vWeatherNormal;
      `,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vec4 weatherWorld = vec4(position,1.0);
        vec3 weatherN = normal;
        #ifdef USE_INSTANCING
          weatherWorld = instanceMatrix * weatherWorld;
          weatherN = transpose(inverse(mat3(instanceMatrix))) * weatherN;
        #endif
        weatherWorld = modelMatrix * weatherWorld;
        weatherN = normalize(transpose(inverse(mat3(modelMatrix))) * weatherN);
        vec4 weatherHit = weatherSurface(weatherWorld.xz);
        float weatherExposure = mix(weatherHit.g, 1.0, smoothstep(weatherHit.a-0.8,weatherHit.a+0.4,weatherWorld.y));
        float weatherRetention = mix(1.0,weatherHit.b,${ground.toFixed(1)});
        float weatherDeposit = smoothstep(0.23,0.8,weatherN.y) * weatherExposure * weatherRetention * weatherSnow * ${snow.toFixed(3)};
        // Thin, bounded accumulation. World-space lift remains valid for scaled instances.
        float weatherDepth = weatherDeposit * 0.065;
        vec2 weatherBend = weatherWind * ${wind.toFixed(3)} * min(pow(max(position.y,0.0),1.4),5.0) * (0.055 + 0.018*sin(weatherTime*1.3+weatherWorld.x*0.7+weatherWorld.z*0.5));
        vec3 weatherOffset = vec3(weatherBend.x,weatherDepth,weatherBend.y);
        #ifdef USE_INSTANCING
          transformed += inverse(mat3(modelMatrix)*mat3(instanceMatrix)) * weatherOffset;
        #else
          transformed += inverse(mat3(modelMatrix)) * weatherOffset;
        #endif
        vWeatherPosition = weatherWorld.xyz;
        vWeatherNormal = weatherN;
      `,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        ${surfaceGLSL}
        uniform float weatherSnow; uniform float weatherWet; uniform float weatherWinter;
        varying vec3 vWeatherPosition; varying vec3 vWeatherNormal;
      `,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec4 weatherHit = weatherSurface(vWeatherPosition.xz);
        float weatherExposure = mix(weatherHit.g, 1.0, smoothstep(weatherHit.a-0.8,weatherHit.a+0.4,vWeatherPosition.y));
        float weatherRetention = mix(1.0,weatherHit.b,${ground.toFixed(1)});
        float weatherSlope = smoothstep(0.23,0.8,normalize(vWeatherNormal).y);
        float weatherMacro = weatherNoise(vWeatherPosition.xz*1.8) * 0.65 + weatherNoise(vWeatherPosition.xz*8.0) * 0.35;
        float weatherAmount = weatherSnow * weatherExposure * weatherRetention * ${snow.toFixed(3)};
        float weatherCover = smoothstep(0.15,0.4,weatherAmount - (1.0-weatherSlope)*0.65 - weatherMacro*0.21);
        weatherCover *= weatherSlope;
        float weatherMoisture = weatherWet * mix(0.25,1.0,weatherExposure) * ${wet.toFixed(3)};
        diffuseColor.rgb *= 1.0 - weatherMoisture * 0.33;
        // Seasonal vegetation retains texture and variety instead of becoming emissive green.
        float winterLuma = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb,vec3(winterLuma*0.92,winterLuma*0.94,winterLuma*0.83),0.55),weatherWinter*${foliage.toFixed(1)});
        vec3 snowColor = vec3(0.77,0.84,0.88) * (0.91+weatherMacro*0.09);
        snowColor *= 1.0-weatherMoisture*0.1;
        diffuseColor.rgb = mix(diffuseColor.rgb,snowColor,weatherCover);
      `,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, max(0.18,roughnessFactor*0.39),weatherMoisture);
        roughnessFactor = mix(roughnessFactor,0.83-weatherMoisture*0.2,weatherCover);
      `,
        )
        .replace(
          '#include <lights_physical_fragment>',
          `
        normal = normalize(mix(normal,nonPerturbedNormal,weatherCover*0.78));
        #include <lights_physical_fragment>
      `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
        totalEmissiveRadiance *= (1.0-weatherCover)*(1.0-weatherWinter*0.85);
      `,
        );
    };
    const cacheKey = () =>
      `${baseKey}:weather-v1:${snow}:${wet}:${wind}:${ground}:${foliage}`;
    material.onBeforeCompile = compile;
    material.customProgramCacheKey = cacheKey;
    material.needsUpdate = true;
    owned.push(() => {
      if (material.onBeforeCompile === compile)
        material.onBeforeCompile = previous;
      if (material.customProgramCacheKey === cacheKey)
        material.customProgramCacheKey = previousKey;
      material.needsUpdate = true;
    });
  }
  return {
    update() {
      uniforms.weatherWet.value = state.wetness;
      uniforms.weatherSnow.value = state.snow;
      uniforms.weatherWinter.value = state.winter;
      uniforms.weatherTime.value = state.time;
      uniforms.weatherWind.value.set(state.windX, state.windZ);
    },
    dispose() {
      owned
        .splice(0)
        .reverse()
        .forEach((restore) => restore());
    },
  };
}

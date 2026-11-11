import { replaceShader } from '../../renderer/shader-patch.js';
import { finishHabitatMaterial } from '../oriel/environment/habitat.js';

/** This private copy borrows the inhabited world, not the old circuit's
 * unsupported road-specific piers/coils. Belts, endcaps and sun stay intact. */
export function finishSunvaultShell(group, lifetime, civicKit, maps) {
  const materials = new Set(),
    farMaterials = new Map();
  function farMaterial(original) {
    if (farMaterials.has(original.name)) return farMaterials.get(original.name);
    const material = lifetime.own(original.clone());
    if (/limestone/.test(material.name)) {
      maps.apply(material);
      material.color.set('#b6b49e');
      material.normalScale.set(0.16, 0.16);
    } else {
      material.color.set('#35595c');
      material.roughness = 0.68;
      material.metalness = 0.15;
    }
    finishHabitatMaterial(material, { bounce: 0.1 });
    material.envMapIntensity = 0.14;
    farMaterials.set(original.name, material);
    return material;
  }
  group.traverse((object) => {
    if (!object.isMesh) return;
    // The source's proximity tiers were selected for its original circuit.
    // At this course's5× world scale those detailed window/trim meshes alias.
    // Keep their actual placements, using the canonical coarse civic bodies.
    const category =
      /^Oriel \/ (gardenCourt|waterfront|tower) civic streets$/.exec(
        object.name,
      )?.[1];
    if (category && object.isInstancedMesh) {
      const role = /warm cut limestone/.test(object.material.name)
        ? 'stone'
        : /patinated titanium roof/.test(object.material.name)
          ? 'roof'
          : null;
      const part =
        role &&
        civicKit.prototypes[`${category}Far`].find((entry) =>
          role === 'stone'
            ? /warm cut limestone/.test(entry.material.name)
            : /patinated titanium roof/.test(entry.material.name),
        );
      if (!part) {
        object.visible = false;
        return;
      }
      object.geometry = part.geometry;
      object.material = farMaterial(part.material);
      object.userData.sunvaultFarLOD = `${category}Far/${role}`;
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
    for (const material of [object.material].flat()) materials.add(material);
    if (object.parent?.name !== 'Oriel / axial sun and habitat foundations')
      return;
    const source = object.geometry,
      p = source.attributes.position,
      index = source.index;
    const retained = [];
    const worldMember = (id) => {
      const r = Math.hypot(p.getX(id), p.getY(id) - 1000);
      return Math.abs(p.getZ(id)) > 2280 || r > 962 || r < 40;
    };
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map((offset) =>
        index ? index.getX(i + offset) : i + offset,
      );
      if (ids.every(worldMember)) retained.push(...ids);
    }
    if (!retained.length) {
      object.visible = false;
      return;
    }
    const geometry = lifetime.own(source.clone());
    geometry.setIndex(retained);
    object.geometry = geometry;
  });
  for (const material of materials) {
    if (material.userData.orielFoliage) {
      material.color.set('#74916a');
      material.emissiveIntensity = 0.015;
      material.alphaToCoverage = false;
      material.needsUpdate = true;
    }
    if (material.name === 'Oriel / deep teal formed endcap shutters')
      material.color.set('#25444b');
    if (
      material.name ===
      'Oriel / planted inner landscape and reflecting reservoirs'
    ) {
      const compile = material.onBeforeCompile,
        key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer);
        shader.fragmentShader = replaceShader(
          shader.fragmentShader,
          'vec3 planted=mix(vec3(.055,.17,.08),vec3(.18,.28,.13),crop*.78);',
          'vec3 planted=mix(vec3(.024,.105,.052),vec3(.115,.225,.085),crop*.78);',
        );
        shader.fragmentShader = replaceShader(
          shader.fragmentShader,
          'vec3 shallow=vec3(.03,.32,.39),deep=vec3(.014,.18,.30);',
          'vec3 shallow=vec3(.012,.29,.32),deep=vec3(.005,.105,.18);',
        );
        shader.fragmentShader = replaceShader(
          shader.fragmentShader,
          'planted=mix(planted,vec3(.13,.22,.14),smoothstep(.10,.32,settlement)*.15);',
          'planted=mix(planted,vec3(.30,.29,.22),smoothstep(.10,.48,settlement)*.46);',
        );
      };
      material.customProgramCacheKey = () =>
        key + ':sunvault-landscape-value-v1';
    }
  }
  return {
    materials: [...farMaterials.values()],
    settleBounce() {
      for (const material of materials)
        if (material.userData.orielRadialBounce)
          material.userData.orielRadialBounce.value = material.name.includes(
            'landscape',
          )
            ? 0.08
            : 0.12;
    },
  };
}

import * as T from 'three';
import { createLivingForestKit } from '@worldkit/environment/living-forest';
import { replaceShader } from '../../renderer/shader-patch.js';
import { addSunvaultInstances } from './civic-works.js';

/** Public Worldkit vegetation, seated on the original civic kit's actual soil
 * sockets. The already-owned shell supplies borrowed bark/leaf images. */
export function createSunvaultGardens({
  lifetime,
  shell,
  civicKit,
  placements,
  stone,
  quarterAnchors = [],
}) {
  const group = new T.Group();
  group.name = 'Sunvault / planted courts and calm roof reservoirs';
  let bark, leaves;
  shell.group.traverse((object) => {
    for (const material of [object.material].flat().filter(Boolean)) {
      if (material.name === 'Living Forest / silver weathered fluted bark')
        bark ??= material.map;
      if (material.name === 'Living Forest / dense attached jade leaf sprays')
        leaves ??= material.map;
    }
  });
  if (!bark || !leaves)
    throw new Error('Sunvault needs the canonical Worldkit garden textures');
  const forest = lifetime.own(
    createLivingForestKit({
      detail: 'low',
      textures: { wood: { map: bark }, leaf: { map: leaves } },
    }),
  );
  forest.materials.wood.color.set('#a19b83');
  // The borrowed bark/leaf maps already contain their dark natural colour.
  // A light neutral tint preserves readable green canopies without emission.
  forest.materials.leaf.color.set('#b4c3a8');
  forest.materials.leaf.roughness = 0.82;
  forest.materials.leaf.emissiveIntensity = 0;
  // The HDR composer target does not supply hardware MSAA coverage. Preserve
  // real alpha-tested cutouts instead of writing fractional fringe RGB.
  forest.materials.leaf.alphaToCoverage = false;
  const water = lifetime.own(
    new T.MeshPhysicalMaterial({
      name: 'Sunvault / turquoise civic reservoir water',
      color: '#267c87',
      roughness: 0.19,
      metalness: 0.08,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.85,
    }),
  );
  const clock = { value: 0 };
  water.onBeforeCompile = (shader) => {
    shader.uniforms.sunvaultWaterTime = clock;
    shader.vertexShader = replaceShader(
      `varying vec3 sunvaultWaterPoint;\n${shader.vertexShader}`,
      '#include <begin_vertex>',
      '#include <begin_vertex>\nsunvaultWaterPoint=position;\n#ifdef USE_INSTANCING\nsunvaultWaterPoint=(instanceMatrix*vec4(position,1.)).xyz;\n#endif',
    );
    shader.fragmentShader = replaceShader(
      `varying vec3 sunvaultWaterPoint;uniform float sunvaultWaterTime;\n${shader.fragmentShader}`,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float wx=sin(sunvaultWaterPoint.x*.31+sunvaultWaterPoint.z*.17+sunvaultWaterTime*.28)*.027;
      float wz=cos(sunvaultWaterPoint.z*.39-sunvaultWaterPoint.x*.13+sunvaultWaterTime*.21)*.022;
      normal=normalize(normal+mat3(viewMatrix)*vec3(wx,0.,wz));`,
    );
  };
  water.customProgramCacheKey = () => 'sunvault-quiet-civic-water-v1';
  const trees = [[], []],
    quarterShrubs = [],
    basins = [],
    pools = [];
  let seed = 0;
  // Retain the canonical quarter's actual soil sockets and mature planting
  // scales, transformed with the complete district rather than a separate grid.
  for (const anchor of quarterAnchors) {
    const matrix = new T.Matrix4().compose(
      anchor.position,
      anchor.quaternion,
      anchor.scale,
    );
    if (anchor.kind === 'shrub') quarterShrubs.push(matrix);
    else trees[1].push(matrix);
  }
  for (const [category, matrices] of Object.entries(placements)) {
    const anchors = civicKit.plantingAnchors[category] ?? [];
    for (const matrix of matrices) {
      for (const [index, anchor] of anchors.entries()) {
        const size = 0.18 + (index % 3) * 0.015;
        const local = new T.Matrix4().compose(
          new T.Vector3(...anchor),
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            seed++ * 1.7,
          ),
          new T.Vector3(size, size, size),
        );
        trees[index % 2].push(matrix.clone().multiply(local));
      }
      if (category === 'gardenCourt') {
        basins.push(
          matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(0, 2.05, 9))
            .multiply(new T.Matrix4().makeScale(26, 0.9, 24)),
        );
        pools.push(
          matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(0, 2.52, 9))
            .multiply(new T.Matrix4().makeScale(23.8, 1, 21.8)),
        );
      }
      if (category === 'waterfront') {
        basins.push(
          matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(0, 0.45, 56))
            .multiply(new T.Matrix4().makeScale(138, 0.9, 27)),
        );
        pools.push(
          matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(0, 0.93, 56))
            .multiply(new T.Matrix4().makeScale(135.8, 1, 24.8)),
        );
      }
    }
  }
  function add(geometry, material, matrices, name, shadows = false) {
    addSunvaultInstances({
      group,
      lifetime,
      geometry,
      material,
      matrices,
      name,
      shadows,
    });
  }
  for (const [index, matrices] of trees.entries())
    for (const part of forest.prototypes[index].treeParts)
      add(
        part.geometry,
        part.material,
        matrices,
        'Sunvault / rooted Worldkit courtyard and roof groves',
        false,
      );
  for (const part of forest.shrubParts)
    add(
      part.geometry,
      part.material,
      quarterShrubs,
      'Sunvault / continuous quarter soil-seated Worldkit planting',
      false,
    );
  const basinGeometry = lifetime.own(new T.BoxGeometry(1, 1, 1));
  const waterGeometry = lifetime.own(
    new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  );
  add(
    basinGeometry,
    stone,
    basins,
    'Sunvault / seated central court reservoir basins',
  );
  add(
    waterGeometry,
    water,
    pools,
    'Sunvault / cool reflective open courtyard water',
  );
  return {
    group,
    materials: [forest.materials.wood, forest.materials.leaf, water],
    update(frame) {
      clock.value = frame.settings?.reducedMotion ? 0 : (frame.time ?? 0);
    },
  };
}

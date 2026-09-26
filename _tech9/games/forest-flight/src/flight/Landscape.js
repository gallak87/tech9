import * as THREE from 'three';
import {
  groundHeight,
  trees,
  treeCells,
  detailTile,
} from './LandscapeLayout.js';
import { softenShadowSampling } from '../core/softShadows.js';

const ROOT = `${import.meta.env?.BASE_URL ?? './'}assets/`;
const TREE_NAMES = ['pine_a', 'pine_b', 'pine_c'];
const DETAIL_NAMES = [
  'pine_sapling',
  'rock_a',
  'rock_b',
  'fallen_log',
  'grass_short',
  'grass_short_lod',
  'grass_tall',
  'fern_a',
  'fern_b',
];

/** Finite terrain + fixed canopy + reusable detail buffers. No travel-time GPU allocation. */
export async function createLandscape(context, kit) {
  const group = new THREE.Group();
  group.name = 'Baseline forest / traveling detail';
  const resources = new Set();
  const keep = (r) => {
    resources.add(r);
    return r;
  };
  const eye = { value: new THREE.Vector3() };
  const time = { value: 0 };
  const stats = {
    trees: trees.length,
    nearTrees: 0,
    detailInstances: 0,
    detailTiles: 49,
    rebuilds: 0,
    poolCapacity: 0,
  };
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const prototypes = new Map();
  const cleanup = () => {
    group.removeFromParent();
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    resources.forEach((r) => r.dispose());
    resources.clear();
    group.clear();
  };
  try {
    kit.updateMatrixWorld(true);

    // Preserve the baseline's bark/needle, scanned fern and mossy granite materials,
    // prototype transforms, alpha coverage, transmission and plant wind treatment.
    for (const name of [...TREE_NAMES, ...DETAIL_NAMES]) {
      const root = kit.getObjectByName(name);
      if (!root) throw new Error(`Missing baseline forest asset: ${name}`);
      const inverse = root.matrixWorld.clone().invert();
      const parts = [];
      root.traverse((part) => {
        if (!part.isMesh) return;
        const geometry = keep(
          part.geometry
            .clone()
            .applyMatrix4(
              new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld),
            ),
        );
        const material = keep(part.material.clone());
        material.envMapIntensity = 0.3;
        if (material.map) material.map.anisotropy = 8;
        if (name.startsWith('rock')) {
          const uv = geometry.attributes.uv;
          for (let i = 0; i < uv.count; i++)
            uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
          material.normalScale?.setScalar(0.55);
        }
        const plant = name.startsWith('grass') || name.startsWith('fern');
        if (plant) {
          material.color.multiplyScalar(name.startsWith('grass') ? 1.48 : 1.34);
          material.normalScale?.setScalar(0.5);
          material.emissive.set('#617c36');
          material.emissiveIntensity = name.startsWith('grass') ? 0.115 : 0.07;
        }
        if (
          material.alphaTest > 0 ||
          material.name.toLowerCase().includes('needle')
        ) {
          material.side = THREE.DoubleSide;
          material.alphaTest = material.name.toLowerCase().includes('needle')
            ? 0.37
            : 0.42;
          material.alphaToCoverage = true;
          material.transparent = false;
          material.roughness = 0.95;
        }
        parts.push({ geometry, material, plant });
      });
      if (TREE_NAMES.includes(name)) {
        const bounds = new THREE.Box3();
        for (const part of parts) {
          part.geometry.computeBoundingBox();
          bounds.union(part.geometry.boundingBox);
        }
        const height = bounds.max.y - bounds.min.y;
        for (const part of parts) {
          part.geometry.translate(0, -bounds.min.y, 0);
          part.geometry.scale(1.22 / height, 1 / height, 1.22 / height);
        }
      }
      prototypes.set(name, parts);
    }

    function fade(
      material,
      near,
      far,
      inverse = false,
      plant = false,
      tree = false,
    ) {
      material.alphaToCoverage = true;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { landscapeEye: eye, plantTime: time });
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
        uniform vec3 landscapeEye; uniform float plantTime; varying float vDetailDistance;`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 base = instanceMatrix[3].xyz;
          ${tree ? 'base.y += length(instanceMatrix[1].xyz) * 0.5;' : ''}
          vDetailDistance = distance(base, landscapeEye);
          ${
            plant
              ? `float phase = plantTime * .75 + base.x * .31 + base.z * .17;
          transformed.x += sin(phase) * pow(max(position.y, 0.0), 1.4) * .095;
          transformed.z += cos(phase * 1.23) * pow(max(position.y, 0.0), 1.4) * .047;`
              : ''
          }
        #endif`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nvarying float vDetailDistance;',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
        float coverage = smoothstep(${near.toFixed(1)}, ${far.toFixed(1)}, vDetailDistance);
        ${
          tree
            ? `float sampleMask = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056,.00583715))));
        if (${inverse ? 'coverage <= sampleMask' : 'coverage > sampleMask'}) discard;`
            : 'diffuseColor.a *= 1.0 - coverage;'
        }`,
        );
        if (
          (material.isMeshStandardMaterial || material.isMeshLambertMaterial) &&
          material.alphaTest > 0
        )
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * ${material.isMeshLambertMaterial ? '.14' : '.08'};`,
          );
      };
      material.customProgramCacheKey = () =>
        `landscape-${near}-${far}-${inverse}-${plant}-${tree}`;
      if (material.isMeshStandardMaterial) softenShadowSampling(material);
    }

    const loader = new THREE.TextureLoader();
    const loadedTextures = await Promise.allSettled(
      [
        'forest-floor-color.jpg',
        'forest-floor-normal.jpg',
        'forest-floor-roughness.jpg',
        'path-color.jpg',
        'path-normal.jpg',
        'path-roughness.jpg',
      ].map(async (name) => {
        const texture = keep(await loader.loadAsync(`${ROOT}textures/${name}`));
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(
          8,
          context.renderer.capabilities.getMaxAnisotropy(),
        );
        if (name.includes('color')) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      }),
    );
    const textureFailure = loadedTextures.find(
      (result) => result.status === 'rejected',
    );
    if (textureFailure) throw textureFailure.reason;
    const textures = loadedTextures.map((result) => result.value);
    // One finite shade field anchors the distant canopy to the same placements.
    const shadeCanvas = document.createElement('canvas');
    shadeCanvas.width = shadeCanvas.height = 2048;
    const shadeContext = shadeCanvas.getContext('2d');
    shadeContext.fillStyle = '#ffffff';
    shadeContext.fillRect(0, 0, 2048, 2048);
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 32;
    const stampContext = stamp.getContext('2d');
    const gradient = stampContext.createRadialGradient(16, 16, 1, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(0,0,0,.64)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,.42)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    stampContext.fillStyle = gradient;
    stampContext.fillRect(0, 0, 32, 32);
    for (const t of trees) {
      const radius = ((t.height * 0.36) / 5600) * 2048;
      shadeContext.drawImage(
        stamp,
        ((t.x + 2800) / 5600) * 2048 - radius,
        ((t.z + 2800) / 5600) * 2048 - radius,
        radius * 2,
        radius * 2,
      );
    }
    const canopyShade = keep(new THREE.CanvasTexture(shadeCanvas));
    canopyShade.flipY = false;
    const terrainGeometry = keep(new THREE.PlaneGeometry(6400, 6400, 640, 640));
    terrainGeometry.rotateX(-Math.PI / 2);
    const p = terrainGeometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      p.setY(i, groundHeight(x, z) - 0.045);
      terrainGeometry.attributes.uv.setXY(i, x / 3.2, z / 3.2);
    }
    terrainGeometry.computeVertexNormals();
    const terrainMaterial = keep(
      new THREE.MeshStandardMaterial({
        map: textures[0],
        normalMap: textures[1],
        roughnessMap: textures[2],
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.97,
        color: '#e5e8d5',
      }),
    );
    terrainMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.pathTexture = { value: textures[3] };
      shader.uniforms.pathNormal = { value: textures[4] };
      shader.uniforms.pathRoughness = { value: textures[5] };
      shader.uniforms.canopyShade = { value: canopyShade };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vGround;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGround = position;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
      varying vec3 vGround; uniform sampler2D pathTexture; uniform sampler2D pathNormal; uniform sampler2D pathRoughness; uniform sampler2D canopyShade;
      float coverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float coverNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(coverHash(i),coverHash(i+vec2(1,0)),f.x),mix(coverHash(i+vec2(0,1)),coverHash(i+1.),f.x),f.y); }`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
      vec2 w = vGround.xz;
      float grove = sin(w.x * .005 + cos(w.y * .003)*2.) * cos(w.y*.004-w.x*.001)
        + .20*sin(w.x*.023+cos(w.y*.017)*2.)*cos(w.y*.029-w.x*.009)
        + .09*sin(w.x*.067+w.y*.037)*cos(w.y*.051);
      float glade = smoothstep(.05,.85,grove);
      float cut = (1.-smoothstep(28.,80.,abs(w.x))) * (1.-smoothstep(465.,760.,abs(w.y)));
      float track = 1.-smoothstep(1.25,2.75,abs(w.x-(320.+85.*sin(w.y*.003)+26.*sin(w.y*.012))));
      vec3 floorColor = texture2D(map,vMapUv).rgb;
      vec3 dirt = texture2D(pathTexture,vMapUv*1.28+vec2(.213,.782)).rgb;
      float edgeNoise = (floorColor.g-floorColor.r)*2. + (floorColor.r-.3)*.36;
      float pathBlend = smoothstep(.16,.88,track + edgeNoise*(1.-abs(track*2.-1.)));
      float macro = coverNoise(w*.018)*.65 + coverNoise(w*.079)*.35;
      float litter = coverNoise(w*.37)*.65 + coverNoise(w*1.7)*.35;
      vec3 meadow = mix(vec3(.085,.125,.035),vec3(.22,.26,.09),macro);
      vec3 forest = floorColor * mix(vec3(.12,.21,.07),vec3(.20,.29,.105),macro);
      forest *= mix(vec3(.72,.83,.58),vec3(1.07,.93,.69),smoothstep(.33,.7,litter));
      vec3 cover = mix(forest, meadow*(.78+floorColor*.65), max(glade,cut*.85));
      // The same colony rhythm used by seeded plants leaves a moss/litter bed
      // when fine geometry recedes, including in the trimmed airfield meadow.
      float colony = .5 + .5*sin(w.x*.19+cos(w.y*.16))*cos(w.y*.23);
      vec3 moss = floorColor*vec3(.12,.24,.055);
      cover = mix(cover,moss,smoothstep(.30,.80,colony)*.38);
      float slope = 1.0 - abs(normalize(cross(dFdx(vGround),dFdy(vGround))).y);
      float outcrop = smoothstep(.045,.19,slope)*smoothstep(130.,260.,vGround.y)*(0.55+macro*.45);
      cover = mix(cover,vec3(.25,.27,.23)*(floorColor*.5+.6),outcrop*.75);
      // Fine PBR detail resolves nearby; broad coherent canopy/glade colors survive altitude.
      diffuseColor.rgb *= mix(cover, dirt*vec3(.73,.60,.44),pathBlend);
      float soilMoisture = .87 + .13*sin(w.x*.39+cos(w.y*.17))*sin(w.y*.23);
      diffuseColor.rgb *= mix(1.,soilMoisture,pathBlend);
      diffuseColor.rgb *= .80 + .20 * texture2D(canopyShade,(w+2800.)/5600.).r;
    `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = max(.71, roughness * mix(texture2D(roughnessMap,vRoughnessMapUv).g,texture2D(pathRoughness,vRoughnessMapUv*1.28+vec2(.213,.782)).g,pathBlend));`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          `vec3 mapN = mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(pathNormal,vNormalMapUv*1.28+vec2(.213,.782)).xyz,pathBlend)*2.-1.;`,
        ),
      );
    };
    terrainMaterial.customProgramCacheKey = () => 'landscape-scanned-ground';
    softenShadowSampling(terrainMaterial);
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.receiveShadow = true;
    group.add(terrain);

    // Bake actual baseline pines at sixteen azimuths and four elevations.
    // Camera-facing cards select the corresponding view without crossed-plane artifacts.
    const renderer = context.renderer;
    const atlas = keep(
      new THREE.WebGLRenderTarget(3072, 2304, {
        samples: 4,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
      }),
    );
    const bakeScene = new THREE.Scene();
    bakeScene.add(new THREE.HemisphereLight('#c4d3d2', '#5c6146', 1.65));
    const sun = new THREE.DirectionalLight('#ffe2af', 4.2);
    sun.position.set(3, 5.4, -3.6);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -1,
      right: 1,
      top: 1,
      bottom: -1,
      near: 0.1,
      far: 12,
    });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0002;
    bakeScene.add(sun);
    const camera = new THREE.OrthographicCamera(
      -0.51,
      0.51,
      0.51,
      -0.51,
      0.01,
      10,
    );
    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.setRenderTarget(atlas);
      renderer.setClearColor(0, 0);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      for (let kind = 0; kind < 3; kind++) {
        const model = new THREE.Group();
        for (const part of prototypes.get(TREE_NAMES[kind])) {
          const mesh = new THREE.Mesh(part.geometry, part.material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          model.add(mesh);
        }
        bakeScene.add(model);
        for (let elevation = 0; elevation < 4; elevation++) {
          for (let azimuth = 0; azimuth < 16; azimuth++) {
            const yaw = (azimuth * Math.PI) / 8,
              pitch = Math.min((elevation * Math.PI) / 6, Math.PI * 0.475);
            camera.up.set(0, 1, 0);
            camera.position.set(
              Math.sin(yaw) * Math.cos(pitch) * 3,
              0.5 + Math.sin(pitch) * 3,
              Math.cos(yaw) * Math.cos(pitch) * 3,
            );
            camera.lookAt(0, 0.5, 0);
            atlas.viewport.set(
              azimuth * 192,
              (kind * 4 + elevation) * 192,
              192,
              192,
            );
            atlas.scissor.copy(atlas.viewport);
            atlas.scissorTest = true;
            renderer.setViewport(
              azimuth * 192,
              (kind * 4 + elevation) * 192,
              192,
              192,
            );
            renderer.setScissor(
              azimuth * 192,
              (kind * 4 + elevation) * 192,
              192,
              192,
            );
            renderer.shadowMap.needsUpdate = true;
            renderer.render(bakeScene, camera);
          }
        }
        bakeScene.remove(model);
      }
    } finally {
      sun.shadow.map?.dispose();
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(previousClear, previousAlpha);
    }

    const treeColor = new THREE.Color();
    function tint(entry) {
      const cohort =
        0.5 +
        0.5 *
          Math.sin(entry.x * 0.014 + Math.cos(entry.z * 0.009)) *
          Math.cos(entry.z * 0.012);
      const value = 0.84 + cohort * 0.24 + entry.tone * 0.08;
      return treeColor.setRGB(
        value * (1.03 - cohort * 0.08),
        value,
        value * (0.92 + cohort * 0.06),
      );
    }
    function transform(entry, tree = false) {
      position.set(entry.x, entry.y, entry.z);
      rotation.setFromAxisAngle(up, entry.angle);
      scale.setScalar(tree ? entry.height : entry.scale);
      return matrix.compose(position, rotation, scale);
    }
    function batch(geometry, material, capacity, shadow) {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      group.add(mesh);
      stats.poolCapacity += capacity;
      return mesh;
    }
    for (let kind = 0; kind < 3; kind++) {
      const entries = trees.filter((t) => t.kind === kind);
      const geometry = keep(new THREE.PlaneGeometry(1.02, 1.02));
      geometry.translate(0, 0.5, 0);
      const surface = keep(
        new THREE.MeshBasicMaterial({
          map: atlas.texture,
          alphaTest: 0.18,
          side: THREE.DoubleSide,
        }),
      );
      fade(surface, 180, 220, true, false, true);
      const configure = surface.onBeforeCompile;
      surface.onBeforeCompile = (shader) => {
        configure(shader);
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vec3 center = (instanceMatrix * vec4(0.,.5,0.,1.)).xyz;
        vec3 direction = normalize(landscapeEye - center);
        vec3 right = normalize(cross(vec3(0.,1.,0.), direction + vec3(.00001,0.,0.)));
        vec3 cardUp = normalize(cross(direction,right));
        float h = length(instanceMatrix[1].xyz);
        vec3 offset = (right*position.x + cardUp*(position.y-.5))*h;
        transformed = transpose(mat3(instanceMatrix)) * offset / (h*h) + vec3(0.,.5,0.);
        float yaw = atan(instanceMatrix[2].x,instanceMatrix[2].z);
        float azimuth = mod(floor((atan(direction.x,direction.z)-yaw)/.392699+ .5),16.);
        float elevation = clamp(floor(asin(clamp(direction.y,-1.,1.))/.523599+.5),0.,3.);
        vMapUv = (uv + vec2(azimuth, ${kind * 4}. + elevation))/vec2(16.,12.);
      `,
        );
      };
      surface.customProgramCacheKey = () => `pine-impostor-${kind}`;
      const mesh = batch(geometry, surface, entries.length, false);
      for (let i = 0; i < entries.length; i++) {
        mesh.setMatrixAt(i, transform(entries[i], true));
        mesh.setColorAt(i, tint(entries[i]));
      }
      mesh.count = entries.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    const nearBatches = new Map();
    for (const name of [...TREE_NAMES, ...DETAIL_NAMES]) {
      const isTree = TREE_NAMES.includes(name);
      const grass = name === 'grass_short' || name === 'grass_short_lod';
      const capacity = isTree
        ? 1600
        : name === 'grass_short_lod'
          ? 110000
          : name === 'grass_short'
            ? 65000
            : 7000;
      nearBatches.set(
        name,
        prototypes.get(name).map((part) => {
          if (name === 'grass_short_lod') {
            part.material = keep(
              new THREE.MeshLambertMaterial({
                map: part.material.map,
                color: part.material.color.clone().multiplyScalar(0.82),
                emissive: part.material.emissive,
                emissiveIntensity: part.material.emissiveIntensity,
                alphaTest: 0.42,
                side: THREE.DoubleSide,
              }),
            );
          }
          fade(
            part.material,
            isTree ? 180 : grass ? 16 : 32,
            isTree ? 220 : grass ? 28 : 66,
            false,
            part.plant,
            isTree,
          );
          if (name === 'grass_short_lod') {
            const configureGrass = part.material.onBeforeCompile;
            part.material.onBeforeCompile = (shader) => {
              configureGrass(shader);
              shader.fragmentShader = shader.fragmentShader.replace(
                'diffuseColor.a *= 1.0 - coverage;',
                'diffuseColor.a *= coverage * (1.0 - smoothstep(70.0,96.0,vDetailDistance));',
              );
            };
            part.material.customProgramCacheKey = () =>
              'landscape-midground-grass';
          }
          const mesh = batch(
            part.geometry,
            part.material,
            capacity,
            !part.plant,
          );
          if (!part.plant) {
            const depth = keep(
              new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map: part.material.map,
                alphaTest: part.material.alphaTest,
                side: part.material.side,
              }),
            );
            fade(
              depth,
              isTree ? 180 : 32,
              isTree ? 220 : 66,
              false,
              false,
              isTree,
            );
            const configureDepth = depth.onBeforeCompile;
            depth.onBeforeCompile = (shader) => {
              configureDepth(shader);
              shader.fragmentShader = shader.fragmentShader.replace(
                'diffuseColor.a *= 1.0 - coverage;',
                'float mask = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715)))); if(coverage > mask) discard;',
              );
            };
            mesh.customDepthMaterial = depth;
          }
          return mesh;
        }),
      );
    }
    let tileX = Infinity,
      tileZ = Infinity,
      tileY = Infinity,
      quality = 'high';
    function fill(name, entries, isTree) {
      for (const mesh of nearBatches.get(name)) {
        if (entries.length > mesh.instanceMatrix.count)
          throw new Error(`Forest pool capacity exceeded: ${name}`);
        mesh.count = entries.length;
        for (let i = 0; i < entries.length; i++) {
          mesh.setMatrixAt(i, transform(entries[i], isTree));
          if (isTree) mesh.setColorAt(i, tint(entries[i]));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    context.scene.add(group);
    return {
      stats,
      configure(settings) {
        if (settings.quality !== quality) {
          quality = settings.quality;
          tileX = Infinity;
        }
      },
      update(cameraPosition, elapsed) {
        eye.value.copy(cameraPosition);
        time.value = elapsed;
        const cx = Math.floor(cameraPosition.x / 32),
          cz = Math.floor(cameraPosition.z / 32),
          cy = Math.floor(cameraPosition.y / 32);
        context.scene.fog.density =
          0.00022 +
          0.0025 *
            Math.exp(
              -Math.max(
                0,
                cameraPosition.y -
                  groundHeight(cameraPosition.x, cameraPosition.z),
              ) / 35,
            );
        if (cx === tileX && cz === tileZ && cy === tileY) return;
        tileY = cy;
        tileX = cx;
        tileZ = cz;
        stats.rebuilds++;
        const families = [[], [], []];
        for (
          let x = Math.floor((cx * 32 - 280) / 80);
          x <= Math.floor((cx * 32 + 312) / 80);
          x++
        )
          for (
            let z = Math.floor((cz * 32 - 280) / 80);
            z <= Math.floor((cz * 32 + 312) / 80);
            z++
          ) {
            for (const t of treeCells.get(`${x},${z}`) ?? [])
              if (
                Math.hypot(
                  t.x - (cx + 0.5) * 32,
                  t.z - (cz + 0.5) * 32,
                  t.y + t.height * 0.5 - (cy + 0.5) * 32,
                ) < 280
              )
                families[t.kind].push(t);
          }
        TREE_NAMES.forEach((name, i) => fill(name, families[i], true));
        stats.nearTrees = families.reduce((n, f) => n + f.length, 0);
        const detail = new Map(DETAIL_NAMES.map((name) => [name, []]));
        for (let x = cx - 3; x <= cx + 3; x++)
          for (let z = cz - 3; z <= cz + 3; z++) {
            detailTile(x, z).forEach((e, i) => {
              if (quality === 'balanced' && e.kind.startsWith('grass') && i % 2)
                return;
              const distance = Math.hypot(
                e.x - (cx + 0.5) * 32,
                e.z - (cz + 0.5) * 32,
                e.y - (cy + 0.5) * 32,
              );
              if (e.kind === 'grass_short') {
                if (distance < 56) detail.get(e.kind).push(e);
                if (distance < 124 && distance > 0)
                  detail.get('grass_short_lod').push(e);
              } else if (distance < 94) detail.get(e.kind).push(e);
            });
          }
        stats.detailInstances = 0;
        for (const [name, entries] of detail) {
          fill(name, entries, false);
          stats.detailInstances += entries.length;
        }
      },
      dispose: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

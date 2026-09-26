import * as THREE from 'three';

/** Boat-owned surface maps; grain runs along V and one plank spans U. */
export function createBoatMaterials({ own, galleon }) {
  const makeMap = (w, h, sample, color = false) => {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const values = sample(x / w, y / h, x, y);
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++)
          data[i + c] = Math.round(
            THREE.MathUtils.clamp(values[c] ?? values[0], 0, 1) * 255,
          );
        data[i + 3] = 255;
      }
    const map = own(new THREE.DataTexture(data, w, h));
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  };
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const wood = (u, v) => {
    const wave =
      u +
      Math.sin(v * Math.PI * 4) * 0.011 +
      Math.sin(v * Math.PI * 10) * 0.004;
    const grain = Math.sin(
      wave * Math.PI * 124 + Math.sin(v * Math.PI * 6) * 1.4,
    );
    const fine = Math.sin(
      wave * Math.PI * 338 + Math.sin(v * Math.PI * 20) * 0.7,
    );
    const knot = Math.exp(-((u - 0.31) ** 2 * 150 + (v - 0.69) ** 2 * 440));
    const rings = Math.sin(
      Math.hypot((u - 0.31) * 1.2, (v - 0.69) * 2.1) * 200,
    );
    const edge = Math.min(u, 1 - u);
    const caulk = 1 - THREE.MathUtils.smoothstep(edge, 0.003, 0.012);
    return {
      grain: grain * 0.021 + fine * 0.011 + knot * rings * 0.065,
      caulk,
      knot,
    };
  };
  const timberMap = makeMap(
    256,
    1024,
    (u, v, x, y) => {
      const w = wood(u, v);
      const val =
        0.89 +
        w.grain -
        w.knot * 0.075 -
        w.caulk * 0.35 +
        (hash(x, y) - 0.5) * 0.025;
      return [val, val * 0.987, val * 0.957];
    },
    true,
  );
  const woodHeight = makeMap(256, 1024, (u, v) => {
    const w = wood(u, v);
    return [0.64 + w.grain * 2.2 - w.caulk * 0.48];
  });
  const woodRough = makeMap(256, 1024, (u, v) => {
    const w = wood(u, v);
    return [0.76 + w.grain * 2 + w.caulk * 0.18];
  });
  const clothMap = makeMap(
    256,
    256,
    (u, v, x, y) => {
      const warp =
        Math.cos(x * Math.PI * 0.5) * 0.002 +
        Math.cos(y * Math.PI * 0.5) * 0.002;
      const mottling =
        Math.sin(u * 16 + Math.sin(v * 23)) * Math.sin(v * 19) * 0.004;
      const value = 0.92 + warp + mottling + (hash(x, y) - 0.5) * 0.005;
      return [value, value * 0.99, value * 0.963];
    },
    true,
  );
  const clothHeight = makeMap(256, 256, (u, v, x, y) => [
    0.5 +
      Math.sin((x * Math.PI) / 2) * 0.16 +
      Math.cos((y * Math.PI) / 2) * 0.13,
  ]);
  const metalRough = makeMap(128, 128, (u, v, x, y) => [
    0.7 + (hash(x, y) - 0.5) * 0.2 + Math.sin(u * 33) * Math.cos(v * 24) * 0.09,
  ]);

  // A subdued maritime reflection environment belongs only to the ship materials.
  const envData = new Float32Array(128 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const v = y / 63,
        sky = v < 0.5;
      const brightness = sky
        ? 0.45 + Math.sin(v * Math.PI) * 0.5
        : 0.15 + (1 - v) * 0.23;
      const sun =
        Math.exp(-((x / 128 - 0.27) ** 2 * 1000 + (v - 0.27) ** 2 * 1800)) * 6;
      const i = (y * 128 + x) * 4;
      envData[i] = brightness * (sky ? 0.83 : 0.43) + sun;
      envData[i + 1] = brightness * (sky ? 0.93 : 0.59) + sun * 0.85;
      envData[i + 2] = brightness + sun * 0.62;
      envData[i + 3] = 1;
    }
  const environment = own(
    new THREE.DataTexture(envData, 128, 64, THREE.RGBAFormat, THREE.FloatType),
  );
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.needsUpdate = true;
  const material = (color, roughness = 0.8, metalness = 0) =>
    own(
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        envMap: environment,
        envMapIntensity: 0.5,
      }),
    );
  const lumber = (color, roughness = 0.8, bumpScale = 0.002) => {
    const mat = material(color, roughness);
    Object.assign(mat, {
      map: timberMap,
      bumpMap: woodHeight,
      bumpScale,
      roughnessMap: woodRough,
    });
    return mat;
  };
  const hullWood = lumber(galleon ? '#644735' : '#76533a');
  const deckWood = lumber('#b6a083', 0.92, 0.0015);
  const timber = lumber('#69503a', 0.76, 0.001);
  const darkWood = lumber('#2d2924', 0.94);
  const wheelWood = lumber('#79502e', 0.48, 0.0006);
  const trim = material('#b49b62', 0.43, 0.72);
  trim.roughnessMap = metalRough;
  const paint = material(galleon ? '#233b37' : '#245559', 0.63);
  paint.map = timberMap;
  paint.roughnessMap = woodRough;
  paint.bumpMap = woodHeight;
  paint.bumpScale = 0.0008;
  const iron = material('#343d3c', 0.65, 0.58);
  iron.roughnessMap = metalRough;
  const rope = material('#75674e', 0.97);
  rope.bumpMap = clothHeight;
  rope.bumpScale = 0.001;
  const canvas = material(galleon ? '#d3c9ad' : '#e0d8bf', 0.96);
  Object.assign(canvas, {
    side: THREE.DoubleSide,
    map: clothMap,
    bumpMap: clothHeight,
    bumpScale: 0.00035,
    vertexColors: true,
    envMapIntensity: 0.18,
  });
  const glass = own(
    new THREE.MeshPhysicalMaterial({
      color: '#243b40',
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 0.8,
      envMap: environment,
      envMapIntensity: 0.9,
    }),
  );
  const lamp = material('#dbc18a', 0.4, 0.15);
  lamp.emissive.set('#b97837');
  lamp.emissiveIntensity = 0.2;
  const skin = material('#a7866d', 0.78);
  const shirt = material('#b4b2a1', 0.95);
  shirt.map = clothMap;
  shirt.bumpMap = clothHeight;
  shirt.bumpScale = 0.001;
  const coat = material(galleon ? '#24313c' : '#254649', 0.92);
  coat.bumpMap = clothHeight;
  coat.bumpScale = 0.001;
  const hair = material('#302b25', 0.98);

  for (const mat of [hullWood, deckWood, timber, paint]) {
    const isDeck = mat === deckWood;
    const isPaint = mat === paint;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vTimberPosition; varying vec2 vTimberUv;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTimberPosition = position; vTimberUv=uv;',
      );
      shader.fragmentShader =
        'varying vec3 vTimberPosition; varying vec2 vTimberUv;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      float boardId=${isDeck ? 'floor(vTimberPosition.x*4.8)' : 'floor(vTimberPosition.y*7.4)'};
      float lengthId=floor(vTimberPosition.z*0.36+fract(boardId*0.618));
      float boardHash=fract(sin(boardId*127.1+lengthId*311.7)*43758.5453);
      float broadPatina=sin(vTimberPosition.z*1.9+sin(vTimberPosition.x*3.2))*0.5+0.5;
      diffuseColor.rgb*=mix(0.87,1.075,boardHash)*mix(0.96,1.0,broadPatina);
      ${
        isPaint
          ? `float edge=min(fract(vTimberUv.x),1.0-fract(vTimberUv.x));
      float wear=(1.0-smoothstep(0.006,0.025,edge))*smoothstep(0.4,0.8,boardHash)*smoothstep(0.35,0.75,broadPatina);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.23,0.16,0.083),wear*0.42);`
          : ''
      }
      ${mat === hullWood || isPaint ? 'diffuseColor.rgb*=mix(0.74,1.0,smoothstep(0.06,0.55,vTimberPosition.y));' : ''}`,
      );
    };
    mat.customProgramCacheKey = () =>
      `boat-timber-finish-v2:${isDeck}:${isPaint}:${mat === hullWood}`;
  }
  return {
    hullWood,
    deckWood,
    timber,
    darkWood,
    wheelWood,
    trim,
    paint,
    iron,
    rope,
    canvas,
    glass,
    lamp,
    skin,
    shirt,
    coat,
    hair,
  };
}

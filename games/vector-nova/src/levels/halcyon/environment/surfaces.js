import * as THREE from 'three';
import { createArchitectureMaps } from './architectural-finish.js';

export function randomSource(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(canvas, color = true) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

// Original, editable facade surfaces. Geometry UVs retain the 3.2m bay / 4.2m floor.
// Lit rooms use a separate emission map; reflected sky remains real scene lighting.
function facadeTextures(kind, seed) {
  const [canvas, context] = makeCanvas(512, 1024);
  const [emission, light] = makeCanvas(512, 1024);
  const [roughness, rough] = makeCanvas(512, 1024);
  const random = randomSource(seed);
  context.fillStyle = kind === 'stone' ? '#878984' : '#34464f';
  context.fillRect(0, 0, 512, 1024);
  light.fillStyle = '#000000';
  light.fillRect(0, 0, 512, 1024);
  rough.fillStyle = '#969696';
  rough.fillRect(0, 0, 512, 1024);
  for (let floor = 0; floor < 32; floor += 1) {
    const maintenance = floor === 9 || floor === 23;
    for (let bay = 0; bay < 16; bay += 1) {
      const x = bay * 32;
      const y = floor * 32;
      const inset = kind === 'stone' ? 8 : 2;
      const sill = kind === 'stone' ? 9 : 6;
      const occupiedWing = (floor + Math.floor(bay / 4) * 3) % 11 < 3;
      const warm = random() < (occupiedWing ? 0.52 : 0.035);
      const shade = Math.floor(random() * 13);
      context.fillStyle = `rgb(${23 + shade},${40 + shade},${51 + shade})`;
      context.fillRect(x + inset, y + 2, 32 - inset * 2, 32 - sill);
      rough.fillStyle = `rgb(${80 + shade},${80 + shade},${80 + shade})`;
      rough.fillRect(x + inset, y + 2, 32 - inset * 2, 32 - sill);
      if (warm && !maintenance) {
        const selected = random();
        const tint = selected < 0.65 ? '#c6a477' : '#b8c5c8';
        light.fillStyle = tint;
        light.globalAlpha = 0.35 + random() * 0.48;
        const curtain = random() < 0.23 ? 9 : 0;
        light.fillRect(
          x + inset + 1,
          y + 3 + curtain,
          30 - inset * 2,
          29 - sill - curtain,
        );
        light.globalAlpha = 1;
        context.fillStyle = selected < 0.65 ? '#907c60' : '#778c94';
        context.fillRect(
          x + inset + 1,
          y + 3 + curtain,
          30 - inset * 2,
          29 - sill - curtain,
        );
        // Interior blinds, mullions and occasional dark office partition.
        light.fillStyle = '#191f23';
        light.fillRect(x + 15, y + 2, 1, 32 - sill);
        if (random() > 0.5)
          light.fillRect(x + inset, y + 13, 32 - inset * 2, 1);
      }
      context.fillStyle = kind === 'stone' ? '#656d6b' : '#596469';
      context.fillRect(x, y + 31, 32, 1);
      context.fillStyle = kind === 'stone' ? '#555e5e' : '#6a7476';
      context.fillRect(x + inset, y + 2, 1, 32 - sill);
      if (maintenance) {
        context.fillStyle = '#24333c';
        context.fillRect(x + 1, y + 2, 30, 25);
        context.fillStyle = '#526269';
        for (let yy = y + 4; yy < y + 26; yy += 4)
          context.fillRect(x + 2, yy, 28, 1);
        light.fillStyle = '#000000';
        light.fillRect(x, y, 32, 32);
      }
    }
  }
  return {
    map: canvasTexture(canvas),
    emissiveMap: canvasTexture(emission),
    roughnessMap: canvasTexture(roughness, false),
  };
}

function groundTexture() {
  const [canvas, context] = makeCanvas(512, 512);
  const random = randomSource(777131);
  const pixels = context.createImageData(512, 512);
  for (let p = 0; p < 512 * 512; p += 1) {
    const n = 71 + Math.floor(random() * 11);
    pixels.data.set([n, n + 6, n + 7, 255], p * 4);
  }
  context.putImageData(pixels, 0, 0);
  context.strokeStyle = 'rgba(24,36,43,0.22)';
  context.lineWidth = 2;
  for (let i = 0; i < 512; i += 64) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 512);
    context.moveTo(0, i);
    context.lineTo(512, i);
    context.stroke();
  }
  return canvasTexture(canvas);
}

function districtTextures(kind, seed) {
  const [canvas, context] = makeCanvas(512, 1024);
  const [emission, light] = makeCanvas(512, 1024);
  const [roughness, rough] = makeCanvas(512, 1024);
  const [metalness, metal] = makeCanvas(512, 1024);
  rough.fillStyle = '#e2e2e2';
  rough.fillRect(0, 0, 512, 1024);
  metal.fillStyle = '#151515';
  metal.fillRect(0, 0, 512, 1024);
  const random = randomSource(seed);
  const industrial = kind === 'industrial';
  const ceramic = kind === 'ceramic';
  context.fillStyle = industrial ? '#707c7e' : ceramic ? '#a6a79b' : '#375461';
  context.fillRect(0, 0, 512, 1024);
  light.fillStyle = '#000000';
  light.fillRect(0, 0, 512, 1024);
  for (let floor = 0; floor < 32; floor += 1) {
    const y = floor * 32;
    if (industrial) {
      context.fillStyle = floor % 7 === 0 ? '#3e5059' : '#6a7779';
      context.fillRect(0, y, 512, 2);
      for (let x = 0; x < 512; x += 8) {
        context.fillStyle = x % 32 === 0 ? '#59696e' : '#7b8583';
        context.fillRect(x, y + 2, 1, 30);
      }
      if (floor % 7 === 1) {
        for (let bay = 0; bay < 8; bay += 1) {
          context.fillStyle = '#29424d';
          context.fillRect(bay * 64 + 8, y + 5, 47, 14);
          if (random() < 0.26) {
            light.fillStyle = '#746f52';
            light.fillRect(bay * 64 + 9, y + 6, 45, 12);
          }
        }
      }
      continue;
    }
    for (let bay = 0; bay < 16; bay += 1) {
      const x = bay * 32;
      const shade = Math.floor(random() * 12);
      context.fillStyle = `rgb(${26 + shade},${47 + shade},${59 + shade})`;
      context.fillRect(
        x + (ceramic ? 10 : 0),
        y + (ceramic ? 2 : 5),
        ceramic ? 12 : 31,
        ceramic ? 27 : 20,
      );
      rough.fillStyle = '#555555';
      metal.fillStyle = '#dedede';
      for (const map of [rough, metal])
        map.fillRect(
          x + (ceramic ? 10 : 0),
          y + (ceramic ? 2 : 5),
          ceramic ? 12 : 31,
          ceramic ? 27 : 20,
        );
      if (
        random() < ((floor + Math.floor(bay / 4) * 3) % 13 < 3 ? 0.48 : 0.035)
      ) {
        light.fillStyle = random() < 0.75 ? '#c1a16f' : '#859ca0';
        light.globalAlpha = 0.3 + random() * 0.5;
        light.fillRect(
          x + (ceramic ? 11 : 1),
          y + (ceramic ? 3 : 6),
          ceramic ? 10 : 29,
          ceramic ? 25 : 18,
        );
        light.globalAlpha = 1;
      }
      context.fillStyle = ceramic ? '#717d7d' : '#81979b';
      if (ceramic) context.fillRect(x + 25, y, 1, 32);
      else if (bay % 4 === 0) context.fillRect(x, y + 4, 2, 23);
    }
    context.fillStyle = ceramic ? '#999e94' : '#4d6269';
    context.fillRect(0, y + 30, 512, 2);
    if (!ceramic) {
      context.fillStyle = '#839291';
      context.fillRect(0, y + 28, 512, 1);
    }
  }
  return {
    map: canvasTexture(canvas),
    emissiveMap: canvasTexture(emission),
    roughnessMap: canvasTexture(roughness, false),
    metalnessMap: canvasTexture(metalness, false),
  };
}

function landscapeTexture() {
  const [canvas, context] = makeCanvas(256, 256);
  const pixels = context.createImageData(256, 256);
  const random = randomSource(371772);
  const lattice = Array.from({ length: 64 }, () => random());
  for (let y = 0; y < 256; y += 1)
    for (let x = 0; x < 256; x += 1) {
      const gx = x / 32,
        gy = y / 32;
      const ix = Math.floor(gx),
        iy = Math.floor(gy);
      const fx = gx - ix,
        fy = gy - iy;
      const sample = (dx, dy) => lattice[((iy + dy) % 8) * 8 + ((ix + dx) % 8)];
      const n =
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(sample(0, 0), sample(1, 0), fx),
          THREE.MathUtils.lerp(sample(0, 1), sample(1, 1), fx),
          fy,
        ) *
          16 +
        random() * 10;
      pixels.data.set([78 + n, 88 + n, 66 + n * 0.8, 255], (y * 256 + x) * 4);
    }
  context.putImageData(pixels, 0, 0);
  return canvasTexture(canvas);
}

function waveNormals() {
  const [canvas, context] = makeCanvas(512, 512);
  const pixels = context.createImageData(512, 512);
  const random = randomSource(751791);
  const layers = [5, 19, 73].map((size) => ({
    size,
    angles: Array.from({ length: size * size }, () => random() * Math.PI * 2),
  }));
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(u, v, layer) {
    const x = u * layer.size,
      y = v * layer.size;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const dot = (dx, dy) => {
      const row = (((iy + dy) % layer.size) + layer.size) % layer.size;
      const column = (((ix + dx) % layer.size) + layer.size) % layer.size;
      const angle = layer.angles[row * layer.size + column];
      return Math.cos(angle) * (fx - dx) + Math.sin(angle) * (fy - dy);
    };
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(dot(0, 0), dot(1, 0), fade(fx)),
      THREE.MathUtils.lerp(dot(0, 1), dot(1, 1), fade(fx)),
      fade(fy),
    );
  }
  const height = (u, v) =>
    noise(u, v, layers[0]) * 0.8 +
    noise(u, v, layers[1]) * 0.21 +
    noise(u, v, layers[2]) * 0.035;
  for (let y = 0; y < 512; y += 1)
    for (let x = 0; x < 512; x += 1) {
      const u = x / 512,
        v = y / 512,
        step = 1 / 512;
      const dx = (height(u + step, v) - height(u - step, v)) * 3;
      const dy = (height(u, v + step) - height(u, v - step)) * 3;
      const n = new THREE.Vector3(dx, dy, 1).normalize();
      pixels.data.set(
        [(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, n.z * 255, 255],
        (y * 512 + x) * 4,
      );
    }
  context.putImageData(pixels, 0, 0);
  const texture = canvasTexture(canvas, false);
  texture.repeat.set(0.07, 0.09);
  return texture;
}

function bankTexture() {
  const [canvas, context] = makeCanvas(512, 256);
  const pixels = context.createImageData(512, 256);
  const random = randomSource(61903);
  for (let y = 0; y < 256; y += 1)
    for (let x = 0; x < 512; x += 1) {
      const damp = Math.max(0, (y - 168 + Math.sin(x * 0.033) * 11) / 88);
      const grit = random() * 14;
      pixels.data.set(
        [
          134 - damp * 56 + grit,
          143 - damp * 43 + grit,
          131 - damp * 37 + grit,
          255,
        ],
        (y * 512 + x) * 4,
      );
    }
  context.putImageData(pixels, 0, 0);
  return canvasTexture(canvas);
}

export function createSurfaces(renderer) {
  const textures = new Set();
  const own = (parameters) => {
    for (const value of Object.values(parameters))
      if (value?.isTexture) textures.add(value);
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      ...parameters,
    });
  };
  const commercial = facadeTextures('glass', 197373);
  const residential = facadeTextures('stone', 550017);
  const office = facadeTextures('glass', 118457);
  const ripples = waveNormals();
  textures.add(ripples);
  const surfaces = {
    roomDark: own({ color: '#263d49', roughness: 0.48, metalness: 0.28 }),
    roomWarm: own({
      color: '#9d987f',
      roughness: 0.92,
      emissive: '#d4bb84',
      emissiveIntensity: 0.32,
    }),
    roomCool: own({
      color: '#879a9e',
      roughness: 0.91,
      emissive: '#bfd1d0',
      emissiveIntensity: 0.13,
    }),
    heroGlass: new THREE.MeshPhysicalMaterial({
      color: '#a9c7ce',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      roughness: 0.09,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.1,
      vertexColors: true,
    }),
    bankStone: own({
      color: '#b3b3a5',
      map: bankTexture(),
      roughness: 0.86,
      metalness: 0.02,
    }),
    path: own({
      color: '#cad0bd',
      map: groundTexture(),
      roughness: 0.89,
      metalness: 0.02,
    }),
    landscape: own({
      color: '#8f9f7e',
      map: landscapeTexture(),
      roughness: 0.97,
      metalness: 0,
    }),
    pavement: own({ color: '#647574', roughness: 0.96, metalness: 0.02 }),
    ribbonGlass: own({
      color: '#c1d8dd',
      ...districtTextures('ribbon', 18371),
      roughness: 0.38,
      metalness: 0.48,
      emissive: '#ffffff',
      emissiveIntensity: 0.55,
      envMapIntensity: 0.8,
    }),
    ceramicWindows: own({
      color: '#f2e8d3',
      ...districtTextures('ceramic', 71199),
      roughness: 0.74,
      metalness: 0.65,
      emissive: '#ffffff',
      emissiveIntensity: 0.62,
    }),
    industrial: own({
      color: '#b1b9b4',
      ...districtTextures('industrial', 95371),
      roughness: 0.8,
      metalness: 0.38,
      emissive: '#ffffff',
      emissiveIntensity: 0.35,
    }),
    brick: own({ color: '#c2a494', roughness: 0.88, metalness: 0 }),
    roof: own({ color: '#9ba8a9', roughness: 0.7, metalness: 0.25 }),
    concrete: own({ color: '#afb5b1', roughness: 0.86, metalness: 0.04 }),
    stone: own({ color: '#b5b3a6', roughness: 0.8, metalness: 0.06 }),
    steel: own({ color: '#708087', roughness: 0.46, metalness: 0.65 }),
    dark: own({ color: '#253641', roughness: 0.66, metalness: 0.48 }),
    copper: own({ color: '#927567', roughness: 0.57, metalness: 0.54 }),
    glass: own({
      color: '#e1edf1',
      ...commercial,
      roughness: 0.62,
      metalness: 0.55,
      emissive: '#ffffff',
      emissiveIntensity: 0.7,
      envMapIntensity: 0.9,
    }),
    silverGlass: own({
      color: '#c6d3cf',
      ...office,
      roughness: 0.7,
      metalness: 0.6,
      emissive: '#ffffff',
      emissiveIntensity: 0.55,
      envMapIntensity: 0.9,
    }),
    stoneWindows: own({
      color: '#ded7c7',
      ...residential,
      bumpMap: residential.roughnessMap,
      bumpScale: 0.08,
      roughness: 0.88,
      metalness: 0.2,
      emissive: '#ffffff',
      emissiveIntensity: 0.6,
    }),
    road: own({ color: '#35434a', roughness: 0.91, metalness: 0.04 }),
    ground: own({
      color: '#a8b6bc',
      map: groundTexture(),
      roughness: 0.91,
      metalness: 0.05,
      // This 19 km underlay sits centimetres below streets and planting.
      // Keep its depth behind those overlays at distant/grazing race cameras;
      // moving geometry or changing the shared camera clip planes is unnecessary.
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 8,
    }),
    paint: own({ color: '#b8b7a7', roughness: 0.85 }),
    vegetation: own({ color: '#394b44', roughness: 0.96 }),
    warm: own({
      color: '#e5cc99',
      emissive: '#ffd59a',
      emissiveIntensity: 1.4,
      roughness: 0.5,
    }),
    red: own({
      color: '#b74433',
      emissive: '#e34c25',
      emissiveIntensity: 0.7,
      roughness: 0.65,
    }),
    water: new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      color: '#517e78',
      roughness: 0.2,
      metalness: 0.28,
      ior: 1.333,
      clearcoat: 1,
      clearcoatRoughness: 0.13,
      normalMap: ripples,
      normalScale: new THREE.Vector2(0.6, 0.6),
      clearcoatNormalMap: ripples,
      clearcoatNormalScale: new THREE.Vector2(0.6, 0.6),
      envMapIntensity: 1.45,
    }),
  };
  // Quiet room-scale gradients/blinds supply depth without more geometry/maps.
  for (const [name, surface] of Object.entries(surfaces)) {
    if (!name.startsWith('room')) continue;
    surface.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec2 roomUV;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nroomUV=uv;',
        );
      shader.fragmentShader =
        'varying vec2 roomUV;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float ceiling=smoothstep(.0,.8,roomUV.y);
        float blind=.5+.5*cos(roomUV.y*94.25);
        float detail=1.-smoothstep(.015,.06,length(fwidth(roomUV)));
        diffuseColor.rgb*=mix(.56,1.,ceiling)*(1.-blind*.1*detail);
      `,
        );
    };
    surface.customProgramCacheKey = () => `halcyon-recessed-room-v1-${name}`;
  }
  const architecture = createArchitectureMaps(renderer, {
    concrete: [surfaces.concrete, surfaces.stone, surfaces.bankStone],
    brick: [surfaces.brick],
    roof: [surfaces.roof],
  });
  return {
    ready: architecture.ready,
    dispose: () => architecture.dispose(),
    surfaces,
    textures,
    update(time) {
      ripples.offset.set((time * 0.0003) % 1, (time * 0.00011) % 1);
    },
  };
}

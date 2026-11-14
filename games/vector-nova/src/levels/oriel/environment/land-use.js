import { replaceShader } from '../../../renderer/shader-patch.js';
import * as T from 'three';
import {
  HABITAT,
  TOWN_CORES,
  finishHabitatMaterial,
  groundSlope,
  lakeAt,
  routeClearance,
  shellPoint,
  terrainHeight,
} from './habitat.js';

const wrapped = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Each borough has an unequal civic pair, with a cultivated belt between the
// next borough. The plan is shared by the architecture and its terrain parcels;
// rows of buildings no longer run uninterrupted around the cylinder.
export const HABITAT_BOROUGHS = TOWN_CORES.flatMap(([angle, z], index) => [
  {
    id: index * 2,
    angle: angle - 0.14,
    z: z - 180,
    across: 330 + (index % 3) * 30,
    along: 450,
    yaw: index % 2 ? Math.PI / 2 : 0,
  },
  {
    id: index * 2 + 1,
    angle: angle + 0.19,
    z: z + 240,
    across: 280,
    along: 380 + (index % 2) * 35,
    yaw: index % 2 ? 0 : Math.PI / 2,
  },
]);

export function boroughAt(angle, z) {
  let selected = null;
  let distance = Infinity;
  for (const borough of HABITAT_BOROUGHS) {
    const d = Math.hypot(
      (wrapped(angle - borough.angle) * HABITAT.radius) / borough.across,
      (z - borough.z) / borough.along,
    );
    if (d < distance) {
      distance = d;
      selected = borough;
    }
  }
  return distance < 1 ? { ...selected, distance } : null;
}

/** Connected civic courts and terrain-seated cultivation preserve the
 * authored ground/collision skin. Generous exclusions protect the road,
 * flights and finished quarters; crops never use a separate overlay sheet.
 */
export function createHabitatLandUse({
  track,
  own,
  reservations = [],
  terrainMaterial,
}) {
  const group = new T.Group();
  group.name = 'Oriel / connected cultivated borough belts';
  const clear = routeClearance(track);
  const positions = [];
  const colors = [];
  const indices = [];
  const stone = new T.Color('#b2ae91');
  const point = (angle, z, lift = 0.6) =>
    shellPoint(angle, z, terrainHeight(angle, z) + lift);
  const quad = (points, color) => {
    const first = positions.length / 3;
    for (const p of points) {
      positions.push(...p.toArray());
      colors.push(color.r, color.g, color.b);
    }
    indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
  };
  // The crop pattern belongs to the existing authored terrain skin. Painting
  // its surface avoids a second interpolated sheet floating above broad slopes.
  const width = 512,
    height = 384;
  const pixels = new Uint8Array(width * height);
  const districts = new Set();
  for (let row = 0; row < height; row++) {
    const z = ((row + 0.5) / height) * 4800 - 2400;
    for (let col = 0; col < width; col++) {
      const angle = ((col + 0.5) / width) * Math.PI * 2;
      let mask = 0,
        selected = -1;
      TOWN_CORES.forEach(([centerAngle, centerZ], district) => {
        const farmAngle = centerAngle + (district % 2 ? -0.43 : 0.42);
        const farmZ = centerZ + (district % 2 ? 280 : -230);
        const across = wrapped(angle - farmAngle) * HABITAT.radius;
        const along = z - farmZ;
        const distance = Math.hypot(across / 590, along / 520);
        const weight = distance < 0.95 ? 1 : 0;
        if (weight > mask) {
          mask = weight;
          selected = district;
        }
      });
      if (
        !mask ||
        Math.abs(z) > 2240 ||
        lakeAt(angle, z) < 1.18 ||
        groundSlope(angle, z) > 0.28 ||
        boroughAt(angle, z)
      )
        continue;
      const position = point(angle, z);
      if (
        !clear(position, 150) ||
        reservations.some((quarter) => quarter.contains(position, 42))
      )
        continue;
      pixels[row * width + col] = Math.round(mask * 0.9 * 255);
      districts.add(selected);
    }
  }
  const cultivation = own(
    new T.DataTexture(pixels, width, height, T.RedFormat),
  );
  cultivation.name = 'Oriel / terrain-seated cultivation plan';
  cultivation.wrapS = T.RepeatWrapping;
  cultivation.magFilter = T.LinearFilter;
  cultivation.minFilter = T.LinearMipmapLinearFilter;
  cultivation.generateMipmaps = true;
  cultivation.anisotropy = 4;
  cultivation.needsUpdate = true;
  if (terrainMaterial) {
    const previous = terrainMaterial.onBeforeCompile;
    const key = terrainMaterial.customProgramCacheKey();
    terrainMaterial.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      shader.uniforms.orielCultivation = { value: cultivation };
      shader.fragmentShader =
        'uniform sampler2D orielCultivation;\n' +
        replaceShader(
          shader.fragmentShader,
          'diffuseColor.rgb*=surface;',
          `vec2 parcelCoords=vec2(metres.x+metres.y*.16,metres.y);
        vec2 parcelSize=vec2(190.,155.);
        vec2 parcelCell=floor(parcelCoords/parcelSize);
        vec2 parcelPhase=mod(parcelCoords,parcelSize);
        vec2 parcelEdge=min(parcelPhase,parcelSize-parcelPhase);
        float parcelFootprint=max(fwidth(parcelCoords.x),fwidth(parcelCoords.y));
        float parcelLane=1.-smoothstep(4.5,6.+parcelFootprint,min(parcelEdge.x,parcelEdge.y));
        float parcelCrop=fieldHash(parcelCell+vec2(17.,41.));
        vec3 parcelColor=mix(vec3(.095,.19,.045),vec3(.25,.31,.095),parcelCrop);
        float tillage=sin(parcelCoords.x*.85+parcelCrop*6.283)*.06;
        parcelColor*=1.+tillage*(1.-smoothstep(1.2,3.,parcelFootprint));
        parcelColor=mix(parcelColor,vec3(.31,.285,.19),parcelLane*.85);
        float cultivation=texture2D(orielCultivation,habitatUV).r;
        diffuseColor.rgb*=mix(surface,parcelColor,cultivation*(1.-orielLakeMask)*(1.-scarp));`,
        );
    };
    terrainMaterial.customProgramCacheKey = () =>
      key + ':oriel-terrain-cultivation-v2';
    terrainMaterial.needsUpdate = true;
  }
  // Each civic pair shares a continuous pedestrian spine and a broad common
  // court. These surfaces follow the real hillside, joining the reused civic
  // wings into a place instead of leaving them as isolated repeated props.
  for (const borough of HABITAT_BOROUGHS) {
    const length = borough.along * 1.35;
    const steps = Math.ceil(length / 10);
    for (let step = 0; step < steps; step++) {
      const z0 = borough.z + (step / steps - 0.5) * length;
      const z1 = borough.z + ((step + 1) / steps - 0.5) * length;
      const width = Math.abs((z0 + z1) / 2 - borough.z) < 65 ? 135 : 13;
      for (let strip = 0; strip < Math.ceil(width / 12); strip++) {
        const n = Math.ceil(width / 12);
        const a0 =
          borough.angle + (-width / 2 + (strip * width) / n) / HABITAT.radius;
        const a1 =
          borough.angle +
          (-width / 2 + ((strip + 1) * width) / n) / HABITAT.radius;
        const coords = [
          [a0, z0],
          [a0, z1],
          [a1, z0],
          [a1, z1],
        ];
        const permitted = coords.every(([angle, z]) => {
          const p = point(angle, z);
          return (
            Math.abs(z) < 2240 &&
            lakeAt(angle, z) > 1.13 &&
            groundSlope(angle, z) < 0.09 &&
            clear(p, 120) &&
            !reservations.some((quarter) => quarter.contains(p, 22))
          );
        });
        if (permitted)
          quad(
            coords.map(([angle, z]) => point(angle, z)),
            stone,
          );
      }
    }
  }
  const materials = [];
  if (indices.length) {
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = own(
      finishHabitatMaterial(
        new T.MeshStandardMaterial({
          name: 'Oriel / honed civic courts and contour spines',
          vertexColors: true,
          roughness: 0.94,
          side: T.DoubleSide,
        }),
        { bounce: 0.22 },
      ),
    );
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Oriel / connected civic courts and hillside spines';
    mesh.receiveShadow = true;
    group.add(mesh);
    materials.push(material);
  }
  group.userData.agriculturalDistricts = districts.size;
  group.userData.triangles = indices.length / 3;
  group.userData.cultivationBytes = pixels.byteLength;
  group.userData.routeClearance = 120;
  return { group, materials, cultivation };
}

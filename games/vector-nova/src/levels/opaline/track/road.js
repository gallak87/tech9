import * as T from 'three';
import {
  createOpalineMaterials,
  opalineStoneURLs,
  loadOpalineSculptures,
} from '@worldkit/environment/opaline';
import { createLifetime } from '../../../core/lifecycle.js';
import { sweepGeometry } from '../../../track/geometry.js';
import {
  roadIntervals,
  createOpalineSurfaceGeometry,
  createOpalineConnectorRailGeometry,
  createOpalineSurfGeometry,
} from './geometry.js';

export async function createOpalineRoad({ track, shape = false } = {}) {
  const lifetime = createLifetime(),
    group = new T.Group();
  group.name = 'Opaline / polished mineral running surfaces';
  lifetime.defer(() => group.clear());
  try {
    let textures = {},
      palette;
    if (!shape) {
      const stoneMaps = {};
      // Load each authored channel once; the environment borrows this palette.
      for (const [key, url] of Object.entries(opalineStoneURLs)) {
        const map = lifetime.own(await new T.TextureLoader().loadAsync(url));
        map.colorSpace = key === 'map' ? T.SRGBColorSpace : T.NoColorSpace;
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.anisotropy = 8;
        stoneMaps[key] = map;
      }
      textures = { stone: stoneMaps };
      palette = lifetime.own(
        createOpalineMaterials({
          textures,
          surface: 'shelf',
          wetness: 0.55,
          textureScale: 1 / 6,
        }),
      );
      palette.stone.color.set('#e2dcd2');
      palette.stone.envMapIntensity = 0.7;
      const baseShader = palette.stone.onBeforeCompile;
      palette.stone.onBeforeCompile = (shader) => {
        baseShader(shader);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nattribute vec2 roadCoord;varying vec2 vShelfCoord;',
          )
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvShelfCoord=roadCoord;',
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vShelfCoord;',
        );
        const zones = track.surgeZones
          .map(
            (z) =>
              'step(' +
              z.start.toFixed(3) +
              ',vShelfCoord.x)*step(vShelfCoord.x,' +
              z.end.toFixed(3) +
              ')',
          )
          .join('+');
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nfloat surgeArea=clamp(' +
            zones +
            ',0.,1.);float washed=1.-smoothstep(7.,11.,vShelfCoord.y);diffuseColor.rgb*=mix(vec3(1.),vec3(.68,.79,.72),surgeArea*washed*.45);',
        );
      };
      palette.stone.customProgramCacheKey = () => 'opaline-running-shelf-v2';
    }
    const sculptures = shape
      ? null
      : lifetime.own(await loadOpalineSculptures());
    const stone =
      palette?.stone ??
      lifetime.own(
        new T.MeshStandardMaterial({ color: '#a7b2b8', roughness: 0.75 }),
      );
    const connector = lifetime.own(
      new T.MeshStandardMaterial({
        color: shape ? '#a7b2b8' : '#b9bab0',
        roughness: 0.52,
        metalness: 0.18,
      }),
    );
    const rail = lifetime.own(
      new T.MeshStandardMaterial({
        color: shape ? '#7e909b' : '#667772',
        roughness: 0.38,
        metalness: 0.32,
      }),
    );
    const underside = lifetime.own(
      new T.MeshStandardMaterial({
        color: shape ? '#64727b' : '#6a7773',
        roughness: 0.68,
        metalness: 0.12,
      }),
    );
    const guide = lifetime.own(
      new T.MeshStandardMaterial({
        color: '#84b9a0',
        emissive: '#326b56',
        emissiveIntensity: 0.2,
        roughness: 0.4,
      }),
    );
    function add(geometry, material, name, shadow = true) {
      lifetime.own(geometry);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = shadow;
      group.add(mesh);
      return mesh;
    }
    for (const span of roadIntervals(track)) {
      const deck = add(
        createOpalineSurfaceGeometry(track, span),
        span.constructed ? connector : stone,
        span.constructed
          ? 'Opaline / ceramic service connector'
          : 'Opaline / river-polished shelf',
      );
      deck.userData.roadSurface = true;
      if (span.constructed) {
        add(
          sweepGeometry(
            track,
            [
              [-16, -0.03],
              [-16, -1.6],
              [16, -1.6],
              [16, -0.03],
            ],
            span,
          ),
          underside,
          'Opaline / connector structural shell',
        );
        for (const side of [-1, 1])
          add(
            createOpalineConnectorRailGeometry(track, { ...span, side }),
            rail,
            'Opaline / physical connector parapet',
          );
        // Inlaid expansion joints are local infrastructure; mineral shelves remain unpainted.
        for (let s = span.start + 12; s < span.end - 2; s += 18) {
          add(
            sweepGeometry(
              track,
              [
                [-15.7, 0.025],
                [15.7, 0.025],
              ],
              { start: s, end: s + 0.16, step: 1 },
            ),
            rail,
            'Opaline / connector expansion seam',
            false,
          );
        }
      }
    }
    for (const bank of track.surfBanks) {
      const deck = add(
        createOpalineSurfGeometry(track, bank),
        stone,
        'Opaline / surfable polished inner bank ' + bank.id,
      );
      deck.userData.roadSurface = true;
    }
    for (const jump of track.jumps) {
      for (const side of [-1, 1]) {
        add(
          sweepGeometry(
            track,
            [
              [side * 15.3, 0.045],
              [side * 15.7, 0.045],
            ],
            { start: jump.takeoff - 95, end: jump.takeoff, step: 4 },
          ),
          guide,
          'Opaline / wet lip guide',
          false,
        );
        add(
          sweepGeometry(
            track,
            [
              [side * 15.3, 0.045],
              [side * 15.7, 0.045],
            ],
            { start: jump.landingStart, end: jump.landingStart + 120, step: 4 },
          ),
          guide,
          'Opaline / receiving mineral seam',
          false,
        );
      }
    }
    return {
      group,
      textures,
      sculptures,
      materials: palette?.materials,
      ready: Promise.resolve(),
      dispose: () => lifetime.dispose(),
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

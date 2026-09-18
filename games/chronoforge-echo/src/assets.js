import * as EnemyArt from './enemy-frames.js';
import * as HeroArt from './hero-frames.js';
import * as MidEnemyArt from './mid-enemy-frames.js';
import * as BossArt from './boss-frames.js';
import { ENVIRONMENT_ASSETS } from './environment-frames.js';
import { HERO_WALK_ART } from './hero-walk-frames.js';
import { ALPHA_MASKS } from './alpha-masks.js';
import { WORLD_PROP_ASSETS } from './world-prop-frames.js';
import { RASTER_ICON_ASSETS } from './raster-icon-manifest.js';
import { installRasterIcon } from './raster-icons.js';
import { SIGN_ASSETS } from './sign-art.js';
import { STRUCTURE_ASSETS } from './structure-art.js';
import { NPC_ASSETS } from './npc-art.js';

// Immutable source atlases are interpreted at import. A required asset failure
// stops boot rather than substituting an unrelated sprite into a finished scene.
const heroes = Object.values(HeroArt).filter(a => a?.id && a?.frames);
const enemies = [...Object.values(EnemyArt), ...Object.values(MidEnemyArt), ...Object.values(BossArt)].filter(a => a?.id && a?.source && a?.frames);
const atlas = (id, url, columns, rows, kind, options = {}) => ({
  id, url: `assets/${url}`, columns, rows, kind, required: true, ...options,
});
export const ASSET_MANIFEST = [
  atlas('kaida_walk', 'kaida-walk-source.png', 4, 3, 'kaidaWalk', { key: 'neutral-exterior' }),
  atlas('kaida_showcase', 'kaida-showcase-source.png', 6, 2, 'kaida', { key: 'neutral-exterior' }),
  atlas('coast_props', 'coast-props-source.png', 4, 2, 'environment', { biome: 'coast' }),
  atlas('coast_ground', 'coast-ground-source.png', 3, 2, 'ground', { biome: 'coast' }),
  atlas('emberline_props', 'emberline-props-source.png', 4, 2, 'environment', { biome: 'desert', key: 'neutral-exterior', backgroundSeeds: [[258,78],[247,95],[278,219],[595,136],[682,144],[621,201],[597,296],[1071,150],[1200,161],[1209,180],[1210,235],[1597,228],[1559,220],[1543,226],[1571,306],[1530,253],[1523,288],[1534,561],[557,544],[1600,580],[1683,599],[496,702]] }),
  atlas('emberline_ground', 'emberline-ground-source.png', 3, 2, 'ground', { biome: 'desert' }),
  atlas('interior_ground', 'interior-ground-source.png', 3, 2, 'interiorGround'),
  atlas('interior_wall', 'interior-wall-source.png', 3, 2, 'interiorWall'),
  atlas('civic_production', 'civic-production-source.png', 4, 4, 'building', { group: 'production', key: 'neutral-exterior', backgroundSeeds: [[1116,33],[1137,33],[1052,704],[1132,666],[507,697],[519,680],[119,1029],[787,951],[674,755],[754,755],[817,764],[818,725],[820,663],[51,210],[1054,1043],[1146,168],[1070,152],[1215,164],[1028,167],[1112,951],[811,686],[780,734],[772,750],[779,769],[822,757]] }),
  atlas('civic_culture', 'civic-culture-source.png', 4, 4, 'building', { group: 'culture', key: 'neutral-exterior', backgroundSeeds: [[1098,1082],[704,436],[715,440],[894,58],[856,62],[1083,646],[1123,656],[1135,676],[1159,668],[1066,676],[711,676],[704,676],[714,689],[696,707],[716,711]] }),
  atlas('haventide_interior', 'haventide-interior-source.png', 4, 2, 'interior', { key: 'neutral-exterior' }),
  atlas('domestic_furniture', 'domestic-furniture-source.png', 4, 2, 'domestic'),
  atlas('haventide_civilians', 'haventide-civilians-source.png', 6, 2, 'civilian', { key: 'neutral-exterior' }),
  atlas('rust_scrapper', 'rust-scrapper-source.png', 3, 2, 'enemy', { metadata: { width: 128, height: 112, anchorX: .5, anchorY: .86 } }),
  ...ENVIRONMENT_ASSETS.map(entry => ({ ...entry, url: entry.source, required: true })),
  ...WORLD_PROP_ASSETS.map(entry => ({ ...entry, url: entry.source, required: true })),
  ...RASTER_ICON_ASSETS.map(entry => ({ ...entry, url: entry.source })),
  ...SIGN_ASSETS.map(entry => ({ ...entry, url: entry.source })),
  ...NPC_ASSETS.map(entry => ({ ...entry, url: entry.source })),
  ...STRUCTURE_ASSETS.map(entry => ({ ...entry, url: entry.source })),
  ...HERO_WALK_ART.map(metadata => ({ id: metadata.id + '_walk', heroId: metadata.id, url: metadata.source, columns: 4, rows: 3, kind: 'heroWalk', required: true, key: metadata.key, keyMin: metadata.keyMin, backgroundSeeds: metadata.backgroundSeeds, metadata })),
  ...heroes.map(metadata => ({ id: metadata.id, url: metadata.source || `assets/${metadata.id}-source.png`, columns: metadata.columns || 6, rows: metadata.rows || 2, kind: 'hero', required: true, key: metadata.preserveSourceAlpha ? undefined : metadata.key || 'neutral-exterior', keyMin: metadata.keyMin, backgroundSeeds: metadata.backgroundSeeds, metadata })),
  ...enemies.map(metadata => ({ id: metadata.id, url: metadata.source, columns: metadata.columns || 3, rows: metadata.rows || 2, kind: 'enemy', required: true, key: metadata.key, keyMin: metadata.keyMin, backgroundSeeds: metadata.backgroundSeeds, metadata })),
].map(entry => entry.metadata?.preserveSourceAlpha ? entry : ({ ...entry, ...ALPHA_MASKS[entry.id] }));
export const assetDiagnostics = { loaded: [], errors: [], bytes: 0 };

function keyNeutralExterior(context, width, height, { keyMin = 175, backgroundSeeds = [], keyZones = [] } = {}) {
  const image = context.getImageData(0, 0, width, height), data = image.data;
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const background = i => {
    const k = i * 4, hi = Math.max(data[k], data[k + 1], data[k + 2]), lo = Math.min(data[k], data[k + 1], data[k + 2]);
    if (lo >= keyMin && hi - lo < 16) return true;
    const x = i % width, y = Math.floor(i / width);
    return keyZones.some(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h && lo >= z.min && hi - lo < z.chroma);
  };
  const seed = i => { if (!seen[i] && background(i)) { seen[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  // Measured seeds cover background islands enclosed by a staff, cape or tail.
  // Flood only from those declared points; neutral armor highlights stay intact.
  for (const [x, y] of backgroundSeeds) {
    if (x >= 0 && x < width && y >= 0 && y < height) seed(Math.floor(y) * width + Math.floor(x));
  }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    data[i * 4 + 3] = 0;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < width * (height - 1)) seed(i + width);
  }
  context.putImageData(image, 0, 0);
}

export async function loadPixelAtlas(entry) {
  const started = performance.now(), image = new Image();
  const ready = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Required art failed to load: ${entry.url}`));
  });
  image.src = import.meta.env.BASE_URL + entry.url;
  await ready;
  if (entry.metadata?.frames) {
    const m = entry.metadata;
    if ((m.sourceWidth && m.sourceWidth !== image.width) || (m.sourceHeight && m.sourceHeight !== image.height)) throw Error(`Source dimensions changed: ${entry.id}`);
    for (const f of m.frames) if (![f.x,f.y,f.w,f.h,f.anchorX,f.anchorY].every(Number.isFinite) || f.x < 0 || f.y < 0 || f.w <= 0 || f.h <= 0 || f.x + f.w > image.width || f.y + f.h > image.height) throw Error(`Invalid frame crop: ${entry.id}`);
  } else if (Math.abs(image.width / entry.columns - image.height / entry.rows) > .01) throw Error(`Atlas cells are not square: ${entry.id}`);
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  if (entry.key === 'neutral-exterior') keyNeutralExterior(context, image.width, image.height, entry);
  assetDiagnostics.bytes += image.width * image.height * 4;
  assetDiagnostics.loaded.push({ id: entry.id, width: image.width, height: image.height, loadMs: Math.round(performance.now() - started) });
  return canvas;
}

export async function loadAssets(art) {
  await Promise.all(ASSET_MANIFEST.map(async entry => {
    try {
      const image = await loadPixelAtlas(entry), grid = { columns: entry.columns, rows: entry.rows, biome: entry.biome };
      switch (entry.kind) {
        case 'kaidaWalk': art.installKaidaWalkSheet(image); break;
        case 'kaida': art.installKaidaSheet(image, { cell: image.width / entry.columns }); break;
        case 'hero': art.installHeroSheet(entry.id, image, entry.metadata); break;
        case 'heroWalk': art.installHeroWalkSheet(entry.heroId, image, entry.metadata); break;
        case 'environment': art.installEnvironmentAtlas(image, grid); break;
        case 'ground': art.installGroundAtlas(image, grid); break;
        case 'interiorGround': art.installInteriorGroundAtlas(image, grid); break;
        case 'interiorWall': art.installInteriorWallAtlas(image, grid); break;
        case 'building': art.installBuildingAtlas(entry.group, image, grid); break;
        case 'interior': art.installInteriorAtlas(image, grid); break;
        case 'domestic': art.installDomesticAtlas(image, grid); break;
        case 'worldProp': art.installWorldPropAtlas(image, entry.metadata); break;
        case 'itemIcon': installRasterIcon(image, entry); break;
        case 'roadSign': art.installRoadSign(image, entry.metadata); break;
        case 'structure': art.installStructureSprite(image, entry.metadata); break;
        case 'npc': art.installNpcAtlas(image, entry.metadata); break;
        case 'civilian': art.installCivilianAtlas(image, grid); break;
        case 'enemy': art.installEnemySheet(entry.id, image, { ...grid, ...entry.metadata }); break;
        default: throw Error(`No art importer for ${entry.id}`);
      }
    } catch (error) {
      assetDiagnostics.errors.push(error.message);
      if (entry.required) throw error;
    }
  }));
}

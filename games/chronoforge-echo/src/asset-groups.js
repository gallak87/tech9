import { ALL_SCENES, REGIONS } from './world.js';
import { townInteriorRegion } from './town-interior-art.js';
import { npcIdentity } from './npc-identities.js';

// Groups name dependencies, never duplicate source paths. A region includes its
// town, house and cave so local doorways stay warm after the first crossing.
const COMMON_KINDS = new Set([
  'kaida',
  'kaidaWalk',
  'hero',
  'heroWalk',
  'heroPose',
  'itemIcon',
  'inventoryIcon',
  'civilian',
  'worldProp',
  'roadSign',
  'interior',
  'interiorGround',
  'interiorWall',
  'domestic',
]);
export function regionForScene(sceneId) {
  const scene = ALL_SCENES[sceneId];
  if (!scene) throw new Error(`Unknown asset destination: ${sceneId}`);
  return Object.values(REGIONS).find((region) => region.biome === scene.biome)
    ?.id;
}
export function commonAssetIds(manifest) {
  return manifest
    .filter((entry) => COMMON_KINDS.has(entry.kind))
    .map((entry) => entry.id);
}
export function regionAssetIds(manifest, sceneId, state) {
  const region = regionForScene(sceneId),
    biome = ALL_SCENES[sceneId].biome,
    scenes = Object.values(ALL_SCENES).filter((scene) => scene.biome === biome),
    objects = scenes.flatMap((scene) => scene.objects),
    enemies = new Set(objects.flatMap((object) => object.enemies || [])),
    npcs = new Set(objects.map(npcIdentity).filter(Boolean)),
    kit = townInteriorRegion(region, state);
  return manifest
    .filter((entry) => {
      if (COMMON_KINDS.has(entry.kind)) return true;
      if (['environment', 'ground', 'environmentDetail'].includes(entry.kind))
        return entry.biome === biome;
      if (entry.kind === 'townCenter') return entry.region === region;
      if (entry.kind === 'havenInterior') return entry.region === kit;
      if (entry.kind === 'building') return region === 'haventide';
      if (entry.kind === 'npc')
        return entry.metadata.frames.some((frame) => npcs.has(frame.id));
      if (entry.kind === 'structure')
        return objects.some((object) =>
          entry.metadata.objectId
            ? object.id === entry.metadata.objectId
            : object.style === entry.metadata.style,
        );
      if (['caveKit', 'caveExit', 'caveFloor'].includes(entry.kind))
        return entry.metadata.frames.some((frame) => frame.biome === biome);
      if (entry.kind === 'enemy') return enemies.has(entry.id);
      if (entry.kind === 'enemyWalk') return enemies.has(entry.enemyId);
      return false;
    })
    .map((entry) => entry.id);
}
export function assetDependencies(manifest, destination) {
  if (!destination) return { key: 'common', ids: commonAssetIds(manifest) };
  const state = typeof destination === 'string' ? null : destination,
    sceneId =
      typeof destination === 'string' ? destination : destination.region,
    ids = new Set(regionAssetIds(manifest, sceneId, state)),
    battle = state?.suspendedBattle || state?.battle;
  // Saved battles can come from developer previews or an older encounter roster.
  for (const enemy of battle?.enemies || []) {
    const id = typeof enemy === 'string' ? enemy : enemy.id;
    for (const entry of manifest)
      if (
        (entry.kind === 'enemy' && entry.id === id) ||
        (entry.kind === 'enemyWalk' && entry.enemyId === id)
      )
        ids.add(entry.id);
  }
  // The closing conversation returns home; its artwork is ready before it starts.
  if (state?.flags?.pendingEnding)
    for (const id of regionAssetIds(manifest, 'haventide', state)) ids.add(id);
  return { key: regionForScene(sceneId), ids: [...ids] };
}

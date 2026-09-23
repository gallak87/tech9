import { REGIONS } from './world.js';

const categories = {
  hero: 'Crew',
  heroWalk: 'Crew',
  heroPose: 'Crew',
  kaida: 'Crew',
  kaidaWalk: 'Crew',
  enemy: 'Enemies',
  enemyWalk: 'Enemies',
  inventoryIcon: 'Equipment',
  itemIcon: 'Resources',
  npc: 'Townsfolk',
  civilian: 'Townsfolk',
  building: 'Buildings',
  interior: 'Interiors',
  interiorGround: 'Interiors',
  interiorWall: 'Interiors',
  domestic: 'Interiors',
  caveKit: 'Caves',
  caveExit: 'Caves',
  caveFloor: 'Caves',
  worldProp: 'Landmarks',
  structure: 'Landmarks',
  roadSign: 'Signs',
};
function assetLabel(entry) {
  if (!entry) return 'Artwork';
  const region = Object.values(REGIONS).find(
    (region) => region.id === entry.region || region.biome === entry.biome,
  );
  return region?.name || categories[entry.kind] || 'Artwork';
}

// Count artwork only after decoding and installation, using the selected boot
// bundle as the denominator. This is preparation progress, not download bytes.
export function mountLoadingProgress(root, total, entries = new Map()) {
  root.innerHTML =
    '<span class="insignia" aria-hidden="true">⌁</span><div class="loading-progress"><p data-loading-title role="status">Assembling the field atlas…</p><progress max="1" value="0" aria-label="Artwork ready"></progress><p data-loading-count></p></div>';
  const bar = root.querySelector('progress');
  const count = root.querySelector('[data-loading-count]');
  const title = root.querySelector('[data-loading-title]');
  bar.max = Math.max(1, total);
  function update({ loadedCount = 0, loadingId = null } = {}) {
    const ready = Math.min(total, Math.max(0, loadedCount));
    const percent = total ? Math.floor((ready / total) * 100) : 100;
    bar.value = total ? ready : 1;
    count.textContent = `${ready} / ${total} assets ready · ${percent}%`;
    const message =
      ready === total
        ? 'Starting the expedition…'
        : `Loading ${assetLabel(entries.get(loadingId))}…`;
    if (title.textContent !== message) title.textContent = message;
  }
  update();
  return update;
}

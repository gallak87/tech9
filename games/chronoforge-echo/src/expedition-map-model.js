import { REGIONS } from './world.js';
import { isRevealed } from './maps.js';

export const MAP_REGIONS = {
  crater_ember: [1, 0],
  frost_canyon: [2, 0],
  haventide: [0, 1],
  emberline: [1, 1],
  orbital_reach: [2, 1],
  last_crown: [3, 1],
  forest_veil: [1, 2],
  mire_bog: [2, 2],
};

export function mapLayout(width, height, zoom = 1, panX = 0, panY = 0) {
  const scale =
    Math.max(0.08, Math.min((width - 48) / 597, (height - 100) / 304)) * zoom;
  const left = width / 2 + panX - (597 * scale) / 2,
    top = 54 + (height - 100) / 2 + panY - (304 * scale) / 2;
  return Object.fromEntries(
    Object.entries(MAP_REGIONS).map(([id, [col, row]]) => [
      id,
      {
        x: left + col * 157 * scale,
        y: top + row * 106 * scale,
        width: 126 * scale,
        height: 74 * scale,
        scale,
      },
    ]),
  );
}

export function adjacentMapRegion(id, key) {
  const direction = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[key];
  if (!direction || !MAP_REGIONS[id]) return id;
  const [x, y] = MAP_REGIONS[id],
    [dx, dy] = direction;
  const score = (p) =>
    Math.abs((p[0] - x) * dy + (p[1] - y) * dx) * 4 +
    Math.abs((p[0] - x) * dx + (p[1] - y) * dy);
  return (
    Object.entries(MAP_REGIONS)
      .filter(([, p]) => (p[0] - x) * dx + (p[1] - y) * dy > 0)
      .sort(([, a], [, b]) => score(a) - score(b))[0]?.[0] ?? id
  );
}

// The local reveal affects the menu only, never the expedition's survey data.
export function mapRegionVisible(game, id) {
  return !!game.devTools?.mapExplored || !!game.state.visited[id];
}
export function mapPointVisible(game, id, x, y) {
  return !!game.devTools?.mapExplored || isRevealed(game.state, id, x, y);
}

function travelUnavailableReason(game, id) {
  const region = Object.hasOwn(REGIONS, id) ? REGIONS[id] : null;
  if (!region) return 'Unknown region';
  if (game.mode !== 'world' || game.battle)
    return 'Finish the encounter to travel';
  if (game.transition || game.state.recruitmentWalk || game.upgradeTour?.open)
    return 'Travel unavailable right now';
  return null;
}

// Normal settlement travel also serves scripted homecoming. Map preview changes
// the map's action only, never the underlying real-expedition travel permission.
export function settlementTravelAction(game, id) {
  const reason = travelUnavailableReason(game, id);
  if (reason) return { reason };
  const region = REGIONS[id];
  if (game.state.flags.pendingEnding)
    return { reason: 'Finish the crew’s ending first' };
  if (!game.state.visited[id]) return { reason: 'Uncharted' };
  if (!region.town) return { reason: 'No caravan route' };
  if (region.town.discoveryTravel && !game.state.visited[id + '_town'])
    return { reason: 'Enter this settlement to discover its travel stop' };
  if (!region.town.discoveryTravel && !game.state.flags[id + '_liberated'])
    return { reason: 'Liberate this settlement to travel' };
  return { action: 'travel:' + id, label: 'Travel' };
}

// The revealed dev map offers temporary jumps; normal travel keeps its gates.
export function mapTravelAction(game, id) {
  const reason = travelUnavailableReason(game, id);
  if (reason) return { reason };
  if (game.devTools?.mapExplored) {
    if (game.ui?.panel) return { reason: 'Close the conversation to jump' };
    return { action: 'dev-world:' + id, label: 'Jump' };
  }
  return settlementTravelAction(game, id);
}

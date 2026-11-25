import { raceHudColors } from '../race/roster.js';
import { getShip } from '../ships/catalog.js';
import { escapeHTML } from './html.js';

export const classificationColors = (shipId) =>
  raceHudColors(getShip(shipId).liveryAccent);

export function classificationRowAttributes(id, colors, playerClass = 'you') {
  const color = Object.hasOwn(colors, id) ? colors[id] : '#e7edf0';
  return `class="classification-row${id === 'player' ? ` ${playerClass}` : ''}" data-racer="${escapeHTML(id)}" style="--racer-color:${color}"`;
}

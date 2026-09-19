import { encounterLevelLabel } from './enemy-levels.js';
import { VIEW_WIDTH, VIEW_HEIGHT } from './rendering.js';

// A final, stationary canvas pass keeps these small badges above scenery and
// actors. Text uses the existing high-resolution HUD surface, not a sprite.
export function drawEncounterLevels(ctx, scene, camera, state) {
  ctx.save();
  ctx.font = '500 10px Barlow, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const encounter of scene.objects) {
    if (encounter.type !== 'encounter') continue;
    const cleared = Boolean(state.cleared?.[encounter.id]);
    if (cleared && (encounter.boss || encounter.guard || encounter.flag)) continue;
    const x = Math.round(encounter.x - Math.round(camera.x || 0));
    const y = Math.round(encounter.y - Math.round(camera.y || 0)) + 10;
    const label = `${encounterLevelLabel(encounter)}${encounter.guard ? ' · SENTRY' : ''}`;
    const width = Math.ceil(ctx.measureText(label).width) + 14;
    if (x + width / 2 < 0 || x - width / 2 > VIEW_WIDTH || y < 0 || y > VIEW_HEIGHT) continue;
    const left = Math.round(x - width / 2);
    ctx.fillStyle = cleared ? '#1b1b1bd9' : '#1b1b1bef';
    ctx.fillRect(left, y, width, 17);
    ctx.strokeStyle = '#b8b8b866';
    ctx.lineWidth = .5;
    ctx.strokeRect(left, y, width, 17);
    ctx.fillStyle = cleared ? '#b8b8b8' : '#eeece9';
    ctx.fillText(label, x, y + 8.5);
  }
  ctx.restore();
}

import {
  encounterBadgeLabel,
  encounterDanger,
  ENEMY_DANGER_STYLES,
} from './enemy-levels.js';
import { ENCOUNTER_RING, hasContactBoundary } from './encounter-contact.js';
import { cameraViewport } from './viewport.js';

// A ground pass keeps the contact cue underneath sprites and scenery. Cooldown
// hides it briefly after retreat so a protected boundary never claims to be live.
export function drawEncounterRings(
  ctx,
  scene,
  camera,
  state,
  { contactReady = true } = {},
) {
  if (!contactReady) return;
  const { width: viewWidth, height: viewHeight } = cameraViewport(camera);
  const { radiusX, radiusY } = ENCOUNTER_RING;
  ctx.save();
  for (const encounter of scene.objects) {
    if (!hasContactBoundary(encounter, state)) continue;
    const x = encounter.x - Math.round(camera.x || 0),
      y = encounter.y - Math.round(camera.y || 0);
    if (
      x + radiusX < 0 ||
      x - radiusX > viewWidth ||
      y + radiusY < 0 ||
      y - radiusY > viewHeight
    )
      continue;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d657500c';
    ctx.fill();
    // A quiet dark under-stroke keeps the same red legible on snow and lava.
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#15191c40';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d657506b';
    ctx.stroke();
  }
  ctx.restore();
}

function skull(ctx, x, y, style) {
  ctx.fillStyle = style.text;
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 3.5, 3.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 2, y + 1, 4, 3.5);
  ctx.fillStyle = style.background;
  ctx.fillRect(x - 2.5, y - 1.5, 1.5, 1.5);
  ctx.fillRect(x + 1, y - 1.5, 1.5, 1.5);
  ctx.fillRect(x - 0.5, y + 1, 1, 1.5);
}

// A final canvas pass keeps these small badges above scenery and
// actors. Text uses the existing high-resolution HUD surface, not a sprite.
export function drawEncounterLevels(ctx, scene, camera, state) {
  const { width: viewWidth, height: viewHeight } = cameraViewport(camera);
  const textScale = camera.mobile ? 14 / (10 * (camera.cssScale || 0.8)) : 1;
  const rowHeight = 17 * textScale;
  ctx.save();
  ctx.font = `500 ${10 * textScale}px Barlow, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const encounter of scene.objects) {
    if (encounter.type !== 'encounter') continue;
    const cleared = Boolean(state.cleared?.[encounter.id]);
    if (cleared && (encounter.boss || encounter.guard || encounter.flag))
      continue;
    const x = Math.round(encounter.x - Math.round(camera.x || 0));
    const footY = Math.round(encounter.y - Math.round(camera.y || 0));
    const label = encounterBadgeLabel(encounter);
    const danger = cleared ? 'lower' : encounterDanger(encounter, state),
      style = ENEMY_DANGER_STYLES[danger],
      warning = danger === 'severe';
    const width =
      Math.ceil(ctx.measureText(label).width) +
      (14 + (warning ? 12 : 0)) * textScale;
    if (
      x + width / 2 < 0 ||
      x - width / 2 > viewWidth ||
      footY < 0 ||
      footY > viewHeight
    )
      continue;
    const left = Math.max(
      4,
      Math.min(viewWidth - width - 4, Math.round(x - width / 2)),
    );
    const y = Math.min(
      viewHeight - rowHeight - 4,
      footY +
        (hasContactBoundary(encounter, state)
          ? ENCOUNTER_RING.radiusY + 5
          : 10),
    );
    ctx.fillStyle = cleared ? '#1b1b1bd9' : style.background;
    ctx.fillRect(left, y, width, rowHeight);
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(left, y, width, rowHeight);
    if (warning) {
      ctx.save();
      ctx.translate(left + 9 * textScale, y + rowHeight / 2);
      ctx.scale(textScale, textScale);
      skull(ctx, 0, 0, style);
      ctx.restore();
    }
    ctx.fillStyle = style.text;
    ctx.fillText(
      label,
      left + width / 2 + (warning ? 6 * textScale : 0),
      y + rowHeight / 2,
    );
  }
  ctx.restore();
}

import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { AEGIS_BREAK_DURATION } from './rules.js';
import { disposeGroup } from './geometry.js';
import { lowMesh, lowRing } from './low-geometry.js';

const clamp = (value) => T.MathUtils.clamp(value, 0, 1);
const white = new T.Color(0xffffff);

// Three plain hoops give a field volume in one draw without covering the hull.
function fieldOutline(color, name) {
  const points = [];
  for (let axis = 0; axis < 3; axis++)
    for (let i = 0; i < 24; i++)
      for (const angle of [
        (i / 24) * Math.PI * 2,
        ((i + 1) / 24) * Math.PI * 2,
      ]) {
        const p = [Math.cos(angle), Math.sin(angle)];
        points.push(
          ...(axis === 0
            ? [p[0], 0, p[1]]
            : axis === 1
              ? [p[0], p[1], 0]
              : [0, p[0], p[1]]),
        );
      }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  const lines = new T.LineSegments(
    geometry,
    new T.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  lines.name = name;
  lines.userData.aoExclude = lines.userData.reflectionExclude = true;
  return lines;
}

export function createLowShipFeedback({ vectorThrust = true } = {}) {
  const group = new T.Group();
  group.name = 'Low pickup / ship feedback';
  const shield = fieldOutline(DEVICE_COLORS.aegis, 'Low Aegis / field');
  shield.scale.set(2.4, 1.4, 4.2);
  shield.position.y = 0.25;
  const acquired = lowRing(DEVICE_COLORS.arc, 'Low pickup / activation');
  acquired.scale.set(2.7, 1, 4.4);
  acquired.position.y = 0.2;
  const vectorGeometry = new T.BoxGeometry(0.14, 0.14, 5);
  vectorGeometry.translate(0, 0, -5.5);
  const drive = lowMesh(
    vectorGeometry,
    DEVICE_COLORS.vector,
    'Low Vector / thrust',
  );
  group.add(shield, acquired, drive);
  let hitTime = 0,
    expiryTime = 0,
    acquiredTime = 0;
  const reset = () => {
    hitTime = expiryTime = acquiredTime = 0;
    shield.visible = acquired.visible = drive.visible = false;
  };
  reset();
  return {
    group,
    get hitActive() {
      return hitTime > 0;
    },
    reset,
    update({
      effects = {},
      events = [],
      racing = true,
      driving = racing,
      dt = 0,
      settings = {},
    } = {}) {
      group.visible = driving;
      if (racing) {
        hitTime = Math.max(0, hitTime - dt);
        expiryTime = Math.max(0, expiryTime - dt);
        acquiredTime = Math.max(0, acquiredTime - dt);
        for (const event of events) {
          const kind = event.payload?.kind;
          if (
            ['pickup-activate', 'combat-fire'].includes(event.type) &&
            DEVICE_COLORS[kind]
          ) {
            acquiredTime = 0.25;
            acquired.material.color.setHex(DEVICE_COLORS[kind]);
          }
          if (event.type === 'shield-hit') {
            hitTime = AEGIS_BREAK_DURATION;
            expiryTime = 0;
          }
          if (event.type === 'pickup-expire' && kind === 'aegis')
            expiryTime = 0.5;
          if (
            (event.type === 'impact' && !event.payload?.shielded) ||
            (event.type === 'pickup-cancel' && kind === 'aegis')
          )
            hitTime = expiryTime = 0;
        }
      }
      const aegis = effects.aegisRemaining > 0;
      shield.visible = aegis || hitTime > 0 || expiryTime > 0;
      shield.material.color.setHex(DEVICE_COLORS.aegis);
      if (hitTime > 0 && !settings.reducedMotion)
        shield.material.color.lerp(
          white,
          clamp(hitTime / AEGIS_BREAK_DURATION),
        );
      shield.material.opacity =
        (settings.reducedMotion ? 0.55 : 0.85) *
        (aegis
          ? 1
          : hitTime > 0
            ? hitTime / AEGIS_BREAK_DURATION
            : expiryTime / 0.5);
      acquired.visible = acquiredTime > 0;
      acquired.material.opacity =
        ((settings.reducedMotion ? 0.3 : 0.7) * acquiredTime) / 0.25;
      drive.visible = effects.vectorActive === true && vectorThrust;
    },
    dispose() {
      disposeGroup(group);
    },
  };
}

export function createLowHitFeedback(ship, hull) {
  const group = new T.Group();
  group.name = 'Low combat / hull response';
  const outline = fieldOutline(DEVICE_COLORS.arc, 'Low combat / hit outline');
  // Fit opaque hull parts once; never clone a hull mesh or borrow its material.
  ship.updateWorldMatrix(true, true);
  const inverse = ship.matrixWorld.clone().invert();
  const bounds = new T.Box3();
  const local = new T.Matrix4();
  for (const part of hull) {
    part.geometry.computeBoundingBox();
    local.multiplyMatrices(inverse, part.matrixWorld);
    bounds.union(part.geometry.boundingBox.clone().applyMatrix4(local));
  }
  if (bounds.isEmpty())
    bounds.set(new T.Vector3(-2, -0.5, -4), new T.Vector3(2, 1, 4));
  bounds.getCenter(outline.position);
  bounds.getSize(outline.scale).multiplyScalar(0.55);
  group.add(outline);
  group.visible = false;
  ship.add(group);
  return {
    group,
    update(
      age,
      { reducedMotion = false } = {},
      kind = 'arc',
      { ionContact = 0 } = {},
    ) {
      const hit =
        ['arc', 'repulsor', 'ion'].includes(kind) && age >= 0 && age < 0.55;
      const contact = kind === 'ion' ? clamp(ionContact) : 0;
      group.visible = hit || contact > 0;
      outline.material.color.setHex(DEVICE_COLORS[kind] ?? DEVICE_COLORS.arc);
      outline.material.opacity =
        (reducedMotion ? 0.45 : 0.9) *
        (hit ? clamp(age / 0.06) * clamp((0.55 - age) / 0.4) : contact * 0.4);
    },
    dispose() {
      disposeGroup(group);
    },
  };
}

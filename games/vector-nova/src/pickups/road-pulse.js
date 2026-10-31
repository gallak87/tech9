import * as T from 'three';
import { energyMaterial } from './energy-material.js';
import { lowMaterial } from './low-geometry.js';
import { DEVICE_COLORS } from './theme.js';

// Reuse the device projector's exact running triangles. A world-space disk or
// cylinder slices through banks and hills, increasingly so at the larger range.
export function createRoadPulsePresentation(
  root,
  projection,
  { low = false } = {},
) {
  const pulses = new Map();
  const windows = new Map();
  const { track, projector } = projection;
  const handles = (flash) =>
    flash.kind === 'repulsor' &&
    !flash.target &&
    flash.radius > 10 &&
    Number.isFinite(flash.distance) &&
    Number.isFinite(flash.lateral);
  function geometry(flash, radius, ring) {
    const shapes = [];
    const { lateral: x, distance: s } = flash;
    if (ring) {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const b = ((i + 1) / 48) * Math.PI * 2;
        shapes.push([
          [x + Math.cos(a) * radius * 0.94, s + Math.sin(a) * radius * 0.94],
          [x + Math.cos(a) * radius, s + Math.sin(a) * radius],
          [x + Math.cos(b) * radius, s + Math.sin(b) * radius],
          [x + Math.cos(b) * radius * 0.94, s + Math.sin(b) * radius * 0.94],
        ]);
      }
    } else
      shapes.push([
        [x - radius, s - radius],
        [x + radius, s - radius],
        [x + radius, s + radius],
        [x - radius, s + radius],
      ]);
    return projector.geometry(shapes, 0.16);
  }
  function windowFor(flash) {
    // Nearby racers share a projected road window. Only the small material
    // uniforms differ; a bunched field must not rebuild the same road ten times.
    const s =
      track.closed === false
        ? flash.distance
        : T.MathUtils.euclideanModulo(flash.distance, track.length);
    const key = Math.floor(s / 64);
    if (!windows.has(key))
      windows.set(key, {
        key,
        references: 0,
        geometry: geometry(
          { distance: key * 64 + 32, lateral: 0 },
          flash.radius + 32,
          false,
        ),
      });
    const window = windows.get(key);
    window.references++;
    return window;
  }
  function release(pulse) {
    if (pulse.window) {
      if (--pulse.window.references === 0) {
        pulse.window.geometry.dispose();
        windows.delete(pulse.window.key);
      }
    } else pulse.mesh.geometry.dispose();
    pulse.mesh.material.dispose();
    pulse.mesh.removeFromParent();
  }
  return {
    handles,
    update(state, settings = {}) {
      const live = new Set();
      for (const flash of state.flashes) {
        if (!handles(flash)) continue;
        live.add(flash.id);
        let pulse = pulses.get(flash.id);
        if (
          pulse &&
          (pulse.distance !== flash.distance ||
            pulse.lateral !== flash.lateral ||
            pulse.range !== flash.radius)
        ) {
          release(pulse);
          pulses.delete(flash.id);
          pulse = null;
        }
        const radius = Math.max(
          3.6,
          flash.radius * Math.min(1, flash.age / 0.3),
        );
        if (!pulse) {
          const material = low
            ? lowMaterial(DEVICE_COLORS.repulsor, 0.8)
            : energyMaterial('road-pressure');
          const window = low ? null : windowFor(flash);
          const mesh = new T.Mesh(
            window?.geometry ?? geometry(flash, radius, true),
            material,
          );
          mesh.name = 'Repulsor / road-conforming pressure wave';
          mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
          root.add(mesh);
          pulse = {
            mesh,
            radius,
            window,
            distance: flash.distance,
            lateral: flash.lateral,
            range: flash.radius,
          };
          pulses.set(flash.id, pulse);
        }
        const fade = Math.pow(Math.max(0, 1 - flash.age / 0.55), 1.5);
        if (low) {
          // Low keeps its ordinary unlit ring. Reproject only during expansion;
          // pause and the stationary fade perform no geometry work.
          if (Math.abs(radius - pulse.radius) > 0.5) {
            pulse.mesh.geometry.dispose();
            pulse.mesh.geometry = geometry(flash, radius, true);
            pulse.radius = radius;
          }
          pulse.mesh.material.opacity =
            fade * (settings.reducedMotion ? 0.35 : 0.8);
        } else {
          const u = pulse.mesh.material.uniforms;
          u.color.value.setHex(DEVICE_COLORS.repulsor);
          u.age.value = flash.age;
          u.time.value = state.time;
          u.strength.value = fade * (settings.reducedMotion ? 0.25 : 0.8);
          u.motion.value = settings.reducedMotion ? 0 : 1;
          u.origin.value.set(flash.lateral, flash.distance);
          u.courseLength.value = track.closed === false ? 0 : track.length;
          u.pulseRadius.value = flash.radius;
        }
      }
      for (const [id, pulse] of pulses) {
        if (live.has(id)) continue;
        release(pulse);
        pulses.delete(id);
      }
    },
    dispose() {
      for (const pulse of pulses.values()) {
        release(pulse);
      }
      pulses.clear();
    },
  };
}

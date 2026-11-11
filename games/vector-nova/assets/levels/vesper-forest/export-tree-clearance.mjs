import assert from 'node:assert/strict';
import { log } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { createVesperTrack } from '../../../src/levels/vesper-forest/track/model.js';
import { createForestTerrain } from '../../../src/levels/vesper-forest/environment/terrain.js';

const gameRoot = fileURLToPath(new URL('../../../', import.meta.url));
const DEFAULT_OUTPUT = resolve(
  gameRoot,
  '.experiments/giant-rebuild/clearance.json',
);

/**
 * Export consumer-owned route/soil constraints for an offline tree builder.
 * This samples the authored course and actual retained terrain triangles. It
 * neither imports the previous giant tree nor generates runtime geometry.
 */
export async function exportTreeClearance({
  output = DEFAULT_OUTPUT,
  step = 2,
  cutterRadius = 29,
  centerOffsetUp = 12.5,
} = {}) {
  if (!Number.isFinite(step) || step <= 0 || step > 4)
    throw new RangeError('Tree clearance sampling requires a step in (0, 4]m');
  if (!Number.isFinite(cutterRadius) || cutterRadius <= 0)
    throw new RangeError('Tree cutter radius must be positive and finite');
  if (!Number.isFinite(centerOffsetUp))
    throw new RangeError('Tree cutter height must be finite');

  const track = createVesperTrack();
  const terrain = createForestTerrain(track);
  try {
    const center = [...track.landmarks.hollow.center];
    const clearance = {
      halfWidth: track.width / 2 + 4,
      minUp: -1,
      maxUp: 26,
      centerOffsetUp,
      cutterRadius,
    };
    const requiredRadius = Math.hypot(
      clearance.halfWidth,
      Math.max(
        Math.abs(clearance.minUp - centerOffsetUp),
        Math.abs(clearance.maxUp - centerOffsetUp),
      ),
    );
    assert.ok(
      cutterRadius > requiredRadius,
      'The cutter must contain the full road/driver/chase-camera cross section',
    );
    const count = Math.ceil(track.length / step);
    const spacing = track.length / count;
    const relative = (p) => p.map((v, axis) => v - center[axis]);
    const samples = [];
    for (let i = 0; i <= count; i++) {
      const distance = i === count ? track.length : i * spacing;
      // Repeating the first frame closes the last segment without a tiny
      // floating-point seam at the course's wrapped distance.
      const frame = track.sample(i === count ? 0 : distance);
      samples.push({
        distance,
        point: relative(frame.position.toArray()),
        cutterPoint: relative(
          frame.position
            .clone()
            .addScaledVector(frame.up, centerOffsetUp)
            .toArray(),
        ),
        right: frame.right.toArray(),
        up: frame.up.toArray(),
        tangent: frame.tangent.toArray(),
      });
    }
    assert.deepEqual(samples[0].point, samples.at(-1).point);
    assert.deepEqual(samples[0].cutterPoint, samples.at(-1).cutterPoint);

    // Unequal bearings/radii describe only candidate soil contacts. The tree
    // author can choose roots around these; they do not prescribe its shape.
    const bearings = [-2.8, -2.05, -1.25, -0.5, 0.3, 1.12, 1.96, 2.65];
    const radii = [205, 180, 220, 190, 230, 185, 210, 200];
    const soilAnchors = bearings.map((angle, index) => {
      const radius = radii[index];
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[2] + Math.sin(angle) * radius;
      const y = terrain.surfaceHeight(x, z);
      return {
        angle,
        radius,
        point: relative([x, y, z]),
        worldPoint: [x, y, z],
        submerged: y < terrain.river.level,
      };
    });
    const { entry, exit, spiralStart, spiralEnd } = track.landmarks.hollow;
    const result = {
      version: 1,
      consumer: 'vector-nova/vesper-forest',
      routeRevision: track.revision,
      units: 'metres',
      coordinates:
        '+Y up; points relative to center; direction vectors unshifted',
      center,
      ground: terrain.surfaceHeight(center[0], center[2]) - center[1],
      riverLevel: terrain.river.level - center[1],
      clearance: {
        ...clearance,
        crossSectionCornerRadius: requiredRadius,
        discretizationMargin: cutterRadius - requiredRadius,
      },
      route: {
        closed: true,
        length: track.length,
        width: track.width,
        requestedStep: step,
        step: spacing,
        entry,
        exit,
        spiralStart,
        spiralEnd,
        samples,
      },
      soilAnchors,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    terrain.dispose();
  }
}

// node assets/levels/vesper-forest/export-tree-clearance.mjs [output.json] [step]
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await exportTreeClearance({
    output: process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT,
    step: process.argv[3] === undefined ? 2 : Number(process.argv[3]),
  });
  log(
    `Exported ${result.route.samples.length} closed route samples at ${result.route.step.toFixed(3)}m; ` +
      `cutter radius ${result.clearance.cutterRadius}m, road-camera corner radius ${result.clearance.crossSectionCornerRadius.toFixed(2)}m.`,
  );
}

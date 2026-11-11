import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry, boxProfile } from '../track/geometry.js';
import { createLifetime } from '../core/lifecycle.js';

/** The same supported cross-section in each world. Theme-owned finishes may
 * decorate these private materials without changing the driving surface.
 */
export function createEliminatorRoad({ track, shape = false }, palette = {}) {
  const group = new T.Group(),
    lifetime = createLifetime();
  group.name = `${track.name} / continuous racing deck`;
  lifetime.defer(() => group.clear());
  try {
    const material = (name, color, roughness, metalness, emission = null) =>
      lifetime.own(
        new T.MeshStandardMaterial({
          name: `${track.name} / ${name}`,
          color: shape ? '#829098' : color,
          roughness,
          metalness,
          ...(emission && !shape
            ? { emissive: emission, emissiveIntensity: 0.3 }
            : {}),
        }),
      );
    const materials = {
      surface: material(
        'running surface',
        palette.surface ?? '#7d919c',
        0.46,
        0.2,
      ),
      structure: material(
        'structural cassette',
        palette.structure ?? '#26343c',
        0.62,
        0.5,
      ),
      edge: material('seated edge finish', palette.edge ?? '#bec9c9', 0.4, 0.4),
      guide: material(
        'verge guidance',
        palette.guide ?? '#d1ab68',
        0.45,
        0.25,
        palette.guide ?? '#d1ab68',
      ),
      cut: material('cut signal', '#e84432', 0.45, 0.2, '#d7251a'),
    };
    const half = track.width / 2;
    function add(name, geometry, finish, driving = false) {
      lifetime.own(geometry);
      const mesh = new T.Mesh(geometry, finish);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true;
      if (driving)
        mesh.userData.drivingSurface = mesh.userData.roadSurface = true;
      group.add(mesh);
      return mesh;
    }
    const sweep = (name, start, end, profile, finish, driving = false) =>
      add(
        name,
        sweepGeometry(track, profile, {
          start,
          end,
          step: 4,
          transverseStep: driving ? 2 : undefined,
          uvScale: 2.5,
        }),
        finish,
        driving,
      );
    const count = Math.ceil(track.length / 420);
    for (let i = 0; i < count; i++) {
      const a = (track.length * i) / count,
        b = (track.length * (i + 1)) / count;
      sweep(
        'Supported pack-racing surface',
        a,
        b,
        [
          [-half, 0],
          [half, 0],
        ],
        materials.surface,
        true,
      );
      sweep(
        'Closed underside carrier',
        a,
        b,
        [
          [-half, -0.1],
          [-half + 1, -3.6],
          [half - 1, -3.6],
          [half, -0.1],
        ],
        materials.structure,
      );
      for (const side of [-1, 1]) {
        sweep(
          'Flush containment shoulder',
          a,
          b,
          [
            [side * (half - 1.4), 0.02],
            [side * half, 0.02],
          ],
          materials.edge,
        );
        sweep(
          'Low outboard rail',
          a,
          b,
          boxProfile(side * (half + 0.4), 0.6, 0.8, 1.2),
          materials.structure,
        );
        sweep(
          'Seated rail cap',
          a,
          b,
          boxProfile(side * (half + 0.4), 1.24, 0.95, 0.12),
          materials.edge,
        );
        sweep(
          'Continuous verge guidance',
          a,
          b,
          [
            [side * (half - 1.85), 0.035],
            [side * (half - 1.6), 0.035],
          ],
          materials.guide,
        );
      }
    }
    const marks = [];
    for (let s = 15; s < track.length - 8; s += 36)
      for (const lane of [-track.width / 6, track.width / 6])
        marks.push(
          sweepGeometry(
            track,
            [
              [lane - 0.08, 0.025],
              [lane + 0.08, 0.025],
            ],
            { start: s, end: s + 7, step: 3 },
          ),
        );
    try {
      if (marks.length)
        add('Flush pack lane dashes', mergeGeometries(marks), materials.edge);
    } finally {
      for (const geometry of marks) geometry.dispose();
    }
    const signalGeometry = lifetime.own(new T.BoxGeometry(0.5, 2.8, 1.8));
    const bracketGeometry = lifetime.own(new T.BoxGeometry(3, 0.35, 2.5));
    for (const distance of track.cutGates)
      for (const side of [-1, 1]) {
        const frame = track.sample(distance),
          signal = new T.Mesh(signalGeometry, materials.cut);
        signal.name = 'Founded cut warning lamp';
        signal.position
          .copy(frame.position)
          .addScaledVector(frame.right, side * (half + 1.7))
          .addScaledVector(frame.up, 1.4);
        signal.quaternion.copy(frame.quaternion);
        group.add(signal);
        const bracket = new T.Mesh(bracketGeometry, materials.structure);
        bracket.name = 'Cut lamp / seated rail bracket';
        bracket.position
          .copy(frame.position)
          .addScaledVector(frame.right, side * (half + 1))
          .addScaledVector(frame.up, -0.1);
        bracket.quaternion.copy(frame.quaternion);
        group.add(bracket);
      }
    return {
      group,
      materials,
      setReflection(texture) {
        for (const material of Object.values(materials)) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      },
      update(frame) {
        const cut = frame.eliminator,
          remaining = cut?.nextCut - cut?.elapsed;
        const warning = remaining >= 0 && remaining <= 3 && !cut?.result;
        materials.cut.emissiveIntensity = warning
          ? frame.settings.reducedMotion
            ? 1.1
            : 0.9 + Math.sin(frame.time * 8) * 0.25
          : 0.3;
      },
      dispose: () => lifetime.dispose(),
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

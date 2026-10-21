import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene } from 'three';
import { createRacerPresentation } from './racer-presentation.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { DEVICE_COLORS } from '../pickups/theme.js';
import { VEHICLE_HULL } from '../physics/hull.js';
import { createVehicleState } from '../physics/index.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createTrack } from '../levels/halcyon/track/model.js';

const dt = 1 / 120;

for (const quality of ['high', 'low'])
  for (const kind of ['arc', 'repulsor', 'ion', 'vector'])
    test(`${quality} rivals show real ${kind} collection and firing, then clear their effects`, async (t) => {
      const track = createTrack();
      const dynamics = await createRapierWorld({
        collisionWorld: withMagneticBoundaries(track),
      });
      t.after(() => dynamics.dispose());
      const combat = createCombatSimulation({ track });
      const device = {
        id: `test-${kind}`,
        type: kind,
        distance: 360,
        lateral: 3,
        width: 8,
        length: kind === 'vector' ? 54 : 8,
      };
      const opponents = ['rook', 'latch'].map((id, i) => {
        const state = {
          ...createVehicleState(),
          distance: i
            ? 100
            : device.distance -
              0.3 -
              (kind === 'vector'
                ? device.length / 2 +
                  Math.hypot(VEHICLE_HULL.halfLength, VEHICLE_HULL.halfWidth) +
                  1
                : 0),
          lateral: 3,
          speed: 80,
        };
        const runtime = createDeviceRuntime({
          track,
          devices: [device],
          combat,
          combatId: id,
          motion: createMagneticRuntime({ track, dynamics }),
        });
        runtime.reset({ state });
        return {
          specification: { id, name: id },
          state,
          prev: { ...state },
          runtime,
        };
      });
      const groups = [];
      const propulsionFrames = [];
      const presentation = await createRacerPresentation({
        racers: { enabled: true, opponents },
        scene: new Scene(),
        track,
        combat,
        settings: { quality },
        loadRival: async () => {
          const group = new Group();
          groups.push(group);
          const index = groups.length - 1;
          return {
            group,
            update: (frame) => (propulsionFrames[index] = frame),
            dispose: () => group.removeFromParent(),
          };
        },
      });
      const rook = opponents[0];
      const draw = (mode = 'racing') =>
        presentation.update({ mode, settings: { quality } });
      let shots = 0;
      const detach = rook.runtime.observePresentation({
        events: (batch) =>
          (shots += batch.filter((e) => e.type === 'combat-fire').length),
        reset() {},
      });
      const step = () => {
        rook.runtime.advance(rook.state, { throttle: 1 }, dt);
        combat.step(dt);
        rook.runtime.update({});
        draw();
      };
      const collection = () =>
        groups[0].getObjectByName(
          quality === 'low'
            ? 'Low pickup / activation'
            : 'Device collection / shaped energy transfer',
        );
      const thrust = () =>
        groups[0].getObjectByName(
          quality === 'low'
            ? 'Low Vector / thrust'
            : 'Vector / soft twin nozzle volume',
        );
      const allHidden = (group) => {
        const visible = [];
        group.traverseVisible((o) => {
          if (o.isMesh || o.isLineSegments) visible.push(o);
        });
        return visible.length === 0;
      };
      try {
        for (let i = 0; i < 10 && !collection().visible; i++) step();
        assert.equal(
          collection().visible,
          true,
          'crossing a gate reaches the rival renderer',
        );
        const material = collection().material;
        assert.equal(
          (material.color ?? material.uniforms.color.value).getHex(),
          DEVICE_COLORS[kind],
        );
        assert.ok(
          allHidden(groups[1]),
          'another rival does not inherit the pickup',
        );
        const acquired = rook.runtime.snapshot();
        draw('paused');
        assert.deepEqual(
          rook.runtime.snapshot(),
          acquired,
          'rendering does not change gameplay',
        );
        assert.equal(
          collection().visible,
          true,
          'pause preserves the acquisition flash',
        );
        if (quality === 'low') {
          groups[0].traverse((o) => {
            if (o.material)
              assert.ok(
                o.material.isMeshBasicMaterial ||
                  o.material.isLineBasicMaterial,
              );
            assert.ok(!o.isLight);
          });
        }
        if (kind === 'vector') {
          assert.equal(
            propulsionFrames[0].catapulting,
            true,
            'Vector drives the actual nozzle plumes',
          );
          assert.equal(
            thrust().visible,
            false,
            'no generic extra nozzle effect is drawn',
          );
        }
        for (let tick = 0; tick < 240; tick++) {
          const previousShots = shots;
          step();
          if (shots > previousShots) {
            const discharge =
              quality === 'low'
                ? collection()
                : groups[0].getObjectByName(
                    kind === 'arc'
                      ? 'Arc / branching hull discharge'
                      : 'Repulsor / hull discharge halo',
                  );
            assert.equal(
              discharge.visible,
              true,
              'each actual discharge reaches the source hull',
            );
            if (quality === 'high')
              assert.ok(discharge.material.uniforms.strength.value > 0.6);
            draw('paused');
            assert.equal(discharge.visible, true);
          }
        }
        assert.equal(shots, kind === 'arc' ? 3 : kind === 'repulsor' ? 1 : 0);
        if (kind === 'ion')
          assert.ok(
            combat.view().wakes.length > 0,
            'the shared wake remains active',
          );
        assert.equal(
          thrust().visible,
          false,
          'Vector ends when the hull leaves its strip',
        );
        assert.equal(propulsionFrames[0].catapulting, false);
        assert.equal(collection().visible, false, 'collection flashes settle');
        rook.runtime.reset({ state: rook.state });
        draw();
        assert.ok(
          allHidden(groups[0]),
          'reset clears every transient pickup effect',
        );
        draw('title');
        assert.ok(groups.every((group) => !group.visible));
      } finally {
        detach();
        presentation.dispose();
        for (const opponent of opponents) opponent.runtime.dispose();
      }
    });

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLifetime } from '../../core/lifecycle.js';
import { createOrielEnvironment } from '../oriel/environment/index.js';
import { createOrielTrack } from '../oriel/track/model.js';
import { createCivicKit } from '../oriel/environment/civic-kit.js';
import { createOrielFreestyleTrack } from './track/model.js';
import { finishSunvaultShell } from './shell-finish.js';
import { sunvaultQuarterClearanceEnvelope } from './quarter-plan.js';

test(
  'Borrowed Oriel civic boroughs and courts clear the complete Sunvault road, pipes and transfer camera corridors',
  { timeout: 30000 },
  async (t) => {
    const lifetime = createLifetime();
    const originalGLTF = GLTFLoader.prototype.loadAsync;
    const originalTexture = T.TextureLoader.prototype.loadAsync;
    // Source geometry, transforms, seeded placement and borrower LOD stay real.
    // Only appearance-only forest pixels are stubbed in this CPU clearance pass.
    GLTFLoader.prototype.loadAsync = async function (url) {
      const path = new URL(url, 'https://assets.invalid/').pathname.replace(
        /^\//,
        '',
      );
      const bytes = await readFile(
        new URL(`../../../public/${path}`, import.meta.url),
      );
      return this.parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      );
    };
    T.TextureLoader.prototype.loadAsync = async () =>
      new T.DataTexture(new Uint8Array(16), 2, 2);
    try {
      const shell = lifetime.own(
        await createOrielEnvironment({ track: createOrielTrack() }),
      );
      const kit = lifetime.own(await createCivicKit());
      finishSunvaultShell(shell.group, lifetime, kit, {
        apply() {},
        coordinates() {},
      });
      shell.group.scale.setScalar(5);
      shell.group.position.y = -4000;
      shell.group.updateWorldMatrix(true, true);
      const parts = [];
      const bounds = new Map();
      const local = new T.Matrix4();
      shell.group.traverseVisible((mesh) => {
        if (
          !mesh.isMesh ||
          !(
            /^Oriel \/ (gardenCourt|waterfront|tower)(Far)? civic streets$/.test(
              mesh.name,
            ) ||
            mesh.name ===
              'Oriel / connected civic courts and hillside spines' ||
            mesh.name === 'Oriel / connected four-metre civic footpaths'
          )
        )
          return;
        const geometry = mesh.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        bounds.set(geometry, geometry.boundingBox);
        for (
          let instance = 0;
          instance < (mesh.isInstancedMesh ? mesh.count : 1);
          instance++
        ) {
          if (mesh.isInstancedMesh) mesh.getMatrixAt(instance, local);
          else local.identity();
          parts.push({
            geometry,
            matrix: mesh.matrixWorld.clone().multiply(local),
            name: mesh.name,
            instance,
          });
        }
      });
      assert.ok(
        parts.length > 100,
        'actual current seeded civic instances must be checked',
      );
      for (const name of [
        'Oriel / connected civic courts and hillside spines',
        'Oriel / connected four-metre civic footpaths',
      ])
        assert.ok(
          parts.some((part) => part.name === name),
          `missing borrowed district surface: ${name}`,
        );
      const track = createOrielFreestyleTrack();
      const box = new T.Box3(),
        triangle = new T.Triangle(),
        inverse = new T.Matrix4(),
        matrix = new T.Matrix4(),
        broad = new T.Box3();
      const blockers = [];
      let frames = 0,
        triangles = 0;
      for (let distance = -64; distance <= track.length; distance += 16) {
        const frame = track.sample(distance);
        inverse
          .makeBasis(frame.right, frame.up, frame.tangent)
          .setPosition(frame.position)
          .invert();
        const envelope = sunvaultQuarterClearanceEnvelope(track, distance);
        box.set(envelope.min, envelope.max);
        // The tube rises at most52m from its floor within the existing90m camera
        // envelope. Full launch/recovery runs retain the420m vertical flight box.
        const pipe = track.tubeAt(distance);
        if (pipe) assert.ok(envelope.max.y >= pipe.radius * 2);
        frames++;
        for (const part of parts) {
          matrix.multiplyMatrices(inverse, part.matrix);
          broad.copy(bounds.get(part.geometry)).applyMatrix4(matrix);
          if (!broad.intersectsBox(box)) continue;
          const positions = part.geometry.attributes.position,
            index = part.geometry.index;
          for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
            triangle.a
              .fromBufferAttribute(positions, index ? index.getX(i) : i)
              .applyMatrix4(matrix);
            triangle.b
              .fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1)
              .applyMatrix4(matrix);
            triangle.c
              .fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2)
              .applyMatrix4(matrix);
            triangles++;
            if (box.intersectsTriangle(triangle)) {
              blockers.push({
                distance,
                phase: envelope.phase,
                name: part.name,
                instance: part.instance,
                triangle: i / 3,
              });
              break;
            }
          }
        }
        if (blockers.length > 8) break;
      }
      t.diagnostic(
        JSON.stringify({
          frames,
          instances: parts.length,
          triangles,
          blockers,
        }),
      );
      assert.deepEqual(
        blockers,
        [],
        'borrowed civic geometry intrudes into Sunvault driving/flight space',
      );
      assert.equal(frames, Math.floor(track.length / 16) + 5);
    } finally {
      GLTFLoader.prototype.loadAsync = originalGLTF;
      T.TextureLoader.prototype.loadAsync = originalTexture;
      lifetime.dispose();
    }
  },
);

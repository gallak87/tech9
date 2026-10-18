import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createTrack } from '../track/model.js';
import { createRouteClearance } from '../../../environment/placement.js';
import { roadsideSites, buildRoadsideArchitecture } from './roadside.js';
import { skylineSites, buildSkyline } from './skyline.js';
import { createSupportClearance } from '../track/supports.js';
import { createPortalTrusses } from '../track/portal-detail.js';

const track = createTrack();
const clearance = createRouteClearance(track);
function geometryBounds(build, site) {
  const bounds = new T.Box3(),
    matrix = new T.Matrix4();
  const collect = (g, mat, x, y, z, w = 1, h = 1, d = 1, yaw = 0) => {
    g.computeBoundingBox();
    matrix.compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
      new T.Vector3(w, h, d),
    );
    bounds.union(g.boundingBox.clone().applyMatrix4(matrix));
  };
  build(
    track,
    {
      add: collect,
      primitive(shape, ...args) {
        assert.equal(shape, 'box');
        const g = new T.BoxGeometry(1, 1, 1);
        collect(g, ...args);
        g.dispose();
      },
    },
    [site],
  );
  return bounds;
}

test('authored streetfronts and upper skyline remain grounded within their reserved envelopes', () => {
  const roads = roadsideSites(track, clearance.clears),
    sky = skylineSites(track, clearance.clears);
  assert.equal(roads.length, 5);
  assert.equal(sky.length, 2);
  for (const [sites, build] of [
    [roads, buildRoadsideArchitecture],
    [sky, buildSkyline],
  ])
    for (const site of sites) {
      const b = geometryBounds(build, site);
      assert.ok(Math.abs(b.min.y - track.groundY) < 0.01);
      assert.ok(b.max.y < track.groundY + site.height + 24);
      const halfX = (site.w ? site.w + 6 : 94) / 2,
        halfZ = (site.d ? site.d + 6 : 106) / 2;
      const c = Math.abs(Math.cos(site.yaw)),
        s = Math.abs(Math.sin(site.yaw));
      assert.ok(
        b.min.x >= site.x - halfX * c - halfZ * s - 0.01 &&
          b.max.x <= site.x + halfX * c + halfZ * s + 0.01,
      );
      assert.ok(
        b.min.z >= site.z - halfX * s - halfZ * c - 0.01 &&
          b.max.z <= site.z + halfX * s + halfZ * c + 0.01,
      );
      assert.ok(
        clearance.clears(
          site.x,
          site.z,
          halfX * 2,
          halfZ * 2,
          b.max.y,
          site.yaw,
        ),
      );
    }
});

test('upper trusses clear the entire upright, banked and inverted racing envelope', () => {
  const trusses = createPortalTrusses(track, track.supportLayout),
    clears = createSupportClearance(track);
  assert.ok(trusses.chords.length > 10 && trusses.diagonals.length > 60);
  for (const { from, to, width, depth } of [
    ...trusses.chords,
    ...trusses.diagonals,
  ]) {
    assert.ok(
      from.toArray().every(Number.isFinite) &&
        to.toArray().every(Number.isFinite),
    );
    assert.ok(clears(from, to, Math.hypot(width, depth) / 2));
  }
});

import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetURL } from '../../assets/url.js';

const Y = new T.Vector3(0, 1, 0);
const ONE = new T.Vector3(1, 1, 1);
const RULES = Object.freeze({
  version: 'ravel-seated-galleries-and-service-bays-v2',
  normalOffset: 78,
  arcStep: 40,
  segmentLength: 36,
  crownLaterals: [-150, 150],
  saddleTop: -1.5,
  saddleOverlap: 3,
  outboard: 32,
});

/** A real transverse service gallery, seated through explicit under-rim mounts.
 * The caller owns finish and its asynchronous texture lifetime. */
export function createRavelAnchorDistricts({
  track,
  finish = null,
  stations = [920],
  serviceBays = [],
}) {
  const group = new T.Group();
  group.name = 'Ravel / seated transverse anchor districts';
  const geometries = new Set(),
    materials = new Set(),
    rendered = new Set();
  const attachmentMaterial = new T.MeshStandardMaterial({
    name: 'Ravel / formed rim saddle alloy',
    color: '#ffffff',
    vertexColors: true,
    metalness: 0.78,
    roughness: 0.32,
  });
  finish?.bind(attachmentMaterial, 'steel');
  materials.add(attachmentMaterial);
  let source = null,
    disposed = false;
  const report = {
    ...RULES,
    asset: 'assets/levels/ravel/tension-gallery.glb',
    districts: [],
    serviceBays: [],
    prototypeBounds: {},
    batchCount: 0,
    attachmentMeshCount: 0,
    segmentCount: 0,
    crownCount: 0,
    triangles: 0,
  };
  group.userData.ravelAnchorDistricts = report;

  function frameAt(distance, lateral) {
    return track.sampleBranchSurface(distance, lateral);
  }
  function galleryPoint(distance, lateral, normalOffset = RULES.normalOffset) {
    const surface = frameAt(distance, lateral);
    return surface.position.clone().addScaledVector(surface.up, normalOffset);
  }
  function rimBounds(distance) {
    return track.sheetBoundsAt?.(distance) ?? track.branchAt(distance, 0);
  }
  function basis(across, normal) {
    const x = across.clone().normalize();
    const y = normal.clone().addScaledVector(x, -normal.dot(x)).normalize();
    const z = new T.Vector3().crossVectors(x, y).normalize();
    return new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(x, y, z),
    );
  }
  function matrix(position, quaternion, scale = ONE) {
    return new T.Matrix4().compose(position, quaternion, scale);
  }

  // Native small formed fittings are retained separately from broad landmark
  // batches. Only this explicitly seated load path receives a raw-hull check.
  function rimMount(
    distance,
    lateral,
    side,
    { normalOffset = RULES.normalOffset, receiver = null } = {},
  ) {
    const running = frameAt(distance, lateral);
    const edgePoint = (at) => {
      const bounds = rimBounds(at);
      return frameAt(at, side < 0 ? bounds.min : bounds.max).position;
    };
    // A widening fan's edge travels across the sheet as well as along it.
    // Seat the fitting along that actual edge, with its arm perpendicular to
    // the rim, so nearby wider road cannot grow through an outboard riser.
    const edgeTangent = edgePoint(distance + 0.25)
      .sub(edgePoint(distance - 0.25))
      .normalize();
    const right = running.up.clone().cross(edgeTangent).normalize();
    const tangent = right.clone().cross(running.up).normalize();
    const surface = {
      ...running,
      right,
      tangent,
      quaternion: basis(right, running.up),
    };
    const pieces = [];
    const local = (across, normal, along = 0) =>
      surface.position
        .clone()
        .addScaledVector(surface.right, across * side)
        .addScaledVector(surface.up, normal)
        .addScaledVector(surface.tangent, along);
    function box(position, quaternion, dimensions, color) {
      const geometry = new RoundedBoxGeometry(
        ...dimensions,
        1,
        Math.min(0.3, Math.min(...dimensions) * 0.12),
      );
      geometry.applyMatrix4(matrix(position, quaternion));
      const rgb = new T.Color(color),
        colors = [];
      for (let i = 0; i < geometry.attributes.position.count; i++)
        colors.push(rgb.r, rgb.g, rgb.b);
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      pieces.push(geometry);
    }
    function beam(a, b, width, depth, color) {
      const delta = b.clone().sub(a);
      box(
        a.clone().add(b).multiplyScalar(0.5),
        new T.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
        [width, delta.length(), depth],
        color,
      );
    }
    // Nine metres across: three lie under the sheet, six beyond the real edge.
    // The uppermost surface is deliberately 1.5m below the physical foil.
    box(
      local(1.5, RULES.saddleTop - 1.1),
      surface.quaternion,
      [9, 2.2, 18],
      '#b2b9b7',
    );
    box(local(2.5, -5.3), surface.quaternion, [6, 3.2, 13], '#39464a');
    for (const along of [-6, 6]) {
      box(local(2, -3.9, along), surface.quaternion, [8, 1.1, 2.2], '#75878b');
      box(
        local(-1, -3.1, along),
        surface.quaternion,
        [1.1, 0.7, 2.8],
        '#c0b6a3',
      );
    }
    const under = local(RULES.outboard, -8);
    const shoulder = local(RULES.outboard, normalOffset);
    const socket = receiver ?? galleryPoint(distance, lateral, normalOffset);
    // The only rise through road height is 32m OUTSIDE the actual open rim.
    // The path under the foil remains underneath until it has left the edge.
    beam(local(4, -5.5), under, 3.6, 4.6, '#58676b');
    beam(under, shoulder, 3.6, 4.6, '#58676b');
    beam(shoulder, socket, 3.6, 4.6, '#75878b');
    beam(
      local(22, -6.5),
      local(RULES.outboard, Math.min(23, normalOffset * 0.5)),
      2.2,
      3.2,
      '#39464a',
    );
    box(shoulder, surface.quaternion, [8, 5, 12], '#b2b9b7');
    box(socket, surface.quaternion, [7, 4, 14], '#75878b');
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, attachmentMaterial);
    mesh.name = `Ravel / seated ${side < 0 ? 'port' : 'starboard'} rim saddle and outboard load path`;
    mesh.userData.ravelRimMount = { station: distance, lateral, side };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    rendered.add(mesh);
    group.add(mesh);
    report.attachmentMeshCount++;
    report.triangles += geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
    return {
      station: distance,
      lateral,
      side,
      topOffset: RULES.saddleTop,
      overlap: RULES.saddleOverlap,
      outboard: RULES.outboard,
      position: surface.position.toArray(),
      gallerySocket: socket.toArray(),
    };
  }

  const ready = new GLTFLoader()
    .loadAsync(assetURL(report.asset))
    .then((gltf) => {
      source = gltf.scene;
      source.updateWorldMatrix(true, true);
      source.traverse((object) => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      });
      if (disposed) {
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        source.clear();
        return;
      }
      const prototypes = new Map();
      for (const name of ['tension_gallery_segment', 'sail_load_crown']) {
        const root = source.getObjectByName(name);
        if (!root)
          throw new Error(`Ravel tension-gallery kit is missing ${name}`);
        const inverse = root.matrixWorld.clone().invert();
        const bounds = new T.Box3().setFromObject(root, true);
        report.prototypeBounds[name] = {
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
        };
        const parts = [],
          sockets = {};
        root.traverse((object) => {
          const relative = inverse.clone().multiply(object.matrixWorld);
          if (object.isMesh)
            parts.push({
              geometry: object.geometry,
              material: object.material,
              relative,
            });
          else if (object.userData.anchorKind)
            sockets[object.name.slice(name.length + 2)] =
              new T.Vector3().setFromMatrixPosition(relative);
        });
        prototypes.set(name, { parts, sockets });
      }
      for (const material of materials) {
        if (
          material === attachmentMaterial ||
          material.name.startsWith('Power')
        )
          continue;
        const kind = material.name.startsWith('Ceramic')
          ? 'shell'
          : material.name.startsWith('Graphite') ||
              material.name.startsWith('Interior')
            ? 'dark'
            : 'steel';
        finish?.bind(material, kind);
      }
      const batches = new Map();
      function place(name, placement) {
        const prototype = prototypes.get(name);
        for (const part of prototype.parts) {
          if (!batches.has(part.material))
            batches.set(part.material, new Map());
          const entries = batches.get(part.material);
          if (!entries.has(part.geometry))
            entries.set(part.geometry, {
              geometry: part.geometry,
              matrices: [],
            });
          entries
            .get(part.geometry)
            .matrices.push(placement.clone().multiply(part.relative));
          report.triangles +=
            (part.geometry.index?.count ??
              part.geometry.attributes.position.count) / 3;
        }
      }
      for (const entry of stations) {
        const {
          station: distance,
          normalOffset = RULES.normalOffset,
          crownLaterals = RULES.crownLaterals,
        } = typeof entry === 'number' ? { station: entry } : entry;
        if (
          !Number.isFinite(distance) ||
          !Number.isFinite(normalOffset) ||
          normalOffset < 35 ||
          crownLaterals.length !== 2 ||
          crownLaterals[0] >= crownLaterals[1]
        )
          throw new RangeError('Invalid Ravel gallery station configuration.');
        const bounds = track.sheetBoundsAt?.(distance);
        if (!bounds || bounds.max - bounds.min < 600)
          throw new RangeError(
            `Ravel transverse district requires a broad continuous sail at ${distance}`,
          );
        const district = {
          station: distance,
          normalOffset,
          crownLaterals,
          bounds,
          segments: [],
          crowns: [],
          rimMounts: [],
        };
        const crowns = crownLaterals.map((lateral) => {
          const frame = frameAt(distance, lateral);
          const centre = galleryPoint(distance, lateral, normalOffset);
          const socketY =
            prototypes.get('sail_load_crown').sockets.gallery_port.y;
          const placement = matrix(
            centre.clone().addScaledVector(frame.up, -socketY),
            basis(frame.right, frame.up),
          );
          const sockets = Object.fromEntries(
            Object.entries(prototypes.get('sail_load_crown').sockets).map(
              ([name, point]) => [name, point.clone().applyMatrix4(placement)],
            ),
          );
          // Translate rigid crown socket span into nearby gallery arc coordinates.
          const h = 0.1;
          const arcMetric =
            galleryPoint(distance, lateral + h, normalOffset).distanceTo(
              galleryPoint(distance, lateral - h, normalOffset),
            ) /
            (2 * h);
          const halfSpan =
            Math.abs(prototypes.get('sail_load_crown').sockets.gallery_port.x) /
            arcMetric;
          const entry = {
            lateral,
            low: lateral - halfSpan,
            high: lateral + halfSpan,
            sockets,
          };
          place('sail_load_crown', placement);
          report.crownCount++;
          district.crowns.push({
            lateral,
            root: new T.Vector3().setFromMatrixPosition(placement).toArray(),
            sockets: Object.fromEntries(
              Object.entries(sockets).map(([name, point]) => [
                name,
                point.toArray(),
              ]),
            ),
          });
          return entry;
        });
        const runs = [
          {
            low: bounds.min,
            high: crowns[0].low,
            a: galleryPoint(distance, bounds.min, normalOffset),
            b: crowns[0].sockets.gallery_port,
          },
          {
            low: crowns[0].high,
            high: crowns[1].low,
            a: crowns[0].sockets.gallery_starboard,
            b: crowns[1].sockets.gallery_port,
          },
          {
            low: crowns[1].high,
            high: bounds.max,
            a: crowns[1].sockets.gallery_starboard,
            b: galleryPoint(distance, bounds.max, normalOffset),
          },
        ];
        for (const run of runs) {
          const count = Math.max(
            1,
            Math.ceil((run.high - run.low) / RULES.arcStep),
          );
          for (let i = 0; i < count; i++) {
            const low = T.MathUtils.lerp(run.low, run.high, i / count);
            const high = T.MathUtils.lerp(run.low, run.high, (i + 1) / count);
            const a =
              i === 0
                ? run.a.clone()
                : galleryPoint(distance, low, normalOffset);
            const b =
              i === count - 1
                ? run.b.clone()
                : galleryPoint(distance, high, normalOffset);
            const normal = frameAt(distance, (low + high) / 2).up;
            const quaternion = basis(b.clone().sub(a), normal);
            const up = Y.clone().applyQuaternion(quaternion);
            // Joint sockets at Y=-.5 land exactly on the two fitted arc points.
            const socketY = prototypes.get('tension_gallery_segment').sockets
              .joint_port.y;
            const centre = a
              .clone()
              .add(b)
              .multiplyScalar(0.5)
              .addScaledVector(up, -socketY);
            const scale = new T.Vector3(
              a.distanceTo(b) / RULES.segmentLength,
              1,
              1,
            );
            place('tension_gallery_segment', matrix(centre, quaternion, scale));
            district.segments.push({
              min: low,
              max: high,
              a: a.toArray(),
              b: b.toArray(),
            });
            report.segmentCount++;
          }
        }
        district.rimMounts.push(
          rimMount(distance, bounds.min, -1, { normalOffset }),
          rimMount(distance, bounds.max, 1, { normalOffset }),
        );
        report.districts.push(district);
      }
      // A side-running service bay uses the same socketed kit, with its axis
      // along the circuit and its full working depth beyond the drivable rim.
      for (const config of serviceBays) {
        const {
          start,
          end,
          side = 1,
          outboard = 60,
          normalOffset = 18,
          crownStation = (start + end) / 2,
        } = config;
        if (!(
          Number.isFinite(start) &&
          end > start &&
          Math.abs(side) === 1 &&
          outboard >= 55 &&
          normalOffset >= 12
        ))
          throw new RangeError('Invalid Ravel outboard service bay.');
        const at = (distance) => {
          const bounds = rimBounds(distance);
          const lateral = side < 0 ? bounds.min : bounds.max;
          const frame = frameAt(distance, lateral);
          return {
            lateral,
            frame,
            point: frame.position
              .clone()
              .addScaledVector(frame.right, side * outboard)
              .addScaledVector(frame.up, normalOffset),
          };
        };
        const centre = at(crownStation);
        const socketY =
          prototypes.get('sail_load_crown').sockets.gallery_port.y;
        // The crown's service bridge, motor throats and status lights face -Z.
        // Turn that face inboard on either side of a longitudinal service bay.
        const crownAxis = centre.frame.tangent.clone().multiplyScalar(-side);
        const placement = matrix(
          centre.point.clone().addScaledVector(centre.frame.up, -socketY),
          basis(crownAxis, centre.frame.up),
        );
        const sockets = Object.fromEntries(
          Object.entries(prototypes.get('sail_load_crown').sockets).map(
            ([name, point]) => [name, point.clone().applyMatrix4(placement)],
          ),
        );
        place('sail_load_crown', placement);
        report.crownCount++;
        const metric =
          at(crownStation + 0.1).point.distanceTo(
            at(crownStation - 0.1).point,
          ) / 0.2;
        const halfSpan =
          Math.abs(prototypes.get('sail_load_crown').sockets.gallery_port.x) /
          metric;
        const bay = {
          start,
          end,
          side,
          outboard,
          normalOffset,
          crownStation,
          segments: [],
          rimMounts: [],
          sockets: Object.fromEntries(
            Object.entries(sockets).map(([name, point]) => [
              name,
              point.toArray(),
            ]),
          ),
        };
        const entrySocket =
          side > 0 ? sockets.gallery_starboard : sockets.gallery_port;
        const exitSocket =
          side > 0 ? sockets.gallery_port : sockets.gallery_starboard;
        const runs = [
          {
            low: start,
            high: crownStation - halfSpan,
            a: at(start).point,
            b: entrySocket,
          },
          {
            low: crownStation + halfSpan,
            high: end,
            a: exitSocket,
            b: at(end).point,
          },
        ];
        for (const run of runs) {
          if (run.high <= run.low)
            throw new RangeError(
              'Service bay is too short for its seated crown.',
            );
          const count = Math.max(
            1,
            Math.ceil((run.high - run.low) / RULES.arcStep),
          );
          for (let i = 0; i < count; i++) {
            const low = T.MathUtils.lerp(run.low, run.high, i / count),
              high = T.MathUtils.lerp(run.low, run.high, (i + 1) / count);
            const a = i === 0 ? run.a.clone() : at(low).point;
            const b = i === count - 1 ? run.b.clone() : at(high).point;
            const quaternion = basis(
              b.clone().sub(a),
              at((low + high) / 2).frame.up,
            );
            const up = Y.clone().applyQuaternion(quaternion);
            const socketY = prototypes.get('tension_gallery_segment').sockets
              .joint_port.y;
            const position = a
              .clone()
              .add(b)
              .multiplyScalar(0.5)
              .addScaledVector(up, -socketY);
            place(
              'tension_gallery_segment',
              matrix(
                position,
                quaternion,
                new T.Vector3(a.distanceTo(b) / RULES.segmentLength, 1, 1),
              ),
            );
            bay.segments.push({
              start: low,
              end: high,
              a: a.toArray(),
              b: b.toArray(),
            });
            report.segmentCount++;
          }
        }
        for (const distance of [start, end]) {
          const edge = at(distance);
          bay.rimMounts.push(
            rimMount(distance, edge.lateral, side, {
              normalOffset,
              receiver: edge.point,
            }),
          );
        }
        report.serviceBays.push(bay);
      }
      for (const [material, geometriesBySource] of batches) {
        const entries = [...geometriesBySource.values()];
        const count = entries.reduce(
          (sum, entry) => sum + entry.matrices.length,
          0,
        );
        const vertices = entries.reduce(
          (sum, entry) => sum + entry.geometry.attributes.position.count,
          0,
        );
        const indices = entries.reduce(
          (sum, entry) => sum + (entry.geometry.index?.count ?? 0),
          0,
        );
        const batch = new T.BatchedMesh(count, vertices, indices, material);
        rendered.add(batch);
        batch.name = `Ravel / tension gallery / ${material.name}`;
        batch.perObjectFrustumCulled = true;
        batch.sortObjects = false;
        batch.castShadow = false;
        batch.receiveShadow = true;
        for (const { geometry, matrices } of entries) {
          const geometryId = batch.addGeometry(geometry);
          for (const placement of matrices)
            batch.setMatrixAt(batch.addInstance(geometryId), placement);
        }
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        group.add(batch);
        report.batchCount++;
      }
    });
  return {
    group,
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      rendered.forEach((object) => object.isBatchedMesh && object.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      source?.clear();
    },
  };
}

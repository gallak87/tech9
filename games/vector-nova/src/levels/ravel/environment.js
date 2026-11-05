import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { assetURL } from '../../assets/url.js';
import { createRavelCanopies } from './canopies.js';
import { createRavelRigging } from './rigging.js';
import { createRavelAnchorDistricts } from './anchor-district.js';
import { createRavelBearingSupports } from './bearing.js';

/** Richness comes from a fleet holding a working solar loom: drivable lower
 * sails, overlapping collector sheets and ships with seated tension hardware. */
export function createRavelEnvironment({ track, view, road = null }) {
  const group = new T.Group();
  group.name = 'Ravel / solar loom anchor fleet';
  const finish = createIndustrialFinish(view?.renderer);
  const canopies = createRavelCanopies({ track, finish: road?.foilFinish });
  group.add(canopies.group);
  const rigging = createRavelRigging({ track, finish });
  group.add(rigging.group);
  const districts = createRavelAnchorDistricts({
    track,
    finish,
    stations: [
      360,
      920,
      // Lift the complete seated assembly above the ascent swell envelope.
      { station: 2920, normalOffset: 86, crownLaterals: [-240, 140] },
      { station: 7890, normalOffset: 105, crownLaterals: [-95, 260] },
    ],
    serviceBays: [
      { start: 1680, end: 1930, side: 1, outboard: 60, normalOffset: 18 },
      {
        start: 5570,
        end: 6020,
        side: -1,
        outboard: 60,
        normalOffset: 18,
        crownStation: 5825,
      },
      {
        start: 11600,
        end: 11940,
        side: 1,
        outboard: 66,
        normalOffset: 20,
        crownStation: 11770,
      },
    ],
  });
  group.add(districts.group);
  // Fleet and edge rigging are added from their retained editable asset kit.
  const geometries = new Set(),
    materials = new Set(),
    rendered = new Set();
  let fleet = null,
    ventral = null,
    disposed = false;
  const cableGeometry = new T.CylinderGeometry(1, 1, 1, 6);
  const cableMaterial = new T.MeshStandardMaterial({
    color: '#7b7566',
    metalness: 0.8,
    roughness: 0.3,
  });
  geometries.add(cableGeometry);
  materials.add(cableMaterial);
  const cableMatrices = [],
    guideMatrices = [];
  const guideGeometry = new T.TorusGeometry(3.8, 0.65, 8, 24);
  geometries.add(guideGeometry);
  const cable = (a, b, radius = 0.65) => {
    const delta = b.clone().sub(a);
    if (delta.length() < 1) return;
    cableMatrices.push(
      new T.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.clone().normalize(),
        ),
        new T.Vector3(radius, delta.length(), radius),
      ),
    );
  };
  // The dock is a short load bridge between an authored carrier socket and
  // the receiver gallery. Its deck, open webs and rails remain entirely
  // outside the racing surface, rather than becoming another overhead stay.
  group.userData.ravelDocks = [];
  const dockVessel = (root, placement, config) => {
    const socketName = config.socket;
    const socket = root.getObjectByName(socketName);
    if (!socket) throw new Error('Ravel dock is missing ' + socketName);
    const a = new T.Vector3()
      .setFromMatrixPosition(
        root.matrixWorld.clone().invert().multiply(socket.matrixWorld),
      )
      .applyMatrix4(placement);
    const frame = track.sample(config.station);
    const b = frame.position
      .clone()
      .addScaledVector(frame.right, config.lateral)
      .addScaledVector(frame.up, config.normal);
    const dock = new T.Group();
    dock.name = 'Ravel / ' + config.label + ' socketed service gangway';
    group.add(dock);
    const boxes = new Map();
    const boxGeometry = new T.BoxGeometry(1, 1, 1);
    geometries.add(boxGeometry);
    const point = (t, across = 0, lift = 0) =>
      a
        .clone()
        .lerp(b, t)
        .addScaledVector(frame.tangent, across)
        .addScaledVector(frame.up, lift);
    const box = (kind, position, size, quaternion = frame.quaternion) => {
      if (!boxes.has(kind)) boxes.set(kind, []);
      boxes.get(kind).push(new T.Matrix4().compose(position, quaternion, size));
    };
    const beam = (kind, start, end, width, depth = width) => {
      const delta = end.clone().sub(start);
      box(
        kind,
        start.clone().add(end).multiplyScalar(0.5),
        new T.Vector3(width, delta.length(), depth),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.normalize(),
        ),
      );
    };
    // Two deep chords and open diagonal webs transfer load into the gallery.
    for (const across of [-4, 4]) {
      beam(
        'Graphite / structural carbon',
        point(0, across),
        point(1, across),
        1.5,
        1.7,
      );
      for (let i = 0; i < 3; i++) {
        const t0 = i / 3,
          t1 = (i + 1) / 3;
        beam(
          'Titanium / formed fittings',
          point(t0, across, i % 2 ? 0 : 3.1),
          point(t1, across, i % 2 ? 3.1 : 0),
          0.65,
          0.8,
        );
      }
      // Gallery floor is 3.6m above its joint; the carrier seat is at 22m.
      beam(
        'Copper / heat and tension hardware',
        point(0, across, 5.4),
        point(1, across, 8.4),
        0.32,
      );
      for (const t of [0, 1 / 3, 2 / 3, 1]) {
        const floorLift = 0.6 + t * 3;
        beam(
          'Copper / heat and tension hardware',
          point(t, across, floorLift),
          point(t, across, floorLift + 4.8),
          0.3,
        );
      }
    }
    for (const t of [0, 0.5, 1]) {
      beam('Graphite / structural carbon', point(t, -4), point(t, 4), 1.4, 1.5);
      for (const across of [-4, 4]) {
        box(
          'Titanium / formed fittings',
          point(t, across, 1.2),
          new T.Vector3(1.7, 3.6, 2.3),
        );
      }
    }
    const deckStart = point(0, 0, 0.3),
      deckEnd = point(1, 0, 3.3);
    const along = deckEnd.clone().sub(deckStart).normalize();
    const up = frame.up
      .clone()
      .addScaledVector(along, -frame.up.dot(along))
      .normalize();
    const deckRotation = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(
        along,
        up,
        new T.Vector3().crossVectors(along, up),
      ),
    );
    box(
      'Titanium / formed fittings',
      deckStart.clone().add(deckEnd).multiplyScalar(0.5),
      new T.Vector3(deckStart.distanceTo(deckEnd), 0.6, 7.6),
      deckRotation,
    );
    // Formed socket shoes and seated lights make both ends legible at speed.
    for (const t of [0, 1]) {
      box(
        'Graphite / structural carbon',
        point(t, 0, -0.6),
        new T.Vector3(3.2, 2.4, 10),
      );
      box(
        'Copper / heat and tension hardware',
        point(t, 0, 0.1),
        new T.Vector3(2.2, 1.4, 9),
      );
      box(
        'Power / warm service lights',
        point(t, -5.04, 1.2),
        new T.Vector3(1.4, 0.45, 0.16),
      );
    }
    for (const [kind, matrices] of boxes) {
      const source = [...materials].find((material) => material.name === kind);
      if (!source) throw new Error('Ravel dock is missing material ' + kind);
      const material = source.clone();
      material.name = 'Ravel / ' + config.label + ' dock / ' + kind;
      if (!kind.startsWith('Power /')) finish.bind(material, 'steel');
      materials.add(material);
      const mesh = new T.InstancedMesh(boxGeometry, material, matrices.length);
      rendered.add(mesh);
      mesh.name = 'Ravel / ' + config.label + ' dock load bridge / ' + kind;
      mesh.receiveShadow = true;
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      dock.add(mesh);
    }
    for (const [name, position] of [
      [config.vessel + '_socket', a],
      ['gallery_receiver', b],
    ]) {
      const node = new T.Object3D();
      node.name = config.id + '_dock__' + name;
      node.position.copy(position);
      dock.add(node);
    }
    group.userData.ravelDocks.push({
      id: config.id,
      prototype: root.name,
      sourceSocket: socketName,
      station: config.station,
      lateral: config.lateral,
      normal: config.normal,
      carrierSocket: a.toArray(),
      galleryReceiver: b.toArray(),
      span: a.distanceTo(b),
      batchCount: boxes.size,
    });
  };
  const loadFleetAsset = (path, retain) =>
    new GLTFLoader().loadAsync(assetURL(path)).then(({ scene }) => {
      if (!disposed) retain(scene);
      scene.traverse((object) => {
        if (!object.isMesh) return;
        if (disposed) {
          object.geometry.dispose();
          object.material.dispose();
        } else {
          geometries.add(object.geometry);
          materials.add(object.material);
          object.castShadow = false;
          object.receiveShadow = true;
        }
      });
      if (disposed) scene.clear();
    });
  const fleetReady = Promise.all([
    loadFleetAsset('assets/levels/ravel/anchor-fleet.glb', (scene) => {
      fleet = scene;
    }),
    loadFleetAsset(
      'assets/levels/ravel/ventral-service-insert.glb',
      (scene) => {
        ventral = scene;
      },
    ),
  ]).then(() => {
    if (disposed) return;
    const insert = ventral.getObjectByName(
      'loom_carrier_ventral_service_insert',
    );
    if (!insert)
      throw new Error('Ravel carrier is missing its ventral service insert.');
    insert.updateWorldMatrix(true, true);
    const fleetMaterials = new Map();
    fleet.traverse((object) => {
      if (object.isMesh)
        fleetMaterials.set(object.material.name, object.material);
    });
    group.userData.ravelVentralInserts = [];
    group.userData.ravelCollectorStays = [];
    const collector = canopies.group.userData.ravelAscentCollector;
    const collectorStay = (from, index, source) => {
      const to = new T.Vector3().fromArray(collector.hemAnchors[index]);
      cable(from, to, 0.7);
      guideMatrices.push(
        new T.Matrix4().compose(
          to,
          new T.Quaternion().setFromUnitVectors(
            new T.Vector3(0, 0, 1),
            from.clone().sub(to).normalize(),
          ),
          new T.Vector3(1, 1, 1),
        ),
      );
      group.userData.ravelCollectorStays.push({
        source,
        from: from.toArray(),
        to: to.toArray(),
      });
    };
    const ascentReel = rigging.group.userData.ravelRigging.assemblies.find(
      (assembly) => assembly.distance === 3140 && assembly.side === 1,
    );
    if (!collector || !ascentReel)
      throw new Error('Ravel Ascent collector is missing its real anchor.');
    collectorStay(
      new T.Vector3().fromArray(ascentReel.anchor),
      1,
      'Ascent starboard remote reel',
    );

    const definitions = [
      ['loom_carrier', 1040, -180, 175, 1, 0],
      ['anchor_cutter', 3240, 155, 115, 1, -0.15],
      ['tension_spindle', 3600, -300, 170, 1, 0.3],
      ['tension_spindle', 4260, 0, 0, 1, 0, 180, null, true],
      ['loom_carrier', 5100, 175, 110, 0.8, 0.2],
      [
        'loom_carrier',
        5820,
        -198,
        0,
        1,
        0,
        180,
        {
          id: 'gulf',
          label: 'Gulf carrier',
          vessel: 'carrier',
          socket: 'loom_carrier__cable_socket_starboard',
          station: 5932,
          lateral: -110,
          normal: 18,
        },
      ],
      ['anchor_cutter', 6500, -145, 95, 1.2, -0.25],
      ['tension_spindle', 7850, 500, 620, 1.2, -0.2],
      ['loom_carrier', 8700, -700, 490, 1.2, -0.35],
      ['anchor_cutter', 9500, 850, 600, 1.1, 0.3, 650],
      ['tension_spindle', 10300, -430, 280, 1, 0],
      ['loom_carrier', 11600, 175, 125, 0.8, 0.15],
      [
        'anchor_cutter',
        11835,
        184,
        16.4,
        0.9,
        Math.PI + 0.12,
        180,
        {
          id: 'return',
          label: 'Return cutter',
          vessel: 'cutter',
          socket: 'anchor_cutter__cable_socket_starboard',
          station: 11828.587306,
          lateral: 116,
          normal: 20,
        },
      ],
      ['anchor_cutter', 12800, -150, 110, 1, -0.25],
    ];
    const instances = new Map();
    for (const [
      name,
      s,
      x,
      y,
      scale,
      yaw,
      guideLift = 180,
      dock = null,
      bearing = false,
    ] of definitions) {
      const root = fleet.getObjectByName(name);
      if (!root) throw new Error('Ravel fleet is missing ' + name);
      root.updateWorldMatrix(true, true);
      const frame = track.sample(s);
      const placement = new T.Matrix4().compose(
        frame.position
          .clone()
          .addScaledVector(frame.right, x)
          .addScaledVector(frame.up, y),
        frame.quaternion
          .clone()
          .multiply(
            new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
          )
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 0, 1),
              bearing ? Math.PI : 0,
            ),
          ),
        new T.Vector3(scale, scale, scale),
      );
      let socketIndex = 0;
      root.traverse((o) => {
        if (
          !dock &&
          !bearing &&
          (o.userData.anchorKind === 'cable' || o.userData.anchorKind === 'tow')
        ) {
          const anchor = new T.Vector3()
            .setFromMatrixPosition(
              root.matrixWorld.clone().invert().multiply(o.matrixWorld),
            )
            .applyMatrix4(placement);
          if (s === 3240 && o.name === 'anchor_cutter__cable_socket_starboard')
            collectorStay(anchor, 0, o.name);
          const station = T.MathUtils.euclideanModulo(
            s + (socketIndex++ % 2 ? 100 : -100),
            track.length,
          );
          const bands = track.roadBands.filter(
            (b) => station >= b.start && station <= b.end,
          );
          if (bands.length) {
            const values = bands.flatMap((b) => [
              typeof b.min === 'function' ? b.min(station) : b.min,
              typeof b.max === 'function' ? b.max(station) : b.max,
            ]);
            const lateral = x < 0 ? Math.min(...values) : Math.max(...values);
            const surface = track.surfaceAtTime(station, lateral, 0);
            const stay = (frame, radius, anchorStation) => {
              const side = x < 0 ? -1 : 1;
              const destination = frame.position
                .clone()
                .addScaledVector(frame.up, -70)
                .addScaledVector(frame.right, side * 100);
              const guide = frame.position
                .clone()
                .addScaledVector(track.sample(anchorStation).up, guideLift)
                .addScaledVector(frame.right, side * 150);
              cable(anchor, guide, radius * scale);
              cable(guide, destination, 2.1 * scale);
              guideMatrices.push(
                new T.Matrix4().compose(
                  guide,
                  frame.quaternion,
                  new T.Vector3(scale, scale, scale),
                ),
              );
            };
            stay(surface, 0.7, station);
            const secondStation = station + 45;
            if (track.surfaceCoverage(secondStation, lateral) > 0)
              stay(
                track.surfaceAtTime(secondStation, lateral, 0),
                0.4,
                secondStation,
              );
          }
        }
        if (!o.isMesh) return;
        const key = o.geometry.uuid + o.material.uuid;
        if (!instances.has(key))
          instances.set(key, {
            geometry: o.geometry,
            material: o.material,
            matrices: [],
          });
        const relative = root.matrixWorld
          .clone()
          .invert()
          .multiply(o.matrixWorld);
        instances.get(key).matrices.push(placement.clone().multiply(relative));
      });
      if (name === 'loom_carrier' && (s === 5100 || s === 1040)) {
        // The insert is authored directly against the retained carrier's
        // native hull seats. Reuse its materials and existing fleet batches.
        const inverse = insert.matrixWorld.clone().invert();
        insert.traverse((object) => {
          if (!object.isMesh) return;
          const material = fleetMaterials.get(object.material.name);
          if (!material)
            throw new Error(
              'Ravel ventral insert has an unknown fleet material.',
            );
          const key = object.geometry.uuid + material.uuid;
          if (!instances.has(key))
            instances.set(key, {
              geometry: object.geometry,
              material,
              matrices: [],
            });
          const relative = inverse.clone().multiply(object.matrixWorld);
          instances
            .get(key)
            .matrices.push(placement.clone().multiply(relative));
        });
        group.userData.ravelVentralInserts.push({
          station: s,
          prototype: insert.name,
        });
      }
      if (dock) dockVessel(root, placement, dock);
      if (bearing) {
        const supports = createRavelBearingSupports({
          track,
          station: s,
          prototype: root,
          placement,
          finish,
          geometries,
          materials,
          rendered,
        });
        group.add(supports.group);
        group.userData.ravelWorkingBearing = supports.report;
      }
    }
    if (cableMatrices.length) {
      const stays = new T.InstancedMesh(
        cableGeometry,
        cableMaterial,
        cableMatrices.length,
      );
      stays.name = 'Ravel / fleet to sail tension stays';
      cableMatrices.forEach((matrix, index) =>
        stays.setMatrixAt(index, matrix),
      );
      stays.computeBoundingSphere();
      rendered.add(stays);
      group.add(stays);
    }
    if (guideMatrices.length) {
      const guides = new T.InstancedMesh(
        guideGeometry,
        cableMaterial,
        guideMatrices.length,
      );
      guides.name = 'Ravel / seated outboard tension guides';
      guideMatrices.forEach((matrix, index) =>
        guides.setMatrixAt(index, matrix),
      );
      guides.computeBoundingSphere();
      rendered.add(guides);
      group.add(guides);
    }
    const byMaterial = new Map();
    for (const entry of instances.values()) {
      if (!byMaterial.has(entry.material)) byMaterial.set(entry.material, []);
      byMaterial.get(entry.material).push(entry);
    }
    for (const [material, entries] of byMaterial) {
      const needsUv = entries.some(({ geometry }) =>
        geometry.hasAttribute('uv'),
      );
      // Store each prototype part once, then cull its placed instances
      // separately instead of drawing every ship inside lap-wide bounds.
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
      batch.name = 'Ravel / anchor fleet / ' + material.name;
      batch.perObjectFrustumCulled = true;
      batch.sortObjects = false;
      batch.castShadow = false;
      batch.receiveShadow = true;
      for (const { geometry, matrices } of entries) {
        // The untextured GLB mixes parts with and without UVs. Supply the
        // unused coordinates through a packing view, leaving its sources intact.
        let packed = geometry;
        if (needsUv && !geometry.hasAttribute('uv')) {
          packed = new T.BufferGeometry();
          for (const [name, attribute] of Object.entries(geometry.attributes))
            packed.setAttribute(name, attribute);
          packed.setIndex(geometry.index);
          packed.setAttribute(
            'uv',
            new T.Float32BufferAttribute(
              new Float32Array(geometry.attributes.position.count * 2),
              2,
            ),
          );
        }
        let geometryId;
        try {
          geometryId = batch.addGeometry(packed);
        } finally {
          if (packed !== geometry) packed.dispose();
        }
        for (const matrix of matrices)
          batch.setMatrixAt(batch.addInstance(geometryId), matrix);
      }
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      group.add(batch);
    }
  });
  const ready = Promise.all([finish.ready, fleetReady, districts.ready]);
  return {
    group,
    ready,
    finish,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      canopies.dispose();
      rigging.dispose();
      districts.dispose();
      rendered.forEach((mesh) => mesh.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      fleet?.clear();
      ventral?.clear();
      finish.dispose();
    },
  };
}

import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new T.Vector3(0, 1, 0);
const ONE = new T.Vector3(1, 1, 1);

/** Seated torsion-bearing supports. The environment retains all GPU ownership. */
export function createRavelBearingSupports({
  track,
  station,
  prototype,
  placement,
  finish,
  geometries,
  materials,
  rendered,
}) {
  const group = new T.Group();
  group.name = 'Ravel / first roll seated working bearing';
  const frame = track.sample(station);
  const local = (across, normal, along = 0) =>
    frame.position
      .clone()
      .addScaledVector(frame.right, across)
      .addScaledVector(frame.up, normal)
      .addScaledVector(frame.tangent, along);
  const sourceInverse = prototype.matrixWorld.clone().invert();
  // After the bearing's half-turn both retained drive sockets face down,
  // leaving its service mouth open instead of spanning it with a brace.
  const sockets = [0, 1].map((index) => {
    const name = 'tension_spindle__cable_socket_' + index;
    const node = prototype.getObjectByName(name);
    if (!node) throw new Error('Ravel working bearing is missing ' + name);
    return {
      name,
      position: new T.Vector3()
        .setFromMatrixPosition(sourceInverse.clone().multiply(node.matrixWorld))
        .applyMatrix4(placement),
    };
  });
  const material = new T.MeshStandardMaterial({
    name: 'Ravel / working bearing formed load alloy',
    color: '#ffffff',
    vertexColors: true,
    metalness: 0.78,
    roughness: 0.32,
  });
  materials.add(material);
  finish?.bind(material, 'steel');
  const report = {
    station,
    prototype: 'tension_spindle',
    placement: placement.toArray(),
    supports: [],
    batchCount: 0,
  };
  group.userData.ravelWorkingBearing = report;
  function box(pieces, position, quaternion, dimensions, color) {
    const geometry = new RoundedBoxGeometry(
      ...dimensions,
      1,
      Math.min(0.3, Math.min(...dimensions) * 0.12),
    );
    geometry.applyMatrix4(new T.Matrix4().compose(position, quaternion, ONE));
    const rgb = new T.Color(color),
      colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++)
      colors.push(rgb.r, rgb.g, rgb.b);
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    pieces.push(geometry);
  }
  function beam(pieces, a, b, width, depth, color) {
    const delta = b.clone().sub(a);
    box(
      pieces,
      a.clone().add(b).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
      [width, delta.length(), depth],
      color,
    );
  }
  function install(pieces, name, mount = null) {
    let geometry;
    try {
      geometry = mergeGeometries(pieces, false);
    } finally {
      pieces.forEach((piece) => piece.dispose());
    }
    geometries.add(geometry);
    const mesh = new T.InstancedMesh(geometry, material, 1);
    rendered.add(mesh);
    mesh.name = name;
    mesh.setMatrixAt(0, new T.Matrix4());
    mesh.receiveShadow = true;
    if (mount) mesh.userData.ravelRimMount = mount;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    report.batchCount++;
  }
  const links = [];
  for (const [index, side] of [-1, 1].entries()) {
    const lateral = side * 50;
    const surface = track.sampleBranchSurface(station, lateral);
    // Follow the actual edge tangent and normal: a rolled ribbon's edge
    // frame differs substantially from its centreline frame.
    const edgeTangent = track
      .sampleBranchSurface(station + 0.25, lateral)
      .position.sub(track.sampleBranchSurface(station - 0.25, lateral).position)
      .normalize();
    const right = surface.up.clone().cross(edgeTangent).normalize();
    const up = edgeTangent.clone().cross(right).normalize();
    const rotation = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, edgeTangent),
    );
    const edge = (across, normal, along = 0) =>
      surface.position
        .clone()
        .addScaledVector(right, side * across)
        .addScaledVector(up, normal)
        .addScaledVector(edgeTangent, along);
    const saddle = [],
      knee = local(side * 54, -5.5),
      outboard = local(side * 82, -8);
    const loadStart = local(side * 94, -18);
    box(saddle, edge(1.5, -2.6), rotation, [9, 2.2, 18], '#b2b9b7');
    box(saddle, edge(2.5, -5.3), rotation, [6, 3.2, 13], '#39464a');
    for (const along of [-6, 6]) {
      box(saddle, edge(2, -3.9, along), rotation, [8, 1.1, 2.2], '#75878b');
      box(saddle, edge(-1, -3.1, along), rotation, [1.1, 0.7, 2.8], '#c0b6a3');
    }
    beam(saddle, edge(2.5, -5.3), knee, 3.6, 4.6, '#58676b');
    beam(saddle, knee, outboard, 3.6, 4.6, '#58676b');
    // Finish the short seated elbow beyond the tilted craft margin before
    // the separately checked long chord begins its descent to the drive.
    beam(saddle, outboard, loadStart, 3.6, 4.6, '#58676b');
    // Only this short seated foot enters the broad margin around the foil.
    install(
      saddle,
      'Ravel / bearing ' +
        (side < 0 ? 'port' : 'starboard') +
        ' seated rim foot',
      { station, lateral, side },
    );
    const socket = sockets[index];
    beam(links, loadStart, socket.position, 3.6, 4.6, '#58676b');
    box(links, socket.position, frame.quaternion, [8, 7, 10], '#b2b9b7');
    box(
      links,
      socket.position.clone().addScaledVector(frame.tangent, -4.9),
      frame.quaternion,
      [6.2, 5.2, 1.2],
      '#a4784f',
    );
    const node = new T.Object3D();
    node.name =
      'ravel_bearing__' + (side < 0 ? 'port' : 'starboard') + '_drive_socket';
    node.position.copy(socket.position);
    node.userData.sourceSocket = socket.name;
    group.add(node);
    report.supports.push({
      side,
      lateral,
      sourceSocket: socket.name,
      knee: knee.toArray(),
      outboard: outboard.toArray(),
      loadStart: loadStart.toArray(),
      socket: socket.position.toArray(),
    });
  }
  install(links, 'Ravel / working bearing ordinary under-sail load chords');
  return { group, report };
}

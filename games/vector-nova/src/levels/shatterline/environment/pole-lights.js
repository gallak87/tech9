import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { framePoint } from '../../../track/frames.js';

const POLE_HEIGHT = 11;
const SPACING = 58;
const LIGHT_REACH = 164;

/** Road-mounted floodlights turn with the driving face through both inversions. */
export function createShatterlinePoleLights(track, { lights = true } = {}) {
  const halfWidth = track.width / 2;
  const group = new T.Group();
  group.name = 'Shatterline / 11 metre road-mounted floodlights';
  const materials = {
    metal: new T.MeshStandardMaterial({
      name: 'Shatterline / floodlight titanium',
      color: '#687782',
      metalness: 0.65,
      roughness: 0.43,
    }),
    ceramic: new T.MeshStandardMaterial({
      name: 'Shatterline / floodlight ceramic collars',
      color: '#b5ad9a',
      metalness: 0.08,
      roughness: 0.68,
    }),
    dark: new T.MeshStandardMaterial({
      name: 'Shatterline / floodlight recessed optics',
      color: '#242e35',
      metalness: 0.35,
      roughness: 0.58,
    }),
    lens: new T.MeshBasicMaterial({
      name: 'Shatterline / steady cool-white luminous face',
      color: '#d1ecf7',
      toneMapped: false,
    }),
  };
  const parts = Object.fromEntries(
    Object.keys(materials).map((key) => [key, []]),
  );
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const fixtures = [];
  const addBox = (key, frame, x, y, z, width, height, depth) => {
    const geometry = unitBox.clone();
    geometry.applyMatrix4(
      new T.Matrix4().compose(
        framePoint(frame, x, y, z),
        frame.quaternion,
        new T.Vector3(width, height, depth),
      ),
    );
    parts[key].push(geometry);
  };
  for (const section of track.descents ?? []) {
    let index = 0;
    for (
      let distance = section.start + 25;
      distance < section.end - 20;
      distance += SPACING
    ) {
      const frame = track.sample(distance);
      const side = index++ % 2 ? 1 : -1;
      // The full road and hull envelope stay clear. The foot bolts into its
      // existing outboard keel; the whole fixture is outside the containment.
      addBox('metal', frame, side * (halfWidth + 5.8), -2.8, 0, 5.4, 1.3, 5.2);
      addBox('ceramic', frame, side * (halfWidth + 7.2), -0.3, 0, 3.2, 3.8, 3.6);
      addBox('metal', frame, side * (halfWidth + 7.2), 4.6, 0, 1.3, 11.6, 1.9);
      addBox('dark', frame, side * (halfWidth + 7.95), 4.5, 0, 0.3, 9.4, 0.8);
      for (const y of [1.5, 6.1, 9.7])
        addBox('ceramic', frame, side * (halfWidth + 7.2), y, 0, 2.1, 0.8, 2.8);
      addBox('metal', frame, side * (halfWidth + 5.7), 10.3, 0, 4.5, 1.1, 2.1);
      addBox('dark', frame, side * (halfWidth + 4.5), POLE_HEIGHT - 0.6, 1.1, 4.8, 1.2, 6.6);
      addBox('metal', frame, side * (halfWidth + 4.5), POLE_HEIGHT - 0.2, 1.1, 5.2, 0.4, 7);
      // One broad diffuse face avoids specular/HDR strip scintillation. Its top
      // clears the opaque head and mounting arm; no bright face overlaps either.
      addBox('lens', frame, side * (halfWidth + 4.5), 9.6, 1.1, 4.1, 0.24, 5.8);
      fixtures.push({
        distance,
        position: framePoint(frame, side * (halfWidth + 4.5), 9.45, 1.1),
        target: framePoint(track.sample(distance + 16), -side * 4, 0.1),
      });
    }
  }
  unitBox.dispose();
  for (const [key, geometries] of Object.entries(parts)) {
    if (!geometries.length) continue;
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((item) => item.dispose());
    const mesh = new T.Mesh(geometry, materials[key]);
    mesh.name = `Shatterline / floodlight ${key}`;
    mesh.userData.collisionId = `shatterline-floodlight-${key}`;
    mesh.castShadow = key !== 'lens';
    mesh.receiveShadow = key !== 'lens';
    group.add(mesh);
  }
  // Six bounded lights cover overlapping pools ahead/behind the player. The
  // same fixed-distance fade runs on high/low and during pause/replay restores.
  const pool = lights
    ? Array.from({ length: 6 }, () => {
        const light = new T.SpotLight('#bddcee', 0, 105, 1.08, 0.85, 2);
        light.name = 'Shatterline / road-facing flood pool';
        group.add(light, light.target);
        return light;
      })
    : [];
  let disposed = false;
  return {
    group,
    fixtures,
    update({ state } = {}) {
      if (disposed || !state) return;
      const distance = state.distance + 20;
      const selected = fixtures.filter(
        (f) => Math.abs(f.distance - distance) < LIGHT_REACH,
      );
      for (let i = 0; i < pool.length; i++) {
        const light = pool[i],
          fixture = selected[i];
        light.intensity = fixture
          ? 3200 *
            (1 -
              T.MathUtils.smoothstep(
                Math.abs(fixture.distance - distance),
                106,
                LIGHT_REACH,
              ))
          : 0;
        if (!fixture) continue;
        light.position.copy(fixture.position);
        light.target.position.copy(fixture.target);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((object) => {
        object.geometry?.dispose();
        if (object.isLight) object.dispose();
      });
      Object.values(materials).forEach((material) => material.dispose());
      group.clear();
    },
  };
}

export function createShatterlinePoleLightTriangles(track) {
  const poles = createShatterlinePoleLights(track, { lights: false });
  const triangles = [];
  poles.group.traverse((object) => {
    if (!object.isMesh) return;
    const p = object.geometry.attributes.position,
      indices = object.geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const points = [indices[i], indices[i + 1], indices[i + 2]].map((n) => [
        p.getX(n),
        p.getY(n),
        p.getZ(n),
      ]);
      const tile = Math.floor(points[0][2] / 300);
      triangles.push({
        id: `${object.userData.collisionId}-${tile}`,
        kind: 'structure',
        points,
      });
    }
  });
  poles.dispose();
  return triangles;
}

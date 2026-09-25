import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import { BASE, RELAYS } from './mission.js';
import { pathCenter, terrainHeight } from '../world/terrain.js';

/** Original game-owned props, authored in metres with editable primitive meshes. */
export class FieldEquipment {
  constructor(scene) {
    this.scene = scene;
    this.root = new Group();
    this.root.name = 'Alder survey equipment';
    this.stations = [];
    this.materials = {
      amber: new MeshStandardMaterial({
        color: '#df982f',
        roughness: 0.56,
        metalness: 0.28,
      }),
      dark: new MeshStandardMaterial({
        color: '#20352f',
        roughness: 0.6,
        metalness: 0.45,
      }),
      metal: new MeshStandardMaterial({
        color: '#bcc2af',
        roughness: 0.4,
        metalness: 0.75,
      }),
      rubber: new MeshStandardMaterial({ color: '#14201c', roughness: 0.9 }),
      ivory: new MeshStandardMaterial({
        color: '#e9e3c8',
        roughness: 0.62,
        side: DoubleSide,
      }),
    };
    [...RELAYS, BASE].forEach((station, index) =>
      this.makeStation(station, index),
    );
    for (const z of [20, 2, -21, -28]) this.makeMarker(z);
    scene.add(this.root);
  }
  mesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const mesh = new Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  rod(parent, a, b, radius, material) {
    const start = new Vector3(...a),
      end = new Vector3(...b);
    const mesh = this.mesh(
      parent,
      new CylinderGeometry(radius, radius, start.distanceTo(end), 8),
      material,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    return mesh;
  }
  label(text, subtitle, number) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#142920';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#e7a643';
    ctx.fillRect(24, 26, 56, 8);
    ctx.fillStyle = '#e9ecd9';
    ctx.font = '700 32px sans-serif';
    ctx.fillText(text.toUpperCase(), 24, 85);
    ctx.fillStyle = '#aebaa9';
    ctx.font = '18px sans-serif';
    ctx.fillText(subtitle, 24, 121);
    ctx.fillStyle = '#e9ecd9';
    ctx.font = '700 68px monospace';
    ctx.fillText(number, 24, 207);
    ctx.strokeStyle = '#748b78';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(188, 188);
    ctx.lineTo(236, 188);
    ctx.lineTo(252, 165);
    ctx.lineTo(273, 209);
    ctx.lineTo(296, 148);
    ctx.lineTo(321, 188);
    ctx.lineTo(471, 188);
    ctx.stroke();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ map: texture, roughness: 0.75 });
  }
  makeStation(station, index) {
    const group = new Group();
    group.position.fromArray(station.position);
    group.name = station.label;
    this.root.add(group);
    const { amber, dark, metal, rubber, ivory } = this.materials;
    const radio = station.id === 'base';
    const width = radio ? 1.35 : 0.87;
    const height = radio ? 0.74 : 1.03;
    this.mesh(group, new BoxGeometry(width, height, 0.5), amber, [0, 1.12, 0]);
    this.mesh(group, new BoxGeometry(width + 0.09, 0.1, 0.59), rubber, [
      0,
      1.12 + height / 2,
      0,
    ]);
    this.mesh(group, new BoxGeometry(width + 0.09, 0.1, 0.59), rubber, [
      0,
      1.12 - height / 2,
      0,
    ]);
    this.mesh(
      group,
      new PlaneGeometry(width * 0.86, height * 0.8),
      this.label(
        station.label,
        radio ? 'ALDER SURVEY / UPLINK' : 'ALDER SURVEY / FIELD UNIT',
        radio ? 'HQ' : `0${index + 1}`,
      ),
      [0, 1.12, 0.257],
    );
    for (const x of [-0.32, 0.32])
      for (const z of [-0.21, 0.21]) {
        this.rod(group, [x, 0.7, z], [x * 1.7, 0.04, z * 2.2], 0.035, metal);
        this.mesh(group, new BoxGeometry(0.15, 0.07, 0.15), rubber, [
          x * 1.7,
          0.035,
          z * 2.2,
        ]);
      }
    this.rod(group, [-0.29, 1.7, 0], [0.29, 1.7, 0], 0.026, dark);
    this.rod(group, [-0.29, 1.57, 0], [-0.29, 1.7, 0], 0.026, dark);
    this.rod(group, [0.29, 1.57, 0], [0.29, 1.7, 0], 0.026, dark);
    const mast = station.type === 'mast' ? 3.9 : radio ? 2.8 : 3.1;
    this.rod(group, [0, 1.6, -0.14], [0, mast, -0.14], 0.026, metal);
    const lampMaterial = new MeshStandardMaterial({
      color: '#e3a64b',
      emissive: '#e49632',
      emissiveIntensity: 0.7,
      roughness: 0.35,
    });
    const lamp = this.mesh(
      group,
      new SphereGeometry(0.12, 12, 8),
      lampMaterial,
      [0, mast + 0.08, -0.14],
    );
    if (station.type === 'dish') {
      this.mesh(
        group,
        new CylinderGeometry(0.45, 0.17, 0.13, 24),
        ivory,
        [0, 2.45, -0.14],
        [Math.PI / 2 + 0.45, 0, 0],
      );
      this.mesh(
        group,
        new TorusGeometry(0.46, 0.035, 8, 32),
        metal,
        [0, 2.42, -0.055],
        [0.45, 0, 0],
      );
      this.rod(group, [0, 2.45, -0.14], [0, 2.65, 0.48], 0.022, metal);
    } else if (station.type === 'mast') {
      for (const y of [2.5, 2.9, 3.3]) {
        this.rod(group, [-0.45, y, -0.14], [0.45, y, -0.14], 0.017, metal);
        this.rod(group, [-0.27, y, -0.4], [-0.27, y, 0.13], 0.014, metal);
        this.rod(group, [0.27, y, -0.4], [0.27, y, 0.13], 0.014, metal);
      }
    } else if (radio) {
      this.mesh(group, new BoxGeometry(0.44, 0.23, 0.3), dark, [0.27, 1.62, 0]);
      for (const x of [-0.15, 0, 0.15])
        this.mesh(
          group,
          new CylinderGeometry(0.045, 0.045, 0.05, 12),
          metal,
          [x, 1.1, 0.31],
          [Math.PI / 2, 0, 0],
        );
      this.rod(group, [-0.6, 0.86, -0.12], [-1.05, 2.15, -0.12], 0.025, metal);
    } else {
      this.mesh(
        group,
        new BoxGeometry(0.62, 0.07, 0.34),
        ivory,
        [0, 2.37, -0.14],
      );
      this.mesh(
        group,
        new BoxGeometry(0.42, 0.22, 0.26),
        dark,
        [0, 2.53, -0.14],
      );
    }
    const haloMaterial = new MeshStandardMaterial({
      color: '#f0b54d',
      emissive: '#e4ad50',
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.7,
      roughness: 1,
      side: DoubleSide,
    });
    const halo = this.mesh(
      group,
      new RingGeometry(0.95, 1.0, 48),
      haloMaterial,
      [0, 0.06, 0],
      [-Math.PI / 2, 0, 0],
    );
    halo.castShadow = false;
    // A cloth pennant gives the next station an unmistakable amber silhouette.
    const flag = this.mesh(group, new PlaneGeometry(0.52, 0.28), amber, [
      0.28,
      mast - 0.3,
      -0.13,
    ]);
    flag.material = amber.clone();
    flag.material.side = DoubleSide;
    this.stations.push({ station, lamp, halo, flag, mast });
  }
  makeMarker(z) {
    const x = pathCenter(z) - 1.65;
    const group = new Group();
    group.position.set(x, terrainHeight(x, z), z);
    this.root.add(group);
    this.rod(group, [0, 0, 0], [0, 0.85, 0], 0.035, this.materials.dark);
    this.mesh(
      group,
      new BoxGeometry(0.28, 0.22, 0.06),
      this.materials.amber,
      [0, 0.74, 0],
    );
    this.mesh(
      group,
      new BoxGeometry(0.03, 0.14, 0.01),
      this.materials.ivory,
      [0, 0.74, 0.036],
    );
  }
  update(snapshot, now) {
    for (const { station, lamp, halo, flag, mast } of this.stations) {
      const complete =
        snapshot.restored.includes(station.id) ||
        (station.id === 'base' && snapshot.state === 'won');
      const target = snapshot.target?.id === station.id;
      lamp.material.color.set(complete ? '#8fe9c0' : '#efb250');
      lamp.material.emissive.set(complete ? '#4ed397' : '#d38926');
      lamp.material.emissiveIntensity = complete
        ? 0.7
        : target
          ? 0.8 + Math.sin(now * 3) * 0.35
          : 0.15;
      halo.visible = target;
      flag.rotation.y = Math.sin(now * 1.4 + mast) * 0.1;
    }
  }
  dispose() {
    this.scene.remove(this.root);
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    Object.values(this.materials).forEach((material) =>
      materials.add(material),
    );
    for (const material of materials) {
      if (material.map) textures.add(material.map);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
  }
}

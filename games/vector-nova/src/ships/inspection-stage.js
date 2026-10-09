import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Neutral studio reflections are borrowed only while drawing inspection. */
export function createInspectionStage(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#172832');
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, 0.06);
  room.dispose();
  generator.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.58;
  scene.environmentRotation.set(0, 0.6, 0);
  scene.add(new THREE.HemisphereLight('#d5e7f5', '#17232e', 0.38));
  const key = new THREE.DirectionalLight('#fff2de', 2.0);
  key.position.set(-5, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 30,
  });
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#bedfff', 1.9);
  rim.position.set(6, 4, -5);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 0.4, 96),
    new THREE.MeshStandardMaterial({
      color: '#17252e',
      roughness: 0.64,
      metalness: 0.22,
    }),
  );
  floor.position.y = -0.7;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.4, 0.014, 6, 128),
    new THREE.MeshBasicMaterial({ color: '#566872' }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.48;
  scene.add(ring);
  return {
    scene,
    render(draw) {
      const borrowed = new Map();
      scene.traverse((object) => {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (!material?.isMeshStandardMaterial || borrowed.has(material))
            continue;
          borrowed.set(material, material.envMap);
          material.envMap = null;
        }
      });
      renderer.shadowMap.needsUpdate = true;
      try {
        draw(scene);
      } finally {
        for (const [material, reflection] of borrowed)
          material.envMap = reflection;
      }
    },
    dispose() {
      key.shadow.map?.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      environment.dispose();
      scene.clear();
    },
  };
}
